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
import { type CellAddress, DataGrid, RowModel } from 'foldkit-data-grid'
import { GridCrud } from 'foldkit-data-grid/crud'
import { Remote, type RemoteClient } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import { Sync } from 'foldkit-sync'
import { EditedColumn, Product, ProductChange, ProductId, ProductRow, Registry } from './domain.js'
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
    line: { width: 110, edit: { schema: LineName } },
    // One of the Product's own statuses: edited as a choice of them.
    status: { width: 110, edit: { schema: Product.fields.status.schema } },
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

/**
 * An edited field: its value, the journal sequence its edit committed at, and
 * who committed it, both none while it is pending. Stored and sent, so `null`
 * on the wire.
 */
const DescriptionEdit = Schema.Struct({
  value: Product.fields.description.schema,
  at: Schema.OptionFromNullOr(Schema.Number),
  by: Schema.OptionFromNullOr(Schema.String),
})
const CentsEdit = Schema.Struct({
  value: Product.fields.cents.schema,
  at: Schema.OptionFromNullOr(Schema.Number),
  by: Schema.OptionFromNullOr(Schema.String),
})
const LineEdit = Schema.Struct({
  value: Product.fields.line.schema,
  at: Schema.OptionFromNullOr(Schema.Number),
  by: Schema.OptionFromNullOr(Schema.String),
})
const StatusEdit = Schema.Struct({
  value: Product.fields.status.schema,
  at: Schema.OptionFromNullOr(Schema.Number),
  by: Schema.OptionFromNullOr(Schema.String),
})

