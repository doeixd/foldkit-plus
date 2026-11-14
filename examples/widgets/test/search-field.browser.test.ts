import * as Runtime from 'foldkit/runtime'
import { Style } from 'foldkit-mixins'
import { afterEach, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Model, initial, update } from '../src/search-field/app.js'
import { SearchFieldIsland, SearchPageSlots } from '../src/search-field/demo.js'
import { FieldStyle, SearchSlots } from '../src/search-field/view.js'
import { pageStylesheet, searchFieldStyle, searchPageStyle } from '../src/style.js'

let dispose = () => {}
afterEach(() => {
  dispose()
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

// The page's own sheet: an empty clear button has no size without its recipe.
const drawSheet = () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    pageStylesheet +
    Style.stylesheet(searchPageStyle(SearchPageSlots), searchFieldStyle(SearchSlots), FieldStyle)
  document.head.append(sheet)
}

const input = (placement: string) =>
  document.querySelector<HTMLInputElement>(`#${placement}-input`)!
const results = (placement: string) => document.getElementById(`${placement}-results`)

it('opens and clears each routed search independently in a real browser', async () => {
  drawSheet()
  const container = document.createElement('div')
  container.id = 'search-fields'
  document.body.append(container)
  dispose = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: initial }),
      update,
      view: SearchFieldIsland,
    }),
  ).dispose

  await vi.waitFor(() => expect(document.querySelector('#first-input')).not.toBeNull())
  input('first').focus()
  await userEvent.keyboard('alpha')
  await vi.waitFor(() => expect(input('first').value).toBe('alpha'))
  await userEvent.keyboard('{ArrowDown}')
  await vi.waitFor(() => expect(results('first')?.textContent).toBe('Results for alpha'))
  expect(results('second')).toBeNull()

  input('second').focus()
  await userEvent.keyboard('beta')
  await vi.waitFor(() => expect(input('second').value).toBe('beta'))
  await userEvent.keyboard('{Shift>}{ArrowDown}{/Shift}')
  expect(results('second')).toBeNull()
  await userEvent.keyboard('{Escape}')
  await vi.waitFor(() => expect(input('second').value).toBe(''))
  expect(input('first').value).toBe('alpha')
  expect(results('first')).not.toBeNull()

  input('first').focus()
  await userEvent.keyboard('{Escape}')
  await vi.waitFor(() => expect(results('first')).toBeNull())
  expect(input('first').value).toBe('')
})

it('draws the description the assembly gives, and a pressed clear button returns focus', async () => {
  drawSheet()
  const container = document.createElement('div')
  container.id = 'search-fields'
  document.body.append(container)
  dispose = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: initial }),
      update,
      view: SearchFieldIsland,
    }),
  ).dispose
  await vi.waitFor(() => expect(document.querySelector('#first-input')).not.toBeNull())
  expect(document.getElementById('search-inspection')?.textContent).toContain('SearchField')
  input('second').focus()
  await userEvent.keyboard('beta')
  const clear = await vi.waitFor(() => {
    const button = document.getElementById('second-clear')
    expect(button).not.toBeNull()
    return button!
  })
  await userEvent.click(clear)
  await vi.waitFor(() => expect(input('second').value).toBe(''))
  await vi.waitFor(() => expect(document.activeElement).toBe(input('second')))
})
