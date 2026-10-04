// @vitest-environment jsdom
/**
 * The editor a cell is edited in, as its column's schema says, on the real
 * runtime: a choice of literals is a select of them, opened on the cell's
 * value even by a typed key, and committed with Enter; a number is a text
 * field with a decimal keypad; the application reads the value back typed.
 */
import { Schema, SchemaGetter } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { modifyFields } from 'foldkit/struct'
import { Bundle } from 'foldkit-bundle'
import { Columns, DataGrid, GridFocus, RowModel } from 'foldkit-data-grid'
import { DataGridView } from 'foldkit-mixins-data-grid'
import { afterEach, expect, test, vi } from 'vitest'

const Status = Schema.Literals(['Active', 'Pending', 'Discontinued'])
const Count = Schema.String.check(Schema.isPattern(/^\d+$/, { message: 'Whole numbers' })).pipe(
  Schema.decodeTo(Schema.Number, {
    decode: SchemaGetter.transform(text => Number(text)),
    encode: SchemaGetter.transform(count => String(count)),
  }),
)

interface Item {
  readonly id: string
  readonly status: typeof Status.Type
  readonly qty: number
}
const rows = RowModel.fromArray<Item>(
  // r2 is the last option, so a select that showed its first would be caught.
  Array.from({ length: 4 }, (_, index) => ({
    id: `r${index}`,
    status: index === 2 ? 'Discontinued' : 'Active',
    qty: index,
  })),
  item => item.id,
)
const columns = Columns.define<Item>()({
  id: { header: 'Id', value: item => item.id, width: 80 },
  status: { header: 'Status', value: item => item.status, width: 120, edit: { schema: Status } },
  qty: { header: 'Qty', value: item => item.qty, width: 80, edit: { schema: Count } },
})

const Grid = DataGrid.make({ id: 'items', columns })
const Placement = Bundle.declare(Grid.bundle, 'grid')
const Model = Schema.Struct({ ...Placement.fields, edits: Schema.Array(Schema.String) })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Placement.cases })
type Message = typeof Message.Type
const application = Bundle.assemble<Model, Message>()([
  Bundle.parent({ Model, Message }).at(Placement, {
    // Each edit read back typed: a status is one of its literals, a count a number.
    onOut: out => model =>
      Grid.Out.match(out, {
        Edited: edited => ({
          model: modifyFields(model, {
            edits: () => [
              ...model.edits,
              Grid.matchEdit(edited, {
                status: ({ row, value }) => `${row} is ${value}`,
                qty: ({ row, value }) => `${row} has ${value + 1} less one`,
              }),
            ],
          }),
        }),
        Pasted: () => ({ model }),
      }),
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
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

test('a choice is a select of its literals, and a number a field with a decimal keypad', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(120)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300)
  const container = document.createElement('div')
  container.id = 'grid-editors'
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
      view,
    }),
  )
  const grid = () => document.getElementById('items')!
  const select = () => document.querySelector<HTMLSelectElement>('#items select')
  const field = () => document.querySelector<HTMLInputElement>('#items input')
  const press = (target: Element, key: string) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  const focusOn = async (row: string, column: 'status' | 'qty') => {
    document
      .getElementById(GridFocus.cellId('items', { row, column }))!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await vi.waitFor(() =>
      expect(grid().getAttribute('aria-activedescendant')).toBe(
        GridFocus.cellId('items', { row, column }),
      ),
    )
  }
  try {
    await vi.waitFor(() =>
      expect(document.querySelector('#items [role="gridcell"]')).not.toBeNull(),
    )

    // A select of the literals, on the cell's value, focused.
    await focusOn('r0', 'status')
    press(grid(), 'Enter')
    await vi.waitFor(() => expect(select()).not.toBeNull())
    expect(Array.from(select()!.options, option => option.value)).toEqual([
      'Active',
      'Pending',
      'Discontinued',
    ])
    expect(select()!.value).toBe('Active')
    expect(document.activeElement).toBe(select())
    select()!.value = 'Pending'
    select()!.dispatchEvent(new Event('change', { bubbles: true }))
    press(select()!, 'Enter')
    await vi.waitFor(() => expect(latest.edits).toEqual(['r0 is Pending']))

    // A typed key opens the select on the cell's value, not on the letter.
    await focusOn('r2', 'status')
    press(grid(), 'D')
    await vi.waitFor(() => expect(select()?.value).toBe('Discontinued'))
    press(select()!, 'Escape')
    await vi.waitFor(() => expect(select()).toBeNull())

    // A number is typed in a text field with a decimal keypad, and read back a number.
    await focusOn('r1', 'qty')
    press(grid(), 'Enter')
    await vi.waitFor(() => expect(field()).not.toBeNull())
    expect(field()!.getAttribute('inputmode')).toBe('decimal')
    field()!.value = '41'
    field()!.dispatchEvent(new Event('input', { bubbles: true }))
    press(field()!, 'Enter')
    await vi.waitFor(() => expect(latest.edits).toEqual(['r0 is Pending', 'r1 has 42 less one']))
  } finally {
    handle.dispose()
  }
})
