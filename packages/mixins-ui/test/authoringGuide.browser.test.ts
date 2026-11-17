/// <reference types="@vitest/browser-playwright" />
/**
 * The guide's chip filter on a real page: the arrows, Space and Enter, where
 * focus goes when a chip or the remove button leaves, the page's own Escape,
 * and the rendered `Conformance.listbox` scenario.
 */
import { afterEach, expect, test, vi } from 'vitest'
import { cdp, userEvent } from 'vitest/browser'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Conformance, Frames } from 'foldkit-mixins/testing'
import { Theme } from 'foldkit-mixins/theme'
import { ChipStyle, mountFilter } from './authoringGuide.js'

const harness = Conformance.harness({ cdp, userEvent })
let handles: Array<{ readonly dispose: () => void }> = []
let frames: ReturnType<typeof Frames.track> | undefined

const mount = (id: string) => {
  frames ??= Frames.track()
  const container = document.createElement('div')
  container.id = `host-${id}`
  document.body.appendChild(container)
  handles.push(mountFilter(container, id))
}

afterEach(() => {
  for (const handle of handles) handle.dispose()
  handles = []
  frames?.dispose()
  frames = undefined
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const chips = () => Array.from(document.querySelectorAll<HTMLElement>('[role="option"]'))
const chip = (id: string) => document.getElementById(id)
const picked = () =>
  chips()
    .filter(each => each.getAttribute('aria-selected') === 'true')
    .map(each => each.textContent)
const removeButton = () => document.querySelector<HTMLButtonElement>('button')

/** Focus on the chip `id`, with its report in the Model: a key sooner meets a Model with no current chip. */
const focusChip = async (id: string) => {
  await vi.waitFor(() => expect(chip(id)).not.toBeNull())
  chip(id)!.focus()
  await frames?.settle()
}

/** A key, then the frame it asked for, as a person pressing at a human pace waits. */
const press = async (keys: string) => {
  await userEvent.keyboard(keys)
  await frames?.settle()
}

test('Tab enters at one chip, the arrows move focus, Space and Enter pick', async () => {
  mount('f')
  await vi.waitFor(() => expect(chips()).toHaveLength(4))
  await press('{Tab}')
  expect(document.activeElement).toBe(chip('f-open'))
  await press('{ArrowRight}')
  expect(document.activeElement).toBe(chip('f-mine'))
  await press(' ')
  await press('{ArrowRight}')
  await press('{Enter}')
  expect(picked()).toEqual(['Mine', 'Urgent'])
  await press('{ArrowLeft}')
  await press(' ')
  expect(picked()).toEqual(['Urgent'])
})

test('Delete hands focus to the next chip at once, and the chip goes when its exit ends', async () => {
  mount('f')
  await focusChip('f-mine')
  await press('{Delete}')
  await vi.waitFor(() => expect(document.activeElement).toBe(chip('f-urgent')))
  expect(chip('f-mine')?.hasAttribute('inert')).toBe(true)
  await vi.waitFor(() => expect(chip('f-mine')).toBeNull())
  expect(chips().map(each => each.textContent)).toEqual(['Open', 'Urgent', 'Stale'])
  expect(document.activeElement).toBe(chip('f-urgent'))
})

test('Backspace on the last chip hands focus to the one before it', async () => {
  mount('f')
  await focusChip('f-stale')
  await press('{Backspace}')
  await vi.waitFor(() => expect(document.activeElement).toBe(chip('f-urgent')))
  await vi.waitFor(() => expect(chip('f-stale')).toBeNull())
})

test('Space mid-word goes to the typeahead, not to the pick', async () => {
  mount('f')
  await focusChip('f-open')
  await press('u')
  expect(document.activeElement).toBe(chip('f-urgent'))
  await press(' ')
  expect(picked()).toEqual([])
})

test('the arrows pass over a chip that is leaving', async () => {
  mount('f')
  await focusChip('f-mine')
  await press('{Delete}')
  await vi.waitFor(() => expect(document.activeElement).toBe(chip('f-urgent')))
  await press('{ArrowLeft}')
  expect(document.activeElement).toBe(chip('f-open'))
})

test("the page's Escape lets go of every pick, and is left alone with none", async () => {
  mount('f')
  await focusChip('f-open')
  await press(' ')
  await press('{ArrowRight}')
  await press(' ')
  expect(picked()).toEqual(['Open', 'Mine'])
  await press('{Escape}')
  expect(picked()).toEqual([])
  const declined = new Promise<boolean>(resolve =>
    document.addEventListener('keydown', event => resolve(event.defaultPrevented), { once: true }),
  )
  await press('{Escape}')
  expect(await declined).toBe(false)
})

test('Remove picked takes the picked chips out, and focus leaves the button for the tab stop', async () => {
  mount('f')
  await focusChip('f-open')
  await press(' ')
  await press('{End}')
  await press(' ')
  await vi.waitFor(() => expect(removeButton()).not.toBeNull())
  await userEvent.click(removeButton()!)
  expect(document.activeElement).toBe(removeButton())
  await vi.waitFor(() => expect(chips().map(each => each.textContent)).toEqual(['Mine', 'Urgent']))
  expect(removeButton()).toBeNull()
  await vi.waitFor(() => expect(document.activeElement).toBe(chip('f-mine')))
})

test('a picked chip is filled under each look: the state rule sits beside the look that sets the same property', async () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent = Style.stylesheet(
    Layers.standard.declare,
    Layers.standard.in('reset', Defaults.reset),
    Layers.standard.in('theme', Theme.root(Theme.standard())),
    ChipStyle,
  )
  document.head.append(sheet)
  mount('f')
  await focusChip('f-open')
  await press(' ')
  const fill = (id: string) => getComputedStyle(chip(id)!).backgroundColor
  expect(fill('f-open')).not.toBe(fill('f-mine'))
  expect(fill('f-open')).not.toBe('rgba(0, 0, 0, 0)')
})

test('two filters on one page share no id', async () => {
  mount('a')
  mount('b')
  await vi.waitFor(() => expect(chips()).toHaveLength(8))
  const ids = Array.from(document.querySelectorAll('[id]')).map(element => element.id)
  expect(new Set(ids).size).toBe(ids.length)
})

test('the filter conforms to the listbox scenario, horizontal', async () => {
  mount('f')
  // The scenario calls `enter` only when no option is drawn, so a list drawn open is focused first.
  await focusChip('f-open')
  const result = await Conformance.listbox(harness, {
    name: 'Filters',
    options: ['Open', 'Mine', 'Urgent', 'Stale'],
    orientation: 'horizontal',
    enter: async () => {
      if (!chips().includes(document.activeElement as HTMLElement)) chips()[0]?.focus()
      await frames?.settle()
    },
  })
  expect(Conformance.failures(result)).toEqual([])
  expect(result.length).toBeGreaterThan(6)
})
