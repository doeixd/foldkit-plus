// @vitest-environment jsdom
/**
 * The grid driven on the real Foldkit runtime: keys move the active
 * descendant, a move off screen scrolls the window to the cell, a key the
 * grid leaves alone keeps its default, and pressing a cell focuses it.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { Bundle } from 'foldkit-bundle'
import {
  ColumnLayout,
  Columns,
  DataGrid,
  GridFocus,
  GridProjection,
  RowModel,
} from 'foldkit-data-grid'
import { DataGridView } from 'foldkit-mixins-data-grid'
import { afterEach, expect, test, vi } from 'vitest'

interface Item {
  readonly id: string
  readonly name: string
}

const items: ReadonlyArray<Item> = Array.from({ length: 50 }, (_, index) => ({
  id: `r${index}`,
  name: `Item ${index}`,
}))
const itemKey = (item: Item) => item.id
const columns = Columns.define<Item>()({
  id: { header: 'Id', value: item => item.id, pinned: 'start' },
  name: { header: 'Name', value: item => item.name },
})
const projection = GridProjection.make({
  rows: RowModel.fromArray(items, itemKey),
  columns,
  layout: ColumnLayout.initial(columns),
})

const Grid = DataGrid.make({ id: 'items', columns })
const Placement = Bundle.declare(Grid.bundle, 'grid')
const Model = Schema.Struct({ ...Placement.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Placement.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const placed = Page.at(Placement)
const application = Bundle.assemble<Model, Message>()([placed])

const View = DataGridView<Message>().define(Grid)
const view = (model: Model, h: HtmlBuilder<Message>) =>
  View(
    {
      state: model.grid,
      projection,
      wrap: message => Placement.wrapper.make(message),
      label: 'Items',
      rowHeight: 20,
      headerHeight: 20,
      width: () => 100,
    },
    h,
  )

afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const cell = (row: string, column: 'id' | 'name') => GridFocus.cellId('items', { row, column })

test('the keyboard moves the active descendant and scrolls a move off screen into view', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  // jsdom lays nothing out: every element is a 300 by 120 box, a 20px header over five rows.
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(120)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300)
  // jsdom has no scrollTo; this one moves the offsets and fires the scroll a browser would.
  const scrolled: Array<ScrollToOptions> = []
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    value(this: HTMLElement, options: ScrollToOptions) {
      scrolled.push(options)
      this.scrollTop = options.top ?? this.scrollTop
      this.scrollLeft = options.left ?? this.scrollLeft
      this.dispatchEvent(new Event('scroll'))
    },
  })

  const container = document.createElement('div')
  container.id = 'grid-runtime'
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
  const grid = () => document.getElementById('items')!
  const press = (key: string) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    grid().dispatchEvent(event)
    return event
  }
  const drawnRows = () =>
    Array.from(document.querySelectorAll('#items [role="row"][aria-rowindex]'), row =>
      row.getAttribute('aria-rowindex'),
    ).filter(index => index !== '1')
  try {
    await vi.waitFor(() => expect(drawnRows()).toEqual(['2', '3', '4', '5', '6']))
    expect(grid().getAttribute('aria-activedescendant')).toBe(cell('r0', 'id'))

    expect(press('ArrowRight').defaultPrevented).toBe(true)
    await vi.waitFor(() =>
      expect(grid().getAttribute('aria-activedescendant')).toBe(cell('r0', 'name')),
    )
    press('ArrowDown')
    await vi.waitFor(() =>
      expect(grid().getAttribute('aria-activedescendant')).toBe(cell('r1', 'name')),
    )
    expect(scrolled).toEqual([])

    // Five rows a page: r6 is below the window, so the move scrolls just far enough.
    press('PageDown')
    await vi.waitFor(() => expect(scrolled).toEqual([{ top: 40, left: 0 }]))
    await vi.waitFor(() => expect(drawnRows()).toEqual(['4', '5', '6', '7', '8']))
    expect(grid().getAttribute('aria-activedescendant')).toBe(cell('r6', 'name'))
    expect(document.querySelector('[data-focused="true"]')?.id).toBe(cell('r6', 'name'))

    expect(press('Enter').defaultPrevented).toBe(false)

    document
      .getElementById(cell('r4', 'id'))!
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await vi.waitFor(() =>
      expect(grid().getAttribute('aria-activedescendant')).toBe(cell('r4', 'id')),
    )
  } finally {
    handle.dispose()
  }
})
