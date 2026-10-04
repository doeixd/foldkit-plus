/**
 * The client: Remote reads the registry a page at a time, the data grid draws
 * it, and edits are durable operations that Sync keeps until the server's
 * journal has them. Nothing here knows a table; that is `server.ts`.
 *
 * Who owns what, and none holds another's state:
 *
 * - the journal owns the edits: `edits` is the replicated slice, changed only
 *   by the durable `EditedProducts`, and the server orders and keeps them;
 * - the table is the journal's read model: the seed with each committed edit
 *   applied, each row carrying the `revision` it has read the journal to, and
 *   Remote caches what it has read of it;
 * - the grid owns focus, selection, column state and the viewport;
 * - this application owns the order the list is read in.
 *
 * A row is drawn as Remote read it with the edits it has not absorbed over
 * it: those still pending, and those committed after its revision. So an edit
 * shows at once, survives a reload while offline, shows while the table has
 * not written it, and gives way to the table once a read of the row has it.
 */
import { Match, Option, Schema, SchemaGetter } from 'effect'
import { modifyFields } from 'foldkit/struct'
import { Bundle } from 'foldkit-bundle'
import { Crud } from 'foldkit-crud'
import { DataGrid, RowModel } from 'foldkit-data-grid'
import { GridCrud } from 'foldkit-data-grid/crud'
import { Remote, type RemoteClient } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import { Sync } from 'foldkit-sync'
import { Product, ProductChange, ProductId, ProductRow, Registry } from './domain.js'
import { ProductSort, ProductsQuery } from './operations.js'

/** A description as typed: its spaces around dropped, and something left. */
const Description = Schema.Trim.pipe(
  Schema.decodeTo(Schema.String.check(Schema.isMinLength(1, { message: 'Say what it is' }))),
)

/**
 * A price as typed, in dollars with at most two decimals, and the whole cents
 * it means: the Product's own `cents` schema, so the cell and the server keep
 * one rule.
 */
const Dollars = Schema.Trim.pipe(
  Schema.decodeTo(
    Schema.String.check(Schema.isPattern(/^\d+(\.\d{1,2})?$/, { message: 'A price, like 4.99' })),
  ),
  Schema.decodeTo(Product.fields.cents.schema, {
    decode: SchemaGetter.transform(text => Math.round(Number(text) * 100)),
    encode: SchemaGetter.transform(cents => (cents / 100).toFixed(2)),
  }),
)

export const ProductList = Crud.list('Products', {
  query: ProductsQuery,
  selection: ProductRow,
  pageSize: 100,
})
type Row = typeof ProductRow.schema.Type

// The list says each column's label and how its value shows; the grid adds
// where it stands, how wide it is, and what edits.
export const columns = GridCrud.columns(ProductList, {
  columns: {
    // Hidden, as its Display says; named, for the menu that shows it.
    id: { header: 'Product id', width: 110 },
    upc: { pinned: 'start', width: 150, hideable: false },
    description: {
      width: 280,
      minWidth: 120,
      edit: { schema: Description },
    },
    line: { width: 130 },
    status: { width: 120 },
    cents: {
      width: 110,
      edit: { schema: Dollars, draft: row => Schema.encodeSync(Dollars)(row.cents) },
    },
  },
})

export const Grid = DataGrid.make({
  id: 'products',
  columns,
  rowSelection: 'multiple',
  cellSelection: true,
})

/**
 * An edited field: its value, and the journal sequence its edit committed at,
 * none while it is pending. Stored and sent, so `null` on the wire.
 */
const DescriptionEdit = Schema.Struct({
  value: Product.fields.description.schema,
  at: Schema.OptionFromNullOr(Schema.Number),
})
const CentsEdit = Schema.Struct({
  value: Product.fields.cents.schema,
  at: Schema.OptionFromNullOr(Schema.Number),
})

/** One product's edited fields, the latest per field. */
export const ProductEdit = Schema.Struct({
  id: ProductId,
  description: Schema.OptionFromNullOr(DescriptionEdit),
  cents: Schema.OptionFromNullOr(CentsEdit),
})
export type ProductEdit = typeof ProductEdit.Type

/** Where this replica's edits stand with the server, as its status last said. */
const Exchange = Schema.Struct({
  /** Edits this device made that the server has not taken yet. */
  pending: Schema.Number,
  /** Why the last exchange failed, until one succeeds. */
  error: Schema.OptionFromNullOr(Schema.String),
})

const Base = Bundle.compose({
  remote: Remote.Model,
  /** The order the list is read in: the query's input, so another order is another read. */
  sort: ProductSort.Schema,
  /**
   * Every product edited, with the fields edited, last write winning per
   * field, and when each committed. The replicated slice: the journal's, not
   * this device's.
   */
  edits: Schema.Array(ProductEdit),
  exchange: Exchange,
}).pipe(
  Bundle.withMessages({
    ...Remote.messages,
    /** A sort header was clicked: the intent, toggled in `update` from the Model as it is. */
    SortedProducts: { column: Schema.Literals(ProductSort.columns) },
    RequestedMoreProducts: {},
    RetriedProducts: {},
    /**
     * The durable fact: products' fields were edited. Replayed, so state only.
     * `at` is the journal's: absent on what this device sends, and stamped
     * with the sequence it committed at (`sync.ts`). Messages cross ports and
     * the journal as they are, so it is a plain optional key, not an `Option`.
     */
    EditedProducts: {
      changes: Schema.Array(ProductChange),
      at: Schema.optionalKey(Schema.Number),
    },
    /** The replica's status, for the status line; local, not replicated. */
    ExchangeChanged: Exchange.fields,
  }),
  Bundle.withChild('grid', Grid.bundle),
)

export const Model = Base.Model
export type Model = typeof Model.Type
export const Message = Base.Message
export type Message = typeof Message.Type

