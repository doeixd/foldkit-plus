// @vitest-environment jsdom
/**
 * #373: a page `SSR.entry` renders for a path it is told a build prerenders
 * records its path alone, so the file a static host serves for `?tab=2`
 * resumes there, and the application is told the URL it is at.
 */
import { handleRequest } from 'foldkit/experimental/server'
import { Option } from 'effect'
import { expect, it, vi } from 'vitest'
import { SSR } from 'foldkit-ssr'
import { load, settle, template } from './handoverFixture.js'
import { calls, config as routed, plan } from './routeFixture.js'

const config = {
  ...routed,
  routing: {
    ...routed.routing,
    onUrlChange: (url: Parameters<typeof routed.routing.onUrlChange>[0]) =>
      routed.routing.onUrlChange({
        ...url,
        pathname: `${url.pathname}${Option.match(url.search, { onNone: () => '', onSome: search => `?${search}` })}`,
      }),
  },
}

it('resumes a prerendered page at another query, then hands the application the URL', async () => {
  const entry = SSR.entry(config, plan, { buildId: 'b', prerendered: ['/about'] })
  // As the plugin prerenders: the path alone, written to a file.
  const response = await handleRequest(
    new Request('https://example.test/about', { headers: { accept: 'text/html' } }),
    { renderPage: entry.renderPage, template },
  )
  window.history.replaceState(null, '', '/about?tab=2')
  load(await response.text())
  expect(document.getElementById('route')?.textContent).toBe('/about')
  calls.init = 0

  SSR.hydrate(config, plan, { buildId: 'b' })
  await settle()

  expect(calls.init).toBe(0)
  expect(document.body.inert).not.toBe(true)
  // Started from the URL it is at: the part that shows it is redrawn.
  await vi.waitFor(() => expect(document.getElementById('route')?.textContent).toBe('/about?tab=2'))
})
