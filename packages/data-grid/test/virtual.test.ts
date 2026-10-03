import { Option } from 'effect'
import {
  type CellPosition,
  ColumnLayout,
  Columns,
  GridProjection,
  RowCount,
  RowModel,
  type Viewport,
  VirtualGrid,
} from 'foldkit-data-grid'
import { describe, expect, test } from 'vitest'

interface Line {
  readonly id: string
}

const lines: ReadonlyArray<Line> = Array.from({ length: 1000 }, (_, index) => ({ id: `r${index}` }))
const lineKey = (line: Line) => line.id

// Center widths 100, 50, 200, 80: edges at 0, 100, 150, 350, 430.
const columns = Columns.define<Line>()({
  id: { header: 'Id', value: line => line.id, pinned: 'start' },
  a: { header: 'A', value: () => 'a' },
  b: { header: 'B', value: () => 'b' },
  c: { header: 'C', value: () => 'c' },
  d: { header: 'D', value: () => 'd' },
  total: { header: 'Total', value: () => 0, pinned: 'end' },
  hidden: { header: 'Hidden', value: () => '', hidden: true },
})
type Id = keyof typeof columns.byId
const widths: Readonly<Record<Id, number>> = {
  id: 60,
  a: 100,
  b: 50,
  c: 200,
  d: 80,
  total: 40,
  hidden: 999,
}
const width = (column: Id) => widths[column]

const projection = GridProjection.make({
  rows: RowModel.fromArray(lines, lineKey),
  columns,
  layout: ColumnLayout.initial(columns),
})

// 60 pinned at the start and 40 at the end leave 200 for the center.
const viewport = (overrides: Partial<Viewport> = {}): Viewport => ({
  top: 0,
  left: 0,
  width: 300,
  height: 100,
  ...overrides,
})

const windowAt = (
  view: Viewport,
  overscan: { readonly rows?: number; readonly columns?: number } = {},
  headerHeight = 0,
) =>
  VirtualGrid.window({ projection, rowHeight: 25, width, viewport: view, overscan, headerHeight })

describe('VirtualGrid.window rows', () => {
  test.each<{
    readonly name: string
    readonly view: Viewport
    readonly overscan?: { readonly rows?: number }
    readonly headerHeight?: number
    readonly rows: { readonly start: number; readonly end: number }
  }>([
    { name: 'shows the rows a viewport holds', view: viewport(), rows: { start: 0, end: 4 } },
    {
      name: 'shows a partly visible row at each edge',
      view: viewport({ top: 10 }),
      rows: { start: 0, end: 5 },
    },
    {
      name: 'starts at the scrolled row',
      view: viewport({ top: 250 }),
      rows: { start: 10, end: 14 },
    },
    {
      name: 'adds overscan on both sides',
      view: viewport({ top: 250 }),
      overscan: { rows: 2 },
      rows: { start: 8, end: 16 },
    },
    {
      name: 'overscan stops at the first row',
      view: viewport({ top: 25 }),
      overscan: { rows: 3 },
      rows: { start: 0, end: 8 },
    },
    {
      name: 'overscan stops at the last row',
      view: viewport({ top: 24_900 }),
      overscan: { rows: 3 },
      rows: { start: 993, end: 1000 },
    },
    {
      name: 'leaves the header out of the body',
      view: viewport({ height: 130 }),
      headerHeight: 30,
      rows: { start: 0, end: 4 },
    },
    {
      name: 'reads a negative overscroll as the top',
      view: viewport({ top: -40 }),
      rows: { start: 0, end: 4 },
    },
  ])('$name', ({ view, overscan, headerHeight, rows }) => {
    const shown = windowAt(view, overscan, headerHeight)
    expect({ start: shown.rows.start, end: shown.rows.end }).toEqual(rows)
    expect(shown.rows.before).toBe(rows.start * 25)
    expect(shown.rows.after).toBe((1000 - rows.end) * 25)
  })
})

