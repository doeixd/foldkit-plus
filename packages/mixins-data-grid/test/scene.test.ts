/**
 * A page holding the grid, in Scene: the grid starts three Mounts, each
 * answering when it starts, and `resolveMounts` resolves them with what the
 * runtime sends; a resize handle holds no Mount of its own. The conformance
 * suite (`packages/plus/test/conformance.test.ts`) holds Scene's drawing to
 * the runtime's.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Scene } from 'foldkit/test'
import { Bundle } from 'foldkit-bundle'
import { Columns, DataGrid, GridFocus, GridViewport, RowModel } from 'foldkit-data-grid'
import { DataGridView } from 'foldkit-mixins-data-grid'
import { expect, test } from 'vitest'

interface Item {
  readonly id: string
  readonly name: string
}
const rows = RowModel.fromArray<Item>(
  [
    { id: 'a', name: 'Anchor' },
    { id: 'b', name: 'Bolt' },
  ],
  item => item.id,
)
const columns = Columns.define<Item>()({
  id: { header: 'Id', value: item => item.id, width: 100 },
  name: { header: 'Name', value: item => item.name, width: 100 },
})
const Grid = DataGrid.make({ id: 'items', columns })
const Placement = Bundle.declare(Grid.bundle, 'grid')
const Model = Schema.Struct({ ...Placement.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Placement.cases })
type Message = typeof Message.Type
const application = Bundle.assemble<Model, Message>()([
  Bundle.parent({ Model, Message }).at(Placement, { onOut: Bundle.ignore }),
])
const update = application.update()
const wrap = (message: typeof Grid.Message.Type) => Placement.wrapper.make(message)
const View = DataGridView<Message>().define(Grid)

test('a page with a grid draws in Scene, its Mounts resolved as the runtime answers them', () => {
  const seen: Array<string> = []
  Scene.scene(
    {
      update: (model: Model, message: Message) => {
        Message.match(message, { GotGridMessage: ({ message }) => seen.push(message._tag) })
        return update(model, message)
      },
      view: (model: Model, h) =>
        View({ state: model.grid, rows, wrap, label: 'Items', rowHeight: 20, headerHeight: 20 }, h),
    },
    Scene.given(application.initial({ grid: Grid.bundle.init(undefined).model }).model),
    // One measure and one listener each for the header row and the body: no
    // handle holds a Mount, so a column scrolled into view starts nothing.
    Scene.Mount.expectExact(
      GridViewport.Measure,
      { name: 'DataGridHeaderPress' },
      { name: 'DataGridCellPress' },
    ),
    Scene.Mount.resolveAll(
      ...DataGridView<Message>().resolveMounts(Grid, {
        wrap,
        viewport: { top: 0, left: 0, width: 400, height: 100 },
      }),
    ),
    Scene.keydown(Scene.role('grid'), 'ArrowDown'),
    Scene.expect(Scene.role('grid')).toHaveAttr(
      'aria-activedescendant',
      GridFocus.cellId('items', { row: 'b', column: 'id' }),
    ),
  )
  expect(seen.slice(0, 3)).toEqual(['Measured', 'PressListening', 'PressListening'])
})
