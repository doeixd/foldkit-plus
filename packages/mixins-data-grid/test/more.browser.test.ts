/**
 * More rows asked for in a real browser, where the observer is real: the More
 * button below 600px of rows asks for nothing until the grid is scrolled to
 * within 200px of it, though the page itself shows it all along.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { modifyFields } from 'foldkit/struct'
import { Bundle } from 'foldkit-bundle'
import { Columns, DataGrid, RowCount, RowModel } from 'foldkit-data-grid'
import { Style } from 'foldkit-mixins'
import { DataGridView, GridSlots } from 'foldkit-mixins-data-grid'
import { afterEach, expect, test, vi } from 'vitest'

interface Line {
  readonly id: string
}
const loaded = RowModel.fromArray<Line>(
  Array.from({ length: 30 }, (_, index) => ({ id: `r${index}` })),
  line => line.id,
)
const rows: RowModel<Line> = { ...loaded, count: RowCount.Unknown({ atLeast: 30 }) }
const columns = Columns.define<Line>()({ id: { header: 'Id', value: line => line.id } })
const Grid = DataGrid.make({ id: 'lines', columns })
const Placement = Bundle.declare(Grid.bundle, 'grid')
const Model = Schema.Struct({ ...Placement.fields, asked: Schema.Number })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Placement.cases, AskedForMore: {} })
type Message = typeof Message.Type
const Sized = DataGridView<Message>()
  .define(Grid)
  .pipe(
    Style.attach(
      Style.forSlots(GridSlots)({ root: Style.inline({ height: '100px', width: '200px' }) }),
    ),
  )

afterEach(() => {
  document.body.replaceChildren()
})

test('the grid scrolled near its end asks for more; the page showing it does not', async () => {
  const application = Bundle.assemble<Model, Message>()([
    Bundle.parent({ Model, Message }).at(Placement, { onOut: Bundle.ignore }),
  ])
  const update = application.update()
  let latest: Model = { grid: Grid.bundle.init(undefined).model, asked: 0 }
  const container = document.createElement('div')
  container.id = 'grid-more-browser'
  document.body.appendChild(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => application.initial(latest),
      update: (model: Model, message: Message) => {
        const next = Message.match(message, {
          AskedForMore: () => ({ model: modifyFields(model, { asked: () => model.asked + 1 }) }),
          GotGridMessage: () => update(model, message),
        })
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
            overscan: { rows: 40 },
            onMore: Message.AskedForMore(),
            moreOnScroll: true,
          },
          h,
        ),
    }),
  )
  const grid = () => document.getElementById('lines')!
  try {
    await vi.waitFor(() => expect(grid().querySelector('button')).not.toBeNull())
    await new Promise(resolve => setTimeout(resolve, 200))
    expect(latest.asked).toBe(0)
    grid().scrollTop = grid().scrollHeight
    await vi.waitFor(() => expect(latest.asked).toBe(1))
  } finally {
    handle.dispose()
  }
})
