/// <reference types="@vitest/browser-playwright" />
/**
 * Renaming titles in place on a real page: Enter commits and Escape cancels
 * with focus back on the title, and a value the Model refuses keeps the editor
 * open on what was typed, with the reason, until it is corrected or cancelled.
 */
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Style } from 'foldkit-mixins'
import { BLANK, TAKEN } from '../src/inline-edit/app.js'
import { mountInlineEdit } from '../src/inline-edit/mount.js'
import { pageStylesheet } from '../src/style.js'

let handle: { readonly dispose: () => void } | undefined

beforeEach(async () => {
  Style.install(pageStylesheet)
  const container = document.createElement('div')
  container.id = 'inline-edit-host'
  document.body.appendChild(container)
  handle = mountInlineEdit(container)
  await vi.waitFor(() => expect(titles()).toHaveLength(3))
})

afterEach(() => {
  handle?.dispose()
  handle = undefined
  document.body.replaceChildren()
})

const titles = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[role="list"] > li')).map(
    row => row.querySelector('button, input')?.textContent ?? '',
  )
const display = (text: string) =>
  Array.from(document.querySelectorAll<HTMLElement>('button[id^="titles-display-"]')).find(
    button => button.textContent === text,
  )!
const field = () => document.querySelector<HTMLInputElement>('input')
const reason = () => document.querySelector('p')?.textContent ?? null

const edit = async (text: string) => {
  display(text).focus()
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(document.activeElement).toBe(field()))
  expect(field()).not.toBeNull()
}

test('Enter opens the field on the title with its text selected, and Enter commits with focus back on the title', async () => {
  await edit('Ship it')
  expect(field()!.value).toBe('Ship it')
  expect(field()!.selectionStart).toBe(0)
  expect(field()!.selectionEnd).toBe('Ship it'.length)
  await userEvent.keyboard('Ship it today{Enter}')
  await vi.waitFor(() => expect(field()).toBeNull())
  expect(Array.from(document.querySelectorAll('li button')).map(b => b.textContent)).toContain(
    'Ship it today',
  )
  await vi.waitFor(() => expect(document.activeElement).toBe(display('Ship it today')))
})

test('Escape closes the field, keeps the old title and returns focus to it', async () => {
  await edit('Ship it')
  await userEvent.keyboard('something else{Escape}')
  await vi.waitFor(() => expect(field()).toBeNull())
  await vi.waitFor(() => expect(document.activeElement).toBe(display('Ship it')))
  expect(reason()).toBeNull()
})

test('a blank title is refused: the field stays open and focused with the reason, and typing clears it', async () => {
  await edit('Ship it')
  await userEvent.keyboard('{Backspace}{Enter}')
  await vi.waitFor(() => expect(reason()).toBe(BLANK))
  expect(field()).not.toBeNull()
  expect(field()!.value).toBe('')
  expect(field()!.getAttribute('aria-invalid')).toBe('true')
  expect(field()!.getAttribute('aria-describedby')).toBe(document.querySelector('p')!.id)
  expect(document.activeElement).toBe(field())
  await userEvent.keyboard('Done')
  await vi.waitFor(() => expect(reason()).toBeNull())
  expect(field()!.hasAttribute('aria-invalid')).toBe(false)
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(display('Done')).toBeDefined())
  await vi.waitFor(() => expect(document.activeElement).toBe(display('Done')))
})

test('a duplicate title is refused with what was typed kept, and Escape then restores the title', async () => {
  await edit('Ship it')
  await userEvent.keyboard('write the GUIDE{Enter}')
  await vi.waitFor(() => expect(reason()).toBe(TAKEN))
  expect(field()!.value).toBe('write the GUIDE')
  expect(document.activeElement).toBe(field())
  await userEvent.keyboard('{Escape}')
  await vi.waitFor(() => expect(field()).toBeNull())
  expect(reason()).toBeNull()
  await vi.waitFor(() => expect(document.activeElement).toBe(display('Ship it')))
})

test('a title left as it was commits nothing and leaves no reason', async () => {
  await edit('Ship it')
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(field()).toBeNull())
  expect(reason()).toBeNull()
  await vi.waitFor(() => expect(document.activeElement).toBe(display('Ship it')))
})

test('a double click opens the field, and a refused edit of one title leaves the others alone', async () => {
  await userEvent.dblClick(display('Write the guide'))
  await vi.waitFor(() => expect(document.activeElement).toBe(field()))
  await userEvent.keyboard('ship it{Enter}')
  await vi.waitFor(() => expect(reason()).toBe(TAKEN))
  expect(document.querySelectorAll('input')).toHaveLength(1)
  expect(display('Review the pull request')).toBeDefined()
})
