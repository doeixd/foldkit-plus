/**
 * The data grid at the size it is built for: 100,000 rows and 40 columns.
 * What runs on every scroll frame (the window) and every key (a move) must
 * not walk the rows; what runs once per data change (indexing the rows) may.
 */
import { describe, test } from 'vitest'
import { ColumnLayout, Columns, GridProjection, RowModel, VirtualGrid } from '../src/index.js'

const benchmark = (name: string, run: () => unknown) =>
  test(name, async ({ bench }) => {
    await bench(name, run).run()
  })

interface Row {
  readonly id: string
  readonly values: ReadonlyArray<number>
}

const ROWS = 100_000
const COLUMNS = 40

const rows: ReadonlyArray<Row> = Array.from({ length: ROWS }, (_, index) => ({
  id: `row:${index}`,
  values: Array.from({ length: COLUMNS }, (_, column) => index * column),
}))
const rowKey = (row: Row) => row.id

const specs: Record<string, { header: string; value: (row: Row) => number; pinned?: 'start' }> = {}
for (let column = 0; column < COLUMNS; column++) {
  specs[`c${column}`] = {
    header: `Column ${column}`,
    value: row => row.values[column]!,
    ...(column === 0 ? { pinned: 'start' as const } : {}),
  }
}
const columns = Columns.define<Row>()(specs)
const layout = ColumnLayout.initial(columns)
const rowModel = RowModel.fromArray(rows, rowKey)
const projection = GridProjection.make({ rows: rowModel, columns, layout })
const width = (column: string) => 80 + (column.length % 3) * 40

// Read once: an export getter per call is module-runner overhead, not the grid's cost.
const { window: windowOf, reveal } = VirtualGrid
const { fromArray } = RowModel
const { make } = GridProjection

const middle = { row: `row:${ROWS / 2}`, column: 'c20' }
let top = 0

describe('data grid at 100k rows, 40 columns', () => {
  benchmark('window for a viewport', () =>
    windowOf({
      projection,
      rowHeight: 32,
      width,
      viewport: { top: 1_600_000, left: 1_200, width: 1_280, height: 800 },
      overscan: { rows: 4, columns: 2 },
    }),
  )

  benchmark('1,000 scroll frames', () => {
    for (let frame = 0; frame < 1_000; frame++) {
      top = (top + 97) % (ROWS * 32)
      windowOf({
        projection,
        rowHeight: 32,
        width,
        viewport: { top, left: 0, width: 1_280, height: 800 },
      })
    }
  })

  benchmark('projection from a layout', () => make({ rows: rowModel, columns, layout }))

  benchmark('a move from the middle row', () => projection.moveBy(middle, { rows: 1, columns: 1 }))

  benchmark('position of a cell', () => projection.positionOf(middle))

  benchmark('reveal a cell far below', () =>
    reveal({
      projection,
      rowHeight: 32,
      width,
      viewport: { top: 0, left: 0, width: 1_280, height: 800 },
      position: { row: ROWS - 1, column: 30 },
    }),
  )

  // Once per change of the rows array; a view that keeps its array pays it once.
  benchmark('index 100k rows by key', () => fromArray([...rows], rowKey))
})
