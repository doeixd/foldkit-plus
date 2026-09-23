// @vitest-environment jsdom
/**
 * Phase 2: the browser starts from the server's Model. Its own `init` never
 * runs, the server's DOM is adopted, the page works, and nothing outside the
 * plan's slice is in the page.
 */
import { Effect } from 'effect'
import { FOLDKIT_APP_ATTRIBUTE, FOLDKIT_FLAGS_ATTRIBUTE } from 'foldkit/experimental/server'
import { expect, it, vi } from 'vitest'
import { SSR } from 'foldkit-ssr'
import { calls, config, load, plan, settle, template } from './handoverFixture.js'

it('hands the Model over instead of running init again', async () => {
  const served = SSR.page(
    template,
    await Effect.runPromise(SSR.render(config, plan, { buildId: 'b' })),
  )
  expect(calls.init).toBe(1)
  expect(served).not.toContain('HUGE')
  expect(served).not.toContain(FOLDKIT_FLAGS_ATTRIBUTE)

  load(served)
  const button = document.getElementById('count')
  // Pins the attribute this package reads before the payload, which Foldkit
  // does not export: it must be the one Foldkit's server stamps.
  expect(
    document.querySelector(`[${FOLDKIT_APP_ATTRIBUTE}]`)?.getAttribute('data-foldkit-build'),
  ).toBe('b')

  SSR.hydrate(config, plan, { buildId: 'b' })
  await settle()

  expect(calls.init).toBe(1)
  expect(document.getElementById('count')).toBe(button)
  expect(button?.textContent).toBe('41')
  button!.click()
  await vi.waitFor(() => expect(button?.textContent).toBe('42'))
})
