// @vitest-environment jsdom
/**
 * Phase 5: a generated page resumes on its path whatever the query, and with
 * or without a trailing slash, as a static host serves it.
 */
import { Effect } from 'effect'
import { expect, it } from 'vitest'
import { SSR } from 'foldkit-ssr'
import { load, settle, template } from './handoverFixture.js'
import { calls, config, plan } from './routeFixture.js'

it('resumes a page generated for /about at /about/?utm_source=mail', async () => {
  const [about] = await Effect.runPromise(
    SSR.generate(config, plan, {
      buildId: 'b',
      template,
      origin: 'https://example.test',
      paths: ['/about'],
    }),
  )
  window.history.replaceState(null, '', '/about/?utm_source=mail')
  load(about!.html)
  const route = document.getElementById('route')
  calls.init = 0

  SSR.hydrate(config, plan, { buildId: 'b' })
  await settle()

  expect(calls.init).toBe(0)
  expect(document.body.inert).not.toBe(true)
  expect(document.getElementById('route')).toBe(route)
  expect(route?.textContent).toBe('/about')
})
