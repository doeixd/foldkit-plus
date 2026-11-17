/// <reference types="@vitest/browser-playwright" />
/**
 * An application asks the grid to bring a row into view, as a "go to row"
 * control would: the grid's `reveal` helper, folded into the application's
 * own Message, scrolls the real container to the row.
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
  id: { header: 'Id', value: line => line.id, width: 80 },
  c0: { header: 'C0', value: () => 'zero', width: 100 },
  c1: { header: 'C1', value: () => 'one', width: 100 },
  c2: { header: 'C2', value: () => 'two', width: 100 },
  c3: { header: 'C3', value: () => 'three', width: 100 },
})
const rows = RowModel.fromArray(lines, line => line.id)

const Grid = DataGrid.make({ id: 'lines', columns })
const Placement = Bundle.declare(Grid.bundle, 'grid')
const Model = Schema.Struct({ ...Placement.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({
  ...Placement.cases,
  /** The "go to row" control. */
  WentToRow: { row: Schema.Number, column: Schema.optional(Schema.Literals(['c3'])) },
})
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const Placed = Page.at(Placement, { onOut: Bundle.ignore })
const application = Page.assemble(Placed)
const update = application.update((model, message) =>
  Placed.helpers.reveal(rows, {
    row: message.row,
    ...(message.column === undefined ? {} : { column: message.column }),
    rowHeight: 20,
    headerHeight: 20,
  })(model),
)

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
      h.button([h.Id('go'), h.OnClick(Message.WentToRow({ row: 150 }))], ['Go']),
      h.button([h.Id('goFar'), h.OnClick(Message.WentToRow({ row: 150, column: 'c3' }))], ['Far']),
    ],
  )

afterEach(() => {
  document.body.innerHTML = ''
})

test('a row asked for from outside is scrolled into view', async () => {
  const container = document.createElement('div')
  container.id = 'grid-reveal'
  document.body.append(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => application.initial({ grid: Grid.bundle.init(undefined).model }),
      update,
      view,
    }),
  )
  const grid = () => document.getElementById('lines')!
  const cellId = (row: string, column: 'id' | 'c3') => GridFocus.cellId('lines', { row, column })
  try {
    await vi.waitFor(() => expect(document.getElementById(cellId('r2', 'id'))).not.toBeNull())
    // Seven 20px rows show under the header: row 150 ends at 3020, so the top is 2880.
    await userEvent.click(document.getElementById('go')!)
    await vi.waitFor(() => expect(grid().scrollTop).toBe(2880))
    await vi.waitFor(() => expect(document.getElementById(cellId('r150', 'id'))).not.toBeNull())
    expect(grid().scrollLeft).toBe(0)

    // A named column scrolls sideways to it as well.
    await userEvent.click(document.getElementById('goFar')!)
    await vi.waitFor(() => expect(grid().scrollLeft).toBeGreaterThan(0))
    await vi.waitFor(() => expect(document.getElementById(cellId('r150', 'c3'))).not.toBeNull())
  } finally {
    handle.dispose()
  }
})
