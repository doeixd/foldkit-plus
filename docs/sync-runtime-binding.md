# Binding `foldkit-sync` to a Foldkit runtime

Status: `Sync.mount` ships in `foldkit-sync`; `examples/sync` and
`examples/todo-app` run on it. No upstream Foldkit change is required. This note
records why, what the mount does, and the two conveniences an upstream handle
would still add.

## What Foldkit `0.158.2` exposes

Verified against the installed `foldkit/dist/runtime` declarations.

- `Runtime.makeApplication(config)` returns a configured, not started, runtime.
  `Runtime.embed(program)` returns `{ ports, dispose }`. There is no Model getter
  and no `dispatch` on the handle; inbound Ports are the only way in.
- `config.update` is synchronous: `(model, message) => { model, commands? }`.
- The container element must have an `id`; without one the runtime never starts
  and reports nothing. `Sync.mount` throws up front instead.

## Why the wrapper is enough

An earlier version of this note argued that a wrapper cannot be transparent
because a durable Message had to wait for persistence before it applied, so the
wrapper returned the Model unchanged, persisted in a Command, and re-dispatched a
refresh later. That argument depended on not trusting the local `update` to
match what the replica replays.

The derived replay now *is* the application's `update` on the shared slice, and
it refuses a durable Message that returns a Command or writes outside the
projection. So applying `update` at once is exactly what the replica will hold
after `submit`; there is nothing to wait for. Persist afterwards, and reconcile
only when the replica's state actually differs from the local one.

## What `Sync.mount` does

```ts
const mounted = Sync.mount(App, TodoSync, {
  replica,
  container,
  view,
  url: { init: (model, url) => Filters.reduce(model, url), onUrlChange: url => Message.UrlChanged({ url }) },
  subscriptions, // the application's own entries, a mirror's among them
  resources, // the Layer those entries need, e.g. KeyValueStore
})
mounted.dispatch(Message.CreatedTodo({ id, title }))
mounted.model()
const stop = mounted.observe(message => log(message))
await mounted.dispose()
```

- **Apply first, persist after.** A durable Message runs `update` immediately and
  adds one Command that calls `replica.submit`. A refused or failed persist
  re-installs the replica's shared slice, which reverts exactly that edit, then
  hands the Model and the error to `onPersistenceFailure`.
- **Flat union.** The runtime's Message type is the application's union plus
  five private variants (refresh, persisted, persistence failed, and the two
  steps of following a link), so Commands returned by `update` already produce
  valid Messages. Nothing is re-wrapped.
- **The URL, through the application.** With `url`, `init(model, url)` reduces
  the first URL into the Model before the first render, `onUrlChange(url)` names
  the Message for every navigation, and `onUrlRequest` the Message for a link
  click; omitted, the mount follows the link itself (an internal one pushed, an
  external one loaded). A `foldkit-mirror` URL mirror is `init` plus one
  `onUrlChange` case; its write entry rides in `subscriptions`, and `resources`
  provides what the entries need.
- **Reconcile on change.** The replica's `statusChanges` drive a refresh only
  when the cursor moves, the pending count drops, or the rejections change:
  when an exchange committed, acknowledged, or rejected something. (An
  acknowledgment that returns no operation moves no cursor but still drops the
  edit from the outbox.) A submit only echoes a local edit, so it does not
  refresh; refreshing on it would briefly revert a later local edit whose own
  submit is still in flight.
- **Edits still waiting for the replica survive a refresh.** A durable edit is
  in the Model before its submit reaches the replica, and the submit waits for
  the replica lock. The mount submits one edit at a time, in dispatch order,
  recording the replica's next local sequence when each submit starts. A refresh
  reads one replica snapshot and replays, on top of its `shared`, every edit the
  replica does not hold yet: those still queued, and the one in flight while the
  sequence has not moved past it. The install is never deferred, so remote
  changes show while edits keep overlapping, and an edit the replica already
  holds is not applied twice.
- **Dispatch and Model.** `dispatch` is one inbound Port carrying the whole
  union. `model()` is read from a subscription entry whose `modelToDependencies`
  runs on every transition; the runtime does not expose the Model otherwise.
  `subscribe` notifies on every transition, and `observe` reports every
  application Message the runtime applies, which a capability with a
  `completion` contract needs to see.
- **The committed view.** `mounted.committed` is a source, `{ get, subscribe }`,
  reading `Replica.committed`: the shared slice as the server confirmed it, with
  no pending edit applied. Its subscribers are told after every exchange status,
  including a checkpoint at the same cursor, which replaces the committed state
  without moving it. The Model shows a durable edit at once, so an agent that
  must not report success before the server commits waits on this view with
  `Agent.when({ source: mounted.committed, predicate })`; it completes after the
  committing exchange and never for a rejected edit. It is not a Projection: it
  does not read the Model, and the mount does not install it anywhere.
- **Dispose waits.** In-flight persists are tracked and awaited before the
  runtime is disposed, so the outbox is left complete and resumable.

`Mounted` is also the host shape `foldkit-agent` binds to: `model`,
`dispatch`, `subscribe`, and `observe`; the application adds `principal`.

## What only an upstream handle would add

- `handle.model()`, replacing the subscription stash.
- `handle.dispatch(message)`, replacing the declared Port.

Both are conveniences. Nothing in the acceptance list below depends on them.

## Acceptance

Covered by `packages/sync/test/mount.test.ts` unless noted.

- Failed persistence does not lose the local edit silently: the edit is reverted
  and reported. ✔
- A Command from `update` settles into a durable fact through the same reducer. ✔
- A local edit concurrent with an exchange rebases in the replica; the mount
  installs the rebased slice when the cursor moves. ✔ (exchange) / rebase is the
  replica's own test.
- A rejected operation is reverted. ✔
- A checkpoint installs without resubmitting pending operations: the replica's
  own test. The mount refreshes when the checkpoint moves the cursor or drops
  pending operations; one at the same cursor with nothing dropped only notifies
  `committed` subscribers (known gap: the Model keeps the previous slice). ✔
  (committed notification)
- Disposal with pending work completes it. ✔
- Two bound instances of one document do not interleave admittances: not
  supported; one mount per replica.
