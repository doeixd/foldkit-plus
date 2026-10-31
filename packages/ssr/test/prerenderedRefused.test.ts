// @vitest-environment jsdom
/**
 * #373: a page rendered per request, served for another query (a prerender
 * the entry was not told of), is refused, and the reason says how to keep it.
 */
import { handleRequest } from 'foldkit/experimental/server'
import { expect, it, vi } from 'vitest'
import { Diagnostics, SSR } from 'foldkit-ssr'
import { load, template } from './handoverFixture.js'
import { config, plan } from './routeFixture.js'

it('refuses it, naming prerendered', async () => {
  const entry = SSR.entry(config, plan, { buildId: 'b' })
  const response = await handleRequest(
    new Request('https://example.test/about', { headers: { accept: 'text/html' } }),
    { renderPage: entry.renderPage, template },
  )
  window.history.replaceState(null, '', '/about?tab=2')
  load(await response.text())
  const collected = Diagnostics.collect()

  SSR.hydrate(config, plan, { buildId: 'b', diagnostics: collected.report })
  await vi.waitFor(() => expect(document.body.inert).toBe(true))
  expect(collected.reported).toEqual([
    expect.objectContaining({
      _tag: 'PageContained',
      reason: 'Route',
      message: expect.stringContaining(
        'the page was rendered for /about, not /about?tab=2; a page a static host serves for every query must record its path alone',
      ),
    }),
  ])
})
