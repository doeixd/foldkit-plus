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
import { Frames } from 'foldkit-mixins/testing'
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

const Grid = DataGrid.make({ id: 'items', columns, cellSelection: true })
const Placement = Bundle.declare(Grid.bundle, 'grid')
const Model = Schema.Struct({ ...Placement.fields, edits: Schema.Array(Schema.String) })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Placement.cases })
type Message = typeof Message.Type
const application = Bundle.assemble<Model, Message>()([
  Bundle.parent({ Model, Message }).at(Placement, {
    // Every cell the grid reports, an edit's or a paste's, as row.column=text,
    // and a request to undo or redo by its name.
    onOut: out => model => {
      const cell = (c: { readonly row: string; readonly column: string; readonly text: string }) =>
        `${c.row}.${c.column}=${c.text}`
      const reported = Grid.Out.match(out, {
        Edited: edited => [cell(edited)],
        Pasted: pasted => pasted.accepted.map(cell),
        UndoRequested: () => ['undo'],
        RedoRequested: () => ['redo'],
        Filled: request => Grid.fill(rows, model.grid, request).accepted.map(cell),
      })
      return { model: modifyFields(model, { edits: () => [...model.edits, ...reported] }) }
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

/** The grid mounted on the real runtime, with the latest Model as `update` left it. */
const mount = () => {
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
  return { latest: () => latest, dispose: () => handle.dispose() }
}
const cellOf = (row: string, column: 'name' | 'qty') =>
  document.getElementById(GridFocus.cellId('items', { row, column }))

test('real keys edit a cell, and focus comes back to the grid', async () => {
  const mounted = mount()
  const grid = () => document.getElementById('items')!
  const editor = () => document.querySelector<HTMLInputElement>('#items input')
  try {
    await vi.waitFor(() => expect(cellOf('r2', 'name')).not.toBeNull())
    await userEvent.click(cellOf('r2', 'name')!)
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(document.activeElement).toBe(editor()))
    await userEvent.keyboard('{Control>}a{/Control}Cable{Enter}')
    await vi.waitFor(() => expect(mounted.latest().edits).toEqual(['r2.name=Cable']))
    await vi.waitFor(() => expect(editor()).toBeNull())
    expect(document.activeElement).toBe(grid())
    // Typing on the grid starts the next edit there, below. Typed inside one
    // frame, every key reaches the grid before the editor is drawn, and each
    // adds to the edit rather than starting it over.
    const frames = Frames.track()
    frames.hold()
    await userEvent.keyboard('Dowel')
    frames.release()
    frames.dispose()
    await vi.waitFor(() => expect(editor()?.value).toBe('Dowel'))
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(editor()).toBeNull())
    expect(mounted.latest().edits).toEqual(['r2.name=Cable'])
    expect(document.activeElement).toBe(grid())
  } finally {
    mounted.dispose()
  }
})

test('Ctrl+Z on a cell asks the application to undo; inside an editor it is the field’s', async () => {
  const mounted = mount()
  const editor = () => document.querySelector<HTMLInputElement>('#items input')
  try {
    await vi.waitFor(() => expect(cellOf('r1', 'name')).not.toBeNull())
    await userEvent.click(cellOf('r1', 'name')!)
    await userEvent.keyboard('{Control>}z{/Control}')
    await userEvent.keyboard('{Control>}{Shift>}z{/Shift}{/Control}')
    await userEvent.keyboard('{Control>}y{/Control}')
    await vi.waitFor(() => expect(mounted.latest().edits).toEqual(['undo', 'redo', 'redo']))

    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(document.activeElement).toBe(editor()))
    await userEvent.keyboard('Cable{Control>}z{/Control}')
    expect(editor()).not.toBeNull()
    // Enter and Ctrl+Z inside one frame: the grid has the key before the
    // editor is drawn, and the edit it has opened keeps it.
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(editor()).toBeNull())
    const frames = Frames.track()
    frames.hold()
    await userEvent.keyboard('{Enter}{Control>}z{/Control}')
    frames.release()
    frames.dispose()
    await vi.waitFor(() => expect(document.activeElement).toBe(editor()))
    expect(mounted.latest().edits).toEqual(['undo', 'redo', 'redo'])
  } finally {
    mounted.dispose()
  }
})

test('the fill handle, dragged down, carries the range on over the cells it is let go on', async () => {
  const mounted = mount()
  const frames = Frames.track()
  const grid = () => document.getElementById('items')!
  const handle = () => cellOf('r1', 'name')?.querySelector('span[aria-hidden="true"]') ?? null
  const centre = (element: Element) => {
    const box = element.getBoundingClientRect()
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
  }
  const pointer = (type: string, at: { readonly x: number; readonly y: number }) =>
    handle()!.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        button: 0,
        clientX: at.x,
        clientY: at.y,
      }),
    )
  const previewed = () =>
    Array.from(document.querySelectorAll('#items [data-fill="target"]'), element => element.id)
  try {
    await vi.waitFor(() => expect(cellOf('r1', 'name')).not.toBeNull())
    await userEvent.click(cellOf('r0', 'name')!)
    await userEvent.click(cellOf('r1', 'name')!, { modifiers: ['Shift'] })
    await vi.waitFor(() => expect(handle()).not.toBeNull())
    const from = centre(handle()!)
    pointer('pointerdown', from)
    pointer('pointermove', centre(cellOf('r3', 'name')!))
    await vi.waitFor(() =>
      expect(previewed()).toEqual([
        GridFocus.cellId('items', { row: 'r2', column: 'name' }),
        GridFocus.cellId('items', { row: 'r3', column: 'name' }),
      ]),
    )
    pointer('pointerup', centre(cellOf('r3', 'name')!))
    // The click a captured pointer ends with is the handle's: the range stays.
    handle()!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await vi.waitFor(() =>
      expect(mounted.latest().edits).toEqual(['r2.name=Item 0', 'r3.name=Item 1']),
    )
    expect(previewed()).toEqual([])
    expect(cellOf('r0', 'name')!.getAttribute('aria-selected')).toBe('true')

    // Escape lets a fill go, and its release writes nothing.
    pointer('pointerdown', centre(handle()!))
    pointer('pointermove', centre(cellOf('r4', 'name')!))
    await vi.waitFor(() => expect(previewed()).toHaveLength(3))
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(previewed()).toEqual([]))
    pointer('pointerup', centre(cellOf('r4', 'name')!))
    await frames.settle()
    expect(mounted.latest().edits).toEqual(['r2.name=Item 0', 'r3.name=Item 1'])
  } finally {
    mounted.dispose()
    frames.dispose()
  }
})
