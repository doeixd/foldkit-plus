import { Host } from 'foldkit-host'
import { describe, expect, it } from 'vitest'

interface Env {
  readonly ASSETS: Host.Assets
  readonly ORIGIN?: string
}

/** A host whose every handler answers with its own name, recording each call. */
const hostOver = () => {
  const calls: Array<string> = []
  const answer = (name: string) => async (request: Request, env: Env & { ORIGIN: string }) => {
    calls.push(`${name} ${new URL(request.url).pathname} ${env.ORIGIN}`)
    return new Response(name)
  }
  const handler = Host.routes({
    origin: 'ORIGIN',
    assets: { at: '/assets/', binding: (env: Env) => env.ASSETS },
    routes: {
      '/auth/': answer('auth'),
      '/remote': answer('remote'),
      // Written after `/auth/`, so `/auth/` takes what both match.
      '/auth/admin/': answer('admin'),
    },
    otherwise: answer('pages'),
  })
  const assets: Host.Assets = {
    fetch: async request => {
      calls.push(`assets ${new URL(typeof request === 'string' ? request : request.url).pathname}`)
      return new Response('asset')
    },
  }
  const ask = async (path: string, origin: string | undefined) => {
    const response = await handler(
      new Request(`https://notes.example${path}`),
      origin === undefined ? { ASSETS: assets } : { ASSETS: assets, ORIGIN: origin },
    )
    return { status: response.status, text: await response.text(), headers: response.headers }
  }
  return { ask, calls }
}

const served = 'https://notes.example'

describe('Host.routes', () => {
  it.each([
    ['/auth/signIn', 'auth'],
    ['/auth/admin/users', 'auth'],
    ['/remote', 'remote'],
    ['/remote/more', 'pages'],
    ['/remoteish', 'pages'],
    ['/auth', 'pages'],
    ['/', 'pages'],
    ['/notes/n1', 'pages'],
  ])('answers %s with %s', async (path, name) => {
    const { ask, calls } = hostOver()
    expect((await ask(path, served)).text).toBe(name)
    expect(calls).toEqual([`${name} ${path} https://notes.example`])
  })

  it('serves the build from the assets before the origin check', async () => {
    const { ask, calls } = hostOver()
    expect((await ask('/assets/main.js', undefined)).text).toBe('asset')
    expect(calls).toEqual(['assets /assets/main.js'])
  })

  it.each([undefined, ''])('answers 500 naming the variable when ORIGIN is %j', async origin => {
    const { ask, calls } = hostOver()
    for (const path of ['/', '/auth/signIn', '/remote']) {
      const answer = await ask(path, origin)
      expect(answer.status).toBe(500)
      expect(answer.text).toBe('Set ORIGIN to where this application is served.')
    }
    expect(calls).toEqual([])
  })

  it('keeps nothing: each request reaches its handler, and no cache header is added', async () => {
    const { ask, calls } = hostOver()
    const first = await ask('/notes/n1', served)
    await ask('/notes/n1', served)
    expect(calls).toHaveLength(2)
    expect(first.headers.get('cache-control')).toBeNull()
    expect([...first.headers.keys()]).toEqual(['content-type'])
  })

  it('refuses a route whose path does not start with /', () => {
    expect(() =>
      Host.routes<Env, 'ORIGIN'>({
        origin: 'ORIGIN',
        routes: { remote: async () => new Response() },
        otherwise: async () => new Response(),
      }),
    ).toThrow('A route\'s path starts with "/": "remote" does not')
  })
})
