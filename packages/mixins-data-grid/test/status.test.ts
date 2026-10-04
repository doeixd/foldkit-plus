// @vitest-environment jsdom
/**
 * Where the rows stand, and the application's own Messages: loading says so
 * and is busy, a failure says why with a retry, a failure over rows is said
 * below them, sortable headers say how they sort and send the sort Message on
 * a click or Enter, and More is offered while the count is not known.
 */
import { Option, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { modifyFields } from 'foldkit/struct'
import { Bundle } from 'foldkit-bundle'
import { Columns, DataGrid, GridFocus, RowCount, RowModel, RowStatus } from 'foldkit-data-grid'
import { Inert } from 'foldkit-mixins/testing'
import { DataGridView, type GridInput } from 'foldkit-mixins-data-grid'
import { afterEach, describe, expect, test, vi } from 'vitest'

interface Item {
  readonly id: string
  readonly name: string
}
const items: ReadonlyArray<Item> = [
  { id: 'a', name: 'Anchor' },
  { id: 'b', name: 'Bolt' },
]
const itemKey = (item: Item) => item.id
const columns = Columns.define<Item>()({
  id: { header: 'Id', value: item => item.id, width: 80 },
  name: { header: 'Name', value: item => item.name, width: 120 },
})
type Id = keyof typeof columns.byId

const Grid = DataGrid.make({ id: 'items', columns })
const Placement = Bundle.declare(Grid.bundle, 'grid')
const Model = Schema.Struct({ ...Placement.fields, sent: Schema.Array(Schema.String) })
type Model = typeof Model.Type
const Message = defineMessageUnion({
  ...Placement.cases,
  Sorted: { column: Schema.String },
  Retried: {},
  AskedForMore: {},
})
type Message = typeof Message.Type
const View = DataGridView<Message>().define(Grid)

const all = RowModel.fromArray(items, itemKey)
const none = RowModel.fromArray<Item>([], itemKey)
const open: RowModel<Item> = { ...all, count: RowCount.Unknown({ atLeast: 2 }) }

const input = (
  overrides: Partial<GridInput<Item, Id, typeof Grid.Message.Type, Message>> = {},
): GridInput<Item, Id, typeof Grid.Message.Type, Message> => ({
  state: {
    ...Grid.bundle.init(undefined).model,
    viewport: { top: 0, left: 0, width: 400, height: 100 },
  },
  rows: all,
  wrap: message => Placement.wrapper.make(message),
  label: 'Items',
  rowHeight: 20,
  headerHeight: 20,
  ...overrides,
})
const draw = (given: GridInput<Item, Id, typeof Grid.Message.Type, Message>) =>
  Inert.draw(View, given)
const grid = (drawn: ReturnType<typeof draw>) => Inert.byRole(drawn, 'grid')[0]

describe('the rows’ status', () => {
  test('loading with no rows says so and is busy', () => {
    const drawn = draw(
      input({ rows: none, status: RowStatus.Loading(), words: { loading: 'Fetching…' } }),
    )
    expect(Inert.value(grid(drawn), 'aria-busy')).toBe('true')
    const [status] = Inert.byRole(drawn, 'status')
    expect(Inert.text(status)).toBe('Fetching…')
    expect(Inert.value(status, 'aria-busy')).toBe('true')
  })

  test('refreshing keeps the rows and is busy', () => {
    const drawn = draw(input({ status: RowStatus.Refreshing() }))
    expect(Inert.value(grid(drawn), 'aria-busy')).toBe('true')
    expect(Inert.byRole(drawn, 'gridcell')).toHaveLength(4)
  })

  test('a failure with no rows says why, with a retry when there is one', () => {
    const drawn = draw(
      input({
        rows: none,
        status: RowStatus.Failed({ message: 'offline' }),
        onRetry: Message.Retried(),
        words: { failed: 'Could not load: {message}', retry: 'Again' },
      }),
    )
    expect(Inert.text(Inert.byRole(drawn, 'alert')[0])).toBe('Could not load: offline')
    expect(Inert.text(Inert.bySlot(drawn, 'retry')[0])).toBe('Again')
    expect(Inert.value(grid(drawn), 'aria-busy')).toBeUndefined()
  })

  test('a failure over rows keeps them and is said below them', () => {
    const drawn = draw(input({ status: RowStatus.Failed({ message: 'offline' }) }))
    expect(Inert.byRole(drawn, 'gridcell')).toHaveLength(4)
    const [footer] = Inert.bySlot(drawn, 'footer')
    expect(Inert.text(Inert.byRole(footer, 'alert')[0])).toBe('offline')
    expect(Inert.bySlot(drawn, 'retry')).toEqual([])
  })

  test('More is offered only while the count is not known, and not while busy', () => {
    expect(Inert.bySlot(draw(input({ onMore: Message.AskedForMore() })), 'more')).toEqual([])
    const [more] = Inert.bySlot(draw(input({ rows: open, onMore: Message.AskedForMore() })), 'more')
    expect(Inert.text(more)).toBe('More')
    const [waiting] = Inert.bySlot(
      draw(input({ rows: open, onMore: Message.AskedForMore(), status: RowStatus.Refreshing() })),
      'more',
    )
    expect(Inert.value(waiting, 'disabled')).toBe(true)
  })

  test('a sortable header says how it sorts; another says nothing', () => {
    const drawn = draw(
      input({ sort: { name: { direction: 'desc', message: Message.Sorted({ column: 'name' }) } } }),
    )
    const [id, name] = Inert.byRole(drawn, 'columnheader')
    expect(Inert.value(id, 'aria-sort')).toBeUndefined()
    expect(Inert.value(name, 'aria-sort')).toBe('descending')
    expect(Inert.text(Inert.bySlot(name, 'sort')[0])).toBe('Name')
    // The button carries the direction for a stylist to draw; unsorted, none.
    expect(Inert.value(Inert.bySlot(name, 'sort')[0], 'data-sort')).toBe('desc')
    const unsorted = Inert.byRole(
      draw(input({ sort: { name: { message: Message.Sorted({ column: 'name' }) } } })),
      'columnheader',
    )[1]
    expect(Inert.value(Inert.bySlot(unsorted, 'sort')[0], 'data-sort')).toBeUndefined()
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

test('the sort, retry and More buttons, and Enter on a header, send the application’s Messages', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400)
  const application = Bundle.assemble<Model, Message>()([
    Bundle.parent({ Model, Message }).at(Placement, { onOut: Bundle.ignore }),
  ])
  const update = application.update()
  let latest: Model = { grid: Grid.bundle.init(undefined).model, sent: [] }
  const container = document.createElement('div')
  container.id = 'grid-status'
  document.body.appendChild(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => application.initial(latest),
      update: (model: Model, message: Message) => {
        const next = Message.match(message, {
          Sorted: ({ column }) => ({
            model: modifyFields(model, { sent: () => [...model.sent, `sort:${column}`] }),
          }),
          Retried: () => ({ model: modifyFields(model, { sent: () => [...model.sent, 'retry'] }) }),
          AskedForMore: () => ({
            model: modifyFields(model, { sent: () => [...model.sent, 'more'] }),
          }),
          GotGridMessage: () => update(model, message),
        })
        latest = next.model
        return next
      },
      view: (model: Model, h: HtmlBuilder<Message>) =>
        View(
          {
            ...input({
              rows: open,
              status: RowStatus.Failed({ message: 'offline' }),
              onRetry: Message.Retried(),
              onMore: Message.AskedForMore(),
              sort: { name: { message: Message.Sorted({ column: 'name' }) } },
            }),
            state: model.grid,
          },
          h,
        ),
    }),
  )
  const root = () => document.getElementById('items')!
  const press = (key: string) =>
    root().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  try {
    await vi.waitFor(() =>
      expect(document.querySelector('#items [role="columnheader"] button')).not.toBeNull(),
    )
    const button = (text: string) =>
      Array.from(document.querySelectorAll<HTMLButtonElement>('#items button')).find(
        each => each.textContent === text,
      )!
    button('Name').click()
    button('Try again').click()
    button('More').click()
    await vi.waitFor(() => expect(latest.sent).toEqual(['sort:name', 'retry', 'more']))

    // Enter on a sortable header sorts; on another it does nothing.
    await vi.waitFor(() =>
      expect(root().getAttribute('aria-activedescendant')).toBe(
        GridFocus.cellId('items', { row: 'a', column: 'id' }),
      ),
    )
    press('ArrowUp')
    await vi.waitFor(() =>
      expect(root().getAttribute('aria-activedescendant')).toBe(GridFocus.headerId('items', 'id')),
    )
    press('Enter')
    press('ArrowRight')
    await vi.waitFor(() =>
      expect(root().getAttribute('aria-activedescendant')).toBe(
        GridFocus.headerId('items', 'name'),
      ),
    )
    press('Enter')
    await vi.waitFor(() => expect(latest.sent).toEqual(['sort:name', 'retry', 'more', 'sort:name']))
    expect(Option.isNone(latest.grid.editing)).toBe(true)
  } finally {
    handle.dispose()
  }
})
