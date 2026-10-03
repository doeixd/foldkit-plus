import { Option, Schema } from 'effect'
import type { Columns, ColumnSpec } from './columns.js'
import type { ColumnLayout } from './layout.js'
import { addressableRows, type RowCount, type RowModel } from './rows.js'

/** A cell named by identity, so it stays the same cell through a sort or a reorder. */
export interface CellAddress<Id extends string> {
  readonly row: string
  readonly column: Id
}

export const CellAddress = {
  /**
   * An address as stored or sent: the row key as text, and the column as one
   * of these columns' ids, so a saved address naming a removed column fails
   * to decode instead of naming nothing.
   */
  schema: <Row, Specs extends Record<string, ColumnSpec<Row, unknown>>>(
    columns: Columns<Row, Specs>,
  ) => Schema.Struct({ row: Schema.String, column: Schema.Literals(columns.ids) }),
}

/** Where a cell is drawn now: its row index, and its column's index in display order. */
export interface CellPosition {
  readonly row: number
  readonly column: number
}

/** A rectangle of cells: row indexes `[start, end)` and the columns it spans, in display order. */
export interface CellBox<Id extends string> {
  readonly rows: { readonly start: number; readonly end: number }
  readonly columns: ReadonlyArray<Id>
}

export interface CellOffset {
  readonly rows?: number
  readonly columns?: number
}

/**
 * The grid as presented: rows in the application's order, crossed with the
 * visible columns in display order. It is the one source of geometry for
 * focus, selection, virtualization and the clipboard; none of them reads
 * positions from the DOM. A pure value, cheap to rebuild: it reads the
 * column layout once and asks the row model for rows only on lookup.
 *
 * Every lookup is an `Option`. A cell is absent when its column is hidden,
 * its row is gone, or its row is in range but not loaded yet.
 */
export interface GridProjection<Row, Id extends string> {
  readonly rows: RowModel<Row>
  readonly rowCount: RowCount
  /** Visible columns in display order: the start region, the center, the end. */
  readonly columns: ReadonlyArray<Id>
  /** The visible columns of each region, in display order. */
  readonly start: ReadonlyArray<Id>
  readonly center: ReadonlyArray<Id>
  readonly end: ReadonlyArray<Id>
  columnIndex(id: Id): Option.Option<number>
  rowIndex(key: string): Option.Option<number>
  cellAt(position: CellPosition): Option.Option<CellAddress<Id>>
  positionOf(address: CellAddress<Id>): Option.Option<CellPosition>
  /**
   * The cell `offset` away, stopping at the grid's edges. A fractional offset
   * (a page of rows worked out from a height) drops its fraction.
   */
  moveBy(address: CellAddress<Id>, offset: CellOffset): Option.Option<CellAddress<Id>>
  rowStart(address: CellAddress<Id>): Option.Option<CellAddress<Id>>
  rowEnd(address: CellAddress<Id>): Option.Option<CellAddress<Id>>
  first(): Option.Option<CellAddress<Id>>
  last(): Option.Option<CellAddress<Id>>
  /** The rectangle two cells span, in either order. */
  box(anchor: CellAddress<Id>, focus: CellAddress<Id>): Option.Option<CellBox<Id>>
}

export interface ProjectionOptions<Row, Specs extends Record<string, ColumnSpec<Row, unknown>>> {
  readonly rows: RowModel<Row>
  readonly columns: Columns<Row, Specs>
  readonly layout: ColumnLayout<keyof Specs & string>
}

const clamp = (value: number, last: number): number => Math.min(Math.max(value, 0), last)

export const GridProjection = {
  /**
   * Projects rows through a column layout. A layout saved before a column
   * was added does not mention it, so the column joins the center region in
   * definition order; an id the columns do not define, or one named twice,
   * keeps only its first place.
   */
  make: <Row, Specs extends Record<string, ColumnSpec<Row, unknown>>>(
    options: ProjectionOptions<Row, Specs>,
  ): GridProjection<Row, keyof Specs & string> => {
    type Id = keyof Specs & string
    const { rows, columns, layout } = options
    const placed = new Set<string>()
    const place = (ids: ReadonlyArray<Id>): Array<Id> =>
      ids.filter(id => {
        if (!Object.hasOwn(columns.byId, id) || placed.has(id)) return false
        placed.add(id)
        return true
      })
    const startPlaced = place(layout.start)
    const centerPlaced = place(layout.center)
    const endPlaced = place(layout.end)
    centerPlaced.push(...columns.ids.filter(id => !placed.has(id)))

    const hidden = new Set<string>(layout.hidden)
    const shown = (ids: ReadonlyArray<Id>) => ids.filter(id => !hidden.has(id))
    const start = shown(startPlaced)
    const center = shown(centerPlaced)
    const end = shown(endPlaced)
    const visible = [...start, ...center, ...end]
    const indexes = new Map<string, number>(visible.map((id, index) => [id, index]))

    const lastRow = addressableRows(rows.count) - 1
    const lastColumn = visible.length - 1

    const cellAt = (position: CellPosition): Option.Option<CellAddress<Id>> => {
      const column = visible[position.column]
      if (column === undefined) return Option.none()
      return Option.map(rows.keyAt(position.row), row => ({ row, column }))
    }

    const positionOf = (address: CellAddress<Id>): Option.Option<CellPosition> =>
      Option.flatMap(Option.fromUndefinedOr(indexes.get(address.column)), column =>
        Option.map(rows.indexOf(address.row), row => ({ row, column })),
      )

    const within = (
      address: CellAddress<Id>,
      to: (position: CellPosition) => CellPosition,
    ): Option.Option<CellAddress<Id>> =>
      Option.flatMap(positionOf(address), position => cellAt(to(position)))

    return {
      rows,
      rowCount: rows.count,
      columns: visible,
      start,
      center,
      end,
      columnIndex: id => Option.fromUndefinedOr(indexes.get(id)),
      rowIndex: key => rows.indexOf(key),
      cellAt,
      positionOf,
      moveBy: (address, offset) =>
        within(address, ({ row, column }) => ({
          row: clamp(row + Math.trunc(offset.rows ?? 0), lastRow),
          column: clamp(column + Math.trunc(offset.columns ?? 0), lastColumn),
        })),
      rowStart: address => within(address, ({ row }) => ({ row, column: 0 })),
      rowEnd: address => within(address, ({ row }) => ({ row, column: lastColumn })),
      first: () => cellAt({ row: 0, column: 0 }),
      last: () => cellAt({ row: lastRow, column: lastColumn }),
      box: (anchor, focus) =>
        Option.flatMap(positionOf(anchor), from =>
          Option.map(positionOf(focus), to => ({
            rows: { start: Math.min(from.row, to.row), end: Math.max(from.row, to.row) + 1 },
            columns: visible.slice(
              Math.min(from.column, to.column),
              Math.max(from.column, to.column) + 1,
            ),
          })),
        ),
    }
  },
}
