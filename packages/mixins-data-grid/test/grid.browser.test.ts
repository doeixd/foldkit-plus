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
import { Columns, DataGrid, GridFocus, RowModel } from 'foldkit-data-grid'
import { Style } from 'foldkit-mixins'
import { DataGridView, GridSlots } from 'foldkit-mixins-data-grid'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'

interface Line {
  readonly id: string
}
const lines: ReadonlyArray<Line> = Array.from({ length: 200 }, (_, index) => ({ id: `r${index}` }))
const columns = Columns.define<Line>()({
  id: { header: 'Id', value: line => line.id, pinned: 'start', width: 80 },
  c0: { header: 'C0', value: () => 'zero', width: 100 },
  c1: { header: 'C1', value: () => 'one', width: 100 },
  c2: { header: 'C2', value: () => 'two', width: 100 },
  c3: { header: 'C3', value: () => 'three', width: 100 },
  c4: { header: 'C4', value: () => 'four', width: 100 },
  total: { header: 'Total', value: () => 9, pinned: 'end', width: 60 },
})
type Id = keyof typeof columns.byId
const rows = RowModel.fromArray(lines, line => line.id)

const Grid = DataGrid.make({ id: 'lines', columns })
const Placement = Bundle.declare(Grid.bundle, 'grid')
const Model = Schema.Struct({ ...Placement.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Placement.cases })
type Message = typeof Message.Type
const application = Bundle.assemble<Model, Message>()([
  Bundle.parent({ Model, Message }).at(Placement, { onOut: Bundle.ignore }),
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
          rows,
          wrap: message => Placement.wrapper.make(message),
          label: 'Lines',
          rowHeight: 20,
          headerHeight: 20,
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

    // Dragging C0's handle widens it from where the drag began.
    const c0 = Array.from(grid().querySelectorAll('[role="separator"]')).find(
      separator => separator.getAttribute('aria-label') === 'Resize C0',
    )!
    const edge = c0.getBoundingClientRect()
    const pointer = (type: string, x: number) =>
      c0.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerId: 7,
          button: 0,
          clientX: x,
          clientY: edge.top + 2,
        }),
      )
    pointer('pointerdown', edge.left + 2)
    pointer('pointermove', edge.left + 22)
    pointer('pointermove', edge.left + 42)
    pointer('pointerup', edge.left + 42)
    await vi.waitFor(() => expect(c0.getAttribute('aria-valuenow')).toBe('140'))
    expect(cell('r10', 'c0').getBoundingClientRect().width).toBeCloseTo(140, 0)
  } finally {
    handle.dispose()
  }
})

test('grid.window is the window drawn: its rows are the rows in the page, as it scrolls', async () => {
  const container = document.createElement('div')
  container.id = 'grid-window-browser'
  document.body.append(container)
  const update = application.update()
  let latest: Model = { grid: Grid.bundle.init(undefined).model }
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => application.initial(latest),
      update: (model: Model, message: Message) => {
        const next = update(model, message)
        latest = next.model
        return next
      },
      view,
    }),
  )
  // The body rows drawn, by their aria-rowindex: the header row is 1.
  const drawn = () =>
    Array.from(document.querySelectorAll('#lines [role="row"]'), row =>
      Number(row.getAttribute('aria-rowindex')),
    ).filter(index => index > 1)
  const windowed = () => {
    const { rows: shown } = Grid.window({
      state: latest.grid,
      rows,
      rowHeight: 20,
      headerHeight: 20,
    })
    return Array.from({ length: shown.end - shown.start }, (_, offset) => shown.start + offset + 2)
  }
  try {
    await vi.waitFor(() => expect(latest.grid.viewport.height).toBe(160))
    await vi.waitFor(() => expect(drawn()).toEqual(windowed()))
    expect(drawn()).toHaveLength(7)

    document.getElementById('lines')!.scrollTop = 1010
    await vi.waitFor(() => expect(latest.grid.viewport.top).toBe(1010))
    await vi.waitFor(() => expect(drawn()).toEqual(windowed()))
    expect(drawn()[0]).toBe(52)
  } finally {
    handle.dispose()
  }
})
