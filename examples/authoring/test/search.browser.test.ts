/**
 * The search field on a real page: what a person sees and where focus is after
 * each key. Two instances share the page and none of their ids.
 */
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { Style } from 'foldkit-mixins'
import { mountSearch } from '../src/search/mount.js'
import { pageStylesheet } from '../src/style.js'

let handles: Array<{ readonly dispose: () => void }> = []

const mount = (id: string) => {
  const container = document.createElement('div')
  container.id = `host-${id}`
  document.body.appendChild(container)
  handles.push(mountSearch(container, id))
}

beforeEach(() => {
  Style.install(pageStylesheet)
})

afterEach(() => {
  for (const handle of handles) handle.dispose()
  handles = []
  document.body.replaceChildren()
})

const input = (id: string) => document.getElementById(`${id}:input`) as HTMLInputElement
const options = (id: string) =>
  Array.from(document.querySelectorAll<HTMLElement>(`#${CSS.escape(`${id}:list`)} [role="option"]`))

test('typing lists the matches, and the arrows move the current one without moving focus', async () => {
  mount('a')
  await vi.waitFor(() => expect(input('a')).not.toBeNull())
  await userEvent.click(page.getByRole('combobox'))
  await userEvent.keyboard('ap')
  await vi.waitFor(() => expect(options('a').map(o => o.textContent)).toEqual(['apple', 'apricot']))
  expect(input('a').hasAttribute('aria-activedescendant')).toBe(false)
  await userEvent.keyboard('{ArrowDown}')
  await vi.waitFor(() => expect(options('a')[0]!.hasAttribute('data-active')).toBe(true))
  await userEvent.keyboard('{ArrowDown}')
  await vi.waitFor(() => expect(options('a')[1]!.hasAttribute('data-active')).toBe(true))
  expect(input('a').getAttribute('aria-activedescendant')).toBe(options('a')[1]!.id)
  expect(document.activeElement).toBe(input('a'))
})

test('Enter picks the current result and closes the list', async () => {
  mount('a')
  await vi.waitFor(() => expect(input('a')).not.toBeNull())
  input('a').focus()
  await userEvent.keyboard('ap')
  await vi.waitFor(() => expect(options('a')).toHaveLength(2))
  // A key meets the page as last drawn, so each waits for the frame the one before caused.
  await userEvent.keyboard('{ArrowDown}')
  await vi.waitFor(() => expect(options('a')[0]!.hasAttribute('data-active')).toBe(true))
  await userEvent.keyboard('{ArrowDown}')
  await vi.waitFor(() => expect(options('a')[1]!.hasAttribute('data-active')).toBe(true))
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(input('a').value).toBe('apricot'))
  expect(options('a')).toHaveLength(0)
  expect(document.querySelector('[role="status"]')!.textContent).toBe('Picked apricot.')
  expect(document.activeElement).toBe(input('a'))
})

test('Escape clears what was typed, and the clear button does too, leaving focus in the input', async () => {
  mount('a')
  await vi.waitFor(() => expect(input('a')).not.toBeNull())
  input('a').focus()
  await userEvent.keyboard('ban')
  await vi.waitFor(() => expect(options('a')).toHaveLength(1))
  await userEvent.keyboard('{Escape}')
  await vi.waitFor(() => expect(input('a').value).toBe(''))
  expect(document.activeElement).toBe(input('a'))

  await userEvent.keyboard('che')
  const clear = await vi.waitFor(() => {
    const found = document.querySelector<HTMLElement>('button[aria-label="Clear search"]')
    expect(found).not.toBeNull()
    return found!
  })
  clear.focus()
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(input('a').value).toBe(''))
  // The button left with the text; focus has to land somewhere the person can type.
  await vi.waitFor(() => expect(document.activeElement).toBe(input('a')))
})

test('two instances on one page share no id and do not touch each other', async () => {
  mount('a')
  mount('b')
  await vi.waitFor(() => expect(input('b')).not.toBeNull())
  input('a').focus()
  await userEvent.keyboard('ap')
  input('b').focus()
  await userEvent.keyboard('bl')
  await vi.waitFor(() =>
    expect(options('b').map(o => o.textContent)).toEqual(['blackberry', 'blueberry']),
  )
  expect(options('a').map(o => o.textContent)).toEqual(['apple', 'apricot'])
  const ids = Array.from(document.querySelectorAll('[id]')).map(element => element.id)
  expect(new Set(ids).size).toBe(ids.length)
})
