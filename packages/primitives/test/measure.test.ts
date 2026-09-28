// @vitest-environment jsdom
/**
 * Measure where the browser lacks an observer it needs: nothing it began is
 * left behind to measure later. Measuring itself is `measure.browser.test.ts`.
 */
import { Effect, Fiber, Stream } from 'effect'
import * as Mount from 'foldkit/mount'
import { afterEach, expect, it, vi } from 'vitest'
import { Measure } from '../src/dom/index.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

it('attaches nothing when there is no ResizeObserver', async () => {
  vi.stubGlobal('ResizeObserver', undefined)
  const frames = vi.fn()
  vi.stubGlobal('requestAnimationFrame', frames)
  const container = document.createElement('div')
  document.body.append(container)
  const fiber = Effect.runFork(
    Stream.runDrain(
      Measure({ targets: { chosen: '.chosen' } }).f(container, Mount.liveViewStateChanges),
    ),
  )
  try {
    await new Promise(resolve => setTimeout(resolve, 10))
    // A change the Mount would have measured again asks for no frame.
    container.append(document.createElement('p'))
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(frames).not.toHaveBeenCalled()
  } finally {
    await Effect.runPromise(Fiber.interrupt(fiber))
    container.remove()
  }
})
