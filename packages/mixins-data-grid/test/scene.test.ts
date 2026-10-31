/**
 * A page holding the grid, in Scene: the grid starts three Mounts, each
 * answering when it starts, and `resolveMounts` resolves them with what the
 * runtime sends; a resize handle holds no Mount of its own. An editor, a
 * choice's list and a column's menu each start Mounts as they open, which
 * `resolveOpened` resolves. The conformance suite
 * (`packages/plus/test/conformance.test.ts`) holds Scene's drawing to the
 * runtime's.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Scene } from 'foldkit/test'
import { Bundle } from 'foldkit-bundle'
import { Columns, DataGrid, GridFocus, GridViewport, RowModel } from 'foldkit-data-grid'
import { DataGridView } from 'foldkit-mixins-data-grid'
import { expect, test } from 'vitest'

const Status = Schema.Literals(['Active', 'Paused'])
interface Item {
  readonly id: string
  readonly name: string
  readonly status: typeof Status.Type
}
const rows = RowModel.fromArray<Item>(
  [
    { id: 'a', name: 'Anchor', status: 'Active' },
    { id: 'b', name: 'Bolt', status: 'Active' },
  ],
  item => item.id,
)
const columns = Columns.define<Item>()({
  id: { header: 'Id', value: item => item.id, width: 100 },
  name: { header: 'Name', value: item => item.name, width: 100, edit: {} },
  status: { header: 'Status', value: item => item.status, width: 100, edit: { schema: Status } },
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

/** The page, recording the grid's Messages into `seen`. */
const page = (seen: Array<string>) => ({
  update: (model: Model, message: Message) => {
    Message.match(message, { GotGridMessage: ({ message }) => seen.push(message._tag) })
    return update(model, message)
  },
  view: (model: Model, h: HtmlBuilder<Message>) =>
    View(
      {
        state: model.grid,
        rows,
        wrap,
        label: 'Items',
        rowHeight: 20,
        headerHeight: 20,
        columnMenu: true,
      },
      h,
    ),
})
const start = Scene.given(application.initial({ grid: Grid.bundle.init(undefined).model }).model)
const drawn = Scene.Mount.resolveAll(
  ...DataGridView<Message>().resolveMounts(Grid, {
    wrap,
    viewport: { top: 0, left: 0, width: 400, height: 100 },
  }),
)
const opened = (what: 'editor' | 'choice' | 'menu') =>
  DataGridView<Message>().resolveOpened(Grid, { wrap, opened: what })
// Once it closes, what it held has ended, and Scene asks for that to be said.
const closed = (what: 'editor' | 'choice' | 'menu') =>
  Scene.Mount.expectEnded(...opened(what).map(([mount]) => mount))

test('a page with a grid draws in Scene, its Mounts resolved as the runtime answers them', () => {
  const seen: Array<string> = []
  Scene.scene(
    page(seen),
    start,
    // One measure and one listener each for the header row and the body: no
    // handle holds a Mount, so a column scrolled into view starts nothing.
    Scene.Mount.expectExact(
      GridViewport.Measure,
      { name: 'DataGridHeaderPress' },
      { name: 'DataGridCellPress' },
    ),
    drawn,
    Scene.keydown(Scene.role('grid'), 'ArrowDown'),
    Scene.expect(Scene.role('grid')).toHaveAttr(
      'aria-activedescendant',
      GridFocus.cellId('items', { row: 'b', column: 'id' }),
    ),
  )
  expect(seen.slice(0, 3)).toEqual(['Measured', 'MountStarted', 'MountStarted'])
})

test('an editor opens in Scene, its focus resolved as the runtime answers it', () => {
  const seen: Array<string> = []
  const editor = Scene.role('textbox', { name: 'Name' })
  Scene.scene(
    page(seen),
    start,
    drawn,
    Scene.keydown(Scene.role('grid'), 'ArrowRight'),
    Scene.keydown(Scene.role('grid'), 'Enter'),
    Scene.Mount.expectExact({ name: 'DataGridHoldFocus' }),
    Scene.Mount.resolveAll(...opened('editor')),
    Scene.type(editor, 'Anvil'),
    Scene.expect(editor).toHaveValue('Anvil'),
    Scene.keydown(editor, 'Escape'),
    Scene.expect(Scene.role('textbox')).toBeAbsent(),
    closed('editor'),
  )
  expect(seen.slice(3)).toEqual([
    'Moved',
    'EditStarted',
    'MountStarted',
    'EditChanged',
    'EditCancelled',
  ])
})

test('a choice opens its list in Scene, and an option is chosen from it', () => {
  const seen: Array<string> = []
  Scene.scene(
    page(seen),
    start,
    drawn,
    Scene.keydown(Scene.role('grid'), 'End'),
    Scene.keydown(Scene.role('grid'), 'Enter'),
    // The combobox holds focus, and the list keeps a press from taking it.
    Scene.Mount.expectExact({ name: 'DataGridHoldFocus' }, { name: 'DataGridKeepFocus' }),
    Scene.Mount.resolveAll(...opened('choice')),
    Scene.expect(Scene.role('combobox', { name: 'Status' })).toHaveText('Active'),
    Scene.click(Scene.role('option', { name: 'Paused' })),
    Scene.expect(Scene.role('listbox')).toBeAbsent(),
    closed('choice'),
  )
  expect(seen.slice(3)).toEqual([
    'Moved',
    'EditStarted',
    'MountStarted',
    'MountStarted',
    'EditChosen',
  ])
})

test('a column menu opens in Scene and closes with Escape', () => {
  const seen: Array<string> = []
  Scene.scene(
    page(seen),
    start,
    drawn,
    Scene.click(Scene.role('button', { name: 'Name menu' })),
    Scene.Mount.expectExact({ name: 'DataGridHoldFocus' }),
    Scene.Mount.resolveAll(...opened('menu')),
    Scene.expect(Scene.role('menu', { name: 'Name' })).toExist(),
    Scene.keydown(Scene.role('menu'), 'Escape'),
    Scene.expect(Scene.role('menu')).toBeAbsent(),
    closed('menu'),
  )
  expect(seen.slice(3)).toEqual(['MenuOpened', 'MountStarted', 'MenuClosed'])
})
