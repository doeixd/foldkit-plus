// @vitest-environment jsdom
/** Phase 2: a routing application resumes on the route it was rendered for. */
import { Effect } from 'effect'
import { expect, it } from 'vitest'
import { SSR } from 'foldkit-ssr'
import { load, settle, template } from './handoverFixture.js'
import { calls, config, plan } from './routeFixture.js'

it('resumes on the route the server rendered, without running init', async () => {
  window.history.replaceState(null, '', '/about?tab=2')
  load(
    SSR.page(
      template,
      await Effect.runPromise(
        SSR.render(config, plan, { buildId: 'b', url: 'http://localhost/about?tab=2' }),
      ),
    ),
  )
  const route = document.getElementById('route')
  calls.init = 0

  SSR.hydrate(config, plan, { buildId: 'b' })
  await settle()

  expect(calls.init).toBe(0)
  expect(document.body.inert).not.toBe(true)
  expect(document.getElementById('route')).toBe(route)
  expect(route?.textContent).toBe('/about')
})
