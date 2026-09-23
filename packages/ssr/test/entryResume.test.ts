// @vitest-environment jsdom
/**
 * Phase 6: a page answered by `handleRequest` through `SSR.entry` resumes in
 * the browser on its route, without running `init`.
 */
import { handleRequest } from 'foldkit/experimental/server'
import { expect, it } from 'vitest'
import { SSR } from 'foldkit-ssr'
import { load, settle, template } from './handoverFixture.js'
import { calls, config, plan } from './routeFixture.js'

it('resumes a page served by handleRequest', async () => {
  const entry = SSR.entry(config, plan, { buildId: 'b', template })
  const response = await handleRequest(
    new Request('https://example.test/about?tab=2', { headers: { accept: 'text/html' } }),
    { renderPage: entry.renderPage, template },
  )
  window.history.replaceState(null, '', '/about?tab=2')
  load(await response.text())
  const route = document.getElementById('route')
  calls.init = 0

  SSR.hydrate(config, plan, { buildId: 'b' })
  await settle()

  expect(calls.init).toBe(0)
  expect(document.body.inert).not.toBe(true)
  expect(document.getElementById('route')).toBe(route)
  expect(route?.textContent).toBe('/about')
})
