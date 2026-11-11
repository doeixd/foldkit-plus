/**
 * A date cell's editor in a real browser: a date input has no text selection,
 * so placing the caret there throws, and focus must still come back to the
 * grid when the edit ends. jsdom does not throw, so only a browser shows it.
 * A number is drawn as a text field with a decimal keypad, which has one.
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
  readonly qty: number
  readonly due: Date
}
const rows = RowModel.fromArray<Item>(
  Array.from({ length: 3 }, (_, index) => ({
    id: `r${index}`,
    qty: index,
    due: new Date(`2026-10-0${index + 1}T12:00:00.000Z`),
  })),
  item => item.id,
)
const Count = Schema.String.pipe(Schema.decodeTo(Schema.Number))
const columns = Columns.define<Item>()({
  id: { header: 'Id', value: item => item.id, width: 80 },
  qty: { header: 'Qty', value: item => item.qty, width: 80, edit: { schema: Count } },
  due: {
    header: 'Due',
    value: item => item.due,
    width: 160,
    edit: { schema: Schema.DateFromString },
  },
})
const Grid = DataGrid.make({ id: 'dates', columns })
const Placement = Bundle.declare(Grid.bundle, 'grid')
const Model = Schema.Struct({ ...Placement.fields, edits: Schema.Array(Schema.String) })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Placement.cases })
type Message = typeof Message.Type
const application = Bundle.assemble<Model, Message>()([
  Bundle.parent({ Model, Message }).at(Placement, {
    onOut: out => model =>
      Grid.Out.match(out, {
        Edited: edited => ({
          model: modifyFields(model, {
            edits: () => [...model.edits, `${edited.row}.${edited.column}`],
          }),
        }),
        Pasted: () => ({ model }),
        UndoRequested: () => ({ model }),
        RedoRequested: () => ({ model }),
        Filled: () => ({ model }),
        RowsRequested: () => ({ model }),
        Filtered: () => ({ model }),
      }),
  }),
])
const View = DataGridView<Message>().define(Grid)

afterEach(() => {
  document.body.replaceChildren()
})

const mount = () => {
  let latest: Model = { grid: Grid.bundle.init(undefined).model, edits: [] }
  const update = application.update()
  const container = document.createElement('div')
  container.id = 'grid-date-browser'
  document.body.appendChild(container)
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
        View(
          {
            state: model.grid,
            rows,
            wrap: message => Placement.wrapper.make(message),
            label: 'Dates',
            rowHeight: 32,
            headerHeight: 32,
          },
          h,
        ),
    }),
  )
  return { handle, edits: () => latest.edits }
}
const grid = () => document.getElementById('dates')!
const cell = (row: string, column: 'qty' | 'due') =>
  document.getElementById(GridFocus.cellId('dates', { row, column }))!

const editThenCommit = async (column: 'qty' | 'due', type: string) => {
  const { handle, edits } = mount()
  try {
    await vi.waitFor(() => expect(cell('r0', column)).not.toBeNull())
    await userEvent.click(cell('r0', column))
    await userEvent.keyboard('{Enter}')
    const field = () => document.querySelector<HTMLInputElement>('#dates input')
    await vi.waitFor(() => expect(field()).not.toBeNull())
    expect(field()!.type).toBe(type)
    await vi.waitFor(() => expect(document.activeElement).toBe(field()))
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(field()).toBeNull())
    expect(document.activeElement).toBe(grid())
    expect(grid().getAttribute('aria-activedescendant')).toBe(cell('r1', column).id)
  } finally {
    handle.dispose()
  }
}

test('a date editor takes focus and hands it back to the grid on Enter', async () => {
  await editThenCommit('due', 'date')
})

test('a number editor takes focus and hands it back to the grid on Enter', async () => {
  await editThenCommit('qty', 'text')
})
