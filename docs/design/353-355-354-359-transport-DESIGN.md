# Remote's transport: deadlines, cancellation, batching and body limits (#353, #355, #354, #359)

Status: designed (2026-10-30). All four came out of planning the
foldkit-domains port (`foldkit-domains-PLAN.md`, gaps 4, 5, 6 and 10). They
share one seam, the wrapper `Remote.clientLayer` and `Remote.coalesced` put
around a transport, and the server's one byte-reading boundary, `serveFetch`.

```text
Surface -> plan -> read entry -> RemoteClient (wrapper: deadline, coalesce, split, cancel)
        -> transport (Remote.http / Remote.json / RPC) -> serveFetch (body limit) -> handlers
```

## What happens today

Measured with a probe over the real runtime, `Remote.http` and `serveFetch`
(556 rows, each `Data.get` of one `Price`, combined with `Projection.struct`):

- **One request.** The read entry plans every row into one `ReadBatch`;
  `coalesceReads` merges it into one read: one `POST` of 29,415 bytes. No
  bound applies: at 1,001 rows of one Entity the server refuses the whole
  batch (`maxIdsPerEntity`, default 1000), and every row reads `Failed`.
- **Nothing is aborted.** Typing narrowed the rows from 556 to 111. The read
  entry restarted and its old fiber was interrupted, but `Remote.http` passes
  no `signal` to `fetch`, and `coalesceReads` runs a batch to completion
  whatever its requesters do (Effect's `RequestResolver` drops a waiter only
  while the batch is still collecting). The new read of 111 joined the
  in-flight one, so its whole answer of 556 was stored. Had the new names been
  disjoint, the old answer would have been fetched, decoded and dropped.
- **No deadline.** A read waits as long as the transport does; `fetch` has no
  timeout of its own.
- **No body limit.** `serveFetch` calls `request.json()`, which buffers a body
  of any size before anything looks at it.

## 1. A deadline per client and per call (#353)

```ts
Remote.clientLayer(Remote.http('/remote'), { timeout: '20 seconds' })
Data.subscriptions(active, { timeout: '5 seconds' })     // this entry's reads and lists
Data.mutate(model, Rename, input, { timeout: '5 seconds' }) // this send
```

- `ClientOptions.timeout` (renamed from `CoalesceOptions`, which now holds
  more than coalescing) is the client's deadline for every read, query and
  mutation. No default: a deadline is the application's judgement.
- The deadline runs on the caller's side of the wrapper, per requester, not
  around the shared batch: a caller with a short deadline gives up without
  failing a caller that joined the same read with a longer one. Giving up
  releases what the caller waited on, so a read nobody else waits on is
  cancelled (section 2) and its request aborted.
- A read or a query that times out fails with `RemoteReadError` /
  `RemoteQueryError` ("No answer within 20 seconds"): `ReadFailed` /
  `QueryFailed`, retried by `Data.refresh` like any failed read.
- A mutation that times out fails `RemoteUnreachable`: it may have reached the
  server, so a durable one stays in the outbox and is sent again under the
  same operation id, which the ledger answers once.
- Live streams have no deadline: they are meant to stay open.
- Per call: `ObserveOptions.timeout` (every read entry's reads and queries,
  so `Data.subscriptions`, `Data.wiring`, `Remote.observe`) and
  `DomainMutateOptions.timeout` (`Data.mutate`, `Remote.mutate`). Both reach
  the wrapper through one internal `Context.Reference`, read where the
  deadline is applied, so the rule lives in one place. A durable write is
  sent by the outbox, which applies the client's deadline; `timeout` with
  `durable` throws, as `requestId` with `durable` does, rather than being
  dropped.
- The wrapper applies it, so a hand-written `RemoteClient` gets it through
  `Remote.coalesced(layer, { timeout })`; one given with `Layer.succeed`
  alone has none, as it has no coalescing.

Rejected: a timeout inside `Remote.http`. It would cover only one transport,
and a deadline inside the shared batch fails every requester at once.

## 2. Cancelling a read nobody waits on (#355)

The wrapper counts, per requirement key, the callers waiting on it. A read
in flight settles a set of keys. When the last caller of every key a read
settles has gone (its read entry restarted on new requirements, its deadline
passed, its runtime disposed), the read is interrupted and its transport
call aborted. The count is checked a frame (16 ms) later, so a read entry
that restarts and asks again for some of the same keys (a list narrowed by
typing, a window moved by a row) joins the read in flight instead of
cancelling and resending it. A timer turn alone was too short: Effect's
scheduler may start the restarted entry's fiber on a later timer turn, and
the coalescer's own test cancelled a read a restart was about to join.

