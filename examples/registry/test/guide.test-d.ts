/**
 * The calls `docs/editing-server-data.md` shows, type-checked against the
 * registry's own Product so the guide cannot drift from the packages. The
 * guide's one editable column is `cents`; `sqlite` and `journal` stand in for
 * the server's database and its journal.
 */
import { Effect, Option, Schema } from 'effect'
import { RowModel } from 'foldkit-data-grid'
import type { Journal } from 'foldkit-durable/core'
import type { CommitStamp, Operation } from 'foldkit-sync'
import { EditableEntity } from 'foldkit-sync/entity'
import { editsJournal } from 'foldkit-sync/journal'
import { Product, ProductRow } from '../src/domain.js'

// In the domain.
const ProductEdits = EditableEntity.make(Product, { members: ['cents'] })
type Row = typeof ProductRow.schema.Type

// The Model's slice and the durable Message's fields.
const edits = Schema.Array(ProductEdits.Edit)
const EditedProducts = Schema.Struct(ProductEdits.edited)
type Edited = typeof EditedProducts.Type
void edits

// The fold in update.
declare const kept: ReadonlyArray<typeof ProductEdits.Edit.Type>
declare const message: Edited
const merged = ProductEdits.merge(
  kept,
  message.changes,
  Option.fromUndefinedOr(message.at),
  Option.fromUndefinedOr(message.by),
)
void merged

// What the grid draws.
declare const read: RowModel<Row>
const shown: RowModel<Row> = RowModel.map(read, kept, ProductEdits.overlay<Row>)
void shown

// The stamp.
const stamp = ({ changes }: Edited, commit: CommitStamp): Edited => ({
  changes,
  ...ProductEdits.stamped(commit),
})
void stamp

// On the server.
declare const sqlite: {
  readonly run: (sql: string, values: ReadonlyArray<unknown>) => void
  readonly highestRevision: () => number
}
type Shared = { readonly edits: ReadonlyArray<typeof ProductEdits.Edit.Type> }
declare const journal: Journal<Operation, Shared, string, Operation>
declare const editsOf: (operation: Operation) => Option.Option<{
  readonly changes: ReadonlyArray<typeof ProductEdits.Change.Type>
  readonly at: Option.Option<number>
}>
declare const absorbed: (through: number, cursor: number) => Operation
const { settle, absorb } = editsJournal({
  documentId: 'registry-edits',
  journal,
  editsOf,
  apply: (change, at) =>
    Effect.try(() =>
      sqlite.run('update products set cents = ?, revision = ? where id = ? and revision <= ?', [
        change.value,
        at,
        change.id,
        at,
      ]),
    ),
  tableRevision: Effect.try(() => sqlite.highestRevision()),
  holdsThrough: (snapshot, through) => ProductEdits.holdsThrough(snapshot.edits, through),
  absorbed,
  server: 'server',
})
void [settle, absorb]
