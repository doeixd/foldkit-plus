// @vitest-environment node
/**
 * Yielded Auth on D1, in the bundled worker on miniflare over real HTTP: a
 * person signs up and signs in through Yielded's routes, the account row and
 * the session land in D1, and `/me` reads the session back through
 * `foldkit-auth`'s resolver until it is signed out.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PAGE_ORIGIN, startStack, type CloudflareStack } from '../src/stack.js'

let stack: CloudflareStack

beforeAll(async () => {
  stack = await startStack()
}, 120_000)

afterAll(async () => {
  await stack.stop()
}, 120_000)

/** What the page at `AUTH_ORIGIN` sends with every call. */
const fromThePage = {
  origin: PAGE_ORIGIN,
  'x-effect-auth-csrf': '1',
  'content-type': 'application/json',
}

const post = (path: string, body: unknown, cookie?: string) =>
  fetch(`${stack.origin}${path}`, {
    method: 'POST',
    headers: { ...fromThePage, ...(cookie === undefined ? {} : { cookie }) },
    body: JSON.stringify(body),
  })

const me = async (cookie?: string) => {
  const response = await post('/me', {}, cookie)
  return { status: response.status, body: await response.json() }
}

const ada = {
  email: 'ada@example.invalid',
  password: 'the engine weaves algebra',
  displayName: 'Ada',
}

/** Signs in through Yielded's route; the session cookie it set, as `name=value`. */
const signIn = async (email: string, password: string) => {
  const response = await post('/auth/signIn', { payload: { email, password } })
  expect(response.status).toBe(200)
  return response.headers
    .getSetCookie()
    .find(cookie => cookie.includes('-session='))!
    .split(';')[0]!
}

describe('Yielded Auth on D1', () => {
  it('answers a request without a session as a visitor', async () => {
    expect(await me()).toEqual({ status: 200, body: { account: null } })
  }, 120_000)

  it('signs up, signs in, and reads the session back until it is signed out', async () => {
    const registered = await post('/auth/register', {
      payload: {
        requestId: 'sign-up-ada',
        email: ada.email,
        newPassword: ada.password,
        registration: { displayName: ada.displayName },
      },
    })
    expect(registered.status).toBe(200)
    expect(await registered.json()).toEqual({
      _tag: 'Success',
      value: { _tag: 'RegistrationAccepted' },
    })

    // The account row, written in the batch that bound the email.
    const rows = await stack.db
      .prepare('SELECT id, status, email, display_name AS displayName FROM accounts')
      .all<{ id: string; status: string; email: string; displayName: string }>()
    expect(rows.results).toEqual([
      { id: expect.any(String), status: 'active', email: ada.email, displayName: 'Ada' },
    ])
    const id = rows.results[0]!.id

    const cookie = await signIn(ada.email, ada.password)
    const sessions = await stack.db.prepare('SELECT subject_id FROM auth_sessions').all()
    expect(sessions.results).toEqual([{ subject_id: id }])

    expect(await me(cookie)).toEqual({
      status: 200,
      body: { account: { id, email: ada.email, displayName: 'Ada' } },
    })

    expect((await post('/auth/signOut', {}, cookie)).status).toBe(200)
    expect(await me(cookie)).toEqual({ status: 401, body: { error: 'Your session ended.' } })
  }, 120_000)

  // Ada signed up in the test above.
  it('refuses a session cookie from a request that did not come from the page', async () => {
    const cookie = await signIn(ada.email, ada.password)
    const response = await fetch(`${stack.origin}/me`, {
      method: 'POST',
      headers: { origin: 'https://elsewhere.example', cookie },
      body: '{}',
    })
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      error: 'The request did not show it came from this application.',
    })
  }, 120_000)
})
