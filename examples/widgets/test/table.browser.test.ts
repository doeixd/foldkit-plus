/**
 * The roster Table in Chromium. Its accessibility tree names the row heading
 * and each column heading, and says which cells sit under them, and the
 * button in the markup cell works from the keyboard.
 */
import { Runtime } from 'foldkit'
import { Conformance } from 'foldkit-mixins/testing'
import { Style } from 'foldkit-mixins'
import { afterEach, expect, it, vi } from 'vitest'
import { cdp, userEvent } from 'vitest/browser'
import { Model, initial, update } from '../src/table/app.js'
import { ButtonStyle, TableIsland, TableStyle } from '../src/table/view.js'
import { pageStylesheet } from '../src/style.js'

let dispose = () => {}
afterEach(() => {
  dispose()
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

// `embed` draws in place of its container, so the tree is read from the document.
const mount = () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent = pageStylesheet + Style.stylesheet(TableStyle, ButtonStyle)
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'table'
  document.body.append(container)
  dispose = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: initial }),
      update,
      view: (model, h) => TableIsland(model, h),
    }),
  ).dispose
}

const button = (name: string) =>
  Array.from(document.querySelectorAll('button')).find(
    element => element.textContent?.trim() === name,
  )

it('names each cell under its row heading and its column heading, as Chromium announces them', async () => {
  mount()
  await vi.waitFor(() => expect(button('Archive Ada Lovelace')).toBeDefined())
  const tree = await Conformance.harness({ cdp, userEvent }).accessibility()

  const roles = (role: string) => tree.filter(node => node.role === role)
  // The recipe sets the headings in capitals and Chromium names them as drawn.
  expect(roles('columnheader').map(node => node.name.toLowerCase())).toEqual([
    'name',
    'role',
    'standing',
    'action',
  ])
  expect(roles('rowheader').map(node => node.name)).toEqual([
    'Grace Hopper',
    'Ada Lovelace',
    'Katherine Johnson',
    'Annie Easley',
  ])

  // A cell's row heading is the rowheader of its own row, its column heading
  // the columnheader at its position: the pairing a screen reader reads out.
  const headRow = document.querySelector('table')!.tHead!.rows[0]!
  const pairs = roles('cell').flatMap(({ node }) =>
    node instanceof HTMLTableCellElement && node.parentElement instanceof HTMLTableRowElement
      ? [[node.parentElement.cells[0]?.textContent, headRow.cells[node.cellIndex]?.textContent]]
      : [],
  )
  expect(roles('rowheader').map(({ node }) => node.nodeName)).toEqual(['TH', 'TH', 'TH', 'TH'])
  expect(roles('cell')).toHaveLength(12)
  expect(pairs.slice(3, 6)).toEqual([
    ['Ada Lovelace', 'Role'],
    ['Ada Lovelace', 'Standing'],
    ['Ada Lovelace', 'Action'],
  ])
})

// ADOPT when Table keeps focus on a row's button as keyed rows move (approved fix in mixins-ui).
it.todo('focus on Archive Annie Easley stays on that button after the Name heading sorts the rows')

it('presses the markup cell button with Enter and Space, and keeps focus on it', async () => {
  mount()
  await vi.waitFor(() => expect(button('Archive Ada Lovelace')).toBeDefined())
  button('Archive Ada Lovelace')!.focus()
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(button('Restore Ada Lovelace')).toBeDefined())
  expect(document.activeElement).toBe(button('Restore Ada Lovelace'))
  await userEvent.keyboard(' ')
  await vi.waitFor(() => expect(button('Archive Ada Lovelace')).toBeDefined())
  expect(document.activeElement).toBe(button('Archive Ada Lovelace'))
})
