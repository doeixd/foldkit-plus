import { Option, Schema } from 'effect'
import type { KeyboardModifiers } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Bundle } from 'foldkit-bundle'
import type { Columns, ColumnSpec } from './columns.js'
import { CellAddress, type GridProjection } from './projection.js'

export type Direction = 'ltr' | 'rtl'

export interface KeyOptions<Id extends string> {
  readonly current: Option.Option<CellAddress<Id>>
  readonly key: string
  readonly modifiers: KeyboardModifiers
  /** Default `'ltr'`; under `'rtl'` the left and right arrows swap. */
  readonly direction?: Direction
  /** How many rows PageUp and PageDown move: the rows a viewport shows. */
  readonly pageRows: number
}

const sameAddress = <Id extends string>(a: CellAddress<Id>, b: CellAddress<Id>): boolean =>
  a.row === b.row && a.column === b.column

/**
 * The cell that holds the grid's one tab stop: the focused cell while it is
 * shown, and otherwise the first cell. A focused cell whose column was hidden
 * or whose row went away stays in the Model, so focus returns to it if it
 * comes back, but the tab stop moves on until then.
 */
const tabStop = <Row, Id extends string>(
  projection: GridProjection<Row, Id>,
  current: Option.Option<CellAddress<Id>>,
): Option.Option<CellAddress<Id>> =>
  Option.orElse(
    Option.filter(current, address => Option.isSome(projection.positionOf(address))),
    () => projection.first(),
  )

const arrows: ReadonlyMap<string, { readonly rows: number; readonly columns: number }> = new Map([
  ['ArrowUp', { rows: -1, columns: 0 }],
  ['ArrowDown', { rows: 1, columns: 0 }],
  ['ArrowLeft', { rows: 0, columns: -1 }],
  ['ArrowRight', { rows: 0, columns: 1 }],
])

/**
 * The cell a key moves focus to, or none when the key is not the grid's to
 * handle, so the caller leaves it to the page. Arrows step one cell, Home and
 * End go to the row's edges and, with Ctrl, to the grid's corners; PageUp and
 * PageDown move `pageRows`. A key the grid handles always lands somewhere: at
 * an edge, or onto a row that is counted but not loaded, focus stays where it
 * is. Shift, Alt and Meta combinations are left alone: Shift extends a
 * selection, which is not focus's to decide.
 */
const target = <Row, Id extends string>(
  projection: GridProjection<Row, Id>,
  options: KeyOptions<Id>,
): Option.Option<CellAddress<Id>> => {
  const { key, modifiers } = options
  if (modifiers.shiftKey || modifiers.altKey || modifiers.metaKey) return Option.none()
  return Option.flatMap(tabStop(projection, options.current), from => {
    const stay = (to: Option.Option<CellAddress<Id>>) =>
      Option.some(Option.getOrElse(to, () => from))
    if (key === 'Home')
      return stay(modifiers.ctrlKey ? projection.first() : projection.rowStart(from))
    if (key === 'End') return stay(modifiers.ctrlKey ? projection.last() : projection.rowEnd(from))
    if (modifiers.ctrlKey) return Option.none()
    if (key === 'PageUp') return stay(projection.moveBy(from, { rows: -options.pageRows }))
    if (key === 'PageDown') return stay(projection.moveBy(from, { rows: options.pageRows }))
    const step = arrows.get(key)
    if (step === undefined) return Option.none()
    const flip = options.direction === 'rtl' ? -1 : 1
    return stay(projection.moveBy(from, { rows: step.rows, columns: step.columns * flip }))
  })
}

/**
 * A cell's DOM id: the grid's id, the row key and the column id, each
 * URI-encoded and joined by `:`, which encoding never leaves in a part, so no
 * two cells share an id. The container points at it with
 * `aria-activedescendant`.
 */
const cellId = <Id extends string>(grid: string, address: CellAddress<Id>): string =>
  [grid, address.row, address.column].map(encodeURIComponent).join(':')

const decode = Option.liftThrowable(decodeURIComponent)

/**
 * The address a `cellId` names, if it is one of this grid's: its row key and
 * its column id as written, for the grid's columns to check. An id from
 * another grid, or with a malformed escape, is none.
 */
const cellOf = (
  grid: string,
  id: string,
): Option.Option<{ readonly row: string; readonly column: string }> => {
  const parts = id.split(':')
  if (parts.length !== 3) return Option.none()
  return Option.flatMap(Option.all(parts.map(part => decode(part))), ([owner, row, column]) =>
    owner === grid ? Option.some({ row: row!, column: column! }) : Option.none(),
  )
}

/**
 * A column header's DOM id: the grid's id and the column id, URI-encoded and
 * joined by `:`. It has two parts where a cell's has three, so the two never
 * meet.
 */
const headerId = (grid: string, column: string): string =>
  [grid, column].map(encodeURIComponent).join(':')

/**
 * Focus for one grid: which cell is current, by identity. Make it once per
 * grid from its columns, so a focus saved in the Model decodes only against
 * columns that exist.
 */
const make = <Row, Specs extends Record<string, ColumnSpec<Row, unknown>>>(
  columns: Columns<Row, Specs>,
) => {
  const Address = CellAddress.schema(columns)
  const Model = Schema.Struct({
    /** The focused cell; stored as `null` when none is. */
    current: Schema.OptionFromNullOr(Address),
    /**
     * The column header focus is on, when it is on the header row. The cell
     * focused before stays in `current`, so going back down returns to it.
     */
    header: Schema.OptionFromNullOr(Address.fields.column),
  })
  type Model = typeof Model.Type
  const Message = defineMessageUnion({
    /** A cell became current: the user focused it, or a key moved there. */
    Focused: { address: Address },
    /** Focus went up to a column's header. */
    HeaderFocused: { column: Address.fields.column },
  })
  const bundle = Bundle.make('GridFocus', {
    Model,
    Message,
    init: () => ({ model: { current: Option.none(), header: Option.none() } }),
    update: (model: Model, message: typeof Message.Type) => ({
      model: Message.match(message, {
        Focused: ({ address }) =>
          Option.isNone(model.header) &&
          Option.isSome(model.current) &&
          sameAddress(model.current.value, address)
            ? model
            : modifyFields(model, {
                current: () => Option.some(address),
                header: () => Option.none(),
              }),
        HeaderFocused: ({ column }) =>
          Option.contains(model.header, column)
            ? model
            : modifyFields(model, { header: () => Option.some(column) }),
      }),
    }),
  })
  return { Address, Model, Message, bundle }
}

export const GridFocus = { make, target, tabStop, cellId, cellOf, headerId }
