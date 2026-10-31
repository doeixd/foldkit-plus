# Solid 2.0's stores and optimistic state, compared with Remote

Status: research (2026-10-30). Not a plan; the ideas at the end are candidates
for issues.

Sources: Solid 2.0's RFCs on the `next` branch,
[04-stores.md](https://github.com/solidjs/solid/blob/next/documentation/solid-2.0/04-stores.md)
and
[06-actions-optimistic.md](https://github.com/solidjs/solid/blob/next/documentation/solid-2.0/06-actions-optimistic.md).
Solid 2.0 is in beta, so names and details may still change. The RFCs leave
two things unstated: how overlapping actions interact, and whether an action
that throws (rather than a failed `until` or `refresh`) reverts its optimistic
writes. `storePath` is in the migration guide, not the stores RFC.

## Stores

- **Proxies tracked per property, at every depth.** Reading `store.user.name`
  subscribes to that property alone. The store API moves from `solid-js/store`
  into `solid-js`.
- **Setters take a draft:** `setStore(s => { s.user.name = "Ada" })`.
  Returning a value from the setter replaces or diffs the top level shallowly
  instead. `reconcile(serverData, "id")(s.todos)` diffs server data into one
  part of the draft and keeps the identity of unchanged rows (key `"id"` by
  default, `null` for position).
- **Derived stores.** `createStore(fn, seed)` is derived and still has a
  setter. `createProjection(fn, seed, { key })` is derived and read-only, the
  store form of a memo: its function writes a draft or returns a value that is
  reconciled into the store by key. Both may be async. Reading an unsettled
  async source throws `NotReadyError`, and that error propagating is how
  loading works; a derive must not catch it, and branches with `isPending()`
  instead.
- **`{ shallow: true }`:** only the root keys are reactive; the records under
  them are replaced by reference, with no proxies.
- **`snapshot(store)`** is a plain value, read without subscribing, keeping
  references where nothing changed. **`deep(store)`** subscribes to every
  nested property, in an effect's tracking half.

## Optimistic state

- **`createOptimistic`** (shaped like a signal) and
  **`createOptimisticStore(source, seed, options?)`** are layers over a source
  of truth, usually `createOptimisticStore(() => todos(), [])`.
- **Optimistic writes last one transition.** When the transition completes
  the layer resets to its source; a failed `until()` or `refresh()` reverts
  it.
- **`action(function* () { … })`** is where a mutation lives: write
  optimistically, `yield` the server call, `refresh(todos)`. The action is one
  transition, so the optimistic value stays until the refreshed truth is
  ready, and the old value never flashes in between.
- **Optimistic writes don't make anything pending.** The RFC calls them
  "verdict-inert": they never make `isPending` true. `affects(target, key?)`
  marks data as pending on purpose; it stays readable while it is.
- **A "saving…" indicator is state the action writes** (an optimistic boolean
  that reverts on settle), not something derived from `isPending`.
- **`until(predicate, { timeout, signal })`** holds the transaction, and every
  optimistic write in it, open until a predicate over the *authoritative* data
  holds; the action's own optimistic writes can't satisfy it. It suits live
  sources (wait until a socket delivers the row), and the RFC asks for a
  `timeout` because "a dead socket otherwise holds the transaction forever".
- **Identity.** The optimistic row should carry the identity the confirmed row
  will (the client's id as the store key), so the real row replaces it rather
  than appearing beside it.
- **Truth arriving mid-action is held.** Server data that lands while an
  action is open is staged until the action completes; an action's own
  optimistic value is never delivered as if it were the truth.

## Compared with Remote

| | Solid 2.0 | foldkit-plus Remote |
| --- | --- | --- |
| Where the guess comes from | Written by hand through `setOptimistic…` | Predicted from the declared write: `Expr`, derived members, guard `may`, list placement ([operations-PLAN.md](./operations-PLAN.md)) |
| How long it lasts | One transition; resets to the source at its end | A pending layer per write, released when the answer reads back what the prediction moved (#265) |
| Avoiding a gap between guess and truth | Hold the transition open (`yield refresh`, `until`) | The answer carries the fields the prediction moved |
| Checking the guess | None | `Law.check`, `verifyPredictions`, `PredictionMismatch` ([349-350-DESIGN.md](./349-350-DESIGN.md)) |
| Surviving a reload | None | The durable outbox ([operations-phase7-DESIGN.md](./operations-phase7-DESIGN.md)) |
| Pending state | Optimistic writes are inert; `affects` opts in | `Data.mutation` status and `Data.why` ([248-data-why-DESIGN.md](./248-data-why-DESIGN.md)) |

Solid's model is a smaller, general set of building blocks: any state can take
an optimistic layer, and the application writes it. Remote predicts the layer
from the domain and checks the prediction against the server, at the cost of
working only for declared writes over Entities.

## Ideas worth taking

1. **Hold a pending layer until live data confirms it** (`until` with a
   `timeout`). With live lists (#270), check whether a write's layer can be
   released by its answer before the live stream shows the same change, and
   whether that can briefly show the old value; if so, release on the live
   confirmation, bounded by a timeout.
2. **Pending as an explicit choice.** Whether a pending write makes a read
   look loading should be decided per write (Solid's inert default plus
   `affects`), not inferred.
3. **A typed "saving" flag written with the write.** Apps derive "waiting to
   send" from `Data.outboxStatus`/`Data.mutation` themselves, and Chirp's
   post flicker came from exactly that derivation (fdf7e79d). A flag that
   reverts when the write settles would give every app the right timing.
4. **Hold live data that lands mid-write.** Check that a live patch arriving
   while a write is pending cannot flicker the predicted row; #288's
   settlement-order fix covers answers, not live patches.
