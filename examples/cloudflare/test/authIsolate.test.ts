// @vitest-environment node
/**
 * Auth is built once per D1 binding. Miniflare hands the Worker new bindings
 * on every reload and poisons the old ones, so a build kept for the first
 * binding must not answer a request made with the next.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('cloudflare:workers', () => ({ DurableObject: class {} }))

const built: Array<unknown> = []
vi.mock('../src/authRoutes.js', () => ({
  authOf: async (db: unknown) => {
    built.push(db)
    return {
      auth: async () => new Response('auth'),
      me: async () => new Response(String(built.indexOf(db))),
    }
  },
}))

const { default: worker } = await import('../src/worker.js')

const meWith = async (db: object) => {
  const response = await worker.fetch(new Request('https://worker.test/me', { method: 'POST' }), {
    DB: db,
    AUTH_ORIGIN: 'https://page.test',
  } as never)
  return response.text()
}

describe('auth over a reloaded D1 binding', () => {
  it('builds again for a binding it has not seen, and once for one it has', async () => {
    const first = {}
    const second = {}
    expect(await meWith(first)).toBe('0')
    expect(await meWith(second)).toBe('1')
    expect(await meWith(first)).toBe('0')
    expect(built).toEqual([first, second])
  })
})
