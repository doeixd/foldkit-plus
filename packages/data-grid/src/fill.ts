import { Option } from 'effect'
import type { PastedCell } from './clipboard.js'
import type { CellAddress, CellBox, GridProjection } from './projection.js'

/** A fill: the range whose cells are carried on, and the cell it was carried to. */
export interface FillRequest<Id extends string> {
  readonly source: { readonly anchor: CellAddress<Id>; readonly focus: CellAddress<Id> }
  readonly to: CellAddress<Id>
}

/**
 * Where a fill lands: the source's box, and the box it fills beyond it, down,
 * up, right or left, whichever way `to` lies further outside the source. A
 * fill carries on along one axis only, as spreadsheets do.
 */
export interface FillPlan<Id extends string> {
  readonly source: CellBox<Id>
  readonly target: CellBox<Id>
  /** Rows (`down`/`up`) or columns (`right`/`left`), away from the source. */
  readonly toward: 'down' | 'up' | 'right' | 'left'
}

const number = /^-?\d+(?:\.(\d+))?$/

/**
 * The texts that carry `source` on for `count` cells, the first of them next
 * to it. Two or more numbers a constant step apart continue their step, with
 * as many decimals as the most precise of them; anything else repeats, in
 * order. `backward` carries the source on before its first text, as filling
 * up or left does.
 */
const series = (
  source: ReadonlyArray<string>,
  count: number,
  backward: boolean,
): ReadonlyArray<string> => {
  const at = (index: number) => source[((index % source.length) + source.length) % source.length]!
  const repeated = Array.from({ length: count }, (_, index) =>
    backward ? at(-1 - index) : at(source.length + index),
  )
  if (source.length < 2) return repeated
  const parsed = source.map(text => number.exec(text.trim()))
  if (parsed.some(match => match === null)) return repeated
  const decimals = Math.max(...parsed.map(match => match![1]?.length ?? 0))
  // Whole units of the finest decimal, so a step of 0.1 adds up exactly.
  const scale = 10 ** decimals
  const units = source.map(text => Math.round(Number(text.trim()) * scale))
  const step = units[1]! - units[0]!
  if (units.some((unit, index) => index > 0 && unit - units[index - 1]! !== step)) return repeated
  const from = backward ? units[0]! : units[units.length - 1]!
  return Array.from({ length: count }, (_, index) =>
    ((from + (backward ? -step : step) * (index + 1)) / scale).toFixed(decimals),
  )
}

/** The source's box and the box beyond it toward `to`; none when `to` is inside it. */
const plan = <Row, Id extends string>(
  projection: GridProjection<Row, Id>,
  request: FillRequest<Id>,
): Option.Option<FillPlan<Id>> =>
  Option.flatMap(projection.box(request.source.anchor, request.source.focus), source =>
    Option.flatMap(projection.positionOf(request.to), to => {
      const first = projection.columns.indexOf(source.columns[0]!)
      const last = first + source.columns.length - 1
      const below = to.row - (source.rows.end - 1)
      const above = source.rows.start - to.row
      const right = to.column - last
      const left = first - to.column
      const rows = Math.max(below, above)
      const columns = Math.max(right, left)
      if (rows <= 0 && columns <= 0) return Option.none()
      if (rows >= columns) {
        const target =
          below > 0
            ? { start: source.rows.end, end: to.row + 1 }
            : { start: to.row, end: source.rows.start }
        return Option.some({
          source,
          target: { rows: target, columns: source.columns },
          toward: below > 0 ? 'down' : 'up',
        })
      }
      const columnsOf = (start: number, end: number) => projection.columns.slice(start, end)
      return Option.some({
        source,
        target: {
          rows: source.rows,
          columns: right > 0 ? columnsOf(last + 1, to.column + 1) : columnsOf(to.column, first),
        },
        toward: right > 0 ? 'right' : 'left',
      })
    }),
  )

/**
 * The cells a fill writes: each lane of the source (a column for a fill down
 * or up, a row for one right or left) carried on through the target by
 * `series`. Cells on a column that does not edit, or on a row not loaded, are
 * dropped; each kept cell has `from`, the text it showed.
 */
const cells = <Row, Id extends string>(
  projection: GridProjection<Row, Id>,
  fill: FillPlan<Id>,
  options: {
    readonly editable: (column: Id) => boolean
    readonly from: (address: CellAddress<Id>) => string
  },
): ReadonlyArray<PastedCell<Id>> => {
  const rowsOf = (box: { readonly start: number; readonly end: number }) =>
    Array.from({ length: box.end - box.start }, (_, offset) => box.start + offset)
  const keyAt = (index: number) => projection.rows.keyAt(index)
  const textAt = (index: number, column: Id) =>
    Option.match(keyAt(index), { onNone: () => '', onSome: row => options.from({ row, column }) })
  const cell = (index: number, column: Id, text: string): ReadonlyArray<PastedCell<Id>> =>
    options.editable(column)
      ? Option.match(keyAt(index), {
          onNone: () => [],
          onSome: row => [{ row, column, text, from: options.from({ row, column }) }],
        })
      : []
  const backward = fill.toward === 'up' || fill.toward === 'left'
  // Away from the source, so the series' first text lands next to it.
  const away = <A>(items: ReadonlyArray<A>) => (backward ? [...items].reverse() : items)
  if (fill.toward === 'down' || fill.toward === 'up') {
    const targetRows = away(rowsOf(fill.target.rows))
    return fill.source.columns.flatMap(column => {
      const texts = series(
        rowsOf(fill.source.rows).map(index => textAt(index, column)),
        targetRows.length,
        backward,
      )
      return targetRows.flatMap((index, at) => cell(index, column, texts[at]!))
    })
  }
  const targetColumns = away(fill.target.columns)
  return rowsOf(fill.source.rows).flatMap(index => {
    const texts = series(
      fill.source.columns.map(column => textAt(index, column)),
      targetColumns.length,
      backward,
    )
    return targetColumns.flatMap((column, at) => cell(index, column, texts[at]!))
  })
}

export const Fill = { series, plan, cells }
