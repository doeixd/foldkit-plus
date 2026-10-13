// @vitest-environment node
/**
 * The host's page answers, against the real auth server: each page is read
 * as whoever the request's cookie says, a page that refuses its reader is a
 * 303 before anything renders, and one that allows them carries what was
 * read in its HTML.
 */
import { readFile } from 'node:fs/promises'
import { toResponse } from 'foldkit/experimental/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startHttpServer } from '../src/http.js'
import { makeRenderPage } from '../src/page.js'
import { accounts, notes } from '../src/server.js'

// The page's origin, which the auth server trusts. Nothing listens there.
const origin = 'http://127.0.0.1:5176'
const template = await readFile(new URL('../index.html', import.meta.url), 'utf8')

let server: Awaited<ReturnType<typeof startHttpServer>>
let renderPage: ReturnType<typeof makeRenderPage>
beforeAll(async () => {
  server = await startHttpServer(0, origin)
  renderPage = makeRenderPage({ buildId: 'test', authServer: server.url })
})
afterAll(() => server.close())

/** Signs in through Yielded's route; the session cookie it set, as `name=value`. */
const signIn = async (subjectId: 'ada' | 'grace'): Promise<string> => {
  const { email, password } = accounts.find(account => account.subjectId === subjectId)!
  const response = await fetch(`${server.url}/auth/signIn`, {
    method: 'POST',
    headers: { origin, 'x-effect-auth-csrf': '1', 'content-type': 'application/json' },
    body: JSON.stringify({ payload: { email, password } }),
  })
  return response.headers
    .getSetCookie()
    .find(cookie => cookie.includes('-session='))!
    .split(';')[0]!
}

/** The page at `path` as the host would send it. */
const answer = async (path: string, init: { cookie?: string; method?: string } = {}) =>
  toResponse(
    template,
    await renderPage(
      new Request(`${origin}${path}`, {
        method: init.method ?? 'GET',
        headers: init.cookie === undefined ? {} : { cookie: init.cookie },
      }),
    ),
  )

const titlesBy = (author: string) =>
  notes.filter(note => note.authorId === author).map(note => note.title)

describe('the host', () => {
  it('sends a visitor asking for the notes home with a 303, returning to them after', async () => {
    const response = await answer('/notes')
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('/?returnTo=%2Fnotes')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('vary')).toBe('cookie')
  })

  it("renders a reader's notes into the page, read as them", async () => {
    const response = await answer('/notes', { cookie: await signIn('grace') })
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('vary')).toBe('cookie')
    const html = await response.text()
    expect(html).toContain('Signed in as grace')
    for (const title of titlesBy('grace')) expect(html).toContain(title)
    for (const title of titlesBy('ada')) expect(html).not.toContain(title)
  })

  it('renders the home page for a visitor, with the form', async () => {
    const response = await answer('/?returnTo=%2Fnotes')
    expect(response.status).toBe(200)
    const html = await response.text()
    expect(html).toContain('Visitor')
    expect(html).toContain('id="sign-in"')
  })

  it('leaves a session the server no longer holds for the browser to read and tell', async () => {
    const cookie = await signIn('ada')
    await fetch(`${server.url}/auth/signOut`, {
      method: 'POST',
      headers: { origin, 'x-effect-auth-csrf': '1', 'content-type': 'application/json', cookie },
      body: '{}',
    })
    const response = await answer('/notes', { cookie })
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('Checking who you are…')
  })

  it('leaves a method no page takes to the entry, which refuses it unread', async () => {
    const response = await answer('/notes', { method: 'DELETE' })
    expect(response.status).toBe(405)
  })
})
