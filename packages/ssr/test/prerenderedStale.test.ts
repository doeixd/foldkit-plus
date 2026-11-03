// @vitest-environment jsdom
/**
 * #469: a prerendered page is fresh as of its build, and the server never
 * renders it again. Its resumed Model says when each read was made, so the
 * browser reads again, at boot, what is past its freshness, and nothing else.
 */
import { handleRequest } from 'foldkit/experimental/server'
import { RemotePolicy } from 'foldkit-remote'
import { beforeEach, expect, it } from 'vitest'
import { SSR } from 'foldkit-ssr'
import { load, settle, template } from './handoverFixture.js'
import { Data, authorSurface, config as author, initial, plan, requests } from './remoteFixture.js'

/** The author read at `now`, as the build read it. */
const readAt = (now: number) =>
  Data.reduce(initial, {
    _tag: 'ReadReceived',
    requests: [{ entity: 'User', id: 'u1', fields: ['name'] }],
    result: { entities: [{ entity: 'User', id: 'u1', values: { name: 'Ada' } }], settled: [] },
    now,
  })

const config = (now: number) => ({
  ...author,
  init: () => ({ model: readAt(now) }),
  subscriptions: Data.subscriptions(
    { page: authorSurface },
    { policy: RemotePolicy.staleWhileRevalidate({ maxAge: 60_000 }) },
  ),
})

/** The file a build writes for `/` with the read made at `now`, loaded and taken over. */
const bootFrom = async (now: number) => {
  const entry = SSR.entry(config(now), plan, { buildId: 'b', prerendered: ['/'] })
  const response = await handleRequest(
    new Request('https://example.test/', { headers: { accept: 'text/html' } }),
    { renderPage: entry.renderPage, template },
  )
  window.history.replaceState(null, '', '/')
  load(await response.text())
  expect(document.getElementById('author')?.textContent).toBe('Ada')
  SSR.hydrate(config(now), plan, { buildId: 'b' })
  await settle()
  await settle()
  expect(document.body.inert).not.toBe(true)
}

beforeEach(() => {
  requests.length = 0
})

it('reads again at boot a read the build made longer ago than its maxAge', async () => {
  await bootFrom(Date.now() - 2 * 60_000)
  expect(requests).toEqual([['User:u1']])
})

it('reads nothing at boot while the build’s reads are fresh', async () => {
  await bootFrom(Date.now())
  expect(requests).toEqual([])
})
