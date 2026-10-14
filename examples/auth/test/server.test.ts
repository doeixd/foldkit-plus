// @vitest-environment node
/**
 * The server over real HTTP, as the page reaches it: Yielded's own routes
 * sign a reader in and set the cookie, and Remote answers `Me` and the notes
 * as whoever that cookie says, or as a visitor without one.
 */
import { Option, Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { May, ME } from 'foldkit-guard'
import { REMOTE_PROTOCOL_VERSION } from 'foldkit-remote'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Me, OpenAdmin } from '../src/domain.js'
import { startHttpServer } from '../src/http.js'
import { PAGE_ORIGIN, signIn as signInAt } from './accounts.js'

const fromThePage = {
  origin: PAGE_ORIGIN,
  'x-effect-auth-csrf': '1',
  'content-type': 'application/json',
}

let server: Awaited<ReturnType<typeof startHttpServer>>
beforeAll(async () => {
  server = await startHttpServer(0, PAGE_ORIGIN)
})
afterAll(() => server.close())

const post = (path: string, body: unknown, cookie?: string) =>
  fetch(`${server.url}${path}`, {
    method: 'POST',
    headers: { ...fromThePage, ...(cookie === undefined ? {} : { cookie }) },
    body: JSON.stringify(body),
  })

const signIn = (subjectId: 'ada' | 'grace') => signInAt(server.url, subjectId)

/** Remote's JSON answer, in the two shapes read here. */
interface Answer {
  readonly result: {
    readonly entities: ReadonlyArray<{ readonly values: unknown }>
    readonly edges: ReadonlyArray<{ readonly id: string }>
  }
}

const remote = async (operation: 'read' | 'query', payload: unknown, cookie?: string) => {
  const response = await post('/remote', { operation, payload }, cookie)
  return { status: response.status, body: (await response.json()) as Answer }
}

const decodeMe = Schema.decodeUnknownSync(Entity.select(Me, { key: true, may: true }).schema)

/** Who the server answers as, and whether it may open the admin area. */
const meOf = async (cookie?: string) => {
  const { body } = await remote(
    'read',
    {
      version: REMOTE_PROTOCOL_VERSION,
      requests: [{ entity: 'Me', id: ME, fields: ['key', 'may'] }],
    },
    cookie,
  )
  const me = decodeMe(body.result.entities[0]!.values)
  return { key: me.key, admin: May.can(me.may, OpenAdmin.key) }
}

const notesOf = async (cookie?: string) => {
  const { body } = await remote('query', { query: 'Notes', input: {}, window: {} }, cookie)
  return body.result.edges.map(edge => edge.id)
}

describe('the server, by who the cookie says', () => {
  it('answers a visitor with no key, no admin, and no notes', async () => {
    expect(await meOf()).toEqual({ key: Option.none(), admin: false })
    expect(await notesOf()).toEqual([])
  })

  it.each([
    ['an admin, every note', 'ada', true, ['n1', 'n2', 'n3', 'n4']],
    ['a member, their own', 'grace', false, ['n2', 'n4']],
  ] as const)('answers %s', async (_, subjectId, admin, notes) => {
    const cookie = await signIn(subjectId)
    expect(await meOf(cookie)).toEqual({ key: Option.some(subjectId), admin })
    expect(await notesOf(cookie)).toEqual(notes)
  })

  it('refuses the cookie of a session signed out', async () => {
    const cookie = await signIn('ada')
    expect((await post('/auth/signOut', {}, cookie)).status).toBe(200)
    expect(await remote('query', { query: 'Notes', input: {}, window: {} }, cookie)).toEqual({
      status: 401,
      body: {
        error: 'Your session ended.',
        unauthenticated: { reason: 'Your session ended.' },
      },
    })
  })
})
