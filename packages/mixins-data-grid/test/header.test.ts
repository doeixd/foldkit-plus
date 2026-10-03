// @vitest-environment jsdom
/**
 * The header row by keyboard, on the real runtime: ArrowUp from the first row
 * goes up to the header, the arrows and Home and End move along it (scrolling
 * a header in), Shift with an arrow resizes the column, Ctrl or Meta with
 * Shift and an arrow moves it within its region, and ArrowDown or Escape go
 * back to the cells.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { Bundle } from 'foldkit-bundle'
import { Columns, DataGrid, GridFocus, RowModel } from 'foldkit-data-grid'
import { DataGridView } from 'foldkit-mixins-data-grid'
import { afterEach, expect, test, vi } from 'vitest'

interface Line {
  readonly id: string
}
const rows = RowModel.fromArray<Line>(
  Array.from({ length: 10 }, (_, index) => ({ id: `r${index}` })),
  line => line.id,
)
// 100px each: 300 of the 500 are in view.
const columns = Columns.define<Line>()({
  a: { header: 'A', value: line => line.id, width: 100 },
  b: { header: 'B', value: () => 'b', width: 100 },
  c: { header: 'C', value: () => 'c', width: 100 },
  d: { header: 'D', value: () => 'd', width: 100 },
  e: { header: 'E', value: () => 'e', width: 100 },
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
const View = DataGridView<Message>().define(Grid)
const view = (model: Model, h: HtmlBuilder<Message>) =>
  View(
    {
      state: model.grid,
      rows,
      wrap: message => Placement.wrapper.make(message),
      label: 'Lines',
      rowHeight: 20,
      headerHeight: 20,
    },
    h,
  )

afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

test('the header row is reached, walked, resized and reordered by keyboard', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(120)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300)
  const scrolled: Array<ScrollToOptions> = []
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    value(this: HTMLElement, options: ScrollToOptions) {
      scrolled.push(options)
      this.scrollLeft = options.left ?? this.scrollLeft
      this.dispatchEvent(new Event('scroll'))
    },
  })
  const container = document.createElement('div')
  container.id = 'grid-header'
  document.body.appendChild(container)
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
  const active = () => grid().getAttribute('aria-activedescendant')
  const press = async (key: string, modifiers: KeyboardEventInit = {}, expected?: string) => {
    const event = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      ...modifiers,
    })
    grid().dispatchEvent(event)
    if (expected !== undefined) await vi.waitFor(() => expect(active()).toBe(expected))
    return event
  }
  const header = (column: Id) => GridFocus.headerId('lines', column)
  const cell = (row: string, column: Id) => GridFocus.cellId('lines', { row, column })
  const headers = () =>
    Array.from(
      document.querySelectorAll('#lines [role="columnheader"]'),
      each => each.firstChild?.textContent,
    )
  try {
    await vi.waitFor(() => expect(active()).toBe(cell('r0', 'a')))

    expect((await press('ArrowUp', {}, header('a'))).defaultPrevented).toBe(true)
    expect(document.getElementById(header('a'))!.getAttribute('data-focused')).toBe('true')
    await press('ArrowRight', {}, header('b'))
    // End reaches the last header, scrolled into view sideways.
    await press('End', {}, header('e'))
    expect(scrolled).toEqual([{ top: 0, left: 200 }])
    await press('Home', {}, header('a'))

    // Shift with an arrow resizes the column on the header.
    await press('ArrowRight', { shiftKey: true })
    await vi.waitFor(() => expect(document.getElementById(header('a'))!.style.width).toBe('116px'))
    // Ctrl and Shift with an arrow move it within its region.
    await press('ArrowRight', { shiftKey: true, ctrlKey: true })
    await vi.waitFor(() => expect(headers().slice(0, 2)).toEqual(['B', 'A']))
    expect(active()).toBe(header('a'))

    // Down returns to the row focus came from, in this column.
    await press('ArrowDown', {}, cell('r0', 'a'))
    await press('ArrowUp', {}, header('a'))
    await press('Escape', {}, cell('r0', 'a'))
    // From a lower row, ArrowUp is an ordinary move.
    await press('ArrowDown', {}, cell('r1', 'a'))
    await press('ArrowUp', {}, cell('r0', 'a'))
  } finally {
    handle.dispose()
  }
})
