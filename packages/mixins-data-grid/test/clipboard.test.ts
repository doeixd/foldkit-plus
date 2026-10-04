// @vitest-environment jsdom
/**
 * The clipboard on the real runtime: copy puts the range (or the focused
 * cell) on the clipboard as tab-separated text; paste lays text from the
 * range's corner and the application hears it as one `Pasted`; cut copies
 * and clears; while a cell is edited the field keeps the clipboard.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { modifyFields } from 'foldkit/struct'
import { Bundle } from 'foldkit-bundle'
import { Clipboard, Columns, DataGrid, GridFocus, RowModel } from 'foldkit-data-grid'
import { DataGridView } from 'foldkit-mixins-data-grid'
import { afterEach, expect, test, vi } from 'vitest'

interface Item {
  readonly id: string
  readonly name: string
  readonly qty: number
}
const rows = RowModel.fromArray<Item>(
  Array.from({ length: 6 }, (_, index) => ({ id: `r${index}`, name: `Item ${index}`, qty: index })),
  item => item.id,
)
const columns = Columns.define<Item>()({
  id: { header: 'Id', value: item => item.id, width: 80 },
  name: { header: 'Name', value: item => item.name, width: 100, edit: {} },
  qty: {
    header: 'Qty',
    value: item => item.qty,
    width: 80,
    edit: { schema: Schema.String.check(Schema.isPattern(/^\d*$/, { message: 'Digits only' })) },
  },
})

const Grid = DataGrid.make({ id: 'items', columns, cellSelection: true })
const Placement = Bundle.declare(Grid.bundle, 'grid')
const Model = Schema.Struct({
  ...Placement.fields,
  accepted: Schema.Array(Schema.String),
  refused: Schema.Array(Schema.String),
})
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Placement.cases })
type Message = typeof Message.Type
const cellText = (cell: { readonly row: string; readonly column: string; readonly text: string }) =>
  `${cell.row}.${cell.column}=${cell.text}`
const application = Bundle.assemble<Model, Message>()([
  Bundle.parent({ Model, Message }).at(Placement, {
    onOut: out => model =>
      Grid.Out.match(out, {
        Edited: () => ({ model }),
        Pasted: pasted => ({
          model: modifyFields(model, {
            accepted: () => [...model.accepted, ...pasted.accepted.map(cellText)],
            refused: () => [...model.refused, ...pasted.refused.map(cellText)],
          }),
        }),
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

/** A clipboard event as a browser sends one, with its data. */
const clipboardEvent = (type: 'copy' | 'cut' | 'paste', pasted = '') => {
  const data = new Map<string, string>([['text/plain', pasted]])
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', {
    value: {
      getData: (format: string) => data.get(format) ?? '',
      setData: (format: string, text: string) => data.set(format, text),
    },
  })
  return { event, text: () => data.get('text/plain') ?? '' }
}

test('copy, cut and paste work on the range, as one change to the application', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(140)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300)
  const container = document.createElement('div')
  container.id = 'grid-clipboard'
  document.body.appendChild(container)
  let latest: Model = { grid: Grid.bundle.init(undefined).model, accepted: [], refused: [] }
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
  const id = (row: string, column: 'id' | 'name' | 'qty') =>
    GridFocus.cellId('items', { row, column })
  const click = (row: string, column: 'id' | 'name' | 'qty', shiftKey = false) =>
    document
      .getElementById(id(row, column))!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey }))
  const send = (type: 'copy' | 'cut' | 'paste', pasted?: string) => {
    const made = clipboardEvent(type, pasted)
    grid().dispatchEvent(made.event)
    return { prevented: made.event.defaultPrevented, text: made.text() }
  }
  try {
    await vi.waitFor(() => expect(document.getElementById(id('r1', 'name'))).not.toBeNull())

    // With no range, copy takes the focused cell.
    click('r1', 'name')
    await vi.waitFor(() =>
      expect(grid().getAttribute('aria-activedescendant')).toBe(id('r1', 'name')),
    )
    expect(send('copy').text).toBe('Item 1')

    // A range copies as rows of tab-separated cells.
    click('r2', 'qty', true)
    await vi.waitFor(() =>
      expect(document.querySelectorAll('#items [aria-selected="true"]')).toHaveLength(4),
    )
    const copied = send('copy')
    expect(copied.prevented).toBe(true)
    expect(Clipboard.parseTsv(copied.text)).toEqual([
      ['Item 1', '1'],
      ['Item 2', '2'],
    ])

    // A paste lands from the range's corner; each cell is checked by its column.
    expect(send('paste', 'Anchor\t7\nBolt\tseven\n').prevented).toBe(true)
    await vi.waitFor(() =>
      expect(latest.accepted).toEqual(['r1.name=Anchor', 'r1.qty=7', 'r2.name=Bolt']),
    )
    expect(latest.refused).toEqual(['r2.qty=seven'])

    // A cut copies the range and clears its editable cells.
    const cut = send('cut')
    expect(Clipboard.parseTsv(cut.text)).toEqual([
      ['Item 1', '1'],
      ['Item 2', '2'],
    ])
    await vi.waitFor(() =>
      expect(latest.accepted.slice(3)).toEqual(['r1.name=', 'r1.qty=', 'r2.name=', 'r2.qty=']),
    )

    // While a cell is edited, the clipboard is the field's: nothing is intercepted.
    click('r0', 'name')
    await vi.waitFor(() =>
      expect(grid().getAttribute('aria-activedescendant')).toBe(id('r0', 'name')),
    )
    grid().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'F2', bubbles: true, cancelable: true }),
    )
    await vi.waitFor(() => expect(document.querySelector('#items input')).not.toBeNull())
    const inField = clipboardEvent('paste', 'typed')
    document.querySelector('#items input')!.dispatchEvent(inField.event)
    expect(inField.event.defaultPrevented).toBe(false)
  } finally {
    handle.dispose()
  }
})
