# Editing server data through a journal

When a database table holds 100,000 rows—far too many to replicate to every browser—yet users still need to edit cells offline and converge across devices, put a durable journal in charge of the edits. Keep the SQL table as the journal's read model, and use `foldkit-remote` to draw each cached row with any unabsorbed edits layered on top.

This guide combines [Remote](./remote.md) and [Replicated state](./replication.md). See [`examples/registry`](../examples/registry) for the complete 100,000-product example running across two devices.

## When to use this pattern, and who owns what

| Situation | Use | Who owns the fact |
| --- | --- | --- |
| Online table edits; cached view is disposable | Remote mutation | Server; optimistic layer clears on settle |
| Single write that must survive reload offline | Durable Remote mutation (`outbox`) | Server; outbox retries until answered |
| Shared state small enough for every client | Sync slice | Durable journal; every replica holds it |
| Large table with offline cell edits | Journal + read-model table | Journal owns edits; table derives from them |

In the journal-and-table pattern, ownership splits cleanly:

- **The journal owns every edit.** Each edit is a durable `Message` committed in one global order and stamped with its sequence (`at`) and author (`by`).
- **The SQL table is a derived read model.** Only the journal updates it, writing each committed change alongside the highest sequence applied to that row (`revision`). You can rebuild the table at any time from its seed plus the log.
- **Remote caches the table's rows** as it caches any server-owned read.
- **The replicated slice holds only unabsorbed edits**—edits still in flight or not yet folded into the table—so the slice stays tiny.

## How an edit moves from the screen to the table

A cell on screen shows the row's last read value unless a local or recently committed edit for that cell is still pending (no `at` yet) or committed after the row's `revision` (`at > row.revision`).

Each edit passes through four stages:

1. **Pending:** The user edits a cell, appending a pending `EditedProducts` operation to the outbox. The overlay draws the new value immediately.
2. **Committed, not yet in the row:** The server journal validates the edit, assigns sequence `n`, stamps `{ at: n, by }`, and broadcasts it to every replica. Devices show the edit whenever their cached row has `revision < n`.
3. **Applied to the table:** The server's `settle` worker writes the cell and updates `revision := n` (refusing to move backward if `revision > n`). Once Remote re-reads the row, the row itself carries the value.
4. **Absorbed:** On a periodic tick, `absorb` appends an `AbsorbedEdits { through }` operation. Replicas drop edits with `at <= through`, and the journal compacts history behind them.

Tracking `revision` per row (instead of one global table checkpoint) matters because Remote fetches and caches individual rows at different times. Because recovery applies edits strictly in commit order and stops at the first failure, a row at `revision: 7` is guaranteed to include every edit to that row up to sequence `7`.

## A first editable column: `cents`

Three helpers implement this loop: `EditableEntity` (`foldkit-sync/entity`) tracks per-cell edits, `RemoteEdits` (`foldkit-sync/remote`) projects them onto Remote rows, and `editsJournal` (`foldkit-sync/journal`) settles and compacts them on the server.

Start in your shared domain module by declaring which entity fields accept cell edits:

