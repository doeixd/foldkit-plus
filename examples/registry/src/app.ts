/**
 * The client: Remote over the registry's one Entity, a list of products read
 * a page at a time in the order the Model names, and a data grid over it.
 * Nothing here knows a table; that is `server.ts`.
 *
 * Three owners, and none holds another's state:
 *
 * - the server owns the products, and Remote caches what it has read;
 * - the grid owns focus, selection, column state and the viewport;
 * - this application owns the order the list is read in, and the write it
 *   last sent.
 *
 * An edit or a paste comes out of the grid as text. `onOut` turns it into an
 * `EditProducts` mutation with optimistic patches, so the cells show the new
 * values at once; the server's answer replaces them, or its refusal takes
 * them away again.
 */
import { Match, Option, Schema } from 'effect'
import { modifyFields } from 'foldkit/struct'
import { Bundle } from 'foldkit-bundle'
import { Crud } from 'foldkit-crud'
import { DataGrid } from 'foldkit-data-grid'
import { GridCrud } from 'foldkit-data-grid/crud'
import { Remote, type RemoteClient } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import { ProductId, ProductRow, Registry, type ProductChange } from './domain.js'
import { EditProductsMutation, ProductSort, ProductsQuery } from './operations.js'

/** A price as typed: dollars, with at most two decimals. */
const price = /^\d+(\.\d{1,2})?$/

export const ProductList = Crud.list('Products', {
  query: ProductsQuery,
  selection: ProductRow,
  pageSize: 100,
})

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
      edit: {
        validate: text => (text.trim() === '' ? Option.some('Say what it is') : Option.none()),
      },
    },
    line: { width: 130 },
    status: { width: 120 },
    cents: {
      width: 110,
      edit: {
        draft: row => (row.cents / 100).toFixed(2),
        validate: text =>
          price.test(text.trim()) ? Option.none() : Option.some('A price, like 4.99'),
      },
    },
  },
})

export const Grid = DataGrid.make({
  id: 'products',
  columns,
  rowSelection: 'multiple',
  cellSelection: true,
})

const Base = Bundle.compose({
  remote: Remote.Model,
  /** The order the list is read in: the query's input, so another order is another read. */
  sort: ProductSort.Schema,
  /** The last write sent, by its request id, for the status line to follow. */
  saving: Schema.OptionFromNullOr(Schema.String),
}).pipe(
  Bundle.withMessages({
    ...Remote.messages,
    SortedProducts: { sort: ProductSort.Schema },
    RequestedMoreProducts: {},
    RetriedProducts: {},
  }),
  Bundle.withChild('grid', Grid.bundle),
)

export const Model = Base.Model
export type Model = typeof Model.Type
export const Message = Base.Message
export type Message = typeof Message.Type

export const App = Surface.application(Base)

export const Data = Remote.make({
  model: App.model.remote,
  entities: Object.values(Registry),
  mutations: [EditProductsMutation],
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

/**
 * A cell as a change to its product. Only `description` and `cents` edit,
 * and their columns checked the text, so it parses.
 */
const changeOf = (cell: Cell): ProductChange => {
  const text = cell.text.trim()
  return {
    id: ProductId.make(cell.row),
    description: cell.column === 'description' ? Option.some(text) : Option.none(),
    cents: cell.column === 'cents' ? Option.some(Math.round(Number(text) * 100)) : Option.none(),
  }
}

/** What a change shows before the server answers: its fields, as the server writes them. */
const optimisticOf = (change: ProductChange) =>
  Remote.patch(Registry.Product, change.id, {
    ...Option.match(change.description, {
      onNone: () => ({}),
      onSome: description => ({ description }),
    }),
    ...Option.match(change.cents, { onNone: () => ({}), onSome: cents => ({ cents }) }),
  })

// A paste the columns refused all of, or one onto cells that do not edit, writes nothing.
const save = (model: Model, cells: ReadonlyArray<Cell>) => {
  const changes = cells.map(changeOf)
  if (changes.length === 0) return { model }
  const started = Data.mutate(
    model,
    EditProductsMutation,
    { changes },
    { optimistic: changes.map(optimisticOf) },
  )
  return {
    model: modifyFields(started.model, { saving: () => Option.some(started.requestId) }),
    commands: [started.command],
  }
}

const Page = Base.pipe(
  Bundle.withServices<RemoteClient>(),
  // The grid reports text; this is where it becomes a write.
  Bundle.configure('grid', {
    onOut: out => model =>
      Grid.Out.match(out, {
        Edited: edited => save(model, [edited]),
        // What a column refused is the grid's to say; what it accepted is written.
        Pasted: ({ accepted }) => save(model, accepted),
      }),
  }),
  Bundle.withWiring(Data.wiring(Crud.actives({ products: Products }))),
)

export const placements = Page.placements

export const update = placements.update((model: Model, message: Message) => {
  switch (message._tag) {
    case 'SortedProducts':
      return { model: modifyFields(model, { sort: () => message.sort }) }
    case 'RequestedMoreProducts':
      return { model: Option.getOrElse(Products.more(model), () => model) }
    // A failed read is not asked for again on its own; this is the asking.
    case 'RetriedProducts':
      return { model: Products.refresh(model) }
    default:
      return { model }
  }
})

export const initial = (): Model =>
  placements.initial({ remote: Remote.initial, sort: ProductSort.none, saving: Option.none() })
    .model

/** Where the last write stands, for the status line. */
export const savingOf = (model: Model): string =>
  Option.match(model.saving, {
    onNone: () => '',
    onSome: requestId =>
      Match.valueTags(Data.mutation(model, requestId), {
        Unknown: () => '',
        Pending: () => 'Saving…',
        Applied: () => 'Saved.',
        Failed: ({ error }) => `Not saved: ${error.message}`,
      }),
  })
