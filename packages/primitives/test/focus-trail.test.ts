// @vitest-environment jsdom
/**
 * Only `FocusReturn` follows the focus trail: a page with a `FocusScope` or a
 * `FocusRecovery` alone installs no document listener.
 */
import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
})

const focusListenersAfter = async (load: () => Promise<unknown>) => {
  const added = vi.spyOn(document, 'addEventListener')
  await load()
  return added.mock.calls.filter(([type]) => type === 'focusin').length
}

it('a FocusScope or FocusRecovery page installs no focus trail', async () => {
  expect(
    await focusListenersAfter(async () => {
      await import('../src/dom/focus-scope.js')
      await import('../src/dom/focus-recovery.js')
    }),
  ).toBe(0)
})

it('FocusReturn installs it as its module loads', async () => {
  expect(await focusListenersAfter(() => import('../src/dom/focus-return.js'))).toBe(1)
})