/** One product's edited fields, the latest per field. */
export const ProductEdit = Schema.Struct({
  id: ProductId,
  description: Schema.OptionFromNullOr(DescriptionEdit),
  cents: Schema.OptionFromNullOr(CentsEdit),
  line: Schema.OptionFromNullOr(LineEdit),
  status: Schema.OptionFromNullOr(StatusEdit),
})
export type ProductEdit = typeof ProductEdit.Type

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
  /** The device whose commit came later. */
  by: Schema.String,
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
  /**
   * Committed edits the journal has absorbed that this device's cached rows
   * have not been read since: kept here, locally, so the row does not show the
   * stale read for a moment. Set by the mount's `onReinstall` (`retiredOf`).
   */
  retired: Schema.Array(ProductEdit),
  exchange: Exchange,
  /** Edits the server refused, each cell it had changed, until dismissed. Local. */
  refused: Schema.Array(Refusal),
  /** This device's edits another device's later commit replaced, until dismissed. Local. */
  replaced: Schema.Array(Replacement),
  /** Whether the person chose to work offline: no exchange runs until they stop. */
  offline: Schema.Boolean,
  /** The other devices that have a cell focused, from presence. Local and passing. */
  peers: Schema.Array(Peer),
}).pipe(
  Bundle.withMessages({
    ...Remote.messages,
    /** A sort header was clicked: the intent, toggled in `update` from the Model as it is. */
    SortedProducts: { column: Schema.Literals(ProductSort.columns) },
    RequestedMoreProducts: {},
    RetriedProducts: {},
    /**
     * The durable fact: products' fields were edited. Replayed, so state only.
     * `at` and `by` are the journal's: absent on what this device sends, and
     * stamped with the sequence it committed at and who committed it
     * (`sync.ts`). Messages cross ports and the journal as they are, so they
     * are plain optional keys, not `Option`s.
     */
    EditedProducts: {
      changes: Schema.Array(ProductChange),
      at: Schema.optionalKey(Schema.Number),
      by: Schema.optionalKey(Schema.String),
    },
    /**
     * Durable, and the server's alone: the table holds every edit committed
     * through `through`, so the edits drop them. Keeps the replicated slice to
     * what the table has not absorbed, usually nothing.
     */
    AbsorbedEdits: { through: Schema.Number },
    /** The server refused edits: their cells, as the mount read them before sending. */
    EditsRefused: { refusals: Schema.Array(Refusal) },
    /** The line about a refused edit was dismissed. */
    RefusalDismissed: { opId: Schema.String },
    /** The line about a replaced edit was dismissed. */
    ReplacementDismissed: { id: ProductId, column: EditedColumn },
    /** The offline switch was pressed: the intent, flipped from the Model as it is. */
    OfflineToggled: {},
    /** Presence said where the other devices are now. */
    PeersChanged: { peers: Schema.Array(Peer) },
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
  const unchanged = {
    id,
    description: Option.none(),
    cents: Option.none(),
    line: Option.none(),
    status: Option.none(),
  }
  return Grid.matchEdit(cell, {
    description: ({ value }) => ({ ...unchanged, description: Option.some(value) }),
    cents: ({ value }) => ({ ...unchanged, cents: Option.some(value) }),
    line: ({ value }) => ({ ...unchanged, line: Option.some(value) }),
    status: ({ value }) => ({ ...unchanged, status: Option.some(value) }),
  })
}

/** The edits with `changes` laid over them, each field it holds as committed `at` by `by`, or pending. */
const merged = (
  edits: ReadonlyArray<ProductEdit>,
  changes: ReadonlyArray<ProductChange>,
  at: Option.Option<number>,
  by: Option.Option<string>,
): ReadonlyArray<ProductEdit> => {
  const byId = new Map(edits.map(edit => [edit.id, edit]))
  for (const change of changes) {
    const before = Option.fromUndefinedOr(byId.get(change.id))
    // A field the change holds, as edited now; otherwise what was there.
    const over = <A, Kept>(
      changed: Option.Option<A>,
      kept: (edit: ProductEdit) => Option.Option<Kept>,
    ) =>
      Option.orElse(
        Option.map(changed, value => ({ value, at, by })),
        () => Option.flatMap(before, kept),
      )
    byId.set(change.id, {
      id: change.id,
      description: over(change.description, edit => edit.description),
      cents: over(change.cents, edit => edit.cents),
      line: over(change.line, edit => edit.line),
      status: over(change.status, edit => edit.status),
    })
  }
  return [...byId.values()]
}

/** Whether a product's edits hold no field. */
const isEmpty = (edit: ProductEdit) =>
  Option.isNone(edit.description) &&
  Option.isNone(edit.cents) &&
  Option.isNone(edit.line) &&
  Option.isNone(edit.status)

/** A field's edit, unless it committed at or before `through`. */
const keepAfter = <Field extends { readonly at: Option.Option<number> }>(
  field: Option.Option<Field>,
  through: number,
) => Option.filter(field, edit => !Option.exists(edit.at, at => at <= through))

/** The edits without what committed through `through`; a product left with none goes. */
const absorbed = (edits: ReadonlyArray<ProductEdit>, through: number) =>
  edits.flatMap(edit => {
    const kept = {
      id: edit.id,
      description: keepAfter(edit.description, through),
      cents: keepAfter(edit.cents, through),
      line: keepAfter(edit.line, through),
      status: keepAfter(edit.status, through),
    }
    return isEmpty(kept) ? [] : [kept]
  })

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
      EditedProducts: ({ changes, at, by }) => ({
        model: modifyFields(model, {
          edits: edits =>
            merged(edits, changes, Option.fromUndefinedOr(at), Option.fromUndefinedOr(by)),
        }),
      }),
      AbsorbedEdits: ({ through }) => ({
        model: modifyFields(model, { edits: edits => absorbed(edits, through) }),
      }),
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
      PeersChanged: ({ peers }) => ({ model: modifyFields(model, { peers: () => peers }) }),
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

export const initial = (): Model =>
  placements.initial({
    remote: Remote.initial,
    sort: ProductSort.none,
    edits: [],
    retired: [],
    exchange: { pending: 0, error: Option.none() },
    refused: [],
    replaced: [],
    offline: false,
    peers: [],
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
  // Two maps, each cached by its own input: the retired edits beneath, the
  // current ones over them.
  RowModel.map(
    RowModel.map(
      GridCrud.rows(Products.page(model), row => row.id),
      model.retired,
      overlaid,
    ),
    model.edits,
    overlaid,
  )

/** Rows with the edits they have not absorbed laid over them. */
const overlaid = (edits: ReadonlyArray<ProductEdit>) => {
  const byId = new Map(edits.map(edit => [edit.id, edit]))
  return (row: Row): Row =>
    Option.match(Option.fromUndefinedOr(byId.get(row.id)), {
      onNone: () => row,
      onSome: edit => ({
        ...row,
        description: Option.getOrElse(
          unabsorbed(edit.description, row.revision),
          () => row.description,
        ),
        cents: Option.getOrElse(unabsorbed(edit.cents, row.revision), () => row.cents),
        line: Option.getOrElse(unabsorbed(edit.line, row.revision), () => row.line),
        status: Option.getOrElse(unabsorbed(edit.status, row.revision), () => row.status),
      }),
    })
}

/**
 * The retired edits after the mount replaced the edits: what `previous`
 * showed, retired or not, that `next` no longer holds, while a cached row's
 * revision is still below it. Whatever a row has caught up with, or a row not
 * cached, is let go: its next read has the table's value.
 */
export const retiredOf = (previous: Model, next: Model): ReadonlyArray<ProductEdit> => {
  // The rows as the grid has them; the key lookup is the row model's own index.
  const rows = GridCrud.rows(Products.page(next), row => row.id)
  const revisionOf = (id: string) =>
    Option.map(Option.flatMap(rows.indexOf(id), rows.rowAt), row => row.revision)
  const current = new Map(next.edits.map(edit => [edit.id, edit]))
  const held = <Field extends { readonly at: Option.Option<number> }>(
    field: Option.Option<Field>,
    now: Option.Option<unknown>,
    revision: number,
  ) =>
    Option.isSome(now)
      ? Option.none()
      : Option.filter(field, edit => Option.exists(edit.at, at => at > revision))
  return [...previous.retired, ...previous.edits].flatMap(edit =>
    Option.match(revisionOf(edit.id), {
      onNone: () => [],
      onSome: revision => {
        const now = Option.fromUndefinedOr(current.get(edit.id))
        const kept = {
          id: edit.id,
          description: held(
            edit.description,
            Option.flatMap(now, kept => kept.description),
            revision,
          ),
          cents: held(
            edit.cents,
            Option.flatMap(now, kept => kept.cents),
            revision,
          ),
          line: held(
            edit.line,
            Option.flatMap(now, kept => kept.line),
            revision,
          ),
          status: held(
            edit.status,
            Option.flatMap(now, kept => kept.status),
            revision,
          ),
        }
        return isEmpty(kept) ? [] : [kept]
      },
    }),
  )
}

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

/** One field's edit as the edits keep it. */
interface FieldEdit<A> {
  readonly value: A
  readonly at: Option.Option<number>
  readonly by: Option.Option<string>
}

/**
 * What the mount just replaced that `device` had written: each field whose
 * last edit was this device's, pending or committed by it, and now holds
 * another device's commit with another value. Last writer wins, by the
 * journal's order; this is how the page says so.
 */
export const replacedOf = (
  previous: Model,
  next: Model,
  device: string,
): ReadonlyArray<Replacement> => {
  const before = new Map(previous.edits.map(edit => [edit.id, edit]))
  const mine = (field: FieldEdit<unknown>) =>
    Option.isNone(field.at) || Option.contains(field.by, device)
  const replaced = <A>(
    id: ProductId,
    column: Replacement['column'],
    now: Option.Option<FieldEdit<A>>,
    then: Option.Option<FieldEdit<A>>,
    text: (value: A) => string,
  ): ReadonlyArray<Replacement> =>
    Option.match(
      Option.zipWith(now, then, (current, prior) => ({ current, prior })),
      {
        onNone: () => [],
        onSome: ({ current, prior }) =>
          Option.match(current.by, {
            onNone: () => [],
            onSome: by =>
              by !== device && mine(prior) && current.value !== prior.value
                ? [{ id, column, by, was: text(prior.value) }]
                : [],
          }),
      },
    )
  return next.edits.flatMap(edit => {
    const was = Option.fromUndefinedOr(before.get(edit.id))
    return [
      ...replaced(
        edit.id,
        'description',
        edit.description,
        Option.flatMap(was, kept => kept.description),
        value => value,
      ),
      ...replaced(
        edit.id,
        'cents',
        edit.cents,
        Option.flatMap(was, kept => kept.cents),
        centsText,
      ),
      ...replaced(
        edit.id,
        'line',
        edit.line,
        Option.flatMap(was, kept => kept.line),
        value => value,
      ),
      ...replaced(
        edit.id,
        'status',
        edit.status,
        Option.flatMap(was, kept => kept.status),
        value => value,
      ),
    ]
  })
}

const centsText = (cents: number) => (cents / 100).toFixed(2)

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
  const rows = GridCrud.rows(Products.page(model), row => row.id)
  const edits = new Map([...model.retired, ...model.edits].map(edit => [edit.id, edit]))
  const refused = new Map(
    model.refused.map(refusal => [`${refusal.id}:${refusal.column}`, refusal]),
  )
  const replaced = new Map(
    model.replaced.map(replacement => [`${replacement.id}:${replacement.column}`, replacement]),
  )
  const peers = new Map(model.peers.map(peer => [`${peer.row}:${peer.column}`, peer]))
  /** The mark of the cell's own edit: not yet sent, or saved and not in the table. */
  const editMark = (row: string, column: keyof typeof columns.byId): Option.Option<CellMark> => {
    // When the cell's edit committed, if it has one: none while pending.
    const field = Option.flatMap(Option.fromUndefinedOr(edits.get(ProductId.make(row))), edit =>
      Match.value(column).pipe(
        Match.when('description', () => Option.map(edit.description, ({ at }) => at)),
        Match.when('cents', () => Option.map(edit.cents, ({ at }) => at)),
        Match.when('line', () => Option.map(edit.line, ({ at }) => at)),
        Match.when('status', () => Option.map(edit.status, ({ at }) => at)),
        Match.orElse(() => Option.none()),
      ),
    )
    const revision = Option.map(
      Option.flatMap(rows.indexOf(row), rows.rowAt),
      read => read.revision,
    )
    return Option.flatMap(field, at =>
      Option.match(at, {
        onNone: () => Option.some({ name: 'pending', description: 'Not yet sent' }),
        onSome: committed =>
          Option.exists(revision, read => committed > read)
            ? Option.some({ name: 'saved', description: 'Saved, not yet in the table' })
            : Option.none(),
      }),
    )
  }
  return ({ row, column }) => {
    const key = `${row}:${column}`
    return Option.map(Option.fromUndefinedOr(refused.get(key)), ({ reason }) => ({
      name: 'refused',
      description: `Not saved: ${reason}`,
    })).pipe(
      Option.orElse(() =>
        Option.map(Option.fromUndefinedOr(replaced.get(key)), ({ by, was }) => ({
          name: 'replaced',
          description: `Replaced by ${by}’s edit (was ${was})`,
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
