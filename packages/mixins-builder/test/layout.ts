import { vi } from 'vitest'

/**
 * What the canvas's `Measure` makes before it measures, and jsdom lacks: a
 * ResizeObserver and `document.fonts`. Without them its Mount fails, and the
 * canvas's other Behaviors, merged into the same Mount, fail with it: a click
 * selects nothing and a drag moves nothing. Nothing is laid out here, so they
 * observe nothing; `vi.unstubAllGlobals` takes the ResizeObserver back.
 */
export const observeLayout = (): void => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  Object.defineProperty(document, 'fonts', { configurable: true, value: new EventTarget() })
}
