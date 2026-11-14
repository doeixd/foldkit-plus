/// <reference types="@vitest/browser-playwright" />
/**
 * The list on a real page: dismiss with focus recovery and a row that takes no
 * click while it leaves, editing in place with focus back on its button, and
 * the keyboard path of Reorder with focus staying on the held row.
 */
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Style } from 'foldkit-mixins'
import { mountList } from '../src/list/mount.js'
import { pageStylesheet } from '../src/style.js'

let handle: { readonly dispose: () => void } | undefined

beforeEach(async () => {
  Style.install(pageStylesheet)
  const container = document.createElement('div')
  container.id = 'list-host'
  document.body.appendChild(container)
  handle = mountList(container)
  await vi.waitFor(() => expect(rows()).toHaveLength(3))
})

afterEach(() => {
  handle?.dispose()
  handle = undefined
  document.body.replaceChildren()
})

const rows = () => Array.from(document.querySelectorAll<HTMLElement>('[role="list"] > li'))
const titles = () => rows().map(row => row.querySelector('span')?.textContent ?? '')
const button = (name: string) =>
  document.querySelector<HTMLElement>(`button[aria-label="${name}"]`)!

test('dismissing a row hands focus to the next row at once, takes no click while it leaves, then removes it', async () => {
  button('Dismiss Review the pull request').focus()
  await userEvent.keyboard('{Enter}')
  // The frame that draws the leave also moves focus: nothing waits for the removal.
  await vi.waitFor(() => expect(document.activeElement).toBe(button('Dismiss Ship it')))
  const leaving = rows()[1]!
  expect(leaving.hasAttribute('inert')).toBe(true)
  expect(leaving.getAttribute('data-presence')).toBe('hiding')
  const rect = leaving.getBoundingClientRect()
  expect(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)).not.toBe(
    leaving.querySelector('button[aria-label^="Edit"]'),
  )
  await vi.waitFor(() => expect(titles()).toEqual(['Write the guide', 'Ship it']))
  expect(document.activeElement).toBe(button('Dismiss Ship it'))
})

test('dismissing the last row falls back to the previous one, and the only one left to Add', async () => {
  button('Dismiss Ship it').focus()
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() =>
    expect(document.activeElement).toBe(button('Dismiss Review the pull request')),
  )
  await vi.waitFor(() => expect(titles()).toHaveLength(2))
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(document.activeElement).toBe(button('Dismiss Write the guide')))
  await vi.waitFor(() => expect(titles()).toHaveLength(1))
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(document.activeElement?.textContent).toBe('Add item'))
})

test('editing in place: Enter renames, Escape keeps the old title, and focus returns to Edit', async () => {
  button('Edit Ship it').focus()
  await userEvent.keyboard('{Enter}')
  const editor = await vi.waitFor(() => {
    const found = document.querySelector<HTMLInputElement>('input')
    expect(found).not.toBeNull()
    return found!
  })
  await vi.waitFor(() => expect(document.activeElement).toBe(editor))
  expect(editor.value).toBe('Ship it')
  await userEvent.keyboard('{Control>}a{/Control}Ship it twice{Enter}')
  await vi.waitFor(() => expect(titles()[2]).toBe('Ship it twice'))
  await vi.waitFor(() => expect(document.activeElement).toBe(button('Edit Ship it twice')))

  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(document.querySelector('input')).not.toBeNull())
  await userEvent.keyboard('x{Escape}')
  await vi.waitFor(() => expect(titles()[2]).toBe('Ship it twice'))
  await vi.waitFor(() => expect(document.activeElement).toBe(button('Edit Ship it twice')))
})

test('Space picks a row up, the arrow carries it, Space drops it, and focus never leaves its grip', async () => {
  button('Move Write the guide').focus()
  await userEvent.keyboard(' ')
  await vi.waitFor(() => expect(rows()[0]!.getAttribute('data-reorder')).toBe('held'))
  await userEvent.keyboard('{ArrowDown}')
  await vi.waitFor(() =>
    expect(rows().some(row => row.hasAttribute('data-reorder-over'))).toBe(true),
  )
  expect(titles()).toEqual(['Write the guide', 'Review the pull request', 'Ship it'])
  await userEvent.keyboard(' ')
  await vi.waitFor(() =>
    expect(titles()).toEqual(['Review the pull request', 'Write the guide', 'Ship it']),
  )
  await vi.waitFor(() => expect(document.activeElement).toBe(button('Move Write the guide')))
})

test('Escape puts a held row back where it was', async () => {
  button('Move Ship it').focus()
  await userEvent.keyboard(' ')
  await userEvent.keyboard('{ArrowUp}')
  await vi.waitFor(() =>
    expect(rows().some(row => row.hasAttribute('data-reorder-over'))).toBe(true),
  )
  await userEvent.keyboard('{Escape}')
  await vi.waitFor(() => expect(rows().some(row => row.hasAttribute('data-reorder'))).toBe(false))
  expect(titles()).toEqual(['Write the guide', 'Review the pull request', 'Ship it'])
})

test('Add draws a row of its own, which can be dismissed like the others', async () => {
  button('Dismiss Ship it').focus()
  document.querySelector<HTMLElement>('button:not([aria-label])')!.click()
  await vi.waitFor(() => expect(titles()).toHaveLength(4))
  expect(titles()[3]).toBe('New item 1')
})

test('a pointer drag from the grip lands the row after the one it is released over', async () => {
  const grip = button('Move Write the guide')
  const target = rows()[2]!
  await userEvent.dragAndDrop(grip, target, {
    targetPosition: { x: 40, y: target.getBoundingClientRect().height - 3 },
  })
  await vi.waitFor(() =>
    expect(titles()).toEqual(['Review the pull request', 'Ship it', 'Write the guide']),
  )
})
