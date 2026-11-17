/// <reference types="@vitest/browser-playwright" />
/**
 * The list on a real page: dismiss with focus recovery and a row that takes no
 * click while it leaves, editing in place with focus back on its button, and
 * the keyboard path of Reorder with focus staying on the held row.
 */
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cdp, userEvent } from 'vitest/browser'
import { Option } from 'effect'
import { Style } from 'foldkit-mixins'
import { DURATION_MS, type Item } from '../src/list/app.js'
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

const item = (id: string, title: string, parent?: string): Item => ({
  id,
  title,
  parent: Option.fromUndefinedOr(parent),
})

// The default list stays on the page, so a test that seeds its own replaces it first.
const remount = async (options: Parameters<typeof mountList>[1]) => {
  handle?.dispose()
  document.body.replaceChildren()
  const container = document.createElement('div')
  container.id = 'list-host'
  document.body.appendChild(container)
  handle = mountList(container, options)
  await vi.waitFor(() => expect(rows().length).toBeGreaterThan(0))
}

test('a dismissed child hands focus to the row that holds it, ahead of its next sibling', async () => {
  await remount({
    items: [
      item('parent', 'Parent task'),
      item('child-1', 'First child', 'parent'),
      item('child-2', 'Second child', 'parent'),
    ],
  })
  button('Dismiss First child').focus()
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(document.activeElement).toBe(button('Dismiss Parent task')))
  await vi.waitFor(() => expect(titles()).toEqual(['Parent task', 'Second child']))
  // A row with no parent still goes to its neighbour.
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(document.activeElement).toBe(button('Dismiss Second child')))
})

test('ids holding colons and brackets are found for the editor, its way back, and the fallbacks', async () => {
  await remount({ items: [item('a:[1]:x', 'Odd one'), item('a:[2]:x', 'Odd two')] })
  button('Edit Odd two').focus()
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(document.activeElement).toBe(document.querySelector('input')))
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(document.activeElement).toBe(button('Edit Odd two')))

  button('Dismiss Odd two').focus()
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(document.activeElement).toBe(button('Dismiss Odd one')))
  await vi.waitFor(() => expect(titles()).toEqual(['Odd one']))
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(document.activeElement?.textContent).toBe('Add item'))
})

test('two rows dismissed back to back both leave, and focus lands on the one that is left', async () => {
  button('Dismiss Write the guide').focus()
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() =>
    expect(document.activeElement).toBe(button('Dismiss Review the pull request')),
  )
  // Focus moved at once, so the first exit is still running when the second row is dismissed.
  const leaving = () => rows().filter(row => row.getAttribute('data-presence') === 'hiding')
  expect(leaving()).toHaveLength(1)
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(document.activeElement).toBe(button('Dismiss Ship it')))
  await vi.waitFor(() => expect(titles()).toEqual(['Ship it']))
  expect(document.activeElement).toBe(button('Dismiss Ship it'))
})

test('under reduced motion a dismissed row leaves at once', async () => {
  const reduce = async (value: 'reduce' | 'no-preference') =>
    cdp().send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value }],
    })
  // A control for the clock: with full motion the same dismissal takes the whole exit.
  const leaves = async (name: string) => {
    let pressed = 0
    document.addEventListener('keydown', () => (pressed = performance.now()), {
      capture: true,
      once: true,
    })
    button(name).focus()
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(titles()).toHaveLength(name.includes('Ship') ? 1 : 2))
    return performance.now() - pressed
  }
  await reduce('no-preference')
  expect(await leaves('Dismiss Review the pull request')).toBeGreaterThanOrEqual(DURATION_MS)
  await reduce('reduce')
  try {
    expect(await leaves('Dismiss Ship it')).toBeLessThan(DURATION_MS)
  } finally {
    await cdp().send('Emulation.setEmulatedMedia', { features: [] })
  }
})

test('two lists on one page recover focus and return it each in its own list', async () => {
  const container = document.createElement('div')
  container.id = 'list-host-b'
  document.body.appendChild(container)
  const second = mountList(container, { id: 'second' })
  const first = handle
  handle = { dispose: () => (first?.dispose(), second.dispose()) }
  await vi.waitFor(() => expect(document.querySelectorAll('[role="list"]')).toHaveLength(2))
  const [one, two] = Array.from(document.querySelectorAll<HTMLElement>('[role="list"]'))
  const inside = (list: HTMLElement, name: string) =>
    list.querySelector<HTMLElement>(`button[aria-label="${name}"]`)!
  inside(two!, 'Dismiss Review the pull request').focus()
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(document.activeElement).toBe(inside(two!, 'Dismiss Ship it')))
  await vi.waitFor(() => expect(two!.querySelectorAll('li')).toHaveLength(2))
  expect(one!.querySelectorAll('li')).toHaveLength(3)

  // The editor and the Edit button it hands focus back to are found by id.
  inside(two!, 'Edit Ship it').focus()
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(document.activeElement).toBe(two!.querySelector('input')))
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(document.activeElement).toBe(inside(two!, 'Edit Ship it')))
  const ids = Array.from(document.querySelectorAll('[id]')).map(element => element.id)
  expect(new Set(ids).size).toBe(ids.length)
})
