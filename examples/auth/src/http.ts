/**
 * One Node server for both handlers: Yielded's routes under `/auth`, Remote
 * at `/remote`. Vite proxies both, so the page, its cookie and these
 * requests share one origin.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { openServer } from './server.js'

/**
 * One Node request answered by a Fetch handler, addressed at `origin`: the
 * page's, which is what the handlers compare `Origin` with. Each
 * `Set-Cookie` is kept: a `Headers` folded into an object keeps only the last.
 */
const respond = async (
  answer: (request: Request) => Promise<Response>,
  origin: string,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> => {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(chunk as Buffer)
  const headers = new Headers()
  for (const [name, value] of Object.entries(request.headers)) {
    for (const each of [value ?? []].flat()) headers.append(name, each)
  }
  const bodied = request.method !== 'GET' && request.method !== 'HEAD'
  const answered = await answer(
    new Request(`${origin}${request.url ?? '/'}`, {
      method: request.method ?? 'GET',
      headers,
      ...(bodied ? { body: Buffer.concat(chunks) } : {}),
    }),
  )
  response.writeHead(answered.status, {
    ...Object.fromEntries(answered.headers),
    'set-cookie': answered.headers.getSetCookie(),
  })
  if (answered.body === null) return void response.end()
  // Written as it comes, so a live stream reaches the page as it goes.
  const reader = answered.body.getReader()
  response.on('close', () => void reader.cancel())
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    response.write(value)
  }
  response.end()
}

export const startHttpServer = async (
  port: number,
  origin: string,
): Promise<{ readonly url: string; readonly close: () => Promise<void> }> => {
  const handlers = await openServer(origin)
  const answerOf = (path: string) =>
    path.startsWith('/auth/')
      ? handlers.auth
      : (request: Request) => handlers.remote(request, undefined)

  const server: Server = createServer((request, response) => {
    respond(answerOf(request.url ?? '/'), origin, request, response).catch((error: unknown) => {
      console.error('examples/auth: a request failed', error)
      if (!response.headersSent) response.writeHead(500)
      response.end()
    })
  })

  await new Promise<void>(resolve => server.listen(port, '127.0.0.1', resolve))
  const { port: bound } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${bound}`,
    close: () =>
      new Promise<void>(resolve => {
        server.closeAllConnections()
        server.close(() => void handlers.close().finally(resolve))
      }),
  }
}
