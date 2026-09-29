/**
 * The host over a built `dist/`, on a free port closed after each
 * test: static files, the page for everything else, and the requests it
 * refuses before either.
 */
import { Option } from 'effect'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { request as httpRequest } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { COUNT_COOKIE } from '../src/cookie.js'
import { production, startServer } from '../src/host.js'
import { template } from './helpers.js'
const SCRIPT = 'console.log("the page")'
const SECRET = 'not for the web'

let root: string
let server: { readonly url: string; readonly close: () => Promise<void> }

beforeEach(async () => {
  // The deployment the server answers for, as `FOLDKIT_BUILD_ID` names it.
  vi.stubEnv('FOLDKIT_BUILD_ID', 'test-build')
  // `dist/` as `vite build` leaves it, beside a file the host must never serve.
  root = await mkdtemp(join(tmpdir(), 'foldkit-ssr-host-'))
  const dist = join(root, 'dist')
  await mkdir(join(dist, 'assets'), { recursive: true })
  await writeFile(join(dist, 'index.html'), template)
  await writeFile(join(dist, 'assets', 'app.js'), SCRIPT)
  await writeFile(join(root, 'secret.txt'), SECRET)
  server = await startServer({ port: 0, origin: Option.none(), assets: production(dist) })
})

afterEach(async () => {
  await server.close()
  await rm(root, { recursive: true })
  vi.unstubAllEnvs()
})

/** Sends `target` as written, which `fetch` would normalize first. */
const send = (
  target: string,
  init: { readonly method?: string; readonly headers?: Record<string, string> } = {},
): Promise<{
  readonly status: number
  readonly headers: Record<string, unknown>
  readonly body: string
}> =>
  new Promise((resolve, reject) => {
    const { port } = new URL(server.url)
    const outgoing = httpRequest(
      {
        host: '127.0.0.1',
        port,
        path: target,
        method: init.method ?? 'GET',
        headers: { accept: 'text/html', ...init.headers },
      },
      incoming => {
        const chunks: Array<Buffer> = []
        incoming.on('data', (chunk: Buffer) => chunks.push(chunk))
        incoming.on('end', () =>
          resolve({
            status: incoming.statusCode ?? 0,
            headers: incoming.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        )
      },
    )
    outgoing.on('error', reject)
    outgoing.end()
  })

describe('the host', () => {
  test.each(['/', '/index.html', '/?from=mail'])(
    'renders %s from the visitor’s cookie, never serving the raw template',
    async target => {
      const response = await send(target, { headers: { cookie: `${COUNT_COOKIE}=9` } })
      expect(response.status).toBe(200)
      expect(response.body).toContain('id="count">9</p>')
      expect(response.body).toContain('data-foldkit-build="test-build"')
      expect(response.headers).toMatchObject({
        'cache-control': 'private, no-store',
        vary: 'cookie',
      })
    },
  )

  test('serves a built file as it is', async () => {
    const response = await send('/assets/app.js', { headers: { accept: '*/*' } })
    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toBe('text/javascript; charset=utf-8')
    expect(response.body).toBe(SCRIPT)
  })

  test('answers a missing asset 404, not with the page', async () => {
    const response = await send('/assets/gone.js', { headers: { accept: '*/*' } })
    expect(response.status).toBe(404)
  })

  test.each(['/..%2fsecret.txt', '/assets/..%2f..%2fsecret.txt'])(
    'serves nothing outside dist/ for %s',
    async target => {
      const response = await send(target, { headers: { accept: '*/*' } })
      expect(response.body).not.toContain(SECRET)
    },
  )

  test('refuses a target on another origin before looking for a file', async () => {
    const response = await send('//evil.example/assets/app.js')
    expect(response.status).toBe(400)
    expect(response.body).toBe('')
  })

  test('refuses a method a Web Request cannot carry', async () => {
    const response = await send('/', { method: 'TRACE' })
    expect(response.status).toBe(405)
    expect(response.headers['allow']).toBe('GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS')
  })

  test('hands a preflight to the entry', async () => {
    const response = await send('/assets/app.js', { method: 'OPTIONS' })
    expect(response.status).toBe(204)
  })
})
