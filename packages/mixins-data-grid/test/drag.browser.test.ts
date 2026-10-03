/**
 * A header drag in a real browser, where layout and pointer capture are
 * real: the dragged header is drawn where the pointer has taken it, over its
 * neighbours, and once let go the column and its cells stand in the new place.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { Bundle } from 'foldkit-bundle'
import { Columns, DataGrid, GridFocus, RowModel } from 'foldkit-data-grid'
import { Style } from 'foldkit-mixins'
import { DataGridView, GridSlots, GridStyle } from 'foldkit-mixins-data-grid'
import { afterEach, expect, test, vi } from 'vitest'

interface Line {
  readonly id: string
}
const rows = RowModel.fromArray<Line>(
  Array.from({ length: 5 }, (_, index) => ({ id: `r${index}` })),
  line => line.id,
)
const columns = Columns.define<Line>()({
  a: { header: 'A', value: () => 'a', width: 100 },
  b: { header: 'B', value: () => 'b', width: 100 },
  c: { header: 'C', value: () => 'c', width: 100 },
})
type Id = keyof typeof columns.byId

const Grid = DataGrid.make({ id: 'lines', columns })
const Placement = Bundle.declare(Grid.bundle, 'grid')
const Model = Schema.Struct({ ...Placement.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Placement.cases })
type Message = typeof Message.Type
const application = Bundle.assemble<Model, Message>()([
  Bundle.parent({ Model, Message }).at(Placement, { onOut: Bundle.ignore }),
])
const Sized = DataGridView<Message>()
  .define(Grid)
  .pipe(
    Style.attach(GridStyle),
    Style.attach(
      Style.forSlots(GridSlots)({ root: Style.inline({ height: '160px', width: '400px' }) }),
    ),
  )
const view = (model: Model, h: HtmlBuilder<Message>) =>
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
  )

afterEach(() => {
  document.body.replaceChildren()
})

test('a dragged header is drawn under the pointer, and its column lands where it is let go', async () => {
  const container = document.createElement('div')
  container.id = 'grid-drag-browser'
  document.body.appendChild(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => application.initial({ grid: Grid.bundle.init(undefined).model }),
      update: application.update(),
      view,
    }),
  )
  const header = (column: Id) => document.getElementById(GridFocus.headerId('lines', column))!
  const cell = (column: Id) =>
    document.getElementById(GridFocus.cellId('lines', { row: 'r0', column }))!
  const pointer = (target: Element, type: string, x: number, y: number) =>
    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        pointerId: 1,
        button: 0,
        clientX: x,
        clientY: y,
      }),
    )
  try {
    await vi.waitFor(() =>
      expect(
        document.getElementById(GridFocus.cellId('lines', { row: 'r0', column: 'c' })),
      ).not.toBeNull(),
    )
    const from = header('a').getBoundingClientRect()
    const y = from.top + from.height / 2
    pointer(header('a'), 'pointerdown', from.left + 10, y)
    pointer(header('a'), 'pointermove', from.left + 170, y)
    // Drawn 160px on, over B, which stays where it was.
    await vi.waitFor(() =>
      expect(header('a').getBoundingClientRect().left).toBeCloseTo(from.left + 160, 0),
    )
    expect(header('b').getBoundingClientRect().left).toBeCloseTo(from.left + 100, 0)
    expect(Number(getComputedStyle(header('a')).zIndex)).toBeGreaterThan(
      Number(getComputedStyle(header('b')).zIndex) || 0,
    )
    pointer(header('a'), 'pointerup', from.left + 170, y)
    // B now comes first, A second, and the cells follow their headers.
    await vi.waitFor(() =>
      expect(header('b').getBoundingClientRect().left).toBeCloseTo(from.left, 0),
    )
    expect(header('a').getBoundingClientRect().left).toBeCloseTo(from.left + 100, 0)
    expect(cell('a').getBoundingClientRect().left).toBeCloseTo(from.left + 100, 0)
    expect(header('a').style.transform).toBe('')
  } finally {
    handle.dispose()
  }
})
