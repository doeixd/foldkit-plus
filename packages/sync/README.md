# `foldkit-sync`

When a user checks off a todo or edits a note while offline or on a flaky connection, waiting for the server makes the UI stall—while building your own local queue, optimistic cache, retry loop, and reconciliation reducer beside [Foldkit](https://foldkit.dev/)'s `update` splits your state machine in two.

`foldkit-sync` lets you pick which fields of your Foldkit `Model` are shared across devices and which existing `Message`s change them. Each edit runs through your `update` immediately, persists to a local IndexedDB outbox, syncs to the server journal when connected, and replays cleanly on top of commits from other devices—keeping `Model`, `Message`, and `update` as your single state machine.

See offline sync running live in the [registry demo](https://foldkit-registry-demo.pages.dev/) and the [collaborative pages demo](https://foldkit-pages-demo.pages.dev/), or read [Replicated state](../../docs/replication.md) for client and server end to end (`foldkit-durable` provides the matching SQLite server journal).

## Choose between Sync, Remote, and Durable

| State | Owner | Package |
| --- | --- | --- |
| A route, selection, or transient error | local `Model` | plain Foldkit |
| Facts the server owns and clients cache | server | [`foldkit-remote`](../remote/README.md) |
| User edits that survive offline and converge | durable log | **`foldkit-sync`** |
| Authoritative commit order on the server | server journal | [`foldkit-durable`](../durable/README.md) |

Use `foldkit-remote` when refetching recovers server state, and `foldkit-sync` when client-authored edits live in the outbox and replay is recovery. `foldkit-sync` orders every document through one authoritative server log (for peer-to-peer merging without a server, use a CRDT instead).

## How optimistic edits rebase onto server commits

Your visible state is always the **server's committed snapshot** with your **pending local edits replayed** on top.

Suppose the server has committed `A`, `B`, `C`, and your tab edits `D`, `E` offline; you immediately see `replay(A, B, C, D, E)`. If another device commits `X` before `D` reaches the server, your next sync receives `X` and replays your pending edits on top: `replay(A, B, C, X, D, E)`. That rebase also handles rejections: drop the rejected edit from pending and replay the rest.

Each edit passes three observable milestones:

| Milestone | Where | What it proves |
| --- | --- | --- |
| **visible** | `Model`, at once | Shown on screen right away |
| **saved** | local outbox | Reloads and dropped connections keep it |
| **committed** | server journal | Every device sees it in this order |

Show "saved" from local persistence and "shared" from commit status; see [what to show the user](#what-to-show-the-user).

## Install

```bash
pnpm add foldkit-sync
```

`foldkit` and `effect` are peer dependencies; `foldkit-surface` comes with the package. Browser storage uses IndexedDB, and the server uses [`foldkit-durable`](../durable/README.md) or a custom implementation of [the exchange](#the-exchange).

## A first synced todo list

This declares a Foldkit todo app whose `todos` list syncs via `CreatedTodo` while `selectedTodoId` and `lastError` stay local to this tab:

```ts
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { MessageSet, Projection, Surface } from 'foldkit-surface'
import { DocumentId, forApplication } from 'foldkit-sync'

const Model = Schema.Struct({
  todos: Schema.Array(Schema.Struct({ id: Schema.String, title: Schema.String })),
  selectedTodoId: Schema.Option(Schema.String),
  lastError: Schema.Option(Schema.String),
})
const Message = defineMessageUnion({
  CreatedTodo: { id: Schema.String, title: Schema.String },
  SelectedTodo: { id: Schema.String },
})
const initial: typeof Model.Type = { todos: [], selectedTodoId: Option.none(), lastError: Option.none() }
const App = Surface.application({
  Model, Message, initial,
  update: (model, message) => Message.match(message, {
    CreatedTodo: ({ id, title }) => ({ model: { ...model, todos: [...model.todos, { id, title }] } }),
    SelectedTodo: ({ id }) => ({ model: { ...model, selectedTodoId: Option.some(id) } }),
  }),
})
const TodoSync = forApplication(App).make({
  documentId: DocumentId.make('todos'),
  shared: Projection.pick(App.model.todos),
  durable: MessageSet.make(App, [Message.CreatedTodo]),
})

TodoSync.durable(Message.CreatedTodo({ id: 't1', title: 'Milk' })) // true
TodoSync.journalContract().empty() // { todos: [] }
```

What `TodoSync` defines:

| Member | Scope | Behavior |
| --- | --- | --- |
| `todos` | shared | Replicated, persisted, journaled |
| `selectedTodoId`, `lastError` | local | Kept in this tab only |
| `CreatedTodo` | durable | Queued in outbox, committed by server |
| `SelectedTodo` | local | Runs through `update` locally |

From that single declaration, `make` derives the shared codecs, empty snapshot (`{ todos: [] }`), wire envelope, deterministic replay via your `update`, and the server's [journal contract](#the-server). `TodoSync` is a pure declaration; opening IndexedDB and mounting the app happen next.

## Run it in the browser

Three steps connect `TodoSync` in the browser: open tab storage and a replica, mount the application over it, and start the exchange loop.

```ts
import { Effect, Scope } from 'effect'
import { modifyFields } from 'foldkit/struct'
import { Sync } from 'foldkit-sync'

const container = document.getElementById('app')!

// This tab's store, kept across reloads; its connection lives for the page.
const scope = Effect.runSync(Scope.make())
const replica = await Effect.runPromise(
  Sync.tabStorage('todos').pipe(
    Effect.flatMap(TodoSync.openReplica),
    Effect.provideService(Scope.Scope, scope),
  ),
)

const mounted = Sync.mount(App, TodoSync, {
  replica,
  container,
  view: (model, h) => ({
    title: 'Todos',
    body: h.ul([], model.todos.map(todo => h.li([], [todo.title]))),
  }),
  onPersistenceFailure: (model, error) =>
    modifyFields(model, { lastError: () => Option.some(error.message) }),
})

Effect.runFork(
  Effect.provide(replica.start, Sync.transport.socket({ url: 'wss://example.com/sync' })),
)

mounted.dispatch(Message.CreatedTodo({ id: crypto.randomUUID(), title: 'Milk' }))
```

What each call does:

- **`Sync.tabStorage('todos')`** opens this tab's IndexedDB store using a key in `sessionStorage`, so reloads reopen the same store (including unsent edits) while duplicated tabs get separate stores.
- **`openReplica(storage)`** reads the saved committed snapshot, cursor, and outbox locally (deferring network sync until `replica.start` runs). Its minted `replicaId` identifies one store—never a person—so operation ids (`replicaId:count`) never collide across browsers; pass `{ replicaId }` in tests or servers.
- **`Sync.mount(App, TodoSync, …)`** runs Foldkit with your `view` and `update`. Durable `Message`s update the `Model` immediately and persist via a Command (reverting and calling `onPersistenceFailure` if persistence fails), while local `Message`s run directly.
- **`replica.start`** runs the exchange loop on startup, after each submit, and on server commit notices, retrying failed exchanges with backoff from 0.5 s to 30 s (or immediately on the next edit) and reporting issues via `status`.
- **`mounted.dispatch`** dispatches a `Message` into the mounted app (`container` requires an `id` attribute).

Reload the page: `todos` restores from the outbox and committed snapshot while `selectedTodoId` resets to `Option.none()`.

`mounted` also exposes `model()`, `subscribe`, `observe`, `committed`, `settled()`, and `dispose()` (which awaits in-flight persists while leaving the replica open; close the replica via `scope`). Pair `settled()` with `Frames.track` from `foldkit-mixins/testing` (`await frames.settle(mounted)`) in tests.

## The server

The server answers the exchange: it takes a cursor and pending operations,
commits what it accepts, and returns what the replica is missing. With
`foldkit-durable`, the same contract supplies the journal's codecs, empty
snapshot, reducer, and any [authorization](#authorize-on-the-server):

```ts
import { Effect } from 'effect'
import { ActorId, Journal, OpId } from 'foldkit-durable'
import type { SocketLike } from 'foldkit-sync'
import { serveJournal } from 'foldkit-sync/journal'

type Principal = { readonly actorId: string }

const server = Effect.gen(function* () {
  const journal = yield* Journal.make({
    ...TodoSync.journalContract(),
    file: 'todos.sqlite',
    opId: operation => OpId.make(operation.opId),
    actorId: (principal: Principal) => ActorId.make(principal.actorId),
  })
  // One accepted socket, as the principal its authentication established.
  return (socket: SocketLike, principal: Principal) =>
    serveJournal(socket, { sync: TodoSync, journal, principal })
})
```

`foldkit-sync/journal` is the exchange over the journal (`foldkit-durable`,
an optional peer of this package):

- **`serveJournal(socket, options)`** answers one socket's exchanges and sends
  a notice after each commit, so its replica hears of others' edits.
  `journalExchange(options)` is the same exchange as a `TransportClient`, for
  `Sync.transport.fromPromise` in process; `journalChanges` the notice alone.
  Both report to `diagnostics`, when given, since a notice is sent from
  outside any Effect context.
- **What cannot be taken is rejected by its id, not left to fail the
  exchange.** An operation whose message does not decode, that names another
  document, that `authorize` or `validate` refuses, or that reuses an id for
  other content fails the same way on every retry, so the replica drops it
  and the edits behind it still go. Only an entry with no id, a cursor ahead
  of the journal's, a connection `opens` refuses, or `admit` or the journal
  failing fails the exchange.
- **`admit(operation)`** decides before the journal reads it, by what the
  transport established (a principal that may only read) or by what cannot
  run under the journal's lock (a rule that reads the rows an edit names,
  `foldkit-guard/sync`): `true` admits, a refusal is rejected by id with its
  reason, and it may answer with an `Effect`. A rule about the document
  belongs in `authorize`.
- **`opens`**, an `Effect` of whether the connection may open the document at
  all: refused, every exchange fails and nothing is read or appended, and
  `serveJournal` sends it no notice of a commit. It is asked each exchange, so
  access taken away holds from the next one.
  `defineDocumentHost` takes both as functions of the principal.
- **`settle`** runs after each exchange's appends: apply what committed to
  another store, through `journal.recover`. It runs every exchange, so a
  write that failed is tried again.
- The reply carries what committed since the cursor, a page at a time
  (`limit`, `more`), a checkpoint when that history was compacted, and the
  journal's epoch: a replica of a reset journal is answered from the start.

[The replicated state guide](../../docs/replication.md#3-the-server-an-exchange-over-the-journal)
says why each rule is there, and [`examples/sync`](../../examples/sync) writes
the exchange by hand, with an effect policy per committed operation.

A server that is not Durable implements the same [exchange](#the-exchange).

Import what a server calls by name (`forApplication`, `serveJournal`,
`servePresence`), not through the `Sync` namespace object: a bundler keeps
every member of an object, so `Sync.forApplication` in a server's bundle also
carries the client's mount, sockets, presence and IndexedDB code.

## Serving from a Durable Object

On Cloudflare, one object per document is the single writer the journal
wants. `defineDocumentHost` from `foldkit-sync/do` defines that class: each
accepted socket exchanges against the same journal through `serveJournal`,
and the replica side is the socket transport it already speaks:

```ts sketch
import { DurableObject } from 'cloudflare:workers'
import { defineDocumentHost } from 'foldkit-sync/do'

export class SyncHost extends defineDocumentHost(DurableObject, {
  sync: TodoSync,
  // A D1 journal as the durable D1 guide opens one.
  openJournal: (_ctx, env) => openTodosJournal(env.DB),
  resolvePrincipal: request => Effect.succeed(request.headers.get('x-actor') ?? 'anon'),
}) {}
```

```ts sketch
// The worker: one object per document.
export default {
  fetch: (request: Request, env: Env): Promise<Response> =>
    env.SYNC_HOST.get(env.SYNC_HOST.idFromName('todos')).fetch(request),
}
```

```ts
// A replica: the reconnecting client it already speaks.
Sync.transport.socket({ url: 'wss://example.com/sync' })
```

- The base class is a parameter, so the module imports no worker runtime.
  `openJournal` runs once, on the first upgrade: over D1 (`d1: true`, see
  [the durable D1 guide](../durable/README.md#on-cloudflare-d1-d1-true)), or
  the object's SQLite storage through `ctx`.
- Each upgrade resolves its own principal, an Effect that refuses the caller
  by failing with a `RemoteUnauthenticated`
  (`RemoteServer.unauthenticated(reason?)` makes one): a 401 that says
  `Unauthenticated`, or the refusal's `reason`, the words written for the
  caller, when it has one. Its `message` is never sent. Non-upgrades are 404s
  that open nothing. A resolver that breaks (it dies, throws, or fails with
  anything but a `RemoteUnauthenticated`), a `layer` that fails to build, or
  a journal that never opened, is a 500 that says `Internal error` and an
  `incident`, and nothing of the cause, which is reported as a `HostDefect`
  under that incident (see [Diagnostics](#diagnostics)). A session store that
  is down is no refusal: let it die (`Effect.orDie`), so the caller is not
  told to sign in again.
- A resolver that reads a service (a session store) takes it from
  `layer: env => Layer`, required exactly when the resolver needs one. It is
  built per upgrade and kept until the socket closes, so `revalidate` reads
  an open store; a refused upgrade closes it at once.
- `revalidate: { every, key? }` asks the resolver again, of the upgrade
  request, while the socket is open: a refusal closes it with 4401 and the
  reason `Unauthenticated`, or the refusal's `reason` when it has one (cut to
  the 123 bytes a close reason carries), and a principal whose `key`
  (`Policy.keyOf`) changed with 1012, which the replica reconnects after. A
  resolver that breaks closes it with 1011 `Internal error`. Without it a
  socket serves its first principal until it closes.
- `server: { principal, reactions: env => [...], runsPerPass? }` gives the
  object its [reactions](#work-after-a-commit-reactions): registered when the
  journal opens, before any socket is served; the alarm set before the reply
  to an exchange that committed, a pass run after it, and `alarm()` running
  them and setting the alarm from what they answer, then calling the base
  class's own `alarm()` if it has one. The reactions' part never throws, so
  the runtime's few retries of a throwing alarm are never what a run depends
  on; it runs one pass at a time, and only ever brings the object's one alarm
  earlier. A reaction declared for another contract is refused when the
  object is made. A `setAlarm` that fails after a commit is reported, the
  application's `settle` still runs, and the next exchange arms again.
  A pass that broke is a `HostDefect` (`Alarm`), and the alarm comes back in
  30 seconds. The base class's `alarm()` shares that one alarm: it runs on
  every wake, so it decides for itself what is due, and sets its own next
  wake with `armAlarm(ctx.storage, at)` from `foldkit-sync/do`, which only
  ever brings the alarm earlier. A subclass that overrides `alarm()` calls
  `super.alarm()`, or the reactions stop being resumed.
- `settle: (env, journal) => Effect` runs after each exchange's appends, before
  the reply is read, to apply what committed elsewhere — the Remote tables a
  reader then queries. `journal.recover` makes it crash-safe and idempotent;
  `env` and the journal are handed over because the store they reach lives
  outside the exchange.
- Off Cloudflare, `documentHost` from `foldkit-sync/journal` is the same
  host without the class: `documentHost({ sync, journal, resolvePrincipal,
  layer?, revalidate?, opens?, admit?, settle? })` answers each upgrade
  request before a socket opens, refused with the `Response` to send, or
  accepted with `serve`, for the socket once the runtime has opened it (a
  `HostSocket`: Sync's socket, plus `closeWith(code, reason)`), and
  `abandon`, for when it never will (the client left, the handshake was
  refused). One of the two must follow: until then the upgrade holds what
  its `layer` built. `defineDocumentHost` is built on it.
- A server socket is not a live stream: another request cannot wake the fiber
  of an open SSE response in a worker, not even from the same isolate. What
  crosses requests there is the store they share (D1 here), and the live side
  re-reads it from inside its own request. See
  [the Cloudflare example](../../examples/cloudflare).
- `Sync.transport.workerSocket` wraps the accepted end of a `WebSocketPair`
  for `serveJournal`, anywhere else a platform hands one over.

## What makes a Message durable

Replay runs a durable Message through `update` on another machine, later,
possibly many times as the base beneath it moves. So it has to be a
deterministic, state-only transition of the shared slice. `make` derives replay
from `update` and refuses a durable Message whose transition:

- returns a Command, because an effect cannot be replayed; or
- changes a field outside `shared`, because that change would be lost.

A refused Message fails `submit` with `ReplayError` and writes nothing, so a
mistake shows on the first edit instead of as diverging replicas later.

Replay also reads nothing but the slice. A durable Message whose `update` reads
a local field (a `filter` that decides which todos to clear) shows one slice on
this page and replays to another everywhere else, the server included.
`Sync.mount` catches it as the Message is dispatched: it runs `update` again
with every local field that is not at its `initial` value reset, and when the
two slices differ it does not apply the Message and does not submit it. The
failure reaches `onPersistenceFailure` as a `ReplayError` that names the
fields: `durable "ClearedShown" reads Model fields outside the shared
projection: filter`. A Message that reads a local field and still produces an
equal slice is accepted, and so is one over a slice that holds pending edits.
The check costs one more `update` per durable dispatch, and none while every
local field is still at its `initial` value. `replica.submit` has no Model and
cannot make it; a replica used without `mount` is not checked.

The consequence is a pattern you will use everywhere: **an intent mints, a fact
records**. Keep a local intent Message (such as `RequestedTodo { title }`) whose
`update` returns a Command that reads the clock or mints an id, then dispatches
the pure, durable fact Message (`CreatedTodo { id, title, at }`) over the shared
slice.

Put every nondeterministic input (ids, timestamps, the result of a provider
call) *inside* the fact. `update` for the fact only applies it.

When the intent needs nothing outside the Model, say an id from a counter in
the shared slice, return the fact as `Sync.fact(message)` instead of an
ordinary Command. The mount applies it in the intent's own transition, before
any later Message, so two intents dispatched together cannot read the same
counter. Outside the mount it is an ordinary Command.

A durable `update` should also be idempotent where a retry could deliver one
operation twice, as in `CreatedTodo` ignoring an id it already holds.

## What to show the user

The three milestones each have a reader.

**Visible** is the Model. Nothing to do.

**Saved** is the persist. Between the edit showing and the persist finishing,
a reload would lose what the user saw, so the browser asks before the page
unloads (`beforeunload`) until every shown edit is stored; it usually takes
milliseconds. `onPersistenceFailure` runs when it fails, after the
edit has been reverted; the Model it returns is what the user sees next. The
error names why: `ReplayError` for a Message that cannot be durable,
`StorageError` for IndexedDB.

**Committed** is the replica's status:

```ts
const status = Effect.runSync(replica.status)
// { pending, cursor, lastError: string | undefined, rejected: ReadonlyArray<Rejection>, refused, epoch }
```

`pending` above zero means edits the server has not confirmed; `lastError` is
the last failed exchange, cleared by the next success; `rejected` lists recent
edits the server refused, most recent first, each `{ opId, refusal, operation, message }`,
where `refusal` is an `Option` of why (a `SyncRefusal`, below),
`operation` is the refused operation as it was sent, which the replica has dropped
from the outbox, and `message` its Message encoded at the current version
(see [changing a durable Message](#change-a-durable-message)), so a page reads
what it changed from here. `refused` lists the operations this build cannot
read at all, kept until `replica.dismiss(opId)`. `replica.statusChanges` is a Stream of the same,
emitted now and after every submit and exchange (subscribed before its first
read, so a subscriber slow to take one misses no change); `replica.changes`
pairs it with the optimistic `shared` value so one subscription sees both.

**A refused edit** arrives as a rejection on the next exchange, not as an
error. The replica drops it and replays the rest; the mount re-installs the
shared slice, and the field the user edited reverts. `onPersistenceFailure`
does not run for this, since the local save succeeded. Watch `rejected` to
explain the revert. Each rejection's `refusal` is a `SyncRefusal`, in Remote's
vocabulary for "not saved", so a page that also shows Remote's refusals
handles both with one function:

- `Forbidden { reason }`: `authorize` or `admit` refused who sent it, or its
  replica belongs to another actor. `reason` is the rule's own words when it
  gave some (a plain `false` gives none), cut to 500 characters. Remote's
  `Denied.Forbidden` has the same shape.
- `Invalid { message, entity, rule, path }`: the operation failed. When it
  breaks one of the contract's [laws](#laws-what-every-snapshot-keeps), `rule`
  is the law's id and `message` and `path` are the law's own. Otherwise `rule`
  and `path` are empty and `message` is a fixed sentence: "Not a valid
  operation" when `validate` refused or threw, `authorize` or a law threw, or
  the reducer could not apply it; "Not an operation this server accepts" when
  it did not decode or named another document; "Its id was already used for
  another" for a reused id. `journalExchange` names no Entity, so `entity` is
  empty; the shape is Remote's `Refusal.invalid`.
- `Unreadable { version }`: written at an older Message version that no step
  of the server's history reads. The replica keeps such an operation in
  `status.refused` as well, with its payload (see
  [changing a durable Message](#change-a-durable-message)).

```ts
import { Option } from 'effect'
import { SyncRefusal, type Rejection } from 'foldkit-sync'

const said = (rejection: Rejection): string =>
  Option.match(rejection.refusal, {
    onNone: () => 'Refused by the server',
    onSome: SyncRefusal.match({
      Forbidden: ({ reason }) => Option.getOrElse(reason, () => 'You may not change this'),
      Invalid: ({ message }) => message,
      Unreadable: () => 'Made by another version of the app, so not saved',
    }),
  })
```

`refusal` is none when the server named none (an older or a custom server), or
named one this build cannot read, which the replica reports as
`UnknownRefusal` and still treats as rejected. The server never sends an
error's message, which may carry internals, so a rule a person should read
about belongs in `authorize` with a `reason`, not in `validate`. The
deprecated `reason` (the words alone, an `Option<string>`) is still filled
for one release; read `refusal` instead.

**Waiting for the server.** The Model shows an edit before the server has it.
Something that must not report success until the edit is committed, an agent
tool for instance, waits on `mounted.committed`: the shared slice as the server
confirmed it, with no pending edit applied. It is a source, `{ get, subscribe }`,
told after every exchange:

<!-- docs-check
import { Agent } from 'foldkit-agent'
-->
```ts
const completion = Agent.when({
  source: mounted.committed,
  predicate: (shared, request: { readonly id: string }) =>
    shared.todos.some(todo => todo.id === request.id),
})
```

That completes after the exchange that commits the todo and never for one the
server rejects.

## Growing the application

### Compose a document from features

Each feature declares the fields it shares and the Messages that change them;
`compose` merges them into one document:

<!-- docs-check standalone
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { MessageSet, Projection, Surface } from 'foldkit-surface'
import { DocumentId, forApplication } from 'foldkit-sync'
const Model = Schema.Struct({
  todos: Schema.Array(Schema.Struct({ id: Schema.String, title: Schema.String })),
  members: Schema.Array(Schema.String),
})
const Message = defineMessageUnion({
  CreatedTodo: { id: Schema.String, title: Schema.String },
  RenamedTodo: { id: Schema.String, title: Schema.String },
  Invited: { email: Schema.String },
})
const App = Surface.application({
  Model,
  Message,
  initial: { todos: [], members: [] },
  update: model => ({ model }),
})
-->
```ts
const AppSync = forApplication(App)

const Todos = AppSync.fragment({
  shared: Projection.pick(App.model.todos),
  durable: MessageSet.make(App, [Message.CreatedTodo, Message.RenamedTodo]),
})

const Members = AppSync.fragment({
  shared: Projection.pick(App.model.members),
  durable: MessageSet.make(App, [Message.Invited]),
})

const Board = AppSync.make({
  documentId: DocumentId.make('board'),
  ...AppSync.compose(Todos, Members),
})
```

`compose` throws on a field declared twice with different codecs, a Message
declared durable twice, or a fragment from another application. The result is
still one document: one outbox, one cursor, one server order.

### Authorize on the server

Policy belongs on the contract, beside the Messages it governs, and runs on the
server inside the journal's commit. The client never runs it.

```ts
const Authorized = forApplication(App).withPrincipal<{ readonly role: 'admin' | 'guest' }>()

const GuardedBoard = Authorized.make({
  documentId: DocumentId.make('board'),
  ...Authorized.compose(Todos, Members),
  authorize: {
    RenamedTodo: ({ principal, message, shared }) =>
      principal.role === 'admin' && shared.todos.some(todo => todo.id === message.id),
  },
})
```

A rule returns `true`, `false`, or `{ allowed: false, reason }`; the reason
is sent to the replica whose edit it was, as its rejection's
`Forbidden` refusal.

`message` is exactly that variant, `shared` is the authoritative snapshot, and
`principal` is whatever the server's transport established for the connection;
it is never read from the operation. A variant without a rule is allowed. A key
that is not a durable variant is a type error. The rules ride in
`journalContract()`, so the server enforces them by spreading the contract.

An edit the policy refuses still shows at once on the client, then comes back
as a rejection, as [above](#what-to-show-the-user).

### Laws: what every snapshot keeps

`authorize` decides who may make a change. What the document must always be,
whoever changes it and whichever Message does, is a **law**: a predicate over
the snapshot an operation leaves.

```ts
const CappedBoard = AppSync.make({
  documentId: DocumentId.make('capped-board'),
  ...AppSync.compose(Todos, Members),
  laws: {
    atMost100Todos: {
      holds: ({ after }) => after.todos.length <= 100,
      message: 'A board holds 100 todos',
      path: ['todos'],
    },
  },
})
```

Commit pipeline: `operation` → `validate` → `authorize` → `reduce` → `laws(before, after)` → written.

- **Where it is judged.** The contract's `journalContract()` carries a
  `judge` built from the laws, which the journal runs inside the commit after
  `reduce`, over the snapshot before and the one the operation leaves. The
  first law that does not answer `true`, in the record's order, refuses the
  operation: `journalExchange` sends it as `Invalid` with the law's id as
  `rule`, its `message`, and its `path`. On D1 a commit that lost a race is
  reduced and judged again over the snapshot it then lands on.
- **What it sees.** `holds` gets `{ before, after }`, typed over the shared
  fields alone, so a law that reads a local field does not compile. It sees no
  principal and no Message: a rule about who belongs in `authorize`.
- **In the Module graph.** The contract declares its law ids
  (`contract.laws.model`), and `Graph.of` draws a law per declared law
  (`sync:<name>.<id>`), read as reading the whole shared slice since `holds`
  is a function, and a transition per durable and server-only tag
  (`durable:<tag>`), each writing it. So `Graph.validate(module, { evidence })`
  reports each durable Message as `law-unwitnessed` against each law until a
  walk or a scenario (`Scenario.runMessages`) issues its evidence, or an
  `Evidence.runtimeOnly` line says only the journal's judge refuses it: a
  durable Message added later is reported until something draws it.
- **Matching the refusal.** `CappedBoard.laws.atMost100Todos` is the declared
  law (`{ id, message, path }`), and
  `Sync.isInvalidBy(refusal, CappedBoard.laws.atMost100Todos)` tells its
  refusal from any other.
- **On the replica.** `submit` judges the Message's optimistic result before
  writing the outbox, and fails with `LawBrokenError` (`rule`, `message`,
  `path`) when it breaks a law, so nothing is sent; `Sync.mount` reverts the
  edit it showed and hands the error to `onPersistenceFailure`. It is a hint: the
  optimistic snapshot holds pending edits the server may still refuse, and the
  server judges again where it commits.
- **Strict.** A law judges `after`, whatever `before` held. A document that
  already breaks one, because the law was added after the fact, refuses every
  operation that leaves it broken until one repairs it. To let such documents
  shrink toward a new cap, write the law over `before` too
  (`after.todos.length <= Math.max(100, before.todos.length)`), and run
  `CappedBoard.judge(snapshot, snapshot)` over the stored snapshots before the
  deploy to find the ones it would refuse.
- **The server's own appends** go through the same commit, so
  `appendAsServer` and a reaction's appends are judged too.

`make` throws for a law whose id or message is over 500 characters, or whose
`path` names more than 16 fields: its refusal could not be sent.

### Stamp what only the commit decides

A fact carries its own nondeterminism, but a client cannot know where its
operation lands in the server's order. A stamp writes it in, on the server, as
the journal commits:

<!-- docs-check standalone
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { MessageSet, Projection, Surface } from 'foldkit-surface'
import { DocumentId, forApplication } from 'foldkit-sync'
const Model = Schema.Struct({
  prices: Schema.Array(Schema.Struct({ id: Schema.String, cents: Schema.Number, at: Schema.Number })),
})
-->
```ts
const Message = defineMessageUnion({
  // `at` is absent on what a client sends: the server's sequence once committed.
  PriceEdited: { id: Schema.String, cents: Schema.Number, at: Schema.optionalKey(Schema.Number) },
})

const App = Surface.application({
  Model,
  Message,
  initial: { prices: [] },
  update: model => ({ model }),
})

const Prices = forApplication(App).make({
  documentId: DocumentId.make('prices'),
  shared: Projection.pick(App.model.prices),
  durable: MessageSet.make(App, [Message.PriceEdited]),
  stamp: {
    PriceEdited: ({ id, cents }, { sequence }) => Message.PriceEdited({ id, cents, at: sequence }),
  },
})
```

The rule gets that variant and `{ sequence, actorId, replicaId }` (the
replica that sent it, which tells one person's tabs apart), and returns the same
variant; a key that is not durable is a type error, and a rule that returns
another variant has its operation rejected. It rides in `journalContract()` as
Durable's `stamp`, so the journal stores, reduces and sends the stamped
Message. A replica shows what it sent until the exchange, then replays the
stamped Message in its place, the same on every replica. A retry is still
recognized by what was sent.

Use it for what a reader compares with the server's order: a read model that
records the last sequence it applied can tell which edits it holds by comparing
the two. A client that sends the stamped field itself is claiming a commit it
did not get; refuse it in the journal's `validate`.

### Messages only the server appends

Some facts only the server may record: a payment provider confirmed a
charge, the table absorbed an edit. Declare those Messages `serverOnly`,
beside `durable`. A replica stores and replays them like any other; it can
never submit one:

<!-- docs-check standalone
import { Effect, Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { MessageSet, Projection, Surface } from 'foldkit-surface'
import { DocumentId, forApplication } from 'foldkit-sync'
import type { Journal } from 'foldkit-durable/core'
import type { Operation, WrittenOperation } from 'foldkit-sync'
const Order = Schema.Struct({ id: Schema.String, paid: Schema.Boolean, receipted: Schema.Boolean })
const Model = Schema.Struct({ orders: Schema.Array(Order) })
type Model = typeof Model.Type
-->
```ts
const Message = defineMessageUnion({
  PlacedOrder: { id: Schema.String },
  ConfirmedPayment: { id: Schema.String, charge: Schema.String },
  SentReceipt: { id: Schema.String },
})

const mark = (model: Model, id: string, change: Partial<typeof Order.Type>): Model =>
  modifyFields(model, {
    orders: () => model.orders.map(order => (order.id === id ? { ...order, ...change } : order)),
  })

const App = Surface.application({
  Model,
  Message,
  initial: { orders: [] },
  update: (model, message) => ({
    model: Message.match(message, {
      PlacedOrder: ({ id }) =>
        modifyFields(model, {
          orders: () => [...model.orders, { id, paid: false, receipted: false }],
        }),
      ConfirmedPayment: ({ id }) => mark(model, id, { paid: true }),
      SentReceipt: ({ id }) => mark(model, id, { receipted: true }),
    }),
  }),
})

const Confirmed = MessageSet.make(App, [Message.ConfirmedPayment])
const Receipted = MessageSet.make(App, [Message.SentReceipt])

const Orders = forApplication(App).make({
  documentId: DocumentId.make('orders'),
  shared: Projection.pick(App.model.orders),
  // What a replica may submit.
  durable: MessageSet.make(App, [Message.PlacedOrder]),
  // What only the server appends. A Message in both sets is a type error.
  serverOnly: MessageSet.union(Confirmed, Receipted),
})
```

- **A replica submitting one is a type error**, and refused at run time.
- **The server refuses one any replica sends**, whoever it says it is:
  every reader of a sent entry (`codec.writtenFrom`, `normalizeOperation`,
  `operationFrom`) refuses it, judged after
  [upcasting](#change-a-durable-message), before `admit`, `validate` or
  `authorize` run. `journalExchange` rejects it by its id as `Forbidden`
  ("Only the server makes this change") and reports a `ServerOnlySubmitted`
  diagnostic; the edits beside it still go. No rule about who the principal
  is is involved, so a resolver's mistake cannot let one through.
- **Replica ids under `server/` belong to the server**: a sent entry naming
  one is rejected as `Invalid`, and so is one whose replica id is longer than
  128 characters.
- The contract's `surface` still lists `durable` alone, so an agent bound to
  it cannot dispatch a server-only Message; `authorize` and `stamp` rules may
  name one.

The server appends one through `serverJournal` from `foldkit-sync/journal`,
as a principal it holds in code and never resolves from a request:

<!-- docs-check
declare const journal: Journal<Operation, { readonly orders: Model['orders'] }, { readonly actorId: string }, WrittenOperation>
-->
```ts
import { serverJournal } from 'foldkit-sync/journal'

const serving = Effect.gen(function* () {
  const server = yield* serverJournal({ sync: Orders, journal, server: { actorId: 'orders' } })
  // A payment provider's webhook: its event id names the fact.
  return (event: { readonly id: string; readonly order: string; readonly charge: string }) =>
    server.appendAsServer(Message.ConfirmedPayment({ id: event.order, charge: event.charge }), {
      key: `payment/${event.id}`,
    })
})
```

- **`key` names the fact**, and is required: a webhook's event id, a clock
  tick. A repeat with the same key and Message appends nothing new, so a
  redelivered webhook is harmless; the same key with another Message fails
  with `ServerKeyReusedError`, and the first fact stands. A key is a
  non-empty string of at most 200 characters.
- **It goes through the journal's `append`**, so `validate`, `authorize` and
  the laws judge it like any operation.
- **Keep the server's `actorId`.** The journal binds each replica id to the
  first actor that commits from it, so after a change of `actorId` a
  redelivered key is an `IdentityConflictError`: that fact was the first
  actor's. A new key, and a reaction's append for a new commit, commit as the
  new actor.
- **A refused append frees its key.** The key is recorded before the append,
  so a redelivery after a deploy appends the bytes first written; when the
  journal refuses the append (`validate`, `authorize`, a law), nothing committed and
  the record is cleared, so the key can name a Message the rules take. A
  redelivery after a refusal is judged afresh: refused again with the same
  error, or committed if the rules now take it, never `ServerKeyReusedError`.
- **Each key leaves a row.** The journal keeps a replica binding per
  `appendAsServer` key, and one per reaction append (per trigger and
  index), in `foldkit-durable`'s `replicas` table; neither compaction nor
  `reset` deletes them, so they grow with the facts and reactions recorded.
  Nothing prunes them yet.
- A server that hands `foldkit-durable`'s `append` input it did not first read
  with a `codec` reader gets no server-only check: the journal knows no
  Message's tag. Read every sent entry with `codec.writtenFrom` before
  appending it, as `journalExchange` does. The types hold you to it: what an
  exchange receives (`Sync.transport.serve`'s `exchange`, a `TransportClient`,
  a `loopback` handler) is `ReadonlyArray<unknown>`, and `append` takes only
  a `WrittenOperation`.

### Work after a commit: reactions

A reaction runs after each committed Message of a set, in journal order:
mail a receipt, call a provider, append a server-only Message as a result.
It is a declared value, given to the `serverJournal`:

<!-- docs-check
declare const sendReceipt: (order: string, idempotencyKey: string) => Effect.Effect<void, Error>
-->
```ts
import { reaction } from 'foldkit-sync/journal'

const receipt = reaction(Orders, {
  name: 'receipt',
  on: Confirmed,
  appends: Receipted,
  run: ({ message, key }) =>
    sendReceipt(message.id, key).pipe(Effect.as([Message.SentReceipt({ id: message.id })])),
})

const running = Effect.gen(function* () {
  // Made before the journal serves its first exchange: the reaction sees every commit after it.
  const server = yield* serverJournal({
    sync: Orders,
    journal,
    server: { actorId: 'orders' },
    reactions: [receipt],
  })
  // One pass; none when every reaction has caught up, else how long to wait.
  const next: Option.Option<unknown> = yield* server.react
  return { server, next }
})
```

On each commit, `react` reads operations after the stored cursor, runs the reaction handler (recording its answer), appends any returned messages as the server, and advances the cursor.

- **At least once, never exactly once.** The provider and the journal share
  no transaction: a crash or a timeout between the call and the ledger's
  record runs the call again. `key` is the same on every run of one
  reaction on one commit (64 hex characters); give it to the provider as its
  idempotency key, and the provider decides whether a repeat is a no-op. The
  appends are once: their ids come from the reaction and its trigger's id
  (never its place in the order, which a `reset` reuses), and the journal
  answers a repeat from history.
- **The cursor is stored** beside the journal (`foldkit-durable`'s schema 7),
  one per reaction, so a restart neither walks the log again nor misses what
  committed while it was down. A reaction starts where the journal was when
  `serverJournal` registered it: deploying a mailer does not mail the past.
- **A run that fails waits**: that reaction stops at the commit, on a backoff
  from 0.5 s doubling to 30 s that the store keeps, and the others go on.
  `react` never fails; it reports `ReactionFailed` and answers the delay. A
  defect and a timeout (`timeout`, 10 s by default) are failures like any
  other.
- **A run that can never succeed is parked**: the journal refused its append
  (`validate`, `authorize`, a law), or its answer holds a Message `appends` does not
  name, more than 16, or one that will not encode. So is one that has failed
  `attempts` times (8) *and* for at least `parkAfter` (an hour), so an outage
  parks nothing. The journal itself failing counts toward neither. A parked
  run is reported as `ReactionParked` and set aside with its trigger; the
  reaction goes on. Why it failed, on `parked`'s `error` and the report's
  `cause`, is the failure's own text (a provider's, a driver's), kept beside
  the journal for whoever runs the server: no exchange sends it, and a page
  for the document's readers should not show it. `parked` lists them, `retry` runs one again out of order
  (a recorded answer is reused, so no second call), and `dismiss` gives one
  up. After a `reset` a parked run is `stale`: it can be dismissed, not
  retried.
- **Compact no further than `settledThrough`**, the lowest reaction cursor,
  or a reaction skips what it never saw (`ReactionSkipped`).
- **What a handler is given** is the committed Message, its id, sequence and
  actor: never the snapshot, which has moved on by the time it runs. Its
  fields are what a client wrote; a handler that mails `message.email` mails
  wherever the client said.
- A reaction's append commits where the journal is when it runs, after
  whatever committed meanwhile. Two reactions in a cycle (one appends what
  the other runs on) are refused when the journal is made.

Who calls `react` is the host's:

- **A long-lived process** forks `server.follow`: it runs `react` now, after
  each commit this journal instance hears of, and after the delay `react`
  answers. A reaction's commit reaches the document's sockets through
  `serveJournal`'s notices.
- **A Durable Object**: give `defineDocumentHost` a `server` (below). It
  registers the reactions when it opens the journal, sets the object's alarm
  before replying to an exchange that committed, runs them without holding
  the reply, and `alarm()` runs them again and sets the alarm from their
  answer. Work after a reply lasts only while the object stays loaded; the
  alarm is what resumes a run eviction cut off.
- **A stateless Worker over D1**: `ctx.waitUntil(server.react)` in the
  request that committed, with `runsPerPass` at 1 or 2 since `waitUntil`
  lasts about 30 seconds, and a Cron Trigger calling `react` for what failed
  or was cut off. Two isolates may run one reaction at once, a duplicate call
  without a crash. And no other request is told: a reaction's commit reaches
  another replica when it next exchanges, never as a notice, since one
  request cannot wake another's stream.

`settle` stays for a read model the reply depends on: it runs before the
reply and may fail the exchange. Reactions are for everything else.

### Coalesce a burst of typing

Typing makes one durable Message per keystroke. `coalesce(last, next)` is
offered each submit together with the last operation in the outbox; return a
merged Message to replace it, or `undefined` to keep them apart:

```ts sketch
coalesce: (last, next) =>
  last._tag === 'RenamedTodo' && next._tag === 'RenamedTodo' && last.id === next.id
    ? next
    : undefined
```

Replaying the merged Message must equal replaying `last` then `next`. An
operation is only merged into while no exchange has carried it, so there is no
timer to tune: keystrokes typed while a request is out become one operation, and
a lone keystroke goes out as fast as before.

### Change a durable Message

An operation is stored, in the outbox and in the server's journal, as it was
written, and read later, possibly by a newer build. Renaming a field of a
durable Message, splitting a variant, or changing what a number means would
leave what was stored unreadable. So the document declares its Message's
history, and every reader sees an old operation upcast to the current
version:

<!-- docs-check standalone
import { Match, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { MessageSet, Projection, Surface } from 'foldkit-surface'
import { DocumentId, forApplication, migrations } from 'foldkit-sync'
const Model = Schema.Struct({
  notes: Schema.Array(Schema.Struct({ id: Schema.String, name: Schema.String })),
})
const Message = defineMessageUnion({
  RenamedNote: { id: Schema.String, name: Schema.String },
  ClearedNotes: {},
})
const App = Surface.application({
  Model,
  Message,
  initial: { notes: [] },
  update: (model, message) =>
    Message.match(message, {
      RenamedNote: ({ id, name }) => ({
        model: modifyFields(model, { notes: notes => [...notes, { id, name }] }),
      }),
      ClearedNotes: () => ({ model: modifyFields(model, { notes: () => [] }) }),
    }),
})
-->
```ts
// Version 1, as the first build shipped it: a note had a `title`. Kept as
// long as a stored operation may hold it; only the changed variant is copied.
const RenamedNoteV1 = Schema.TaggedStruct('RenamedNote', {
  id: Schema.String,
  title: Schema.String,
})
const MessageV1 = Schema.Union([RenamedNoteV1, Message.ClearedNotes])

// Version 2 is the application's own Message, where `title` became `name`.
const NoteHistory = migrations(MessageV1).next(App.Message, previous =>
  Match.valueTags(previous, {
    RenamedNote: ({ id, title }) => ({ _tag: 'RenamedNote' as const, id, name: title }),
    ClearedNotes: cleared => cleared,
  }),
)

const Notes = forApplication(App).make({
  documentId: DocumentId.make('notes'),
  shared: Projection.pick(App.model.notes),
  durable: MessageSet.make(App, [Message.RenamedNote, Message.ClearedNotes]),
  migrations: NoteHistory,
})
```

Version 1 is the first Schema; each `next` adds a version with its Schema and
a function from the version before, encoded, to its own, encoded. Each step's
input is typed by the step before, so a step that returns the old shape does
not compile. Steps are written once and never changed: a later change adds a
step. A step must be pure and deterministic, with no clock and no random id:
the server reads an entry more than once (`admit`, then the journal), and
each read must find the same Message. It is given the version before checked
and normalized by that version's Schema. The history must end at
`App.Message` itself (`make` throws otherwise), and with no `migrations` the
Message is version 1, written exactly as before.

What each side does with it:

- **The replica** keeps each operation as it was written, with its
  `messageVersion` (absent for version 1), in its outbox and on the wire, and
  replays it upcast. So an outbox written by the old build opens and sends
  under the new one.
- **The server** (`journalExchange`) hands every hook, `admit`, `validate`,
  `authorize`, `reduce` and `stamp`, the Message upcast to the current version,
  so a client claiming version 1 is judged exactly as the current Message
  would be. It stores what commits at the current version, and recognizes a
  retransmission by the operation as it was written, so an edit committed
  before a deploy, whose acknowledgement was lost, still reads as committed.

When something will not read:

- **An older version no step reads** (its version's Schema refuses it, or a
  step throws): a pending operation moves to `status.refused`, kept as
  written with its payload, never sent, until `replica.dismiss(opId)`; the
  rest of the outbox opens and sends. No Schema of this build reads it, so a
  page shows it raw (`operation.message`, `operation.messageVersion`) or not at
  all. The server rejects one it receives as `Unreadable { version }`, and the
  replica keeps it in `refused` too. A committed one fails what has to read
  it, with `UnreadableHistoryError` on the server: every exchange of a
  replica whose cursor is before it (what that replica sends still commits,
  and is acknowledged once a build reads the row), a retransmission of its
  id, and, while the row is after the journal's stored snapshot, an append
  or load that rebuilds the document from that snapshot. A replica past the
  row is served, and other documents are not affected. Only a build with a
  step that reads it recovers it. The replica is told only "This server
  cannot read the history of this document" and an incident; the
  operation's id and version stay on the error, which a served socket
  reports as an `ExchangeDefect` under that incident.
- **A newer version** (a rollback, or an old client): the replica refuses to
  open on one in its outbox (`UnsupportedMessageVersionError`, nothing
  removed), and an exchange that receives one fails with it, recorded in
  `status.lastError` and retried on the backoff; the page reloads the new build
  when it sees that error (`ExchangeFailed` on `Diagnostics`). A server
  receiving one fails the exchange before appending anything, so the client
  waits with its edits rather than losing them.

Deploy order: the release of Sync that reads `messageVersion` goes to every
server and client first, and skipping that step **loses edits**. A server on
an older release rejects an operation carrying `messageVersion` as `Invalid`,
and the replica drops it; a replica on an older release that is sent an
`Unreadable` refusal drops that operation too, since it keeps no `refused`
list. Then deploy an application's new version server first. A client on the
old version keeps syncing until the first operation of the new version
commits, then fails its exchanges until it reloads; its outbox is kept and
sent after the reload.

A rollback of the Sync release itself meets a replica state holding
`refused`, which an older release refuses to open
(`InvalidReplicaHistoryError`). Do not clear storage on that error: the
outbox is in the same state, and clearing it loses every unsent edit.
Roll forward instead.

A server that builds an operation itself and appends it (`editsJournal`'s
`absorbed`) writes it at the current version:
`Notes.journalContract().operation.encode(operation)`. The journal takes a
`WrittenOperation`, which is branded so that only Sync makes one: a decoded
`Operation` names no version, would read as version 1, and is refused by the
type. An entry from a wire is `unknown` until `codec.writtenFrom` reads it.
Nothing read as history writes again: `operation.decode` takes only a
`WrittenOperation`, and `encode` refuses what `codec.committedFrom` returns,
stripped of its commit or not. Changing the shared
slice's own Schema is not covered: a stored snapshot or checkpoint of the old
shape still needs a migration of your own.

### The URL, mirrors, and agents

`mount` takes the application's own `subscriptions` and the `resources` Layer
they need, and `url: { init, onUrlChange, onUrlRequest? }` to route navigation
through `update`: `init(model, url)` reduces the first URL before the first
render and `onUrlChange(url)` names the Message for every navigation. A
[`foldkit-mirror`](../mirror) URL mirror plugs into exactly that seam.

`Mounted` is also the host an agent binds to: `model`, `dispatch`, `subscribe`,
and `observe`, which reports every application Message the runtime applies.
See [`examples/todo-app`](../../examples/todo-app) for both.

### Carry local state across a reinstall

When an exchange or a failed persist replaces the shared slice outside
`update`, `onReinstall(next, previous, { reset })` returns the transition
instead. Use it to keep a selection that points into the slice, or to return a
Command that patches a DOM the change has to reach. Omitted, the Model stays
`next`. It is not called for a status that changed nothing the Model
shows. `reset` is true when the server's history is a new one (a new
`status.epoch`: the server was reset), so whatever the application derived
from the old one, such as reads keyed by commit sequence, is to be read again.

`afterUpdate(model)` runs after every update of the mounted application, a
durable Message's and a reinstall's included, and never in replay. A durable
Message is replayed through `update` on the server and in the replica, where
it may change only the shared slice; local state derived from the slice (the
Remote overlays below) is kept in step here instead.

### Edit rows a server owns

When rows are too many to replicate but edits to them must survive offline,
let the journal own the edits and the table be its read model, each row
carrying the highest sequence it has applied (`revision`). `foldkit-sync/entity`
keeps such edits one per cell, and `foldkit-sync/remote` shows them over the
rows Remote reads: each shown cell starts from Remote's row and overlays any
pending edit, any edit committed past the row's `revision`, or any edit the
journal absorbed while the cached row is still below it.

`EditableEntity.make(Product, { members: ['description', 'cents'] })` gives
the schemas (`Change` on the wire, `Edit` in the slice, the Message fields
`edited` and `absorbed`) and pure functions for `update`, the stamp
(`stamped`) and `onReinstall`: `merge`, `absorb`, `replaced` (a cell of this
tab's that another's later commit took), `cellsOf` (what a refusal undid) and
`changeAt` (what a row holds in a member, as the change that sets it: an
undo's value) as pure schemas and functions without storing state.

`RemoteEdits.make(Data, ProductEdits)` is the bridge to a Remote domain over
the same Entity. Its `reconcile(model, edits, replica)` brings Remote's
overlays (`overlay` from `foldkit-remote/overlay`) in line with the slice, so every read of a row draws
its edits, a second view or a filter as well as the grid. It holds an edit the
journal absorbed while the cached row is below it, and lifts it once a read
reaches it; it returns those newly `held` (ask for their rows again) and this
replica's edits a read reached with another value (`replaced`: the table
applies in commit order, so a later edit took the cell). An edit to a field a
list orders or filters by moves its row there at once, as Remote places any
pending edit. To see that when the
row arrives live after its own edit landed, it keeps this replica's landed
edit, showing the row's own value, until the slice drops it. Call it from
`afterUpdate`. `shown(model)` lists what the overlays show, for a cell's
mark, and `clear` lifts them all, for a reset. Remote stores none of it: after
a reload, `reconcile` rebuilds the overlays from the slice the replica
restored. On the server, `editsJournal` from `foldkit-sync/journal` keeps
the table: its `settle` (for `journalExchange`) applies each committed change
through your `apply` as a recovery intent, from the journal's floor and keyed
by its epoch, and its `absorb` (on a clock) records what the table holds and
compacts behind it. It refuses to settle a table whose `tableRevision` is past
the journal's cursor (`TableAheadOfJournalError`: the table outlived a reset of
the journal), and an edit to a row the table lacks is the journal's `validate`
to refuse. [Editing server data through a
journal](../../docs/editing-server-data.md) explains the pattern, its failure
cases and its limits; [`examples/registry`](../../examples/registry) is the
whole of it.

## Testing without a browser or a server

A `Storage` needs three members, and the loopback transport takes a handler in
place of a socket:

<!-- docs-check standalone
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { MessageSet, Projection, Surface } from 'foldkit-surface'
import { DocumentId, Sync } from 'foldkit-sync'
const Model = Schema.Struct({
  todos: Schema.Array(Schema.Struct({ id: Schema.String, title: Schema.String })),
})
const Message = defineMessageUnion({
  CreatedTodo: { id: Schema.String, title: Schema.String },
  RenamedTodo: { id: Schema.String, title: Schema.String },
})
const App = Surface.application({
  Model,
  Message,
  initial: { todos: [] },
  update: model => ({ model }),
})
const TodoSync = Sync.forApplication(App).make({
  documentId: DocumentId.make('todos'),
  shared: Projection.pick(App.model.todos),
  durable: MessageSet.make(App, [Message.CreatedTodo, Message.RenamedTodo]),
})
-->
```ts
import { Effect } from 'effect'
import type { Storage } from 'foldkit-sync'

const memoryStorage = (): Storage => {
  let state: unknown
  return {
    load: () => Effect.sync(() => state),
    save: next => Effect.sync(() => void (state = structuredClone(next))),
    close: Effect.void,
  }
}

const inMemory = Effect.gen(function* () {
  const replica = yield* TodoSync.openReplica(memoryStorage())
  yield* replica.submit(Message.CreatedTodo({ id: 't1', title: 'Milk' }))
  yield* replica.synchronize
  return yield* replica.status
}).pipe(
  Effect.provide(
    Sync.transport.loopback((_cursor, pending) => ({
      operations: [],
      acknowledged: pending.map(
        entry => TodoSync.codec.writtenFrom(entry, TodoSync.documentId).opId,
      ),
      rejected: [],
    })),
  ),
)
```

In Node, `Sync.indexedDb(name, new IDBFactory())` from `fake-indexeddb` tests
the real storage adapter. [`examples/sync`](../../examples/sync) tests every
recovery case below against a real journal.

## When things go wrong

Each case is designed, not incidental. The ones that change how you build the
application come first.

- **The network is gone.** Edits keep applying and keep being saved. `pending`
  grows; the loop retries. Nothing to handle.
- **The server rejects an edit.** Dropped from `pending`, the rest replayed,
  the Model re-installed. Explain it from `status.rejected`.
- **The page unloads before the persist finishes.** The browser asks first;
  leaving anyway loses the edits not yet stored.
- **The persist fails.** The edit is reverted and `onPersistenceFailure` runs.
  The user has to redo it.
- **Local storage was evicted.** The replica starts at cursor 0 and catches up
  from the server, but edits that lived only in the outbox are gone. The
  outbox is user data, not a cache.
- **Two tabs share one store.** Compare-and-swap fails the stale writer with
  `StorageError`. `Sync.tabStorage` gives each tab its own; a store named by
  hand with `Sync.indexedDb(name)` must be one tab's.
- **The replica is far behind.** The server may answer in pages (`more`), and
  `synchronize` asks again at once until caught up. If the server compacted
  the history it needs, it sends a checkpoint instead: a snapshot and cursor
  the replica adopts as its base before replaying its pending edits. A
  checkpoint behind the replica's cursor is refused
  (`CheckpointRegressionError`), never applied backwards.
- **The server lost its history.** A server names its history with an `epoch`;
  a replica that hears a new one rebuilds its committed state from that answer
  and resends its outbox. Everything the old server committed is gone on every
  replica. A replica that never heard an epoch cannot tell, and fails every
  exchange until its storage is cleared.
- **Stored state is from another version.** Opening fails with
  `UnsupportedReplicaVersionError` naming both versions; the bytes are left for
  a deliberate migration or reset. That versions Sync's own envelope; a
  durable Message's versions are the document's history
  ([change a durable Message](#change-a-durable-message)), and snapshot
  migrations stay yours.
- **An operation from another build of the application.** An older version no
  step reads lands in `status.refused`, kept until dismissed; a newer one
  refuses to open the replica, or fails the exchange, with
  `UnsupportedMessageVersionError`, and nothing is removed. Moving an
  operation to `refused` is the one write an open makes, under the revision
  it read: if another tab wrote the store meanwhile, the open fails with
  `StorageError`, and opening again reads both.
- **The server answers nonsense.** Malformed exchanges, gaps in the committed
  order, acknowledgements or rejections for operations the replica never sent:
  each fails the exchange rather than touch local work.

### Diagnostics

What Sync keeps going past it reports as a typed diagnostic through
`Diagnostics.Reporter` (`foldkit-surface`'s channel), which by default is
Effect's log: the console in a browser, `wrangler tail` on a Worker.

| `_tag` | `level` | When |
| --- | --- | --- |
| `ExchangeFailed` | `warning` | An exchange failed; recorded in `status.lastError` and retried on backoff. |
| `ExchangeDefect` | `error` | `Sync.transport.serve` threw an unexpected error; client receives an `incident` id. |
| `HistoryRebuilt` | `warning` | Server returned a new `epoch`, rebuilding committed state while keeping the outbox. |
| `HostDefect` | `error` | A document host failed at a `stage` (`cause` stays server-side; client sees `incident`). |
| `ListenerFailed` | `error` | A user callback threw (presence subscriber, socket listener, or `journalChanges`). |

`HostDefect` reports the failing stage: `Upgrade`, `Resolve`, `Journal`, and `Exchange` return HTTP 500 with the `incident` id; `Revalidate` closes the socket with `1011`; `Notice` skips sending a commit notice; and `Changes` stops the commit stream. For `ListenerFailed`, remaining listeners continue running.

A replica reports to the reporter in the Effect context it runs in:
`Layer.succeed(Diagnostics.Reporter, report)` in the runtime's resources. A
host takes one with the upgrade request beside it, used for everything that
upgrade runs:

```ts sketch
export class SyncHost extends defineDocumentHost(DurableObject, {
  sync: TodoSync,
  openJournal: (_ctx, env) => openTodosJournal(env.DB),
  resolvePrincipal: request => Effect.succeed(request.headers.get('x-actor') ?? 'anon'),
  diagnostics: (diagnostic, request) =>
    Effect.logError(`${request.url}: ${diagnostic.message}`),
}) {}
```

`documentHost` takes the same `diagnostics`, and `serveJournal` a
`diagnostics` reporter of its own. In a test, `Diagnostics.collect()` gives a
reporter and the array it fills.

## Advanced: the replica

`Sync.mount` is the normal path. Underneath, a `Replica` works on the shared
slice alone, and an application that is not a Foldkit runtime (a worker, a
server-side actor, a test) uses it directly.

```ts
const worker = Effect.gen(function* () {
  const storage = yield* Sync.indexedDb('todos/worker')
  const replica = yield* TodoSync.openReplica(storage)

  yield* replica.submit(Message.CreatedTodo({ id: 't1', title: 'Milk' }))
  const optimistic = yield* replica.shared // includes the pending edit

  yield* replica.synchronize // one exchange
  return optimistic
}).pipe(Effect.scoped, Effect.provide(Sync.transport.socket({ url: 'wss://example.com/sync' })))
```

`submit(message)` takes a durable Message: on a replica from
`Sync.forApplication(App).make`, a local one does not compile, and an
annotated export names the subset (`Sync<Message, Shared, Durable>`). It
checks again that the Message is durable, replays it against the
current optimistic state, gives it a stable operation id, saves it to the
outbox, publishes the new optimistic value, and wakes the loop. It sends
nothing. A Message replay refuses never enters the outbox.

`synchronize` takes one snapshot of the cursor and outbox, performs one
exchange, validates the answer, and reconciles it with the replica's *current*
state, so an edit submitted while the request was in flight survives.

The rest of the surface: `committed` (the base alone), `pending`, `cursor`,
`status`, `statusChanges`, `changes` (status and `shared` from one snapshot),
`snapshot` (the same plus `nextLocalSequence`), `start`, `dismiss` (forgets a
`status.refused` operation), and `close`. `pending` and a rejection's
`operation` are `WrittenOperation`s: as written, with `messageVersion`.

### The exchange

One request, one answer. A custom server implements this; a custom transport
carries it.

**Request fields:**

- `cursor`: last committed sequence the replica holds.
- `pending`: pending operations as written (`messageVersion` past 1).
- `epoch?`: the server history epoch, once heard.

**Answer fields:**

- `operations`: contiguous operations committed after `cursor`.
- `acknowledged`: ids the server accepted without repeating them.
- `rejected`: ids the server refused.
- `refusals?`: `[{ opId, refusal }]` encoded `SyncRefusal` reasons for rejected ids.
- `reasons?`: `[{ opId, reason }]` deprecated strings (at most 500 chars each).
- `checkpoint?`: `{ cursor, model }` when older history was compacted.
- `more?`: `true` when another page follows.
- `epoch?`: the server's current history epoch.

An acknowledged operation leaves the outbox once its committed copy has
arrived or the last page has been read. A rejected one leaves at once.

A custom server that reads operations through the codec, or appends them to
a Durable journal itself, must do what `journalExchange` does with a newer
`messageVersion` than its own (`codec.messageVersion`): fail the whole
exchange before appending anything. Durable alone sees such an entry as an
`InvalidOperationError`, and rejecting it by id loses the edit. It reads
each sent entry with `codec.writtenFrom` before appending it, too: that is
where a [server-only Message](#messages-only-the-server-appends), a replica
id under `server/` or one past 128 characters is refused. Stored history is
read with `journalContract().operation.decode`, which takes the server's own
Messages; a journal decoding its rows with `codec.normalizeOperation` would
refuse them. The replica validates every field; see
[when things go wrong](#when-things-go-wrong).

### Transports

`Transport` is an Effect service with one operation. Sync ships:

- `Sync.transport.socket({ url, … })`: a reconnecting WebSocket client. It
  queues exchanges while connecting, retries on a jittered backoff capped at
  `maxRetryDelay` (5 s), keeps request ids stable across resends, and after
  `maxRetries` (5) consecutive failed connections fails queued work and fails
  new exchanges fast until a socket is healthy again. `maxQueue` (64) bounds
  the queue.
  Instead of a `url`, pass `makeSocket: () => SocketLike` to connect over
  something else; it is called again on each reconnect. Beside `Transport` it
  provides `TransportSocket`, the connection it keeps, for another protocol
  to share; a layer without a socket has no `TransportSocket` in its type.
- `Sync.transport.serve(socket, { exchange, changes? })`: the server side of one
  accepted socket. With `changes`, a subscription to the document's commits, it
  sends a notice after each; the client's loop exchanges on every notice, so a
  tab that is only reading still sees others' edits without polling.
- `Sync.transport.portSocket(port, { signal? })`: a socket over a
  `MessagePort`, for a server in a worker or in the page. A port tells
  neither end when the other goes, so its `onClose` fires on `close()` or when
  `signal` aborts: a host aborts it when the pane it serves is gone, and
  `serve` stops. A client opens one per connection:
  `Sync.transport.socket({ makeSocket: () => Sync.transport.portSocket(open()) })`.
- `Sync.transport.loopback(handler)`, `fromPromise(client)`, `toPromise(shape)`,
  and `nativeSocket` for the platform `WebSocket`.

A refusal is data in the answer; only a wire failure is a `TransportError`.

**When a served exchange throws.** What the handler given to
`Sync.transport.serve` throws is the server's own, and its replica reads none
of it: the error frame is `{ id, error: 'Exchange failed', incident }`, and
what was thrown is reported as an `ExchangeDefect` under that incident, to
`serve`'s `diagnostics` reporter when given, else the default. The replica
fails the exchange with a `TransportError` carrying the `incident`, shows
`Exchange failed` in `status.lastError`, keeps its outbox whole and asks again
on its backoff, as for any wire failure. This is the failure of an exchange as
a whole; an operation the journal refuses is still a per-operation `rejected`,
which the replica drops. Words meant for the replica are thrown as a
`new ExchangeRefused({ message })`, sent as written with no incident: the
journal's own are `This connection may not open the document`, a cursor ahead
of the server's, and a pending entry that names no operation; a replica newer
than the server (`UnsupportedMessageVersionError`) is told so the same way. A
stored operation no build reads (`UnreadableHistoryError`) is both: reported
under an incident, and answered with the journal's one sentence for it. A
replica older than this change reads the frame as before: `error` is still a
string, and `incident` a field it ignores.

**When the host cannot say who is asking.** A caller the resolver refuses
reads the refusal's `reason`, or `Unauthenticated`: a 401 at the upgrade, a
4401 close on an open socket. A resolver that breaks answers a 500
`Internal error` with an incident, or closes with 1011; the cause is a
`HostDefect`. The socket transport reads neither a refused upgrade's body
nor a close's code: to the replica each is a connection that closed, so it
reconnects on its backoff, shows `transport closed` in `status.lastError`
once the retries are spent, and keeps its outbox until a socket opens.
Nothing here signs anyone out.

### Presence

"Who is viewing this" and "where is their caret" should vanish when the peer
does, not replay next week. `Sync.presence.make({ id, ttl, decodeValue, channel?,
throttle? })` is a TTL'd peer registry outside the log: values are decoded before
they enter it, a peer that stops refreshing is pruned, and `throttle` sends at
most one value per interval, the latest. `Sync.presence.socketChannel(socket)`,
given the `TransportSocket` the socket transport provides, shares the sync
socket across reconnects; `Sync.presence.hub` and `.serve` are
the server side. `.serve` stamps each frame with the connection's `peerId`, so a
peer cannot speak as another, and with `opens` (the exchange's own) joins only
a connection that may open the document, relaying nothing to or from one
refused. It asks again with each frame the connection sends, and one no
longer let open the document leaves. [`examples/pages`](../../examples/pages) shows remote carets.

### Last-writer-wins fields (experimental)

Server order decides concurrent edits. When one field should instead keep the
newest logical write even from a device that reconnects late, `Sync.lww.register(schema)`
gives it a stamped schema and a pure `merge`; `Sync.lww.openClock` allocates
stamps from a persisted counter, before dispatch and never in `update`. It is a
per-field rule, not a CRDT mode: sets, counters, and text stay outside.

```ts
const Title = Sync.lww.register(Schema.String)
const Shared = Schema.Struct({ title: Title.schema })
// in update: title: Title.merge(model.title, message.title)
```

### Without a Foldkit application

`Sync.define({ documentId, message, shared, empty, durable, replay })` is the
protocol primitive `forApplication` compiles to, for a client with no
application to derive from. It takes `migrations` (a `Sync.migrations`
history) in place of `message`, and reads the Message from it. Its `replay` is unguarded; the author owns its
agreement with whatever applies the Message elsewhere.

### Joining an assembly

`TodoSync.wiring()` adds the contract to a `foldkit-bundle` assembly so
`Module.validate` can report two owners of one field. It routes nothing and
runs nothing; Sync owns its runtime through `mount`.

## Ownership and responsibilities

`foldkit-sync` owns the replication contract (shared slice, durable and server-only Message sets, replay, codecs, `journalContract`), the replica (outbox, base, cursor, optimistic projection, status), reconciliation, transports, server-side appends and reactions (`serverJournal`), and the optional presence and LWW helpers.

A reaction's cursor and parked runs live in `foldkit-durable` beside its effect ledger, while Sync schedules runs and appends their results; the external provider owns whether a call executed. Sync applies durable Message migrations whenever reading operations, while your application defines the version history itself.

Local Model fields belong to your Foldkit app, server-derived read caches belong to [`foldkit-remote`](../remote/README.md), authoritative commit ordering and SQLite storage belong to [`foldkit-durable`](../durable/README.md), and shared-slice Schema migrations stay yours.

## Limits

- IndexedDB is the only built-in browser storage; custom `Storage` requires implementing three methods (`load`, `save`, `close`).
- One server order per document; use a CRDT if you need peer-to-peer collaborative text merging.
- Binding the socket transport to a platform WebSocket server uses thin glue (`ws` in Node, or `foldkit-sync/do` and `Sync.transport.workerSocket` on Cloudflare Workers).

## Older spellings

`Sync` groups the exports and wraps nothing; every name is also exported on its own with the same signature: `defineSync` is `Sync.define`, `syncMetrics` is `Sync.metrics`, `layerSocket`/`layerLoopback`/`layerFromPromise`/`toPromise`/`serveSocket`/`nativeSocket`/`workerSocket` are `Sync.transport.*`, `createPresence`/`createPresenceHub`/`servePresence`/`socketPresenceChannel`/`loopbackPresenceChannel` are `Sync.presence.*`, and `lwwRegister`/`openLwwClock` are `Sync.lww.*`. `documentId('todos')` and `DocumentId.make('todos')` make the same branded value, as do the other id constructors.

## Next

- Walk through client and server replication end to end: [Replicated state](../../docs/replication.md).
- Inspect the server journal and crash-recovery guarantees: [`foldkit-durable`](../durable/README.md).
- Compare sync rejections alongside Remote and form errors: [Errors and failures](../../docs/errors.md).
- Run a complete app with fragments, authorization, mirrors, and an agent: [`examples/todo-app`](../../examples/todo-app).