- `RemoteJsonSend` becomes `(request: string, signal: AbortSignal) =>
  Promise<unknown>` (breaking, 0.x): `Remote.json` hands it the call's
  signal, and `Remote.http` passes it to `fetch`. An RPC client's call is a
  fiber, which Effect RPC interrupts on its own (it sends `Interrupt`).
- An answer that already landed is kept: a settled read is never
  interrupted, and every caller still waiting gets the whole answer, as a
  joined read does today.
- Lists (`coalesceQueries`) get the same rule: a superseded search's page
  request is aborted when no list waits on it.
- A cancelled read settles nothing: its keys leave the in-flight table at
  once, so the next caller starts a fresh read rather than joining a dead one.

Rejected: cancelling at the read entry. The entry does not know who else
joined its read; the wrapper owns the join, so it owns the release.

## 3. Many rows, a bounded few requests (#354)

The guarantee: one plan sends one `ReadBatch`, and one batch is cut into the
fewest requests that fit the limits the client knows, each read concurrently.
A view of N rows is `ceil` of its size over the limits, never N. A Model
change that keeps the same requirements does not restart the entry, so no
second request goes; a change that adds rows sends only the rows not already
in flight or stored.

`ClientOptions` gains the server's limits, so the client cuts a batch before
sending rather than having it refused whole:

- `maxIdsPerEntity`: default 1000, the server's default. A batch naming more
  ids of one Entity is cut into requests of at most that many.
- `maxBodyBytes`: default 1 MiB, the server's default (section 4). A request
  whose JSON payload would be larger is cut; one requirement too large alone
  fails `RemoteReadError` without being sent, as the server would refuse it.
  The payload is measured as JSON bytes and kept 512 bytes under the limit
  for the envelope (`{"operation":…}` over HTTP, the RPC request frame).
- Cutting happens in the coalescer, after merging, so each piece is its own
  read with its own keys: it is joined, settled and cancelled on its own.
- A query or a mutation cannot be cut: one larger than `maxBodyBytes` fails
  without being sent, `RemoteQueryError` or `RemoteMutationError` (not
  `RemoteUnreachable`: it was refused, so the outbox does not resend it).

The test is a page on the Foldkit runtime with hundreds of rows over
`Remote.http` and `serveFetch`, counting `POST`s and their sizes.

## 4. A body limit on the endpoint (#359)

```ts
serveFetch({ server, resolvePrincipal, layer, maxBodyBytes: 64 * 1024 })
```

- `FetchConfig.maxBodyBytes`, default 1 MiB (was unbounded). A body over it
  is a 413 with Remote's typed answer, `{ error, tooLarge: { limit } }`
  (`RemoteJsonAnswer`), before any decoding.
- Before allocation proportional to the body: a `content-length` over the
  limit is refused before the layer is built or the principal resolved; any
  other body is read as a stream, counted, and cancelled the moment it passes
  the limit (a chunked body, or a `content-length` that lies), then decoded
  as UTF-8 and parsed. The principal is resolved first, so a refused caller
  makes the server read nothing.
- `RemoteServer.bodyLimit(maxBytes)` is the same check as Effect HTTP
  middleware, for an endpoint that serves `RemoteRpc` through `RpcServer`
  (Effect's own `MaxBodySize` fails the RPC body read as a defect, a 500).
- The client: `Remote.http` reads a 413 as a refusal, whatever its body (a
  gateway's limit says the same): a read or a query fails with its own error,
  a mutation `RemoteMutationError`, never `RemoteUnreachable`, so a durable
  write is not resent forever.

## Tests

- Deadline: TestClock over a transport that never answers; read, query and
  mutation each fail as above; a durable write that times out is sent again
  under the same operation id; per-call deadlines override the client's.
- Cancellation: over `Remote.http` and `serveFetch`, a held `fetch` records
  its `signal`; a narrowed list keeps the in-flight read (no abort, one
  request), a disjoint one aborts it; a deadline aborts; a query superseded
  aborts. Over `Remote.json`, the signal reaches `send`.
- Batching: the runtime page with 556 rows sends one request; 2,500 rows
  send three under the default `maxIdsPerEntity`, each answered; a byte
  limit cuts into requests that each fit and together answer every row.
- Body limit: 413 by `content-length` with no read of the body and no
  principal resolved; 413 for a chunked body that passes the limit, with the
  stream cancelled; a body at the limit is answered; the RPC middleware over
  `RpcServer`; `Remote.http` reads a gateway's HTML 413 as a mutation error.
