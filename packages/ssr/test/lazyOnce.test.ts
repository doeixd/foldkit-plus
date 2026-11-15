/**
 * `lazy` as a function of the Model, on a page whose start is already worked
 * out (`prepare`'s, a post's): the server asks it of that Model, with no
 * render of its own to find the start again.
 */
import { Effect } from 'effect'
import { handleRequest, renderToString } from 'foldkit/experimental/server'
import { expect, it, vi } from 'vitest'
import { SSR } from 'foldkit-ssr'
import { body, make, template, type Model } from './lazyFixture.js'

vi.mock('foldkit/experimental/server', async original => {
  const server = await original<typeof import('foldkit/experimental/server')>()
  return { ...server, renderToString: vi.fn(server.renderToString) }
})

it("renders a prepared page's start once, then its page and the browser's", async () => {
  const { Clicker, config, plan } = make(() => Promise.resolve(body))
  const entry = SSR.entry(
    { ...config, lazy: (model: Model) => (model.title === 'Prepared' ? [Clicker] : []) },
    plan(),
    { buildId: 'b', prepare: model => Effect.succeed({ ...model, title: 'Prepared' }) },
  )
  vi.mocked(renderToString).mockClear()
  const response = await handleRequest(
    new Request('https://example.test/', { headers: { accept: 'text/html' } }),
    { renderPage: entry.renderPage, template },
  )
  expect(response.status).toBe(200)
  expect(Clicker.isLoaded()).toBe(true)
  // `init`'s start for `prepare`, the page drawn, and the page as the browser resumes it.
  expect(vi.mocked(renderToString)).toHaveBeenCalledTimes(3)
})
