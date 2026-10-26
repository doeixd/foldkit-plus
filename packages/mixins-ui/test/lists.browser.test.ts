/// <reference types="@vitest/browser-playwright" />
/**
 * Command and VirtualList on a real page. With their `overlayBars` beside the
 * style, the browser's bar gives way to a thumb as long as the view is of the
 * list and moving with its scroll (a coarse pointer's is in
 * `lists.touch.browser.test.ts`). A VirtualList in a box sized by its content keeps one width as rows of
 * other widths scroll in. A Command's shortcut reads left to right on a right
 * to left page.
 */
import { afterEach, describe, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { FILES, clearPage, mountCommand, mountList, partsOf, scrollers } from './listPages.js'

afterEach(clearPage)

describe.each(Object.entries(scrollers))('%s overlayBars', (_, { mount, scroller }) => {
  test('give the browser bar way to a thumb as long as the view is of the list', async () => {
    const handle = mount({ bars: true })
    try {
      await vi.waitFor(() =>
        expect(document.querySelector(`${scroller}[data-scroll-overlaid]`)).not.toBeNull(),
      )
      const parts = partsOf(scroller)
      expect(getComputedStyle(parts.scroller).scrollbarWidth).toBe('none')
      // The bars can mark the scroller before a VirtualList has drawn the rows that overflow it.
      await vi.waitFor(() =>
        expect(parts.scroller.scrollHeight).toBeGreaterThan(parts.scroller.clientHeight),
      )
      const length =
        (parts.bar.clientHeight * parts.scroller.clientHeight) / parts.scroller.scrollHeight
      await vi.waitFor(() =>
        expect(parts.thumb.getBoundingClientRect().height).toBeCloseTo(Math.max(20, length), 1),
      )
      // Over the scroller's edge.
      expect(parts.bar.getBoundingClientRect().right).toBeCloseTo(
        parts.scroller.getBoundingClientRect().right,
        1,
      )
    } finally {
      handle.dispose()
    }
  })

  test('show the bar while the list scrolls, and move the thumb with it', async () => {
    const handle = mount({ bars: true })
    try {
      await vi.waitFor(() =>
        expect(document.querySelector(`${scroller}[data-scroll-overlaid]`)).not.toBeNull(),
      )
      const parts = partsOf(scroller)
      await userEvent.hover(document.getElementById('away')!)
      await vi.waitFor(() => expect(getComputedStyle(parts.bar).opacity).toBe('0'), {
        timeout: 3000,
      })
      const top = parts.thumb.getBoundingClientRect().top
      const room = parts.scroller.scrollHeight - parts.scroller.clientHeight
      parts.scroller.scrollTop = room / 2
      await vi.waitFor(() => expect(getComputedStyle(parts.bar).opacity).toBe('1'))
      const travel = parts.bar.clientHeight - parts.thumb.getBoundingClientRect().height
      await vi.waitFor(() =>
        expect(parts.thumb.getBoundingClientRect().top - top).toBeCloseTo(travel / 2, 0),
      )
    } finally {
      handle.dispose()
    }
  })
})

test('a VirtualList sized by its container keeps one width as rows of other widths scroll in', async () => {
  const handle = mountList({ bars: false, holder: 'inline-block' })
  try {
    await vi.waitFor(() => expect(document.querySelectorAll('ul li').length).toBeGreaterThan(5))
    const list = document.querySelector<HTMLElement>('ul')!
    const root = list.parentElement!
    const widths = new Set<number>()
    for (const top of [0, 1000, 2000, 5000, 9000, 20000]) {
      list.scrollTop = top
      // Drawn once the list has followed the scroll: the row at its top is among the rows.
      await vi.waitFor(() =>
        expect(Array.from(list.querySelectorAll('li span'), span => span.textContent)).toContain(
          FILES[Math.floor(top / 36)],
        ),
      )
      widths.add(root.getBoundingClientRect().width)
    }
    expect([...widths]).toHaveLength(1)
    // A width of its own, not none: the rows' text has room.
    expect([...widths][0]).toBeGreaterThan(200)
  } finally {
    handle.dispose()
  }
})

test("a Command's shortcut reads left to right on a right to left page", async () => {
  document.documentElement.dir = 'rtl'
  const handle = mountCommand({ bars: false })
  try {
    await vi.waitFor(() => expect(document.getElementById('palette-new')).not.toBeNull())
    const keys = [...document.querySelectorAll('#palette-new kbd kbd')]
    const at = (index: number) => keys[index]!.getBoundingClientRect().left
    expect(keys.map(key => key.textContent)).toEqual(['⌘', 'N'])
    expect(at(0)).toBeLessThan(at(1))
    // Still at the row's end, which right to left is its left.
    const row = document.getElementById('palette-new')!.getBoundingClientRect()
    expect(at(0) - row.left).toBeLessThan(row.width / 2)
  } finally {
    handle.dispose()
  }
})