<!-- docs-check
import { Effect, Layer, Option, Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { Bundle } from 'foldkit-bundle'
import { Remote } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import type { CommitStamp, Operation, WrittenOperation } from 'foldkit-sync'
import type { Journal } from 'foldkit-durable/core'
import { applyEdits, type AnyEntityBinding, type DrizzleDatabase } from 'foldkit-remote-drizzle'
import { modifyFields } from 'foldkit/struct'
-->

```ts
import { EditableEntity } from 'foldkit-sync/entity'

const Product = Entity.define('Product', Schema.Struct({ id: Schema.String, cents: Schema.Number }))
export const ProductEdits = EditableEntity.make(Product, { members: ['cents'] })
```

Next, add the edits slice and `EditedProducts` durable Message to your application bundle, merge incoming edits in `update`, and reconcile Remote overlays in `Sync.mount`'s `afterUpdate`:

<!-- docs-check
declare const replica: { readonly replicaId: string }
type Shared = { readonly edits: ReadonlyArray<typeof ProductEdits.Edit.Type> }
const ProductSchema = Schema.Struct({
  remote: Remote.Model,
  edits: Schema.Array(ProductEdits.Edit),
})
type Model = typeof ProductSchema.Type
-->

```ts
import { RemoteEdits } from 'foldkit-sync/remote'

const Base = Bundle.compose({
  remote: Remote.Model,
  edits: Schema.Array(ProductEdits.Edit),
}).pipe(Bundle.withMessages({ ...Remote.messages, EditedProducts: ProductEdits.edited }))

type EditedMsg = { readonly _tag: 'EditedProducts' } & Schema.Schema.Type<
  Schema.Struct<typeof ProductEdits.edited>
>

const foldEdited = (model: Model, { changes, at, by }: EditedMsg) => ({
  model: modifyFields(model, {
    edits: (edits: ReadonlyArray<typeof ProductEdits.Edit.Type>) =>
      ProductEdits.merge(edits, changes, Option.fromUndefinedOr(at), Option.fromUndefinedOr(by)),
  }),
})

const Made = Surface.application({
  Model: ProductSchema,
  Message: Base.Message,
  initial: { remote: Remote.initial, edits: [] },
  update: (model: Model) => ({ model }),
})
const Data = Remote.make({ model: Made.model.remote, entities: [Product], queries: [] })
const Shown = RemoteEdits.make(Data, ProductEdits)

// Run in Sync.mount's afterUpdate hook (never during replay)
const afterUpdate = (model: Model) => ({
  model: Shown.reconcile(model, model.edits, replica.replicaId).model,
})
```

On your Sync contract, attach the server stamp when `EditedProducts` commits:

```ts
const stampEdited = ({ changes }: EditedMsg, commit: CommitStamp) => ({
  changes,
  ...ProductEdits.stamped(commit),
})
```

On the server, wire `editsJournal` to apply settled edits to your Drizzle binding (`applyEdits`) and compact absorbed history (with your `journal`, `database`, `ProductBinding`, `sqlite`, `editsOf`, and `absorbed` handlers):

<!-- docs-check
declare const sqlite: { readonly highestRevision: () => number }
declare const ProductBinding: AnyEntityBinding
declare const database: Layer.Layer<DrizzleDatabase>
declare const journal: Journal<Operation, Shared, string, WrittenOperation>
declare const editsOf: (operation: Operation) => Option.Option<{
  readonly changes: ReadonlyArray<typeof ProductEdits.Change.Type>
  readonly at: Option.Option<number>
}>
declare const absorbed: (through: number, cursor: number) => WrittenOperation
-->

```ts
import { editsJournal } from 'foldkit-sync/journal'

const applyProduct = applyEdits(ProductBinding)

const { settle, absorb } = editsJournal({
  documentId: 'registry-edits',
  journal,
  editsOf,
  apply: (change, at) => applyProduct(change, at).pipe(Effect.provide(database)),
  tableRevision: Effect.try(() => sqlite.highestRevision()),
  holdsThrough: (snapshot, through) => ProductEdits.holdsThrough(snapshot.edits, through),
  absorbed,
  server: 'server',
})
```

Run `settle` on every journal exchange (via `journalExchange`) and call `absorb` on a schedule. See [`examples/registry/src/journal.ts`](../examples/registry/src/journal.ts) for the full `editsOf` and `absorbed` implementations.

## What each helper handles

- **`ProductEdits.edited` and `ProductEdits.Edit`:** Schemas describing the durable `Message` payload and the stored per-cell edit entries.
- **`ProductEdits.merge`:** Purely folds new changes over existing edits, keeping the latest edit per cell. Sending the operation to the server happens via `Sync.fact` in `update`.
- **`ProductEdits.stamped`:** Runs exclusively inside the server journal at commit time. Clients leave `at` and `by` unset; the journal's `validate` rejects any client operation that tries to supply them.
- **`RemoteEdits.reconcile`:** Purely aligns Remote's optimistic overlays with the current `edits` slice and returns the updated `Model`. Call it in `afterUpdate` rather than `update` so server and replica replay only touch the replicated slice.
- **`settle` and `applyEdits`:** Runs `apply` for each committed change through a recovery intent. Because the journal's effect ledger and the SQL table may be separate stores, an intent can replay after a crash; `applyEdits` guards the update with `revision <= at` on the binding's fixed columns so replaying an older or identical sequence is safe.

## Handling conflicts, compaction, and cell marks

- **Absorbing history:** Calling `absorb` records a server-originated operation stating that the table holds every edit up to the recovery cursor. Replicas drop those edits and the journal compacts old entries so new devices receive a small snapshot. Guard `AbsorbedEdits` in `authorize` so only the server can append it.
- **Held edits:** If the slice drops an absorbed edit while a page still holds an older cached row, `reconcile` keeps that edit's overlay held and returns its row key in `held` so the page can refresh the row.
- **Conflicts:** The later journal commit wins, regardless of when an offline edit was typed. `reconcile` returns a `replaced` entry whenever another replica's commit overwrites this replica's edit—even across two tabs signed in as the same user, or when a read catches an edit that was already absorbed.
- **Refusals:** Rejected operations return to the sender with their error; `cellsOf` identifies the affected cells so the UI can mark them while the rest of the outbox proceeds.
- **Cell status marks:** Cells can display pending, committed, refused, replaced, and peer-presence states using `GridMarkStyle` and `GridLegend`.
- **Unchanged drafts:** Leaving an open cell editor unchanged emits no edit, avoiding accidental overwrites of another device's concurrent change.

## Failure modes and recovery

- **Offline edits:** Pending edits stay in the outbox across reloads and flush on reconnect.
- **Table write lag or failure:** Committed edits keep showing on screen while `revision` lags; the next exchange retries `settle`, and `absorb` waits until recovery succeeds.
- **Duplicate write after a crash:** `applyEdits` checks `revision <= at`, making repeated application harmless.
- **Refused edit or forged stamp:** `validate` and `authorize` reject bad operations or client-supplied stamps before commit; the sender drops the rejected edit and marks its cells.
- **Missing row:** Validate row existence before committing in the journal so edits to missing rows fail visibly rather than vanishing after recovery.
- **Server reset:** When a journal starts a fresh epoch, `onReinstall` fires with `reset`, clears held overlays, and refreshes cached rows. Reset the SQL table alongside the journal: `settle` refuses to run (`TableAheadOfJournalError`) whenever `tableRevision` exceeds the journal's cursor.
- **Sorted lists:** An unabsorbed edit updates the cell value in place until the next query re-sorts rows on the server.
- **Recovery cursor:** In persistent deployments, recovery replays from the journal floor after a restart, while the effect ledger prevents duplicate side effects within an epoch.

## Limits and when to use simpler tools

- Cell values are last-writer-wins by commit order; use CRDT-backed documents for collaborative rich text.
- The journal and the SQL table must be kept or reset together.
- If the dataset fits comfortably in memory on every client, use a plain [Sync slice](./replication.md).
- If edits only happen online, use a [Remote mutation](./remote.md).

## Next

- Learn how Sync's durable log works in [Replicated state](./replication.md).
- See how Remote caches and overlays server data in [Server-derived state](./remote.md).
- Explore the full 100,000-row app in [`examples/registry`](../examples/registry).
