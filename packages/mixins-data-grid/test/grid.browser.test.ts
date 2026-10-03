/**
 * The grid in a real browser, where focus moves and layout is real: pressing a
 * cell focuses the grid itself, keys move the active descendant, Tab leaves
 * the grid in one step, pinned columns stay at their edges while the center
 * scrolls under them, and a key that moves off screen scrolls the cell in.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { Bundle } from 'foldkit-bundle'
import {
  ColumnLayout,
  Columns,
  DataGrid,
  GridFocus,
  GridProjection,
  RowModel,
} from 'foldkit-data-grid'
import { Style } from 'foldkit-mixins'
import { DataGridView, GridSlots } from 'foldkit-mixins-data-grid'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'

interface Line {
  readonly id: string
}
const lines: ReadonlyArray<Line> = Array.from({ length: 200 }, (_, index) => ({ id: `r${index}` }))
const columns = Columns.define<Line>()({
  id: { header: 'Id', value: line => line.id, pinned: 'start' },
  c0: { header: 'C0', value: () => 'zero' },
  c1: { header: 'C1', value: () => 'one' },
  c2: { header: 'C2', value: () => 'two' },
  c3: { header: 'C3', value: () => 'three' },
  c4: { header: 'C4', value: () => 'four' },
  total: { header: 'Total', value: () => 9, pinned: 'end' },
})
type Id = keyof typeof columns.byId
const widths: Partial<Record<Id, number>> = { id: 80, total: 60 }
const projection = GridProjection.make({
  rows: RowModel.fromArray(lines, line => line.id),
  columns,
  layout: ColumnLayout.initial(columns),
})

const Grid = DataGrid.make({ id: 'lines', columns })
const Placement = Bundle.declare(Grid.bundle, 'grid')
const Model = Schema.Struct({ ...Placement.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Placement.cases })
type Message = typeof Message.Type
const application = Bundle.assemble<Model, Message>()([
  Bundle.parent({ Model, Message }).at(Placement),
])

// 300 by 160: a 20px header over seven 20px rows, and 160px of center between the pins.
const Sized = DataGridView<Message>()
  .define(Grid)
  .pipe(
    Style.attach(
      Style.forSlots(GridSlots)({ root: Style.inline({ height: '160px', width: '300px' }) }),
    ),
  )
const view = (model: Model, h: HtmlBuilder<Message>) =>
  h.div(
    [],
    [
      Sized(
        {
          state: model.grid,
          projection,
          wrap: message => Placement.wrapper.make(message),
          label: 'Lines',
          rowHeight: 20,
          headerHeight: 20,
          width: (column: Id) => widths[column] ?? 100,
        },
        h,
      ),
      h.button([h.Id('after')], ['After']),
    ],
  )

afterEach(() => {
  document.body.innerHTML = ''
})

const cellId = (row: string, column: Id) => GridFocus.cellId('lines', { row, column })

test('focus stays on the grid, pins stay at their edges, and a move scrolls its cell in', async () => {
  const container = document.createElement('div')
  container.id = 'grid-browser'
  document.body.append(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => application.initial({ grid: Grid.bundle.init(undefined).model }),
      update: application.update(),
      view,
    }),
  )
  const grid = () => document.getElementById('lines')!
  const cell = (row: string, column: Id) => document.getElementById(cellId(row, column))!
  try {
    await vi.waitFor(() => expect(document.getElementById(cellId('r2', 'c0'))).not.toBeNull())

    // Pressing a cell focuses the grid, which points at the cell.
    await userEvent.click(cell('r2', 'c0'))
    expect(document.activeElement).toBe(grid())
    await vi.waitFor(() =>
      expect(grid().getAttribute('aria-activedescendant')).toBe(cellId('r2', 'c0')),
    )

    await userEvent.keyboard('{ArrowDown}')
    await vi.waitFor(() =>
      expect(grid().getAttribute('aria-activedescendant')).toBe(cellId('r3', 'c0')),
    )

    // The grid is one tab stop: the next one is past every cell.
    await userEvent.tab()
    expect(document.activeElement).toBe(document.getElementById('after'))
    await userEvent.tab({ shift: true })
    expect(document.activeElement).toBe(grid())

    // Scrolled sideways, the pinned cells keep their edges and the center slides under them.
    const box = grid().getBoundingClientRect()
    grid().scrollLeft = 150
    await vi.waitFor(() => expect(document.getElementById(cellId('r3', 'c3'))).not.toBeNull())
    expect(cell('r3', 'id').getBoundingClientRect().left).toBeCloseTo(
      box.left + grid().clientLeft,
      0,
    )
    const viewRight = box.left + grid().clientLeft + grid().clientWidth
    expect(cell('r3', 'total').getBoundingClientRect().right).toBeCloseTo(viewRight, 0)

    // Seven rows a page: r10 is below the window, so the grid scrolls to show it.
    await userEvent.keyboard('{PageDown}')
    await vi.waitFor(() =>
      expect(grid().getAttribute('aria-activedescendant')).toBe(cellId('r10', 'c0')),
    )
    expect(grid().scrollTop).toBeGreaterThan(0)
    const shown = cell('r10', 'c0').getBoundingClientRect()
    const body = grid().getBoundingClientRect()
    expect(shown.top).toBeGreaterThanOrEqual(body.top + 20 - 0.5)
    expect(shown.bottom).toBeLessThanOrEqual(
      body.top + grid().clientTop + grid().clientHeight + 0.5,
    )
  } finally {
    handle.dispose()
  }
})
