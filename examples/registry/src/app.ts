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
 * - this application owns the order the list is read in, and the search.
 *
 * A row is drawn as Remote read it with the edits it has not absorbed over
 * it: those still pending, and those committed after its revision. So an edit
 * shows at once, survives a reload while offline, shows while the table has
 * not written it, and gives way to the table once a read of the row has it.
 */
import { Equal, Match, Option, Schema, SchemaGetter } from 'effect'
import { modifyFields } from 'foldkit/struct'
import { Bundle } from 'foldkit-bundle'
import { Crud } from 'foldkit-crud'
import { type CellAddress, DataGrid, RowModel } from 'foldkit-data-grid'
import { GridCrud } from 'foldkit-data-grid/crud'
import { Remote, type RemoteClient } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import { Sync } from 'foldkit-sync'
import {
  EditedColumn,
  Product,
  type ProductChange,
  type ProductEdit,
  ProductEdits,
  ProductId,
  ProductRow,
  Registry,
} from './domain.js'
import { ProductSort, ProductsQuery } from './operations.js'

/** A description as typed: its spaces around dropped, and something left. */
const Description = Schema.Trim.pipe(
  Schema.decodeTo(Schema.String.check(Schema.isMinLength(1, { message: 'Say what it is' }))),
)

/** A product line as typed: its spaces around dropped, and something left. */
const LineName = Schema.Trim.pipe(
  Schema.decodeTo(Schema.String.check(Schema.isMinLength(1, { message: 'Say which line' }))),
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
    // Widths that fit a device's pane in the sandbox, two side by side.
    upc: { pinned: 'start', width: 130, hideable: false },
    description: {
      width: 220,
      minWidth: 120,
      edit: { schema: Description },
    },
    line: { width: 100, edit: { schema: LineName } },
    // One of the Product's own statuses: edited as a choice of them, wide
    // enough for the longest in its select.
    status: { width: 130, edit: { schema: Product.fields.status.schema } },
    cents: {
      width: 90,
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

/** A cell an edit the server refused had changed, and why. */
export const Refusal = Schema.Struct({
  /** The refused operation, so the line about it can be dismissed. */
  opId: Schema.String,
  id: ProductId,
  column: EditedColumn,
  reason: Schema.String,
})
export type Refusal = typeof Refusal.Type

/** A cell this device last wrote that another's later commit overwrote, and what it was. */
export const Replacement = Schema.Struct({
  id: ProductId,
  column: EditedColumn,
  /**
   * The device whose commit came later; none when the journal had absorbed it
   * before this device heard, so only the row read since says it came.
   */
  by: Schema.OptionFromNullOr(Schema.String),
  /** This device's value, as the cell showed it. */
  was: Schema.String,
})
export type Replacement = typeof Replacement.Type

/**
 * Where a device is, as it says over presence: its name and the cell it has
 * focused. `null` on the wire, where a device has no cell.
 */
export const PeerPresence = Schema.Struct({
  name: Schema.String,
  row: Schema.NullOr(Schema.String),
  column: Schema.NullOr(Schema.String),
})
export type PeerPresence = typeof PeerPresence.Type

/** Another device at a cell, as this page draws it. */
const Peer = Schema.Struct({ name: Schema.String, row: Schema.String, column: Schema.String })

/** Where this replica's edits stand with the server, as its status last said. */
const Exchange = Schema.Struct({
  /** Edits this device made that the server has not taken yet. */
  pending: Schema.Number,
  /** Why the last exchange failed, until one succeeds. */
  error: Schema.OptionFromNullOr(Schema.String),
})

/** One cell an edit changed: what it held, and what the edit made it. */
const CellStep = Schema.Struct({ before: ProductEdits.Change, after: ProductEdits.Change })
/** One step to take back or do again: the cells of one edit, or of one paste. */
const UndoStep = Schema.Array(CellStep)
type UndoStep = typeof UndoStep.Type
const UNDO_DEPTH = 100

/** The cells an undo or a redo left alone, because they had changed since. */
const HeldBack = Schema.Struct({
  by: Schema.Literals(['undo', 'redo']),
  cells: Schema.Array(Schema.Struct({ id: ProductId, column: EditedColumn })),
})

const Base = Bundle.compose({
  remote: Remote.Model,
  /** The order the list is read in: the query's input, so another order is another read. */
  sort: ProductSort.Schema,
  /** The text descriptions are searched for: the query's input too, so the server filters. */
  search: Schema.String,
  /**
   * Every cell edited, the latest per cell, and when each committed. The
   * replicated slice: the journal's, not this device's.
   */
  edits: Schema.Array(ProductEdits.Edit),
  /**
   * Committed edits the journal has absorbed that this device's cached rows
   * have not been read since: kept here, locally, so the row does not show the
   * stale read for a moment. Set by the mount's `onReinstall` (`retiredOf`).
   */
  retired: Schema.Array(ProductEdits.Edit),
  exchange: Exchange,
  /** Edits the server refused, each cell it had changed, until dismissed. Local. */
  refused: Schema.Array(Refusal),
  /** This device's edits another device's later commit replaced, until dismissed. Local. */
  replaced: Schema.Array(Replacement),
  /** Whether the person chose to work offline: no exchange runs until they stop. */
  offline: Schema.Boolean,
  /** The other devices that have a cell focused, from presence. Local and passing. */
  peers: Schema.Array(Peer),
  /** The replica this page commits from, so its own edits are told from another's. Local. */
  replica: Schema.String,
  /**
   * This tab's edits to take back, latest last, and those taken back to do
   * again. Local to the tab, as an editor's undo is, so a reload starts none.
   */
  undo: Schema.Array(UndoStep),
  redo: Schema.Array(UndoStep),
  /** What the last undo or redo left alone, until dismissed or the next. Local. */
  heldBack: Schema.OptionFromNullOr(HeldBack),
}).pipe(
  Bundle.withMessages({
    ...Remote.messages,
    /** A sort header was clicked: the intent, toggled in `update` from the Model as it is. */
    SortedProducts: { column: Schema.Literals(ProductSort.columns) },
    RequestedMoreProducts: {},
    /** The search box's text, as typed: the query asks for it on the next read. */
    SearchChanged: { text: Schema.String },
    RetriedProducts: {},
    /**
     * The durable fact: products' fields were edited. Replayed, so state only.
     * `at` and `by` are the journal's: absent on what this device sends, and
     * stamped with the sequence it committed at and who committed it
     * (`sync.ts`). Messages cross ports and the journal as they are, so they
     * are plain optional keys, not `Option`s.
     */
    EditedProducts: ProductEdits.edited,
    /**
     * Durable, and the server's alone: the table holds every edit committed
     * through `through`, so the edits drop them. Keeps the replicated slice to
     * what the table has not absorbed, usually nothing.
     */
    AbsorbedEdits: ProductEdits.absorbed,
    /** The server refused edits: their cells, as the mount read them before sending. */
    EditsRefused: { refusals: Schema.Array(Refusal) },
    /** The line about a refused edit was dismissed. */
    RefusalDismissed: { opId: Schema.String },
    /** The line about a replaced edit was dismissed. */
    ReplacementDismissed: { id: ProductId, column: EditedColumn },
    /** The line about what an undo or a redo left alone was dismissed. */
    HeldBackDismissed: {},
    /** The offline switch was pressed: the intent, flipped from the Model as it is. */
    OfflineToggled: {},
    /** Presence said where the other devices are now. */
    PeersChanged: { peers: Schema.Array(Peer) },
    /** The page was mounted over this replica: the one it commits from. */
    ReplicaNamed: { replica: Schema.String },
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
  input: (model: Model) => Option.some({ sort: model.sort, search: model.search }),
})

type Cell = {
  readonly row: string
  readonly column: keyof typeof columns.byId
  readonly text: string
}

/** A cell as a change to its product, its value as its column's schema decodes it. */
const changeOf = (cell: Cell): ProductChange => {
  const id = ProductId.make(cell.row)
  return Grid.matchEdit<{
    readonly description: (edited: { readonly value: string }) => ProductChange
    readonly cents: (edited: { readonly value: number }) => ProductChange
    readonly line: (edited: { readonly value: string }) => ProductChange
    readonly status: (edited: {
      readonly value: typeof Product.fields.status.schema.Type
    }) => ProductChange
  }>(cell, {
    description: ({ value }) => ({ id, member: 'description', value }),
    cents: ({ value }) => ({ id, member: 'cents', value }),
    line: ({ value }) => ({ id, member: 'line', value }),
    status: ({ value }) => ({ id, member: 'status', value }),
  })
}

// The grid reports text; the fact it becomes is durable. `Sync.fact` applies
// it within this transition, so no later Message sees the Model without it.
// A paste the columns refused all of writes nothing. The grid reports no
// cell left as it began, so an unchanged one never reaches here.
const edited = (model: Model, cells: ReadonlyArray<Cell>) => {
  if (cells.length === 0) return { model }
  const changes = cells.map(changeOf)
  // What each cell showed before, read from the page: what an undo puts back.
  const shown = shownOf(model)
  const step = changes.flatMap(after =>
    Option.match(shown(after.id), {
      onNone: () => [],
      onSome: row => [{ before: ProductEdits.changeAt(row, after.member), after }],
    }),
  )
  return {
    model: modifyFields(model, {
      undo: undo => (step.length === 0 ? undo : [...undo, step].slice(-UNDO_DEPTH)),
      redo: () => [],
      heldBack: () => Option.none(),
    }),
    commands: [Sync.fact(Message.EditedProducts({ changes }))],
  }
}

const flipped = (step: UndoStep): UndoStep =>
  step.map(({ before, after }) => ({ before: after, after: before }))

/**
 * Takes the last step of `by`'s stack back (or, for redo, does it again) as a
 * new edit: an edit may be committed and seen elsewhere, so nothing is
 * rewound. Undo and redo are one move in opposite directions. A cell is
 * changed only while the page still shows what the step left there: one
 * another device, or a later edit here, has changed since is theirs, and is
 * left alone and said.
 */
const replay = (model: Model, by: 'undo' | 'redo') => {
  const from = model[by]
  const last = from[from.length - 1]
  if (last === undefined) return { model }
  const step = by === 'undo' ? last : flipped(last)
  const shown = shownOf(model)
  const holds = (change: ProductChange) =>
    Option.exists(shown(change.id), row => Equal.equals(row[change.member], change.value))
  const taken = step.filter(cell => holds(cell.after))
  const left = step.filter(cell => !holds(cell.after))
  const other = by === 'undo' ? model.redo : model.undo
  const moved =
    taken.length === 0
      ? other
      : [...other, by === 'undo' ? taken : flipped(taken)].slice(-UNDO_DEPTH)
  const popped = from.slice(0, -1)
  return {
    model: modifyFields(model, {
      undo: () => (by === 'undo' ? popped : moved),
      redo: () => (by === 'undo' ? moved : popped),
      heldBack: () =>
        left.length === 0
          ? Option.none()
          : Option.some({
              by,
              cells: left.map(({ after }) => ({ id: after.id, column: after.member })),
            }),
    }),
    commands:
      taken.length === 0
        ? []
        : [Sync.fact(Message.EditedProducts({ changes: taken.map(cell => cell.before) }))],
  }
}

const Page = Base.pipe(
  Bundle.withServices<RemoteClient>(),
  Bundle.configure('grid', {
    onOut: out => model =>
      Grid.Out.match(out, {
        Edited: cell => edited(model, [cell]),
        // What a column refused is the grid's to say; what it accepted is written.
        Pasted: ({ accepted }) => edited(model, accepted),
        // What a fill writes is worked out from the rows as the page shows them now.
        Filled: request => edited(model, Grid.fill(rowsOf(model), model.grid, request).accepted),
        UndoRequested: () => replay(model, 'undo'),
        RedoRequested: () => replay(model, 'redo'),
      }),
  }),
  Bundle.withWiring(Data.wiring(Crud.actives({ products: Products }))),
)

export const placements = Page.placements

const transition = placements.update((model: Model, message: Message) =>
  Match.value(message).pipe(
    Match.tags({
      SortedProducts: ({ column }) => ({
        model: modifyFields(model, { sort: sort => ProductSort.toggle(sort, column) }),
      }),
      SearchChanged: ({ text }) => ({ model: modifyFields(model, { search: () => text }) }),
      RequestedMoreProducts: () => ({
        model: Option.getOrElse(Products.more(model), () => model),
      }),
      // A failed read is not asked for again on its own; this is the asking.
      RetriedProducts: () => ({ model: Products.refresh(model) }),
      EditedProducts: ({ changes, at, by }) => ({
        model: modifyFields(model, {
          edits: edits =>
            ProductEdits.merge(
              edits,
              changes,
              Option.fromUndefinedOr(at),
              Option.fromUndefinedOr(by),
            ),
        }),
      }),
      AbsorbedEdits: ({ through }) => {
        const edits = ProductEdits.absorb(model.edits, through)
        return {
          model: edits === model.edits ? model : modifyFields(model, { edits: () => edits }),
        }
      },
      EditsRefused: ({ refusals }) => ({
        model: modifyFields(model, { refused: refused => [...refused, ...refusals] }),
      }),
      RefusalDismissed: ({ opId }) => ({
        model: modifyFields(model, {
          refused: refused => refused.filter(refusal => refusal.opId !== opId),
        }),
      }),
      ReplacementDismissed: ({ id, column }) => ({
        model: modifyFields(model, {
          replaced: replaced =>
            replaced.filter(replacement => replacement.id !== id || replacement.column !== column),
        }),
      }),
      HeldBackDismissed: () => ({
        model: Option.isNone(model.heldBack)
          ? model
          : modifyFields(model, { heldBack: () => Option.none() }),
      }),
      PeersChanged: ({ peers }) => ({ model: modifyFields(model, { peers: () => peers }) }),
      ReplicaNamed: ({ replica }) => ({
        model: model.replica === replica ? model : modifyFields(model, { replica: () => replica }),
      }),
      OfflineToggled: () => ({
        model: modifyFields(model, { offline: offline => !offline }),
      }),
      ExchangeChanged: ({ pending, error }) => ({
        model: modifyFields(model, { exchange: () => ({ pending, error }) }),
      }),
    }),
    Match.orElse(() => ({ model })),
  ),
)

/**
 * Every transition, then what a read since says of the retired edits: a read
 * can arrive in any Message Remote sends, so the check follows them all.
 */
export const update: typeof transition = (model, message) => {
  const next = transition(model, message)
  const settled = settledOf(next.model)
  return settled === next.model ? next : { ...next, model: settled }
}

export const initial = (): Model =>
  placements.initial({
    remote: Remote.initial,
    sort: ProductSort.none,
    search: '',
    edits: [],
    retired: [],
    exchange: { pending: 0, error: Option.none() },
    refused: [],
    replaced: [],
    offline: false,
    peers: [],
    replica: '',
    undo: [],
    redo: [],
    heldBack: Option.none(),
  }).model

/** The application as Sync replays it: the same references, with its initial value and update. */
export const App = Made.runnable({ initial: initial(), update })

/** The row Remote read for a product, if the page has it. */
const rowOf =
  (model: Model) =>
  (id: ProductId): Option.Option<Row> => {
    const rows = GridCrud.rows(Products.page(model), row => row.id)
    return Option.flatMap(rows.indexOf(id), rows.rowAt)
  }

/** A product's row as the page shows it, with the edits over it, if the page has it. */
const shownOf =
  (model: Model) =>
  (id: ProductId): Option.Option<Row> => {
    const rows = rowsOf(model)
    return Option.flatMap(rows.indexOf(id), rows.rowAt)
  }

/**
 * The rows Remote read, with the edits over them: each row as it is read, so
 * a page of thousands is not copied when one product changes, and the same
 * rows while neither the page nor the edits do.
 */
export const rowsOf = (model: Model): RowModel<Row> =>
  // Two maps, each cached by its own input: the retired edits beneath, the
  // current ones over them.
  RowModel.map(
    RowModel.map(
      GridCrud.rows(Products.page(model), row => row.id),
      model.retired,
      ProductEdits.overlay<Row>,
    ),
    model.edits,
    ProductEdits.overlay<Row>,
  )

/**
 * The retired edits after the mount replaced the edits: what `previous`
 * showed, retired or not, that `next` no longer holds, while a cached row's
 * revision is still below it.
 */
export const retiredOf = (previous: Model, next: Model): ReadonlyArray<ProductEdit> =>
  ProductEdits.held([...previous.retired, ...previous.edits], next.edits, id =>
    Option.map(rowOf(next)(id), row => row.revision),
  )

/** Whether `retired` holds a cell `previous` had not retired: one just taken from the slice. */
export const retiresAny = (previous: Model, retired: ReadonlyArray<ProductEdit>): boolean =>
  ProductEdits.newlyHeld(previous.retired, retired)

/** Where the edits stand with the server, for the status line. */
export const exchangeOf = (model: Model): string => {
  const { pending, error } = model.exchange
  const edits = `${pending} ${pending === 1 ? 'edit' : 'edits'}`
  if (model.offline)
    return pending === 0 ? 'Working offline.' : `Working offline: ${edits} kept on this device.`
  return Option.match(error, {
    onSome: reason => `${edits} kept on this device; the server cannot be reached (${reason}).`,
    onNone: () => (pending === 0 ? '' : `Sending ${edits}…`),
  })
}

const centsText = (cents: number) => (cents / 100).toFixed(2)

/** An edit's value as its cell shows it. */
const textOf = (edit: ProductEdit): string =>
  Match.value(edit).pipe(
    Match.when({ member: 'cents' }, ({ value }) => centsText(value)),
    Match.orElse(({ value }) => String(value)),
  )

/** A replaced edit, in the words the page says it with: whose later edit, and what it was. */
const replacementOf = ({
  edit,
  by,
}: {
  readonly edit: ProductEdit
  readonly by: Option.Option<{ readonly actor: string }>
}): Replacement => ({
  id: edit.id,
  column: edit.member,
  by: Option.map(by, author => author.actor),
  was: textOf(edit),
})

/**
 * What the mount just replaced that this page's replica had written: each
 * cell whose last edit was its own, and now holds another replica's commit
 * with another value, though it be the same person's in another tab. Last
 * writer wins, by the journal's order; this is how the page says so.
 */
export const replacedOf = (previous: Model, next: Model): ReadonlyArray<Replacement> =>
  ProductEdits.replaced(previous.edits, next.edits, next.replica).map(replacementOf)

/**
 * The retired edits a read of their rows has reached, let go; of those, each
 * of this page's that the row shows another value for, said as replaced: the
 * table applies in order, so a row at or past an edit that holds another
 * value took a later edit, though the journal absorbed it before this page
 * heard whose. Nothing reached, it returns the Model it was given.
 */
export const settledOf = (model: Model): Model => {
  if (model.retired.length === 0) return model
  const { held, replaced } = ProductEdits.settled(model.retired, rowOf(model), model.replica)
  if (held === model.retired) return model
  return modifyFields(model, {
    retired: () => held,
    replaced: before => [...before, ...replaced.map(replacementOf)],
  })
}

/** A cell's state for the grid's `marks`: a name to style, and words to say. */
interface CellMark {
  readonly name: string
  readonly description: string
}

/**
 * Each cell's mark, for the grid: an edit the server refused, until it is
 * dismissed; one not yet sent; one the journal has that the row, as Remote
 * read it, does not.
 */
export const marksOf = (
  model: Model,
): ((address: CellAddress<keyof typeof columns.byId>) => Option.Option<CellMark>) => {
  const rowAt = rowOf(model)
  // The current edits after the retired ones, so a cell's latest is the one kept.
  const edits = new Map<string, Map<string, ProductEdit>>()
  for (const edit of [...model.retired, ...model.edits]) {
    const cells = edits.get(edit.id) ?? new Map<string, ProductEdit>()
    cells.set(edit.member, edit)
    edits.set(edit.id, cells)
  }
  const refused = new Map(
    model.refused.map(refusal => [`${refusal.id}:${refusal.column}`, refusal]),
  )
  const replaced = new Map(
    model.replaced.map(replacement => [`${replacement.id}:${replacement.column}`, replacement]),
  )
  const peers = new Map(model.peers.map(peer => [`${peer.row}:${peer.column}`, peer]))
  /** The mark of the cell's own edit: not yet sent, or saved and not in the table. */
  const editMark = (row: string, column: string): Option.Option<CellMark> =>
    Option.flatMap(Option.fromUndefinedOr(edits.get(row)?.get(column)), edit =>
      Option.match(edit.at, {
        onNone: () => Option.some({ name: 'pending', description: 'Not yet sent' }),
        onSome: () =>
          Option.exists(rowAt(ProductId.make(row)), read => ProductEdits.shows(edit, read.revision))
            ? Option.some({ name: 'saved', description: 'Saved, not yet in the table' })
            : Option.none(),
      }),
    )
  return ({ row, column }) => {
    const key = `${row}:${column}`
    return Option.map(Option.fromUndefinedOr(refused.get(key)), ({ reason }) => ({
      name: 'refused',
      description: `Not saved: ${reason}`,
    })).pipe(
      Option.orElse(() =>
        Option.map(Option.fromUndefinedOr(replaced.get(key)), ({ by, was }) => ({
          name: 'replaced',
          description: `Replaced by ${Option.match(by, {
            onSome: name => `${name}’s edit`,
            onNone: () => 'a later edit',
          })} (was ${was})`,
        })),
      ),
      Option.orElse(() => editMark(row, column)),
      // Below this device's own states: where another device is.
      Option.orElse(() =>
        Option.map(Option.fromUndefinedOr(peers.get(key)), ({ name }) => ({
          name: 'peer',
          description: `${name} is here`,
        })),
      ),
    )
  }
}