// The application's references, for Remote; made runnable below, once the
// update built over them exists, for Sync to replay.
const Made = Surface.application(Base)

export const Data = Remote.make({
  model: Made.model.remote,
  entities: Object.values(Registry),
  queries: [ProductsQuery],
})

export const Products = ProductList.at({
  data: Data,
  input: (model: Model) => Option.some({ sort: model.sort }),
})

type Cell = {
  readonly row: string
  readonly column: keyof typeof columns.byId
  readonly text: string
}

/** A cell as a change to its product, its value as its column's schema decodes it. */
const changeOf = (cell: Cell): ProductChange => {
  const id = ProductId.make(cell.row)
  return Grid.matchEdit(cell, {
    description: ({ value }) => ({ id, description: Option.some(value), cents: Option.none() }),
    cents: ({ value }) => ({ id, description: Option.none(), cents: Option.some(value) }),
  })
}

/** The edits with `changes` laid over them, each field it holds as committed `at`, or pending. */
const merged = (
  edits: ReadonlyArray<ProductEdit>,
  changes: ReadonlyArray<ProductChange>,
  at: Option.Option<number>,
): ReadonlyArray<ProductEdit> => {
  const byId = new Map(edits.map(edit => [edit.id, edit]))
  for (const change of changes) {
    const before = byId.get(change.id)
    byId.set(change.id, {
      id: change.id,
      description: Option.orElse(
        Option.map(change.description, value => ({ value, at })),
        () => Option.flatMap(Option.fromUndefinedOr(before), edit => edit.description),
      ),
      cents: Option.orElse(
        Option.map(change.cents, value => ({ value, at })),
        () => Option.flatMap(Option.fromUndefinedOr(before), edit => edit.cents),
      ),
    })
  }
  return [...byId.values()]
}

// The grid reports text; the fact it becomes is durable. `Sync.fact` applies
// it within this transition, so no later Message sees the Model without it.
// A paste the columns refused all of writes nothing.
const edited = (model: Model, cells: ReadonlyArray<Cell>) =>
  cells.length === 0
    ? { model }
    : { model, commands: [Sync.fact(Message.EditedProducts({ changes: cells.map(changeOf) }))] }

const Page = Base.pipe(
  Bundle.withServices<RemoteClient>(),
  Bundle.configure('grid', {
    onOut: out => model =>
      Grid.Out.match(out, {
        Edited: cell => edited(model, [cell]),
        // What a column refused is the grid's to say; what it accepted is written.
        Pasted: ({ accepted }) => edited(model, accepted),
      }),
  }),
  Bundle.withWiring(Data.wiring(Crud.actives({ products: Products }))),
)

export const placements = Page.placements

export const update = placements.update((model: Model, message: Message) =>
  Match.value(message).pipe(
    Match.tags({
      SortedProducts: ({ column }) => ({
        model: modifyFields(model, { sort: sort => ProductSort.toggle(sort, column) }),
      }),
      RequestedMoreProducts: () => ({
        model: Option.getOrElse(Products.more(model), () => model),
      }),
      // A failed read is not asked for again on its own; this is the asking.
      RetriedProducts: () => ({ model: Products.refresh(model) }),
      EditedProducts: ({ changes, at }) => ({
        model: modifyFields(model, {
          edits: edits => merged(edits, changes, Option.fromUndefinedOr(at)),
        }),
      }),
      ExchangeChanged: ({ pending, error }) => ({
        model: modifyFields(model, { exchange: () => ({ pending, error }) }),
      }),
    }),
    Match.orElse(() => ({ model })),
  ),
)

export const initial = (): Model =>
  placements.initial({
    remote: Remote.initial,
    sort: ProductSort.none,
    edits: [],
    exchange: { pending: 0, error: Option.none() },
  }).model

/** The application as Sync replays it: the same references, with its initial value and update. */
export const App = Made.runnable({ initial: initial(), update })

/**
 * A field's edit, if the row has not absorbed it: pending, or committed after
 * the revision the table had when Remote read the row.
 */
const unabsorbed = <A>(
  field: Option.Option<{ readonly value: A; readonly at: Option.Option<number> }>,
  revision: number,
): Option.Option<A> =>
  Option.flatMap(field, edit =>
    Option.match(edit.at, {
      onNone: () => Option.some(edit.value),
      onSome: at => (at > revision ? Option.some(edit.value) : Option.none()),
    }),
  )

/**
 * The rows Remote read, with the edits over them: each row as it is read, so
 * a page of thousands is not copied when one product changes, and the same
 * rows while neither the page nor the edits do.
 */
export const rowsOf = (model: Model): RowModel<Row> =>
  RowModel.map(
    GridCrud.rows(Products.page(model), row => row.id),
    model.edits,
    edits => {
      const byId = new Map(edits.map(edit => [edit.id, edit]))
      return row =>
        Option.match(Option.fromUndefinedOr(byId.get(row.id)), {
          onNone: () => row,
          onSome: edit => ({
            ...row,
            description: Option.getOrElse(
              unabsorbed(edit.description, row.revision),
              () => row.description,
            ),
            cents: Option.getOrElse(unabsorbed(edit.cents, row.revision), () => row.cents),
          }),
        })
    },
  )

/** Where the edits stand with the server, for the status line. */
export const exchangeOf = (model: Model): string =>
  Option.match(model.exchange.error, {
    onSome: error =>
      `${model.exchange.pending} ${model.exchange.pending === 1 ? 'edit' : 'edits'} kept on this device; the server cannot be reached (${error}).`,
    onNone: () =>
      model.exchange.pending === 0
        ? ''
        : `Sending ${model.exchange.pending} ${model.exchange.pending === 1 ? 'edit' : 'edits'}…`,
  })
