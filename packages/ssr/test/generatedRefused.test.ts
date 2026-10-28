// @vitest-environment jsdom
/** Phase 5: a generated page served at another path is refused. */
import { Effect } from 'effect'
import { expect, it, vi } from 'vitest'
import { Diagnostics, SSR } from 'foldkit-ssr'
import { load, template } from './handoverFixture.js'
import { calls, config, plan } from './routeFixture.js'

it('refuses a page generated for /about when the browser is at /other', async () => {
  const [about] = await Effect.runPromise(
    SSR.generate(config, plan, {
      buildId: 'b',
      template,
      origin: 'https://example.test',
      paths: ['/about'],
    }),
  )
  window.history.replaceState(null, '', '/other')
  load(about.html)
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
      message: expect.stringContaining('generated for /about, not /other'),
    }),
  ])
})
