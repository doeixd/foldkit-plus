/**
 * Editing in a real browser, where focus is real: Enter opens a focused
 * editor, typed text and Enter commit it to the application, and focus comes
 * back to the grid; Escape cancels a typed start.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { modifyFields } from 'foldkit/struct'
import { Bundle } from 'foldkit-bundle'
import { Columns, DataGrid, GridFocus, RowModel } from 'foldkit-data-grid'
import { DataGridView } from 'foldkit-mixins-data-grid'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'

interface Item {
  readonly id: string
  readonly name: string
  readonly qty: number
}
const rows = RowModel.fromArray<Item>(
  Array.from({ length: 8 }, (_, index) => ({ id: `r${index}`, name: `Item ${index}`, qty: index })),
  item => item.id,
)
const columns = Columns.define<Item>()({
  id: { header: 'Id', value: item => item.id, width: 80 },
  name: { header: 'Name', value: item => item.name, width: 100, edit: {} },
  qty: {
    header: 'Qty',
    value: item => item.qty,
    width: 80,
    edit: {
      schema: Schema.String.check(Schema.isPattern(/^\d+$/, { message: 'Whole numbers only' })),
    },
  },
})

const Grid = DataGrid.make({ id: 'items', columns })
const Placement = Bundle.declare(Grid.bundle, 'grid')
const Model = Schema.Struct({ ...Placement.fields, edits: Schema.Array(Schema.String) })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Placement.cases })
type Message = typeof Message.Type
const application = Bundle.assemble<Model, Message>()([
  Bundle.parent({ Model, Message }).at(Placement, {
    // Every cell the grid reports, an edit's or a paste's, as row.column=text.
    onOut: out => model => {
      const cells = Grid.Out.match(out, {
        Edited: edited => [edited],
        Pasted: pasted => pasted.accepted,
      })
      return {
        model: modifyFields(model, {
          edits: () => [...model.edits, ...cells.map(c => `${c.row}.${c.column}=${c.text}`)],
        }),
      }
    },
  }),
])
const View = DataGridView<Message>().define(Grid)
const view = (model: Model, h: HtmlBuilder<Message>) =>
  View(
    {
      state: model.grid,
      rows,
      wrap: message => Placement.wrapper.make(message),
      label: 'Items',
      rowHeight: 20,
      headerHeight: 20,
    },
    h,
  )

afterEach(() => {
  document.body.innerHTML = ''
})

test('real keys edit a cell, and focus comes back to the grid', async () => {
  const container = document.createElement('div')
  container.id = 'grid-editing-browser'
  document.body.appendChild(container)
  let latest: Model = { grid: Grid.bundle.init(undefined).model, edits: [] }
  const update = application.update()
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
        h.div([h.Style({ height: '200px', display: 'grid' })], [view(model, h)]),
    }),
  )
  const grid = () => document.getElementById('items')!
  const editor = () => document.querySelector<HTMLInputElement>('#items input')
  try {
    await vi.waitFor(() =>
      expect(
        document.getElementById(GridFocus.cellId('items', { row: 'r2', column: 'name' })),
      ).not.toBeNull(),
    )
    await userEvent.click(
      document.getElementById(GridFocus.cellId('items', { row: 'r2', column: 'name' }))!,
    )
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(document.activeElement).toBe(editor()))
    await userEvent.keyboard('{Control>}a{/Control}Cable{Enter}')
    await vi.waitFor(() => expect(latest.edits).toEqual(['r2.name=Cable']))
    await vi.waitFor(() => expect(editor()).toBeNull())
    expect(document.activeElement).toBe(grid())
    // Typing on the grid starts the next edit there, below.
    await userEvent.keyboard('Dowel{Escape}')
    await vi.waitFor(() => expect(editor()).toBeNull())
    expect(latest.edits).toEqual(['r2.name=Cable'])
    expect(document.activeElement).toBe(grid())
  } finally {
    handle.dispose()
  }
})
