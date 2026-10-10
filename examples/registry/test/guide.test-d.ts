/**
 * The calls `docs/editing-server-data.md` shows, type-checked against the
 * registry's own Product so the guide cannot drift from the packages. The
 * guide's one editable column is `cents`; `sqlite` and `journal` stand in for
 * the server's database and its journal.
 */
import { Effect, Layer, Option, Schema } from 'effect'
import { applyEdits, type AnyEntityBinding, type DrizzleDatabase } from 'foldkit-remote-drizzle'
import type { Journal } from 'foldkit-durable/core'
import type { CommitStamp, Operation } from 'foldkit-sync'
import { EditableEntity } from 'foldkit-sync/entity'
import { RemoteEdits } from 'foldkit-sync/remote'
import { editsJournal } from 'foldkit-sync/journal'
import { Data, type Model } from '../src/app.js'
import { Product } from '../src/domain.js'

// In the domain.
const ProductEdits = EditableEntity.make(Product, { members: ['cents'] })

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

// What every read draws, after each live update.
const Shown = RemoteEdits.make(Data, ProductEdits)
declare const replica: { readonly replicaId: string }
const afterUpdate = (model: Model): { readonly model: Model } => ({
  model: Shown.reconcile(model, kept, replica.replicaId).model,
})
void afterUpdate

// The stamp.
const stamp = ({ changes }: Edited, commit: CommitStamp): Edited => ({
  changes,
  ...ProductEdits.stamped(commit),
})
void stamp

// On the server.
declare const sqlite: { readonly highestRevision: () => number }
declare const ProductBinding: AnyEntityBinding
declare const database: Layer.Layer<DrizzleDatabase>
const applyProduct = applyEdits(ProductBinding)
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
  apply: (change, at) => applyProduct(change, at).pipe(Effect.provide(database)),
  tableRevision: Effect.try(() => sqlite.highestRevision()),
  holdsThrough: (snapshot, through) => ProductEdits.holdsThrough(snapshot.edits, through),
  absorbed,
  server: 'server',
})
void [settle, absorb]
