/// <reference types="@vitest/browser-playwright" />
/**
 * The popup on a real page: open, arrow, pick, dismiss, and where focus is after
 * each. Then the rendered `Conformance.listbox` scenario over the same view.
 */
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cdp, userEvent } from 'vitest/browser'
import { Style } from 'foldkit-mixins'
import { Conformance, Frames } from 'foldkit-mixins/testing'
import { mountPopup } from '../src/popup/mount.js'
import { pageStylesheet } from '../src/style.js'

const harness = Conformance.harness({ cdp, userEvent })
let handles: Array<{ readonly dispose: () => void }> = []
let frames: ReturnType<typeof Frames.track> | undefined

const mount = (id: string) => {
  frames ??= Frames.track()
  const container = document.createElement('div')
  container.id = `host-${id}`
  document.body.appendChild(container)
  handles.push(mountPopup(container, id))
}

beforeEach(() => {
  Style.install(pageStylesheet)
})

afterEach(() => {
  for (const handle of handles) handle.dispose()
  handles = []
  frames?.dispose()
  frames = undefined
  document.body.replaceChildren()
})

const trigger = (id: string) => document.getElementById(`${id}:trigger`) as HTMLButtonElement
const options = () => Array.from(document.querySelectorAll<HTMLElement>('[role="option"]'))
const names = () => options().map(option => option.textContent)

const open = async (id: string) => {
  await vi.waitFor(() => expect(trigger(id)).not.toBeNull())
  await userEvent.click(trigger(id))
  await vi.waitFor(() => expect(options()).toHaveLength(4))
  await vi.waitFor(() =>
    expect(options().includes(document.activeElement as HTMLElement)).toBe(true),
  )
  // Focus reached the first option, and its report reaches the Model a frame later: a key sooner meets a Model that has no current item.
  await frames?.settle()
}

test('a click opens it and focus lands on the first enabled option', async () => {
  mount('a')
  await open('a')
  expect(trigger('a').getAttribute('aria-expanded')).toBe('true')
  await vi.waitFor(() => expect(document.activeElement).toBe(options()[0]))
})

test('the arrows skip the disabled option, Enter picks, and focus returns to the trigger', async () => {
  mount('a')
  await open('a')
  await vi.waitFor(() => expect(document.activeElement).toBe(options()[0]))
  await userEvent.keyboard('{ArrowDown}')
  await vi.waitFor(() => expect(document.activeElement).toBe(options()[2]))
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(options()).toHaveLength(0))
  expect(trigger('a').textContent).toBe('Overnight')
  await vi.waitFor(() => expect(document.activeElement).toBe(trigger('a')))
})

test('Escape closes without choosing and focus returns to the trigger', async () => {
  mount('a')
  await open('a')
  await userEvent.keyboard('{Escape}')
  await vi.waitFor(() => expect(options()).toHaveLength(0))
  expect(trigger('a').textContent).toBe('Choose')
  await vi.waitFor(() => expect(document.activeElement).toBe(trigger('a')))
})

test('a press outside closes it, and a click on the disabled option does nothing', async () => {
  mount('a')
  await open('a')
  options()[1]!.click()
  await new Promise(done => setTimeout(done, 100))
  expect(options()).toHaveLength(4)
  expect(trigger('a').textContent).toBe('Choose')
  document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  await vi.waitFor(() => expect(options()).toHaveLength(0))
})

test('ArrowDown on the trigger opens it', async () => {
  mount('a')
  await vi.waitFor(() => expect(trigger('a')).not.toBeNull())
  trigger('a').focus()
  await userEvent.keyboard('{ArrowDown}')
  await vi.waitFor(() => expect(options()).toHaveLength(4))
})

test('two popups on one page: opening one leaves the other shut, and no id is shared', async () => {
  mount('a')
  mount('b')
  await open('b')
  expect(trigger('a').getAttribute('aria-expanded')).toBe('false')
  const ids = Array.from(document.querySelectorAll('[id]')).map(element => element.id)
  expect(new Set(ids).size).toBe(ids.length)
  expect(names()).toEqual(['Hourly', 'Daily', 'Overnight', 'Weekly'])
})

test('the popup conforms to the listbox scenario', async () => {
  mount('a')
  await vi.waitFor(() => expect(trigger('a')).not.toBeNull())
  const result = await Conformance.listbox(harness, {
    name: 'Frequency',
    options: ['Hourly', 'Daily', 'Overnight', 'Weekly'],
    disabled: 'Daily',
    enter: async () => {
      if (options().length === 0) await userEvent.click(trigger('a'))
      await vi.waitFor(() => expect(options()).toHaveLength(4))
      await vi.waitFor(() =>
        expect(options().includes(document.activeElement as HTMLElement)).toBe(true),
      )
    },
  })
  expect(Conformance.failures(result)).toEqual([])
  expect(result.length).toBeGreaterThan(8)
})