describe('VirtualGrid.window columns', () => {
  test.each<{
    readonly name: string
    readonly left: number
    readonly overscan?: number
    readonly center: ReadonlyArray<Id>
    readonly before: number
    readonly after: number
  }>([
    {
      name: 'shows the columns that begin before the right edge',
      left: 0,
      center: ['a', 'b', 'c'],
      before: 0,
      after: 80,
    },
    {
      name: 'drops a column scrolled past the left edge',
      left: 120,
      center: ['b', 'c'],
      before: 100,
      after: 80,
    },
    {
      name: 'drops a column that ends exactly at the left edge',
      left: 100,
      center: ['b', 'c'],
      before: 100,
      after: 80,
    },
    {
      name: 'drops a column that begins exactly at the right edge',
      left: 150,
      center: ['c'],
      before: 150,
      after: 80,
    },
    {
      name: 'shows the last columns at the far end',
      left: 230,
      center: ['c', 'd'],
      before: 150,
      after: 0,
    },
    {
      name: 'adds column overscan on both sides',
      left: 120,
      overscan: 1,
      center: ['a', 'b', 'c', 'd'],
      before: 0,
      after: 0,
    },
    {
      name: 'column overscan stops at the last column',
      left: 230,
      overscan: 2,
      center: ['a', 'b', 'c', 'd'],
      before: 0,
      after: 0,
    },
  ])('$name', ({ left, overscan, center, before, after }) => {
    const shown = windowAt(viewport({ left }), { columns: overscan ?? 0 })
    expect(shown.centerColumns).toEqual(center)
    expect(shown.center.before).toBe(before)
    expect(shown.center.after).toBe(after)
  })

  test('always renders the pinned columns, and never a hidden one', () => {
    const shown = windowAt(viewport({ left: 230 }))
    expect(shown.start).toEqual(['id'])
    expect(shown.end).toEqual(['total'])
    expect([...shown.start, ...shown.centerColumns, ...shown.end]).not.toContain('hidden')
  })

  test('sizes the content from every visible column and every row', () => {
    const shown = windowAt(viewport(), {}, 30)
    expect(shown.width).toBe(60 + 430 + 40)
    expect(shown.height).toBe(30 + 1000 * 25)
  })

  test('a grid with no center columns renders none', () => {
    const pinnedOnly = GridProjection.make({
      rows: RowModel.fromArray(lines, lineKey),
      columns,
      layout: { start: ['id'], center: [], end: ['total'], hidden: ['a', 'b', 'c', 'd', 'hidden'] },
    })
    const shown = VirtualGrid.window({
      projection: pinnedOnly,
      rowHeight: 25,
      width,
      viewport: viewport(),
    })
    expect(shown.centerColumns).toEqual([])
    expect(shown.center).toEqual({ start: 0, end: 0, before: 0, after: 0 })
  })

  test('an unknown count sizes the rows seen so far', () => {
    const open: RowModel<Line> = {
      ...RowModel.fromArray(lines, lineKey),
      count: RowCount.Unknown({ atLeast: 40 }),
    }
    const grid = GridProjection.make({ rows: open, columns, layout: ColumnLayout.initial(columns) })
    const shown = VirtualGrid.window({
      projection: grid,
      rowHeight: 25,
      width,
      viewport: viewport({ top: 2000 }),
    })
    expect(shown.height).toBe(40 * 25)
    expect(shown.rows).toEqual({ start: 40, end: 40, before: 1000, after: 0 })
  })

  test.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'refuses a row height of %s',
    rowHeight => {
      expect(() =>
        VirtualGrid.window({ projection, rowHeight, width, viewport: viewport() }),
      ).toThrow(/rowHeight must be a positive number/)
    },
  )
})

// Display order: id (pinned) | a b c d | total (pinned); indexes 0 | 1..4 | 5.
describe('VirtualGrid.reveal', () => {
  test.each<{
    readonly name: string
    readonly view: Viewport
    readonly position: CellPosition
    readonly to: Option.Option<{ readonly top: number; readonly left: number }>
  }>([
    {
      name: 'leaves a cell in view where it is',
      view: viewport({ top: 250 }),
      position: { row: 11, column: 2 },
      to: Option.none(),
    },
    {
      name: 'scrolls up to a row above the view',
      view: viewport({ top: 250 }),
      position: { row: 5, column: 2 },
      to: Option.some({ top: 125, left: 0 }),
    },
    {
      name: 'scrolls down just far enough to show a row below',
      view: viewport(),
      position: { row: 10, column: 2 },
      to: Option.some({ top: 175, left: 0 }),
    },
    {
      name: 'scrolls left to a column before the view',
      view: viewport({ left: 120 }),
      position: { row: 0, column: 1 },
      to: Option.some({ top: 0, left: 0 }),
    },
    {
      name: 'scrolls right just far enough to show a column',
      view: viewport(),
      position: { row: 0, column: 3 },
      to: Option.some({ top: 0, left: 150 }),
    },
    {
      name: 'scrolls a pinned start column only vertically',
      view: viewport({ left: 120 }),
      position: { row: 20, column: 0 },
      to: Option.some({ top: 425, left: 120 }),
    },
    {
      name: 'scrolls a pinned end column only vertically',
      view: viewport({ left: 120 }),
      position: { row: 0, column: 5 },
      to: Option.none(),
    },
  ])('$name', ({ view, position, to }) => {
    expect(
      VirtualGrid.reveal({ projection, rowHeight: 25, width, viewport: view, position }),
    ).toEqual(to)
  })

  test('scrolls a row below the header into view', () => {
    const revealed = VirtualGrid.reveal({
      projection,
      rowHeight: 25,
      width,
      headerHeight: 30,
      viewport: viewport({ height: 130 }),
      position: { row: 4, column: 1 },
    })
    expect(revealed).toEqual(Option.some({ top: 25, left: 0 }))
  })
})
