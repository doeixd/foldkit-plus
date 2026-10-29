# Live polling over a guarded Entity (#264)

Status: built (2026-10-28) in `foldkit-remote-server` (`RemoteServer.readAs`,
`LiveSource.reads`), `foldkit-remote-drizzle` (`pollLive`) and `foldkit-guard`
(`GuardServer.validate`); `examples/reference` validates its live server.

## The problem

`GuardServer.validate` refuses every live Source over a guarded Entity,
because a live Source of its own streams whatever it reads and nothing at
startup could check it. On Workers the only live path is `pollLive`
(`foldkit-remote-drizzle`), since one request cannot wake another's stream,
so an application with a Guard and live updates there could not start with
its safety net on. The reference app validated a second server built without
`live`, which would also pass a `pollLive` over a Source with no rules.

Reading `pollLive` for the issue found a real leak behind the refusal.
`pollLive` called `source.read` directly. The read handlers and the live hub
never do: they ask the Source only for the fields it declares and its
`authorize` allows (`allowedFields`), and pass each record through its
`filter` (`readFiltered`). A guarded Source's member Read rules live in that
`filter` (`GuardServer.filter`), and so does a `Guards.may` answer. So
`pollLive` over the guarded Source applied the row rule (`visible` is in the
SQL) but sent a member the reader may not read, sent `may` unanswered, and
passed a client's field names to `read` unchecked. The Source passing
`validate` said nothing about what `pollLive` did with it.

## Decision

```text
live value = RemoteServer.readAs(source, { ids, fields, principal, viewer })
           = source.read of the declared fields `authorize` allows, each record through `filter`
validate accepts a live Source over a guarded Entity  <=>  live.reads === the Source it checks
```

1. **One read as the principal reads, exported.** `RemoteServer.readAs`
   is the read the handlers make: the asked fields the Source declares and
   `authorize` allows, read through `filter`, each record holding only those
   fields. It answers `Option.none()` when the principal may read none of
   the fields asked, so a caller can tell "nothing to read" from "the row is
   gone". The hub reads through it too, so the two live paths cannot drift.
2. **`pollLive` reads only through it.** Its opening read, each tick, and
   each watched list's rows. A field the read leaves out is not sent: a
   patch carries and names only the fields the record holds, as the hub's
   does. A row that leaves the reader's visibility reads as absent and is
   sent as `EntityDeleted` (and `ConnectionRemove` from a watched list), as
   it already was; with the row log, a row whose visibility changes without
   a write of it is noticed on the next write or a full re-read.
3. **A live Source names the Source it reads through.** `LiveSource.reads`
   is optional; `pollLive` sets it to the Source it was given. It is a claim,
   as `EntitySource.visible` is: the server never reads it, a startup check
   does.
4. **`validate` accepts a live Source whose `reads` is the guarded Source
   it checks.** Identity, not likeness: that Source has just been checked
   for its row and member rules, so what the live Source sends passed them.
   A live Source with no `reads`, or reading through another Source (an
   unguarded one over the same table), is refused, naming both ways out.
5. **The reference app validates the server it serves.** The second,
   live-less server and its comment go.

## Options considered

- **Accept any `pollLive` in `validate`.** Rejected: a `pollLive` over an
  unguarded Source would pass, which is the workaround's flaw.
- **Have `validate` re-check the live Source's own Source.** Equivalent when
  it is the mounted one; when it is not, the live path would read under
  rules the read path does not, and a reader would see different rows live
  than on a refresh. Requiring the mounted Source keeps one set of rules.
- **Send a dropped field as `undefined`.** A JSON frame drops it, so the
  client would get a `changed` naming a field with no value. The hub sends
  no such field; a member that becomes hidden keeps the value the reader
  was allowed to see until it reads again. That is not new information, and
  it matches the read path, which settles such a member unread.

## What is tested

- `packages/guard/test/server.test.ts`, through the real guarded memory
  Source: a member a rule withholds or redacts never appears in a patch, nor
  a row the principal may not read, subscribed or in a watched list whose
  window is every stored row; a member is sent once its rule lets the reader
  read it, and nothing is sent when it stops; a subscribed row that leaves
  visibility is deleted, a listed one deleted and removed. `validate` accepts
  `pollLive` over the Source it checks and refuses one over an unguarded
  Source of the same rows, and a hand-written live Source.
- `packages/remote-drizzle/test/poll.test.ts`: only the declared fields
  `authorize` allows are read and sent; a principal who may read none of the
  fields asked reads nothing and hears no deletion.
- `examples/reference/test/worker.test.ts`, on workerd over D1: the Worker
  starts with its live server validated; a member's stream hears another
  member's note join the list and leave it when deleted, and a visitor's
  stream hears only the opening invalidation.
- Mutations: `poll.mutations.ts`, `guard/test/server.mutations.ts`,
  `remote-server/test/readable.mutations.ts`, and one in
  `examples/reference/test/reference.mutations.ts` run on workerd.

## Not done

- A live subscription over a `LiveSource` is not capped by
  `maxIdsPerEntity`, as the hub's is: a client can ask `pollLive` to re-read
  many rows a tick. Separate from this issue.
