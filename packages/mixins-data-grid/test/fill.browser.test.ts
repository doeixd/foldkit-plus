/**
 * A fill dragged past the grid's edge, in a real browser: the grid scrolls
 * toward the pointer, the drag outlives its handle's cell scrolling out of
 * the window, and the fill reaches the rows scrolled to.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { modifyFields } from 'foldkit/struct'
import { Bundle } from 'foldkit-bundle'
import { Columns, DataGrid, GridFocus, RowModel } from 'foldkit-data-grid'
import { Style } from 'foldkit-mixins'
import { DataGridView, GridSlots } from 'foldkit-mixins-data-grid'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'

interface Line {
  readonly id: string
  readonly name: string
}
const rows = RowModel.fromArray<Line>(
  Array.from({ length: 200 }, (_, index) => ({ id: `r${index}`, name: `Line ${index}` })),
  line => line.id,
)
const columns = Columns.define<Line>()({
  name: { header: 'Name', value: line => line.name, width: 120, edit: {} },
})
const Grid = DataGrid.make({ id: 'lines', columns })
const Placement = Bundle.declare(Grid.bundle, 'grid')
const Model = Schema.Struct({ ...Placement.fields, filled: Schema.Array(Schema.String) })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Placement.cases })
type Message = typeof Message.Type
const application = Bundle.assemble<Model, Message>()([
  Bundle.parent({ Model, Message }).at(Placement, {
    onOut: out => model =>
      Grid.Out.match(out, {
        Filled: request => ({
          model: modifyFields(model, {
            filled: () => Grid.fill(rows, model.grid, request).accepted.map(cell => cell.row),
          }),
        }),
        Edited: () => ({ model }),
        Pasted: () => ({ model }),
        UndoRequested: () => ({ model }),
        RedoRequested: () => ({ model }),
      }),
  }),
])
// A 20px header over seven 20px rows.
const Sized = DataGridView<Message>()
  .define(Grid)
  .pipe(
    Style.attach(
      Style.forSlots(GridSlots)({ root: Style.inline({ height: '160px', width: '200px' }) }),
    ),
  )

afterEach(() => {
  document.body.innerHTML = ''
})

test('a fill dragged below the grid scrolls it, and fills the rows it reaches', async () => {
  const container = document.createElement('div')
  container.id = 'grid-fill-browser'
  document.body.append(container)
  const update = application.update()
  let latest: Model = { grid: Grid.bundle.init(undefined).model, filled: [] }
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
      view: (model: Model, h: HtmlBuilder<Message>) =>
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
    }),
  )
  const cell = (row: string) =>
    document.getElementById(GridFocus.cellId('lines', { row, column: 'name' }))
  const grid = () => document.getElementById('lines')!
  const pointer = (target: Element, type: string, x: number, y: number) =>
    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        button: 0,
        clientX: x,
        clientY: y,
      }),
    )
  try {
    await vi.waitFor(() => expect(cell('r1')).not.toBeNull())
    await userEvent.click(cell('r1')!)
    const fillHandle = () => cell('r1')?.querySelector('[data-fill-handle]') ?? null
    await vi.waitFor(() => expect(fillHandle()).not.toBeNull())
    const start = fillHandle()!.getBoundingClientRect()
    pointer(fillHandle()!, 'pointerdown', start.left + 3, start.top + 3)
    // Held 10px below the grid's bottom: past its edge, so it scrolls.
    const box = grid().getBoundingClientRect()
    pointer(document.body, 'pointermove', box.left + 60, box.bottom + 10)
    await vi.waitFor(() => expect(latest.grid.viewport.top).toBeGreaterThan(400), {
      timeout: 5000,
    })
    // r1, and its handle, have long scrolled out of the window, and the cells
    // the fill would write follow the scroll.
    expect(cell('r1')).toBeNull()
    await vi.waitFor(() =>
      expect(document.querySelectorAll('#lines [data-fill="target"]').length).toBeGreaterThan(3),
    )
    expect(latest.grid.filling._tag).toBe('Some')
    pointer(document.body, 'pointerup', box.left + 60, box.bottom + 10)
    await vi.waitFor(() => expect(latest.filled.length).toBeGreaterThan(20))
    expect(latest.filled[0]).toBe('r2')
    expect(latest.grid.filling._tag).toBe('None')
  } finally {
    handle.dispose()
  }
})
