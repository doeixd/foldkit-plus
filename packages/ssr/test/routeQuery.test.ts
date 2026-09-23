// @vitest-environment jsdom
/** Phase 2: the route a page resumes on includes its query, not only its path. */
import { Effect } from 'effect'
import { expect, it, vi } from 'vitest'
import { SSR } from 'foldkit-ssr'
import { load, template } from './handoverFixture.js'
import { config, plan } from './routeFixture.js'

it('refuses a page rendered for ?tab=2 when the browser is at ?tab=3', async () => {
  load(
    SSR.page(
      template,
      await Effect.runPromise(
        SSR.render(config, plan, { buildId: 'b', url: 'http://localhost/about?tab=2' }),
      ),
    ),
  )
  window.history.replaceState(null, '', '/about?tab=3')
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

  SSR.hydrate(config, plan, { buildId: 'b' })
  await vi.waitFor(() => expect(document.body.inert).toBe(true))
  expect(logged.mock.calls.flat().join(' ')).toContain('/about?tab=2')
})
