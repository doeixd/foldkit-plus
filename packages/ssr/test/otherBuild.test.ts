// @vitest-environment jsdom
/**
 * Phase 2: a page from another build is refused by Foldkit before its payload
 * is read, as Foldkit refuses one. The envelope of another deployment is not
 * decoded by this one, and the refusal is reported with both ids: a client
 * and server built with different ids looked like a silent fallback (#210).
 */
import { Effect } from 'effect'
import { expect, it, vi } from 'vitest'
import { Diagnostics, SSR } from 'foldkit-ssr'
import { calls, config, load, plan, template } from './handoverFixture.js'

it('refuses a page served by another build without reading its envelope', async () => {
  load(SSR.page(template, await Effect.runPromise(SSR.render(config, plan, { buildId: 'old' }))))
  // Decoding would reach the plan's Schema through its codec: watch for that.
  const decoded = vi.spyOn(plan.state, 'set')
  const collected = Diagnostics.collect()
  calls.init = 0

  SSR.hydrate(config, plan, { buildId: 'new', diagnostics: collected.report })
  await vi.waitFor(() => expect(document.body.inert).toBe(true))
  expect(calls.init).toBe(0)
  expect(decoded).not.toHaveBeenCalled()
  expect(collected.reported).toEqual([
    expect.objectContaining({
      _tag: 'PageContained',
      level: 'error',
      reason: 'OtherBuild',
      message: expect.stringContaining(
        'served by deployment "old", but this client belongs to deployment "new"',
      ),
    }),
  ])
})

it('names no deployment for a page that carries no build id', async () => {
  load(SSR.page(template, await Effect.runPromise(SSR.render(config, plan, { buildId: 'old' }))))
  document.querySelector('[data-foldkit-build]')?.removeAttribute('data-foldkit-build')
  const collected = Diagnostics.collect()

  SSR.hydrate(config, plan, { buildId: 'new', diagnostics: collected.report })
  await vi.waitFor(() => expect(document.body.inert).toBe(true))
  expect(collected.reported).toEqual([
    expect.objectContaining({
      reason: 'OtherBuild',
      message: expect.stringContaining('served by no known deployment'),
    }),
  ])
})
