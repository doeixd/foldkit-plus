/**
 * The host, on plain `node:http`: a static file when one answers, and every
 * other request rendered by `entry.server.ts`. It is where the request target,
 * which the client chooses, becomes a URL of this origin, and where the
 * methods a Web `Request` cannot carry are refused.
 */
import { Option } from 'effect'
import {
  HOST_METHOD_ANSWERS,
  isHostSettledMethod,
  resolveRequestUrl,
  resolvesToIndexHtml,
} from 'foldkit/experimental/server'
import { readFile, stat } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { extname, join, resolve, sep } from 'node:path'

import { buildIdOf, makePageHandler } from './entry.server.js'

type PageHandler = (request: Request) => Promise<Response>

/** Where the host finds the page's scripts and styles, and its template. */
export interface Assets {
  /** Answers with a static file, or calls `next`. */
  readonly serve: (request: IncomingMessage, response: ServerResponse, next: () => void) => void
  /** The page handler for a request to `url`. */
  readonly pages: (url: string) => Promise<PageHandler>
  readonly close: () => Promise<void>
}

const EXAMPLE_DIR = resolve(import.meta.dirname, '..')

/**
 * The source, through Vite in middleware mode: Vite answers the modules and
 * its client, and each page is rendered into `index.html` as Vite transforms
 * it. The server's own code is loaded once, by tsx; restart to see an edit.
 */
export const development = async (server: Server): Promise<Assets> => {
  const { createServer: createViteServer } = await import('vite')
  const vite = await createViteServer({
    root: EXAMPLE_DIR,
    appType: 'custom',
    server: { middlewareMode: true, hmr: { server } },
  })
  const template = await readFile(join(EXAMPLE_DIR, 'index.html'), 'utf8')
  const buildId = buildIdOf(template)
  return {
    serve: vite.middlewares,
    pages: async url =>
      makePageHandler({ template: await vite.transformIndexHtml(url, template), buildId }),
    close: () => vite.close(),
  }
}

const CONTENT_TYPES = new Map([
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.json', 'application/json'],
  ['.map', 'application/json'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.ico', 'image/x-icon'],
  ['.woff2', 'font/woff2'],
])

/** The file under `root` a path names, if it is one; never a path outside it. */
const fileUnder = async (root: string, pathname: string): Promise<Option.Option<string>> => {
  try {
    const file = resolve(root, `.${decodeURIComponent(pathname)}`)
    if (!file.startsWith(`${root}${sep}`)) return Option.none()
    return (await stat(file)).isFile() ? Option.some(file) : Option.none()
  } catch {
    // An undecodable path or a missing file: not a static file, so a page.
    return Option.none()
  }
}

/** A directory's files, answered as they are. */
const staticFiles =
  (root: string): Assets['serve'] =>
  (request, response, next) => {
    void fileUnder(root, new URL(request.url ?? '/', 'http://localhost').pathname)
      .then(found =>
        Option.match(found, {
          onNone: next,
          onSome: async file => {
            const body = await readFile(file)
            response.writeHead(200, {
              'content-type': CONTENT_TYPES.get(extname(file)) ?? 'application/octet-stream',
              'x-content-type-options': 'nosniff',
            })
            response.end(request.method === 'HEAD' ? undefined : body)
          },
        }),
      )
      // A file gone between the check and the read is not a static file: a page.
      .catch(next)
  }

/** What `vite build` wrote to `dist`: its files, and its `index.html` as the template. */
export const production = (dist: string) => async (): Promise<Assets> => {
  const template = await readFile(join(dist, 'index.html'), 'utf8')
  const handler = makePageHandler({ template, buildId: buildIdOf(template) })
  return { serve: staticFiles(resolve(dist)), pages: async () => handler, close: async () => {} }
}

/** The Web `Request` for a Node request. Nothing this entry answers reads a body. */
const toRequest = (request: IncomingMessage, url: string): Request => {
  const headers = new Headers()
  for (const [name, value] of Object.entries(request.headers)) {
    for (const each of [value ?? []].flat()) headers.append(name, each)
  }
  return new Request(url, { method: request.method ?? 'GET', headers })
}

const answer = async (response: ServerResponse, from: Response): Promise<void> => {
  from.headers.forEach((value, name) => response.setHeader(name, value))
  response.writeHead(from.status)
  response.end(Buffer.from(await from.arrayBuffer()))
}

const handle =
  (assets: Assets, origin: string) =>
  (request: IncomingMessage, response: ServerResponse): void => {
    const method = request.method ?? 'GET'
    if (isHostSettledMethod(method)) {
      response.writeHead(HOST_METHOD_ANSWERS.refusedStatus, { allow: HOST_METHOD_ANSWERS.allow })
      response.end()
      return
    }
    // NOTE: refuse an off-origin target before looking for a file. A
    // network-path request such as `//evil.example/../assets/app.js` names
    // another host, then a path that exists on disk. The page handler trusts
    // the `Request.url` it is given, so this is the one place that resolves it.
    const url = resolveRequestUrl(request.url ?? '/', origin)
    if (url === undefined) {
      response.writeHead(400)
      response.end()
      return
    }
    const resolved = new URL(url)
    request.url = `${resolved.pathname}${resolved.search}`
    const page = () => {
      void assets
        .pages(url)
        .then(handler => handler(toRequest(request, url)))
        .then(
          from => answer(response, from),
          (error: unknown) => {
            console.error(error)
            response.writeHead(500)
            response.end()
          },
        )
    }
    // `/` and `/index.html` are the page, never the raw template, and only
    // GET and HEAD read a file; the entry answers every other method.
    if (resolvesToIndexHtml(url) || (method !== 'GET' && method !== 'HEAD')) page()
    else assets.serve(request, response, page)
  }

/**
 * Listens on `port` (0 for any free one) at 127.0.0.1. `origin` is the origin
 * this deployment serves, `http://localhost:<port>` unless given: a proxy or a
 * TLS terminator in front names its public one.
 */
export const startServer = async (options: {
  readonly port: number
  readonly origin: Option.Option<string>
  readonly assets: (server: Server) => Promise<Assets>
}): Promise<{ readonly url: string; readonly close: () => Promise<void> }> => {
  const server = createServer()
  const assets = await options.assets(server)
  await new Promise<void>(done => server.listen(options.port, '127.0.0.1', done))
  const { port } = server.address() as AddressInfo
  const origin = Option.getOrElse(options.origin, () => `http://localhost:${port}`)
  server.on('request', handle(assets, origin))
  return {
    url: `http://127.0.0.1:${port}`,
    close: async () => {
      await assets.close()
      await new Promise<void>(done => server.close(() => done()))
    },
  }
}
