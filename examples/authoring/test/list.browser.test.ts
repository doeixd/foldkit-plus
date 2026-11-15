/// <reference types="@vitest/browser-playwright" />
/**
 * The list on a real page: dismiss with focus recovery and a row that takes no
 * click while it leaves, editing in place with focus back on its button, and
 * the keyboard path of Reorder with focus staying on the held row.
 */
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cdp, userEvent } from 'vitest/browser'
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

afterEach(async () => {
  await cdp().send('Emulation.setCPUThrottlingRate', { rate: 1 })
  handle?.dispose()
  handle = undefined
  document.body.replaceChildren()
})

const rows = () => Array.from(document.querySelectorAll<HTMLElement>('[role="list"] > li'))
const titles = () => rows().map(row => row.querySelector('span')?.textContent ?? '')
const button = (name: string) =>
  document.querySelector<HTMLElement>(`button[aria-label="${name}"]`)!

test('dismissing a row hands focus to the next row at once, makes it inert while it leaves, then removes it', async () => {
  button('Dismiss Review the pull request').focus()
  await userEvent.keyboard('{Enter}')
  // The frame that draws the leave also moves focus: nothing waits for the removal.
  await vi.waitFor(() => expect(document.activeElement).toBe(button('Dismiss Ship it')))
  const leaving = rows()[1]!
  expect(leaving.hasAttribute('inert')).toBe(true)
  expect(leaving.getAttribute('data-presence')).toBe('hiding')
  await vi.waitFor(() => expect(titles()).toEqual(['Write the guide', 'Ship it']))
  expect(document.activeElement).toBe(button('Dismiss Ship it'))
})

test.each([1, 6, 20])('a leaving row takes no press at CPU throttling %i', async rate => {
  await cdp().send('Emulation.setCPUThrottlingRate', { rate })
  // The press is delivered inside the mutation callback that sees the row turn `hiding`, in
  // the same task as the frame that drew it, so no runner's speed lets the 200ms exit end
  // first. Like a real press it goes to whatever the browser hit-tests at the button's centre:
  // an inert row is not hit, so the click lands elsewhere, and a live Edit button would be hit.
  const pressed = new Promise<{ readonly hit: Element | null; readonly edit: Element }>(
    (resolve, reject) => {
      const watch = new MutationObserver(() => {
        const leaving = rows()[1]
        if (leaving?.getAttribute('data-presence') !== 'hiding') return
        watch.disconnect()
        const edit = button('Edit Review the pull request')
        const box = edit.getBoundingClientRect()
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
        if (hit instanceof HTMLElement) hit.click()
        resolve({ hit, edit })
      })
      watch.observe(document.body, { subtree: true, attributes: true })
      setTimeout(() => reject(new Error('the row never turned hiding')), 5000)
    },
  )
  button('Dismiss Review the pull request').focus()
  await userEvent.keyboard('{Enter}')
  const { hit, edit } = await pressed
  expect(hit).not.toBe(edit)
  expect(edit.closest('li')?.hasAttribute('inert')).toBe(true)
  await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))
  expect(document.querySelector('input')).toBeNull()
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
  // The drop is also spoken, and the regions are drawn though never seen.
  const spoken = () =>
    Array.from(document.querySelectorAll('[data-foldkit-plus-live]'))
      .map(region => region.textContent)
      .join(' ')
  await vi.waitFor(() => expect(spoken()).toContain('Write the guide'))
  const region = document.querySelector<HTMLElement>('[data-foldkit-plus-live]')!
  expect(region.getBoundingClientRect().width).toBeLessThanOrEqual(1)
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
  document.querySelector<HTMLElement>('button:not([aria-label])')!.click()
  await vi.waitFor(() => expect(titles()).toHaveLength(4))
  expect(titles()[3]).toBe('New item 1')
  button('Dismiss New item 1').focus()
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(rows()[3]!.getAttribute('data-presence')).toBe('hiding'))
  await vi.waitFor(() => expect(titles()).toHaveLength(3))
  expect(titles()).not.toContain('New item 1')
  // The last row left, so focus falls back to the one before it.
  expect(document.activeElement).toBe(button('Dismiss Ship it'))
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
