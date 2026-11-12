/**
 * A real copy in a real browser: the grid's own copy writes `text/plain`, and
 * the listener the body's Mount adds on the root writes the same cells as an
 * HTML table, escaped. A copy that something else took gains no grid HTML.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { Bundle } from 'foldkit-bundle'
import { Columns, DataGrid, GridFocus, RowModel } from 'foldkit-data-grid'
import { DataGridView } from 'foldkit-mixins-data-grid'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'

interface Item {
  readonly id: string
  readonly name: string
  readonly note: string
}
const rows = RowModel.fromArray<Item>(
  [
    { id: 'r0', name: '<img src=x onerror=alert(1)>', note: 'a & "b"' },
    { id: 'r1', name: 'two\nlines', note: 'plain' },
  ],
  item => item.id,
)
const columns = Columns.define<Item>()({
  name: { header: 'Name', value: item => item.name, width: 160, edit: {} },
  note: { header: 'Note', value: item => item.note, width: 120, edit: {} },
})
const Grid = DataGrid.make({ id: 'items', columns, cellSelection: true })
const Placement = Bundle.declare(Grid.bundle, 'grid')
const Model = Schema.Struct({ ...Placement.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Placement.cases })
type Message = typeof Message.Type
const application = Bundle.assemble<Model, Message>()([
  Bundle.parent({ Model, Message }).at(Placement, {
    onOut: () => model => ({ model }),
  }),
])
const View = DataGridView<Message>().define(Grid)

afterEach(() => {
  document.body.innerHTML = ''
})

test('a copy carries the cells as an escaped HTML table beside the tab-separated text', async () => {
  const container = document.createElement('div')
  container.id = 'grid-copy-html'
  document.body.append(container)
  const update = application.update()
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => application.initial({ grid: Grid.bundle.init(undefined).model }),
      update: (model: Model, message: Message) => update(model, message),
      view: (model: Model, h: HtmlBuilder<Message>) =>
        View(
          {
            state: model.grid,
            rows,
            wrap: message => Placement.wrapper.make(message),
            label: 'Items',
            rowHeight: 40,
            headerHeight: 20,
          },
          h,
        ),
    }),
  )
  const cell = (row: string, column: 'name' | 'note') =>
    document.getElementById(GridFocus.cellId('items', { row, column }))
  const copied: Array<{ html: string; text: string; target: EventTarget | null }> = []
  const record = (event: Event) => {
    const data = (event as ClipboardEvent).clipboardData!
    copied.push({
      html: data.getData('text/html'),
      text: data.getData('text/plain'),
      target: event.target,
    })
  }
  const field = document.createElement('textarea')
  try {
    await Promise.resolve()
    await expectCells(cell)
    // Shift-click grows the range over both rows and columns, then copy.
    await userEvent.click(cell('r0', 'name')!)
    cell('r1', 'note')!.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }))
    await vi.waitFor(() => expect(cell('r1', 'note')!.getAttribute('aria-selected')).toBe('true'))
    document.addEventListener('copy', record)
    await userEvent.keyboard('{Control>}c{/Control}')
    expect(copied).toHaveLength(1)
    expect((copied[0]!.target as Element).getAttribute('role')).toBe('gridcell')
    expect(copied[0]!.text).toBe('<img src=x onerror=alert(1)>\t"a & ""b"""\n"two\nlines"\tplain')
    expect(copied[0]!.html).toBe(
      '<table><tbody>' +
        '<tr><td>&lt;img src=x onerror=alert(1)&gt;</td><td>a &amp; &quot;b&quot;</td></tr>' +
        '<tr><td>two<br>lines</td><td>plain</td></tr>' +
        '</tbody></table>',
    )
    // What a paste target reads is the same markup, and it parses as cells, not elements.
    document.body.append(field)
    field.focus()
    let pasted = ''
    field.addEventListener('paste', event => {
      pasted = event.clipboardData!.getData('text/html')
    })
    await userEvent.keyboard('{Control>}v{/Control}')
    const parsed = new DOMParser().parseFromString(pasted, 'text/html')
    expect(parsed.querySelectorAll('img')).toHaveLength(0)
    expect([...parsed.querySelectorAll('td')].map(td => td.textContent)).toEqual([
      '<img src=x onerror=alert(1)>',
      'a & "b"',
      'twolines',
      'plain',
    ])
  } finally {
    document.removeEventListener('copy', record)
    await handle.dispose()
  }
})

test('only the grid’s own copy gains grid HTML', async () => {
  const container = document.createElement('div')
  container.id = 'grid-copy-html-other'
  document.body.append(container)
  const update = application.update()
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => application.initial({ grid: Grid.bundle.init(undefined).model }),
      update: (model: Model, message: Message) => update(model, message),
      view: (model: Model, h: HtmlBuilder<Message>) =>
        View(
          {
            state: model.grid,
            rows,
            wrap: message => Placement.wrapper.make(message),
            label: 'Items',
            rowHeight: 40,
            headerHeight: 20,
          },
          h,
        ),
    }),
  )
  try {
    await expectCells((row, column) =>
      document.getElementById(GridFocus.cellId('items', { row, column })),
    )
    const cell = document.getElementById(GridFocus.cellId('items', { row: 'r0', column: 'name' }))!
    await userEvent.click(cell)
    const grid = document.getElementById('items')!
    const copy = (target: Element) => {
      const data = new DataTransfer()
      target.dispatchEvent(
        new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true }),
      )
      return { text: data.getData('text/plain'), html: data.getData('text/html') }
    }
    // The grid's own focus target gets the markup; an element an application
    // drew inside a cell does not, though the grid's handler took its copy too.
    expect(copy(cell).html).toContain('<table>')
    const inside = document.createElement('span')
    cell.append(inside)
    const nested = copy(inside)
    expect(nested.text).not.toBe('')
    expect(nested.html).toBe('')
    // A copy nothing took (an editor's, or one with no range) gains none.
    const untaken = new DataTransfer()
    untaken.setData('text/plain', 'a\tb')
    const event = new ClipboardEvent('copy', { clipboardData: untaken, bubbles: true })
    grid.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(untaken.getData('text/html')).toBe('')
    // A handler that wrote its own HTML first keeps it.
    const writes = (event: Event) =>
      (event as ClipboardEvent).clipboardData!.setData('text/html', '<p>theirs</p>')
    grid.addEventListener('copy', writes, { capture: true })
    expect(copy(cell).html).toBe('<p>theirs</p>')
  } finally {
    await handle.dispose()
  }
})

const expectCells = async (cell: (row: string, column: 'name' | 'note') => HTMLElement | null) => {
  await vi.waitFor(() => expect(cell('r1', 'note')).not.toBeNull())
}
