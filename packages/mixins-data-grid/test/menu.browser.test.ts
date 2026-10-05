/**
 * A column's menu in a real browser, where focus is real: a key on a header
 * or its button opens the menu and focus goes into it, the arrows walk its
 * items, Enter or a click runs one, and Escape, a choice, a click elsewhere
 * or Tab close it, focus going back to the grid except where the user sent it.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { Bundle } from 'foldkit-bundle'
import { Columns, DataGrid, GridFocus, RowModel } from 'foldkit-data-grid'
import { Style } from 'foldkit-mixins'
import { DataGridView, GridSlots, GridStyle } from 'foldkit-mixins-data-grid'
import { Frames } from 'foldkit-mixins/testing'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'

interface Line {
  readonly id: string
}
const rows = RowModel.fromArray<Line>(
  Array.from({ length: 5 }, (_, index) => ({ id: `r${index}` })),
  line => line.id,
)
const columns = Columns.define<Line>()({
  a: { header: 'A', value: () => 'a', width: 100 },
  b: { header: 'B', value: () => 'b', width: 100 },
  notes: { header: 'Notes', value: () => 'n', width: 100, hidden: true },
})
type Id = keyof typeof columns.byId

const Grid = DataGrid.make({ id: 'lines', columns })
const Placement = Bundle.declare(Grid.bundle, 'grid')
const Model = Schema.Struct({ ...Placement.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Placement.cases })
type Message = typeof Message.Type
const application = Bundle.assemble<Model, Message>()([
  Bundle.parent({ Model, Message }).at(Placement, { onOut: Bundle.ignore }),
])
const Sized = DataGridView<Message>()
  .define(Grid)
  .pipe(
    Style.attach(GridStyle),
    Style.attach(
      Style.forSlots(GridSlots)({ root: Style.inline({ height: '200px', width: '400px' }) }),
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
          headerHeight: 24,
          columnMenu: true,
        },
        h,
      ),
      h.button([h.Id('after')], ['After']),
    ],
  )

afterEach(() => {
  document.body.replaceChildren()
})

test('a column menu is opened, walked and closed by keyboard and pointer, focus following', async () => {
  const container = document.createElement('div')
  container.id = 'grid-menu'
  document.body.appendChild(container)
  const frames = Frames.track()
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => application.initial({ grid: Grid.bundle.init(undefined).model }),
      update: application.update(),
      view,
    }),
  )
  const grid = () => document.getElementById('lines')!
  const menu = () => document.querySelector<HTMLElement>('#lines [role="menu"]')
  const active = () =>
    document.getElementById(menu()!.getAttribute('aria-activedescendant')!)!.textContent
  const headers = () =>
    Array.from(document.querySelectorAll('#lines [role="columnheader"]'), each =>
      each.getAttribute('id'),
    )
  const header = (column: Id) => GridFocus.headerId('lines', column)
  const button = (column: Id) =>
    document.getElementById(header(column))!.querySelector<HTMLElement>('[aria-haspopup="menu"]')!
  try {
    await vi.waitFor(() => expect(headers()).toEqual([header('a'), header('b')]))
    // Looked up each time: a move redraws the cell as a new element.
    const cell = () =>
      document.getElementById(GridFocus.cellId('lines', { row: 'r0', column: 'a' }))!
    await userEvent.click(cell())
    await userEvent.keyboard('{ArrowUp}')
    await vi.waitFor(() => expect(grid().getAttribute('aria-activedescendant')).toBe(header('a')))

    // Alt+ArrowDown opens A's menu and focus goes into it; the arrows walk it.
    await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}')
    await vi.waitFor(() => expect(document.activeElement).toBe(menu()))
    expect(button('a').getAttribute('aria-expanded')).toBe('true')
    expect(active()).toBe('Pin to start')
    await userEvent.keyboard('{ArrowDown}')
    await vi.waitFor(() => expect(active()).toBe('Pin to end'))
    await userEvent.keyboard('{End}')
    await vi.waitFor(() => expect(active()).toBe('Show Notes'))
    await userEvent.keyboard('{Home}')
    await vi.waitFor(() => expect(active()).toBe('Pin to start'))
    // Up from the first item wraps to the last.
    await userEvent.keyboard('{ArrowUp}')
    await vi.waitFor(() => expect(active()).toBe('Show Notes'))

    // Enter runs it: Notes is shown, the menu closes, and focus is the grid's.
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(headers()).toEqual([header('a'), header('b'), header('notes')]))
    expect(menu()).toBeNull()
    expect(document.activeElement).toBe(grid())

    // Shift+F10 opens it again; Escape closes it, back to the grid.
    await userEvent.keyboard('{Shift>}{F10}{/Shift}')
    await vi.waitFor(() => expect(document.activeElement).toBe(menu()))
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(menu()).toBeNull())
    expect(document.activeElement).toBe(grid())

    // B's button opens B's menu; clicking Pin to start pins it.
    await userEvent.click(button('b'))
    await vi.waitFor(() => expect(document.activeElement).toBe(menu()))
    const pin = Array.from(menu()!.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
      item => item.textContent === 'Pin to start',
    )!
    await userEvent.click(pin)
    await vi.waitFor(() =>
      expect(document.getElementById(header('b'))!.dataset['pinned']).toBe('start'),
    )
    expect(menu()).toBeNull()
    expect(document.activeElement).toBe(grid())

    // A click elsewhere in the grid closes it; so does Tab, which goes on.
    await userEvent.click(button('a'))
    await vi.waitFor(() => expect(document.activeElement).toBe(menu()))
    // Notes' last cell: clear of A's menu, which covers the cells below it.
    await userEvent.click(
      document.getElementById(GridFocus.cellId('lines', { row: 'r4', column: 'notes' }))!,
    )
    await vi.waitFor(() => expect(menu()).toBeNull())
    await userEvent.click(button('a'))
    await vi.waitFor(() => expect(document.activeElement).toBe(menu()))
    await userEvent.tab()
    await vi.waitFor(() => expect(menu()).toBeNull())
    expect(document.activeElement).toBe(document.getElementById('after'))

    // Hide, from A's own menu, takes A away and leaves focus on the grid.
    await userEvent.click(button('a'))
    await vi.waitFor(() => expect(document.activeElement).toBe(menu()))
    // A press moved within the menu is not a drag of the header it sits in.
    const first = menu()!.querySelector('[role="menuitem"]')!
    const box = first.getBoundingClientRect()
    for (const [type, x] of [
      ['pointerdown', box.left + 5],
      ['pointermove', box.left + 60],
    ] as const) {
      first.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerId: 1,
          button: 0,
          clientX: x,
          clientY: box.top + 2,
        }),
      )
    }
    await frames.settle()
    expect(document.getElementById(header('a'))!.hasAttribute('data-dragging')).toBe(false)
    first.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, button: 0 }))
    const hide = Array.from(menu()!.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
      item => item.textContent === 'Hide column',
    )!
    await userEvent.click(hide)
    await vi.waitFor(() => expect(headers()).toEqual([header('b'), header('notes')]))
    expect(document.activeElement).toBe(grid())
  } finally {
    handle.dispose()
    frames.dispose()
  }
})
