// @vitest-environment jsdom
/**
 * Phase 2: a page from another build is refused by Foldkit before its payload
 * is read, as Foldkit refuses one. The envelope of another deployment is not
 * decoded by this one.
 */
import { Effect } from 'effect'
import { expect, it, vi } from 'vitest'
import { SSR } from 'foldkit-ssr'
import { calls, config, load, plan, template } from './handoverFixture.js'

it('refuses a page served by another build without reading its envelope', async () => {
  load(SSR.page(template, await Effect.runPromise(SSR.render(config, plan, { buildId: 'old' }))))
  // Decoding would reach the plan's Schema through its codec: watch for that.
  const decoded = vi.spyOn(plan.state, 'set')
  calls.init = 0

  SSR.hydrate(config, plan, { buildId: 'new' })
  await vi.waitFor(() => expect(document.body.inert).toBe(true))
  expect(calls.init).toBe(0)
  expect(decoded).not.toHaveBeenCalled()
})
