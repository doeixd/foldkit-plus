// @vitest-environment jsdom
/**
 * ScrollBars where the browser lacks an observer it needs: nothing it began
 * is left behind to mark the scroller later. The bars themselves are
 * `scroll-bars.browser.test.ts`.
 */
import { Effect, Fiber, Stream } from 'effect'
import * as Mount from 'foldkit/mount'
import { afterEach, expect, it, vi } from 'vitest'
import { ScrollBars } from '../src/dom/index.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

it('attaches nothing when there is no ResizeObserver', async () => {
  vi.stubGlobal('matchMedia', (media: string) => ({ matches: true, media }))
  vi.stubGlobal('ResizeObserver', undefined)
  const area = document.createElement('div')
  const scroller = document.createElement('div')
  const bar = document.createElement('div')
  bar.setAttribute('data-scroll-bar', 'block')
  area.append(scroller, bar)
  document.body.append(area)
  const fiber = Effect.runFork(
    Stream.runDrain(ScrollBars({}).f(scroller, Mount.liveViewStateChanges)),
  )
  try {
    await new Promise(resolve => setTimeout(resolve, 10))
    // A scroll the Mount would have shown the bars for marks nothing.
    scroller.dispatchEvent(new Event('scroll'))
    area.dispatchEvent(new Event('pointerenter'))
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(bar.hasAttribute('data-shown')).toBe(false)
    expect(scroller.hasAttribute('data-scroll-overlaid')).toBe(false)
  } finally {
    await Effect.runPromise(Fiber.interrupt(fiber))
    area.remove()
  }
})
