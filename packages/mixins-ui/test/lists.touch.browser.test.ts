/**
 * Command and VirtualList with their `overlayBars` under a coarse pointer, in
 * the `browser-touch` project, whose page is a touch screen from the start:
 * the browser keeps its bar.
 */
import { afterEach, describe, expect, test, vi } from 'vitest'
import { clearPage, partsOf, scrollers } from './listPages.js'

afterEach(clearPage)

describe.each(Object.entries(scrollers))('%s overlayBars', (_, { mount, scroller }) => {
  test('leave a coarse pointer the browser bar', async () => {
    const handle = mount({ bars: true })
    try {
      expect(matchMedia('(pointer: coarse)').matches).toBe(true)
      await vi.waitFor(() => expect(document.querySelector(scroller)).not.toBeNull())
      // Long past the frame a Mount that ran would have marked the scroller in.
      await new Promise(resolve => setTimeout(resolve, 100))
      const parts = partsOf(scroller)
      expect(parts.scroller.hasAttribute('data-scroll-overlaid')).toBe(false)
      expect(getComputedStyle(parts.scroller).scrollbarWidth).not.toBe('none')
      expect(getComputedStyle(parts.bar).display).toBe('none')
    } finally {
      handle.dispose()
    }
  })
})
