// @vitest-environment jsdom
/**
 * Editing on the real runtime: Enter or a typed key opens an editor in the
 * cell, focused; Enter commits and moves down, Tab across, Escape cancels; a
 * draft the column refuses stays with `aria-invalid`; the application hears
 * `Edited` through its `onOut`, and focus comes back to the grid.
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
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

/** The grid on the real runtime, with the last Model it reached. */
const mount = () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(180)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300)
  const container = document.createElement('div')
  container.id = 'grid-editing'
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
  return { handle, latest: () => latest }
}
const grid = () => document.getElementById('items')!
const editor = () => document.querySelector<HTMLInputElement>('#items input')
const cell = (row: string, column: 'id' | 'name' | 'qty') =>
  GridFocus.cellId('items', { row, column })

test('cells are edited by keyboard, and the application hears the text', async () => {
  const { handle, latest } = mount()
  const press = (target: Element, key: string, modifiers: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      ...modifiers,
    })
    target.dispatchEvent(event)
    return event
  }
  const type = (text: string) => {
    const input = editor()!
    input.value = text
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }
  try {
    await vi.waitFor(() =>
      expect(grid().getAttribute('aria-activedescendant')).toBe(cell('r0', 'id')),
    )
    grid().focus()

    // The Id column does not edit: Enter on it opens nothing.
    press(grid(), 'Enter')
    press(grid(), 'ArrowRight')
    await vi.waitFor(() =>
      expect(grid().getAttribute('aria-activedescendant')).toBe(cell('r0', 'name')),
    )
    expect(editor()).toBeNull()

    // Enter opens the editor on the cell's text, focused.
    press(grid(), 'Enter')
    await vi.waitFor(() => expect(editor()?.value).toBe('Item 0'))
    expect(document.activeElement).toBe(editor())
    type('Anchor')
    // The editor's arrows are its own: the grid's focus does not move.
    expect(press(editor()!, 'ArrowLeft').defaultPrevented).toBe(false)
    expect(press(editor()!, 'Enter').defaultPrevented).toBe(true)
    await vi.waitFor(() => expect(latest().edits).toEqual(['r0.name=Anchor']))
    await vi.waitFor(() => expect(editor()).toBeNull())
    expect(grid().getAttribute('aria-activedescendant')).toBe(cell('r1', 'name'))
    expect(document.activeElement).toBe(grid())

    // A typed key starts the edit over with that character, and keys typed
    // before the editor is drawn add to it; Tab commits and moves on.
    press(grid(), 'B')
    press(grid(), 'o')
    await vi.waitFor(() => expect(editor()?.value).toBe('Bo'))
    type('Bolt')
    press(editor()!, 'Tab')
    await vi.waitFor(() => expect(latest().edits).toEqual(['r0.name=Anchor', 'r1.name=Bolt']))
    await vi.waitFor(() =>
      expect(grid().getAttribute('aria-activedescendant')).toBe(cell('r1', 'qty')),
    )

    // A draft the column refuses stays, marked invalid, and reports nothing.
    press(grid(), 'F2')
    await vi.waitFor(() => expect(editor()?.value).toBe('1'))
    type('one')
    press(editor()!, 'Enter')
    await vi.waitFor(() => expect(editor()?.getAttribute('aria-invalid')).toBe('true'))
    expect(document.getElementById(editor()!.getAttribute('aria-describedby')!)?.textContent).toBe(
      'Whole numbers only',
    )
    expect(latest().edits).toHaveLength(2)

    // Escape cancels, reporting nothing, and hands focus back.
    press(editor()!, 'Escape')
    await vi.waitFor(() => expect(editor()).toBeNull())
    expect(latest().edits).toHaveLength(2)

    // Escape on the grid, before a typed edit's editor is drawn, cancels it too.
    press(grid(), '7')
    press(grid(), 'Escape')
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(editor()).toBeNull()
    expect(latest().edits).toHaveLength(2)
    expect(document.activeElement).toBe(grid())
  } finally {
    handle.dispose()
  }
})

test('a double-click edits a cell that can be edited, and no other', async () => {
  const { handle } = mount()
  const doubleClick = (id: string) =>
    document.getElementById(id)!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
  try {
    await vi.waitFor(() => expect(document.getElementById(cell('r2', 'name'))).not.toBeNull())
    expect(document.getElementById(cell('r2', 'name'))!.getAttribute('data-editable')).toBe('true')
    expect(document.getElementById(cell('r2', 'id'))!.hasAttribute('data-editable')).toBe(false)

    doubleClick(cell('r2', 'id'))
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(editor()).toBeNull()

    doubleClick(cell('r2', 'name'))
    await vi.waitFor(() => expect(editor()?.value).toBe('Item 2'))
    expect(document.getElementById(cell('r2', 'name'))!.getAttribute('data-editing')).toBe('true')
    expect(document.getElementById(cell('r1', 'name'))!.hasAttribute('data-editing')).toBe(false)
  } finally {
    handle.dispose()
  }
})

test('focus leaving the field saves the edit; a refused draft stays, its error below it', async () => {
  const { handle, latest } = mount()
  const elsewhere = document.createElement('button')
  document.body.appendChild(elsewhere)
  const doubleClick = (id: string) =>
    document.getElementById(id)!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
  const type = (text: string) => {
    editor()!.value = text
    editor()!.dispatchEvent(new Event('input', { bubbles: true }))
  }
  try {
    await vi.waitFor(() => expect(document.getElementById(cell('r3', 'name'))).not.toBeNull())
    doubleClick(cell('r3', 'name'))
    await vi.waitFor(() => expect(editor()).not.toBeNull())
    type('Gasket')
    elsewhere.focus()
    await vi.waitFor(() => expect(latest().edits).toEqual(['r3.name=Gasket']))
    await vi.waitFor(() => expect(editor()).toBeNull())

    // A draft the column refuses: still open after the blur, with its error,
    // which the field names.
    doubleClick(cell('r3', 'qty'))
    await vi.waitFor(() => expect(editor()).not.toBeNull())
    type('lots')
    elsewhere.focus()
    await vi.waitFor(() => expect(editor()?.getAttribute('aria-invalid')).toBe('true'))
    const error = document.getElementById(editor()!.getAttribute('aria-describedby')!)
    expect(error?.textContent).toBe('Whole numbers only')
    expect(error?.getAttribute('role')).toBe('alert')
    expect(latest().edits).toEqual(['r3.name=Gasket'])
    expect(editor()?.value).toBe('lots')
  } finally {
    handle.dispose()
  }
})
