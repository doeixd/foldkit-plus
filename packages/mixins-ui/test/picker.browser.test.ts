/// <reference types="@vitest/browser-playwright" />
/**
 * The Picker in a real browser. On a desktop the Listbox's trigger has a box
 * and the opener none, the panel opens under the trigger, and a choice
 * reaches the application with focus back on the trigger. On a phone it is
 * the other way round: the opener's Sheet stands on the bottom edge across
 * the width, focus starts on the chosen option, the arrow keys, Home and End
 * move it, Enter chooses, and focus comes back to the opener. The breakpoint
 * is the recipe's `sheetBelow`.
 */
import { Option } from 'effect'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import {
  chosen,
  drawn,
  mount,
  opener,
  panel,
  settled,
  sheetOptions,
  trigger,
} from './pickerFixture.js'

let handle: { dispose: () => void } | undefined

afterEach(async () => {
  handle?.dispose()
  handle = undefined
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
  await page.viewport(1440, 900)
})

const focusedId = () => document.activeElement?.id

describe('on a desktop', () => {
  test('the trigger shows and the opener does not', async () => {
    await page.viewport(1280, 800)
    handle = await mount()
    expect(drawn(trigger())).toBe(true)
    expect(drawn(opener())).toBe(false)
    expect(trigger().textContent).toContain('Sort by')
  })

  test('the panel opens under the trigger, and a choice reaches the application', async () => {
    await page.viewport(1280, 800)
    handle = await mount()
    await userEvent.click(trigger())
    const items = await vi.waitFor(() => {
      const found = document.getElementById('sort-listbox-items')
      expect(found).not.toBeNull()
      return found!
    })
    await settled(items)
    const button = trigger().getBoundingClientRect()
    const box = items.getBoundingClientRect()
    expect(box.top).toBeGreaterThanOrEqual(button.bottom - 0.5)
    expect(Math.abs(box.left - button.left)).toBeLessThan(1)
    expect(box.width).toBeGreaterThanOrEqual(button.width - 0.5)
    const price = [...items.querySelectorAll<HTMLElement>('[role="option"]')][1]!
    await userEvent.click(price)
    await vi.waitFor(() => expect(trigger().textContent).toContain('Lowest price'))
    expect(chosen).toEqual(['price'])
    await vi.waitFor(() => expect(focusedId()).toBe('sort-listbox-button'))
  })
})

describe('on a phone', () => {
  test('the opener shows and the trigger does not', async () => {
    await page.viewport(390, 844)
    handle = await mount()
    expect(drawn(trigger())).toBe(false)
    expect(drawn(opener())).toBe(true)
    expect(opener().getAttribute('aria-label')).toBe('Sort: Sort by')
  })

  test('the sheet stands on the bottom edge, its keys move focus, and Enter chooses', async () => {
    await page.viewport(390, 844)
    handle = await mount({}, Option.some('price'))
    await userEvent.click(opener())
    const sheet = await vi.waitFor(() => {
      expect(panel()).not.toBeNull()
      return panel()!
    })
    await settled(sheet)
    const box = sheet.getBoundingClientRect()
    expect(box.left).toBeCloseTo(0, 0)
    expect(box.width).toBeCloseTo(window.innerWidth, 0)
    expect(box.bottom).toBeCloseTo(window.innerHeight, 0)
    const ids = sheetOptions().map(option => option.id)
    // The chosen option first, and only it in the tab order.
    await vi.waitFor(() => expect(focusedId()).toBe(ids[1]))
    expect(sheetOptions().map(option => option.tabIndex)).toEqual([-1, 0, -1])
    expect(sheetOptions().map(option => option.getAttribute('aria-selected'))).toEqual([
      'false',
      'true',
      'false',
    ])
    await userEvent.keyboard('{ArrowDown}')
    await vi.waitFor(() => expect(focusedId()).toBe(ids[2]))
    await userEvent.keyboard('{ArrowDown}')
    expect(focusedId()).toBe(ids[2])
    await userEvent.keyboard('{Home}')
    await vi.waitFor(() => expect(focusedId()).toBe(ids[0]))
    await userEvent.keyboard('{End}')
    await vi.waitFor(() => expect(focusedId()).toBe(ids[2]))
    await userEvent.keyboard('{ArrowUp}')
    await vi.waitFor(() => expect(focusedId()).toBe(ids[1]))
    await userEvent.keyboard('{ArrowUp}')
    await vi.waitFor(() => expect(focusedId()).toBe(ids[0]))
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(panel()).toBeNull())
    expect(chosen).toEqual(['relevance'])
    expect(opener().textContent).toContain('Most relevant')
    await vi.waitFor(() => expect(document.activeElement).toBe(opener()))
  })

  test('opened with nothing chosen, focus starts on the first option', async () => {
    await page.viewport(390, 844)
    handle = await mount()
    await userEvent.click(opener())
    await vi.waitFor(() => expect(focusedId()).toBe(sheetOptions()[0]?.id))
  })
})

test.each([
  ['md', 800, false],
  ['lg', 800, true],
  ['sm', 700, false],
  ['md', 700, true],
] as const)('with sheetBelow %s at %ipx the opener shows: %s', async (below, width, sheet) => {
  await page.viewport(width, 800)
  handle = await mount({ sheetBelow: below })
  expect(drawn(opener())).toBe(sheet)
  expect(drawn(trigger())).toBe(!sheet)
})
