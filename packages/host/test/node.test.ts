import { createServer, request as ask, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Host } from 'foldkit-host'
import { afterEach, describe, expect, it } from 'vitest'

interface Env {
  readonly ORIGIN?: string
}

const servers: Array<Server> = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise(done => server.close(done))))
})

/** `handler` on a Node server, its origin given as `origin(port)`. */
const serve = async (
  handler: Host.Handler<Env>,
  origin: (port: number) => string | undefined = port => `http://127.0.0.1:${port}`,
) => {
  const env: { ORIGIN?: string } = {}
  const server = createServer(Host.node(handler, { env, origin: 'ORIGIN' }))
  servers.push(server)
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  const { port } = server.address() as AddressInfo
  const configured = origin(port)
  if (configured !== undefined) env.ORIGIN = configured
  return port
}

/** A raw request: `target` is written as given, as a client may write an absolute one. */
const send = (
  port: number,
  target: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {},
) =>
  new Promise<{ status: number; headers: Record<string, unknown>; body: string }>(
    (resolve, reject) => {
      const sent = ask(
        {
          host: '127.0.0.1',
          port,
          path: target,
          method: options.method ?? 'GET',
          headers: options.headers,
        },
        answer => {
          const chunks: Array<Buffer> = []
          answer.on('data', (chunk: Buffer) => chunks.push(chunk))
          answer.on('end', () =>
            resolve({
              status: answer.statusCode ?? 0,
              headers: answer.headers,
              body: Buffer.concat(chunks).toString(),
            }),
          )
        },
      )
      sent.on('error', reject)
      sent.end(options.body)
    },
  )

describe('Host.node', () => {
  it('hands the handler a Request on the configured origin, with its method, headers and body', async () => {
    let seen: { url: string; method: string; cookie: string | null; body: string } | undefined
    const port = await serve(async request => {
      seen = {
        url: request.url,
        method: request.method,
        cookie: request.headers.get('cookie'),
        body: await request.text(),
      }
      return new Response('ok', { status: 201, headers: { 'x-answer': 'yes' } })
    })
    const answer = await send(port, '/remote?x=1', {
      method: 'POST',
      headers: { cookie: 'session=a', 'content-type': 'application/json' },
      body: '{"read":1}',
    })
    expect(seen).toEqual({
      url: `http://127.0.0.1:${port}/remote?x=1`,
      method: 'POST',
      cookie: 'session=a',
      body: '{"read":1}',
    })
    expect(answer).toMatchObject({ status: 201, body: 'ok', headers: { 'x-answer': 'yes' } })
  })

  it('writes every cookie the answer sets', async () => {
    const port = await serve(async () => {
      const headers = new Headers()
      headers.append('set-cookie', 'a=1; Path=/')
      headers.append('set-cookie', 'b=2; Path=/')
      return new Response(null, { status: 204, headers })
    })
    expect((await send(port, '/auth/signIn')).headers['set-cookie']).toEqual([
      'a=1; Path=/',
      'b=2; Path=/',
    ])
  })

  it.each(['http://elsewhere.example/', '//elsewhere.example/page'])(
    'refuses a target naming another origin (%s) before the handler',
    async target => {
      let reached = false
      const port = await serve(async () => {
        reached = true
        return new Response('ok')
      })
      expect(await send(port, target)).toMatchObject({
        status: 400,
        body: 'The request names another origin.',
      })
      expect(reached).toBe(false)
    },
  )

  it('takes an absolute target on its own origin', async () => {
    const port = await serve(async request => new Response(request.url))
    expect((await send(port, `http://127.0.0.1:${port}/notes`)).body).toBe(
      `http://127.0.0.1:${port}/notes`,
    )
  })

  it('answers 500 naming the variable when the origin is unset', async () => {
    let reached = false
    const port = await serve(
      async () => {
        reached = true
        return new Response('ok')
      },
      () => undefined,
    )
    expect(await send(port, '/')).toMatchObject({
      status: 500,
      body: 'Set ORIGIN to where this application is served.',
    })
    expect(reached).toBe(false)
  })

  it('answers a handler that throws with fixed text, never the error', async () => {
    const logged: Array<unknown> = []
    const original = console.error
    console.error = (...args: Array<unknown>) => void logged.push(...args)
    try {
      const port = await serve(async () => {
        throw new Error('the database password is hunter2')
      })
      expect(await send(port, '/')).toMatchObject({
        status: 500,
        body: 'The request could not be answered.',
      })
      expect(String(logged[0])).toContain('hunter2')
    } finally {
      console.error = original
    }
  })

  it('streams the answer, and cancels it when the client leaves', async () => {
    let cancelled!: () => void
    const ended = new Promise<void>(done => (cancelled = done))
    const port = await serve(
      async () =>
        new Response(
          new ReadableStream({
            start: controller => controller.enqueue(new TextEncoder().encode('first')),
            cancel: () => cancelled(),
          }),
        ),
    )
    const first = await new Promise<string>((resolve, reject) => {
      const sent = ask({ host: '127.0.0.1', port, path: '/remote' }, answer => {
        answer.once('data', (chunk: Buffer) => {
          resolve(chunk.toString())
          sent.destroy()
        })
      })
      sent.on('error', error => (error.message === 'socket hang up' ? undefined : reject(error)))
      sent.end()
    })
    expect(first).toBe('first')
    await ended
  })

  it('serves a Host.routes handler', async () => {
    const handler = Host.routes<Env, 'ORIGIN'>({
      origin: 'ORIGIN',
      routes: { '/remote': async () => new Response('remote') },
      otherwise: async (_request, env) => new Response(`page at ${env.ORIGIN}`),
    })
    const port = await serve(handler)
    expect((await send(port, '/remote')).body).toBe('remote')
    expect((await send(port, '/')).body).toBe(`page at http://127.0.0.1:${port}`)
  })
})
