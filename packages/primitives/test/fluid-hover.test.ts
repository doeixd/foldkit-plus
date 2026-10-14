// @vitest-environment jsdom
/**
 * FluidHover where there is no layout: it starts, so a view drawn in jsdom
 * runs its other Mounts and tests undisturbed. Following the pointer is
 * `fluid-hover.browser.test.ts`.
 */
import { Effect, Fiber, Stream } from 'effect'
import { liveViewStateChanges } from 'foldkit/mount'
import { expect, it, vi } from 'vitest'
import { FluidHover, fluidHovered } from '../src/dom/index.js'

it('starts without a ResizeObserver, and stops cleanly', async () => {
  expect(typeof ResizeObserver).toBe('undefined')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const fiber = Effect.runFork(
    Stream.runDrain(
      FluidHover({ name: 'hover', item: '[data-item]', axis: 'y', gapClick: false }).f(
        container,
        liveViewStateChanges,
      ),
    ),
  )
  await vi.waitFor(() =>
    expect(container.style.getPropertyValue(fluidHovered('hover').shown)).toBe('0'),
  )
  await Effect.runPromise(Fiber.interrupt(fiber))
  container.remove()
})
