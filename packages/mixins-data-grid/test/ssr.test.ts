// @vitest-environment jsdom
/**
 * The grid rendered on a server: Foldkit refuses a view whose markup a parser
 * would build differently, so the grid has to survive a round trip through
 * `renderToString` and `DOMParser` with its roles and indexes intact.
 */
import { Effect, Schema } from 'effect'
import { injectIntoTemplate, renderToString } from 'foldkit/experimental/server'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { Columns, DataGrid, RowModel } from 'foldkit-data-grid'
import { DataGridView } from 'foldkit-mixins-data-grid'
import { expect, test } from 'vitest'

interface Item {
  readonly id: string
  readonly name: string
}
const items: ReadonlyArray<Item> = [
  { id: 'a', name: 'Anchor' },
  { id: 'b', name: 'Bolt' },
]
const columns = Columns.define<Item>()({
  id: { header: 'Id', value: item => item.id, pinned: 'start', width: 100 },
  name: { header: 'Name', value: item => item.name, width: 100 },
})
const rows = RowModel.fromArray(items, item => item.id)

const Grid = DataGrid.make({ id: 'served', columns })
const Placement = Bundle.declare(Grid.bundle, 'grid')
const Model = Schema.Struct({ ...Placement.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Placement.cases })
type Message = typeof Message.Type
const application = Bundle.assemble<Model, Message>()([
  Bundle.parent({ Model, Message }).at(Placement, { onOut: Bundle.ignore }),
])
const View = DataGridView<Message>().define(Grid)

test('renders on a server as markup a parser reads back the same', async () => {
  const served = await Effect.runPromise(
    renderToString(
      {
        // A server knows no viewport: give it the height of the rows it should send.
        init: () =>
          application.initial({
            grid: {
              ...Grid.bundle.init(undefined).model,
              viewport: { top: 0, left: 0, width: 400, height: 100 },
            },
          }),
        view: (model: Model, h: HtmlBuilder<Message>) => ({
          title: 'Grid',
          body: View(
            {
              state: model.grid,
              rows,
              wrap: message => Placement.wrapper.make(message),
              label: 'Items',
              rowHeight: 20,
              headerHeight: 20,
            },
            h,
          ),
        }),
      },
      { buildId: 'b' },
    ),
  )
  const template =
    '<!doctype html><html><head><title></title></head><body><div id="root"></div></body></html>'
  const parsed = new DOMParser().parseFromString(injectIntoTemplate(template, served), 'text/html')
  const grid = parsed.querySelector('[role="grid"]')!
  expect(grid.getAttribute('aria-rowcount')).toBe('3')
  expect(
    Array.from(grid.querySelectorAll('[role="columnheader"]'), header => header.textContent),
  ).toEqual(['Id', 'Name'])
  expect(
    Array.from(grid.querySelectorAll('[role="row"]'), row => row.getAttribute('aria-rowindex')),
  ).toEqual(['1', '2', '3'])
  expect(Array.from(grid.querySelectorAll('[role="gridcell"]'), cell => cell.textContent)).toEqual([
    'a',
    'Anchor',
    'b',
    'Bolt',
  ])
})
