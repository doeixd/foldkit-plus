// @vitest-environment jsdom
/**
 * The grid driven on the real Foldkit runtime: keys move the active
 * descendant, a move off screen scrolls the window to the cell, a key the
 * grid leaves alone keeps its default, and pressing a cell focuses it.
 */
import { Option, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { Bundle } from 'foldkit-bundle'
import { Columns, DataGrid, GridFocus, RowModel } from 'foldkit-data-grid'
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
  id: { header: 'Id', value: item => item.id, pinned: 'start', width: 100 },
  name: { header: 'Name', value: item => item.name, width: 100 },
})
const rows = RowModel.fromArray(items, itemKey)

const Grid = DataGrid.make({ id: 'items', columns })
const Placement = Bundle.declare(Grid.bundle, 'grid')
const Model = Schema.Struct({ ...Placement.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Placement.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const placed = Page.at(Placement, { onOut: Bundle.ignore })
const application = Bundle.assemble<Model, Message>()([placed])

const View = DataGridView<Message>().define(Grid)
const viewIn = (direction: 'ltr' | 'rtl') => (model: Model, h: HtmlBuilder<Message>) =>
  View(
    {
      direction,
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
      view: viewIn('ltr'),
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

    // A resize handle's arrows resize its column and leave the grid's focus alone.
    const nameHandle = () =>
      Array.from(document.querySelectorAll('#items [role="separator"]')).find(
        handle => handle.getAttribute('aria-label') === 'Resize Name',
      )!
    // ArrowLeft, which the grid would take as a move to the Id column.
    const handleKey = new KeyboardEvent('keydown', {
      key: 'ArrowLeft',
      bubbles: true,
      cancelable: true,
    })
    nameHandle().dispatchEvent(handleKey)
    expect(handleKey.defaultPrevented).toBe(true)
    await vi.waitFor(() => expect(nameHandle().getAttribute('aria-valuenow')).toBe('84'))
    expect(document.getElementById(cell('r6', 'name'))!.style.width).toBe('84px')
    expect(grid().getAttribute('aria-activedescendant')).toBe(cell('r6', 'name'))

    document
      .getElementById(cell('r4', 'id'))!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await vi.waitFor(() =>
      expect(grid().getAttribute('aria-activedescendant')).toBe(cell('r4', 'id')),
    )
  } finally {
    handle.dispose()
  }
})

test('in right-to-left text the end edge is on the left, for the keys and the pointer', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(120)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300)
  const container = document.createElement('div')
  container.id = 'grid-rtl'
  document.body.appendChild(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => application.initial({ grid: Grid.bundle.init(undefined).model }),
      update: application.update(),
      view: viewIn('rtl'),
    }),
  )
  const nameHandle = () =>
    Array.from(document.querySelectorAll('#items [role="separator"]')).find(
      separator => separator.getAttribute('aria-label') === 'Resize Name',
    )!
  try {
    await vi.waitFor(() => expect(nameHandle()).toBeDefined())
    // ArrowLeft moves the end edge outward, so the column widens.
    nameHandle().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }),
    )
    await vi.waitFor(() => expect(nameHandle().getAttribute('aria-valuenow')).toBe('116'))
    // A drag to the left widens it too. jsdom has no PointerEvent; Move reads these fields.
    const pointer = (type: string, clientX: number) =>
      nameHandle().dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, clientX }))
    pointer('pointerdown', 100)
    pointer('pointermove', 60)
    pointer('pointerup', 60)
    await vi.waitFor(() => expect(nameHandle().getAttribute('aria-valuenow')).toBe('156'))
    // And ArrowRight moves the end edge inward.
    nameHandle().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
    )
    await vi.waitFor(() => expect(nameHandle().getAttribute('aria-valuenow')).toBe('140'))
  } finally {
    handle.dispose()
  }
})

test('a mark moved to another cell leaves nothing on the cell it was on', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(120)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300)
  // The row marked, read as each render draws: the next render moves it.
  let marked = 'r1'
  const container = document.createElement('div')
  container.id = 'grid-marks'
  document.body.appendChild(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => application.initial({ grid: Grid.bundle.init(undefined).model }),
      update: application.update(),
      view: (model: Model, h: HtmlBuilder<Message>) =>
        View(
          {
            state: model.grid,
            rows,
            wrap: message => Placement.wrapper.make(message),
            label: 'Items',
            rowHeight: 20,
            headerHeight: 20,
            marks: address =>
              address.row === marked && address.column === 'name'
                ? Option.some({ name: 'pending', description: 'Not yet sent' })
                : Option.none(),
          },
          h,
        ),
    }),
  )
  const at = (row: string) => document.getElementById(cell(row, 'name'))!
  try {
    await vi.waitFor(() => expect(at('r1').getAttribute('data-mark')).toBe('pending'))
    marked = 'r2'
    // Any transition redraws: a key that moves the focus.
    document
      .getElementById('items')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    await vi.waitFor(() => expect(at('r2').getAttribute('data-mark')).toBe('pending'))
    expect(at('r2').getAttribute('aria-description')).toBe('Not yet sent')
    expect(at('r1').hasAttribute('data-mark')).toBe(false)
    expect(at('r1').hasAttribute('aria-description')).toBe(false)
  } finally {
    handle.dispose()
  }
})
