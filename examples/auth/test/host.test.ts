// @vitest-environment node
/**
 * #212: the whole site behind one fetch handler, as one Worker serves it,
 * run here with no network at all. A page is read in this process, through
 * the reader the host attached, as whoever the request's cookie says, even
 * when it was followed from another site; `/remote` still asks a script's
 * request for its CSRF header; a page the host attached nothing to is a 500
 * that says why.
 */
import { readFile } from 'node:fs/promises'
import { handleRequest } from 'foldkit/experimental/server'
import { REMOTE_PROTOCOL_VERSION } from 'foldkit-remote'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { openHost, type Pages } from '../src/host.js'
import { makeRenderPage } from '../src/page.js'
import { accounts, notes } from '../src/server.js'
import { PAGE_ORIGIN as origin } from './accounts.js'

const template = await readFile(new URL('../index.html', import.meta.url), 'utf8')
const renderPage = makeRenderPage({ buildId: 'test' })
/** What a build's `fetch.js` is: Foldkit's handler over the server entry's `renderPage`. */
const pages: Pages = { fetch: request => handleRequest(request, { renderPage, template }) }

let host: Awaited<ReturnType<typeof openHost>>
beforeAll(async () => {
  host = await openHost(origin, pages)
  // Nothing here may leave the process: a read over HTTP would fail loudly.
  vi.stubGlobal('fetch', () => Promise.reject(new Error('the host reached the network')))
})
afterAll(async () => {
  vi.unstubAllGlobals()
  await host.close()
})

const fromThePage = { origin, 'x-effect-auth-csrf': '1', 'content-type': 'application/json' }

/** Signs in through the host's own Yielded route; the session cookie it set. */
const signIn = async (subjectId: 'ada' | 'grace'): Promise<string> => {
  const { email, password } = accounts.find(account => account.subjectId === subjectId)!
  const response = await host.fetch(
    new Request(`${origin}/auth/signIn`, {
      method: 'POST',
      headers: fromThePage,
      body: JSON.stringify({ payload: { email, password } }),
    }),
  )
  expect(response.status).toBe(200)
  return response.headers
    .getSetCookie()
    .find(cookie => cookie.includes('-session='))!
    .split(';')[0]!
}

/** A page as a browser navigates to it: no Origin and no header of a script's. */
const navigate = (path: string, headers: Record<string, string> = {}) =>
  host.fetch(new Request(`${origin}${path}`, { headers: { accept: 'text/html', ...headers } }))

const titlesBy = (author: string) =>
  notes.filter(note => note.authorId === author).map(note => note.title)

describe('one fetch handler for the site', () => {
  it("renders a reader's notes, read in this process as them, from a link on another site", async () => {
    const response = await navigate('/notes', {
      cookie: await signIn('grace'),
      'sec-fetch-site': 'cross-site',
    })
    expect(response.status).toBe(200)
    const html = await response.text()
    expect(html).toContain('Signed in as grace')
    for (const title of titlesBy('grace')) expect(html).toContain(title)
    for (const title of titlesBy('ada')) expect(html).not.toContain(title)
  })

  it('sends a visitor asking for the notes home with a 303', async () => {
    const response = await navigate('/notes')
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('/?returnTo=%2Fnotes')
  })

  it('leaves a session that ended for the browser to read and tell', async () => {
    const cookie = await signIn('ada')
    const out = await host.fetch(
      new Request(`${origin}/auth/signOut`, {
        method: 'POST',
        headers: { ...fromThePage, cookie },
        body: '{}',
      }),
    )
    expect(out.status).toBe(200)
    const response = await navigate('/notes', { cookie })
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('Checking who you are…')
  })

  it("answers /remote as before, refusing a script's cookie without the CSRF header", async () => {
    const cookie = await signIn('ada')
    const read = (headers: Record<string, string>) =>
      host.fetch(
        new Request(`${origin}/remote`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', cookie, ...headers },
          body: JSON.stringify({
            operation: 'read',
            payload: { version: REMOTE_PROTOCOL_VERSION, requests: [] },
          }),
        }),
      )
    expect((await read({ origin, 'x-effect-auth-csrf': '1' })).status).toBe(200)
    expect((await read({ origin })).status).toBe(401)
  })

  it('answers a page the host attached no reader to with a 500 that says why', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const response = await pages.fetch(
        new Request(`${origin}/notes`, { headers: { accept: 'text/html' } }),
      )
      expect(response.status).toBe(500)
      expect(String(logged.mock.calls[0]?.[0])).toContain('reached renderPage without a reader')
    } finally {
      logged.mockRestore()
    }
  })
})
