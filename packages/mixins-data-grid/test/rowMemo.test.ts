// @vitest-environment jsdom
/**
 * The grid's body rows on the real Foldkit runtime: a row is drawn again only
 * when what it is drawn from changed, each time and not only the first, and
 * every row is when the columns it lays out change.
 */
import { Schema } from 'effect'
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
const columns = Columns.define<Item>()({
  id: { header: 'Id', value: item => item.id, width: 100 },
  name: { header: 'Name', value: item => item.name, width: 100 },
})
const rows = RowModel.fromArray(items, item => item.id)

const Grid = DataGrid.make({ id: 'items', columns })
const Placement = Bundle.declare(Grid.bundle, 'grid')
const Model = Schema.Struct({ ...Placement.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Placement.cases })
type Message = typeof Message.Type
const application = Bundle.assemble<Model, Message>()([
  Bundle.parent({ Model, Message }).at(Placement, { onOut: Bundle.ignore }),
])

// The rows each frame drew, read from the cells their drawing asked for.
const drawn = new Set<string>()
const cell = (column: 'id' | 'name', item: Item, _h: HtmlBuilder<Message>) => {
  drawn.add(item.id)
  return item[column]
}
const wrap = (message: typeof Grid.Message.Type): Message => Placement.wrapper.make(message)
const View = DataGridView<Message>().define(Grid)
const view = (model: Model, h: HtmlBuilder<Message>) =>
  View({ state: model.grid, rows, wrap, cell, label: 'Items', rowHeight: 20, headerHeight: 20 }, h)

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

test('a key that moves the focus draws again the row it left and the row it reached', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  // jsdom lays nothing out: a 300 by 120 box is a 20px header over five rows.
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(120)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300)
  const container = document.createElement('div')
  container.id = 'grid-rows'
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
  const active = () => grid().getAttribute('aria-activedescendant')
  /** A key on the grid; what the frame that shows `then` drew. */
  const press = async (key: string, then: () => void): Promise<ReadonlyArray<string>> => {
    drawn.clear()
    grid().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    await vi.waitFor(then)
    return [...drawn].sort()
  }
  const focusedName = (row: string) =>
    document.getElementById(GridFocus.cellId('items', { row, column: 'name' }))
  try {
    await vi.waitFor(() =>
      expect(active()).toBe(GridFocus.cellId('items', { row: 'r0', column: 'id' })),
    )
    await vi.waitFor(() => expect(grid().querySelectorAll('[role="row"]').length).toBe(6))

    // Twice down, so the second is not the miss that follows the first draw.
    expect(
      await press('ArrowDown', () =>
        expect(active()).toBe(GridFocus.cellId('items', { row: 'r1', column: 'id' })),
      ),
    ).toEqual(['r0', 'r1'])
    expect(
      await press('ArrowDown', () =>
        expect(active()).toBe(GridFocus.cellId('items', { row: 'r2', column: 'id' })),
      ),
    ).toEqual(['r1', 'r2'])
    expect(
      await press('ArrowRight', () =>
        expect(active()).toBe(GridFocus.cellId('items', { row: 'r2', column: 'name' })),
      ),
    ).toEqual(['r2'])
    expect(focusedName('r2')?.getAttribute('data-focused')).toBe('true')

    // A column made narrower lays out every row again.
    const handleOf = () =>
      Array.from(grid().querySelectorAll('[role="separator"]')).find(
        separator => separator.getAttribute('aria-label') === 'Resize Name',
      )!
    drawn.clear()
    handleOf().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }),
    )
    await vi.waitFor(() => expect(focusedName('r4')?.style.width).toBe('84px'))
    expect([...drawn].sort()).toEqual(['r0', 'r1', 'r2', 'r3', 'r4'])
  } finally {
    handle.dispose()
  }
})
