// @vitest-environment jsdom
/**
 * Phase 2: a page served at a route other than the one it was rendered for is
 * refused, rather than resumed showing one route while on another.
 */
import { Effect } from 'effect'
import { expect, it, vi } from 'vitest'
import { Diagnostics, SSR } from 'foldkit-ssr'
import { load, template } from './handoverFixture.js'
import { calls, config, plan } from './routeFixture.js'

it('refuses a page rendered for /about when the browser is at /other', async () => {
  load(
    SSR.page(
      template,
      await Effect.runPromise(
        SSR.render(config, plan, { buildId: 'b', url: 'http://localhost/about' }),
      ),
    ),
  )
  window.history.replaceState(null, '', '/other')
  const collected = Diagnostics.collect()
  calls.init = 0

  SSR.hydrate(config, plan, { buildId: 'b', diagnostics: collected.report })
  await vi.waitFor(() => expect(document.body.inert).toBe(true))
  expect(calls.init).toBe(0)
  expect(collected.reported).toEqual([
    expect.objectContaining({
      _tag: 'PageContained',
      level: 'error',
      reason: 'Route',
      message: expect.stringContaining('rendered for /about, not /other'),
    }),
  ])
})
