/**
 * The server behind one HTTP endpoint: the same `RemoteServer` handlers the
 * in-process demo calls, reached by `Remote.http`. Authentication would choose
 * the principal here; this example has none.
 */
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Effect } from 'effect'
import { RemoteServer } from 'foldkit-remote-server'
import { openServer } from './server.js'

export const startHttpServer = async (
  port: number,
): Promise<{ readonly url: string; readonly close: () => Promise<void> }> => {
  const backend = openServer()
  const handlers = RemoteServer.handlers(backend.server, null)

  const server: Server = createServer((request, response) => {
    const reply = (status: number, body: unknown) => {
      response.writeHead(status, { 'content-type': 'application/json' })
      response.end(JSON.stringify(body))
    }
    if (request.method !== 'POST' || request.url !== '/remote')
      return reply(404, { error: 'not found' })
    const chunks: Buffer[] = []
    request.on('data', chunk => chunks.push(chunk as Buffer))
    request.on('end', () => {
      let body: unknown
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      } catch {
        return reply(400, { error: 'The body is not JSON' })
      }
      // Decoded by the protocol's own schemas before a handler sees it.
      void Effect.runPromise(
        RemoteServer.answer(handlers, body).pipe(Effect.provide(backend.layer)),
      ).then(answered => reply(answered.status, answered.body))
    })
  })

  await new Promise<void>(resolve => server.listen(port, '127.0.0.1', resolve))
  const { port: bound } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${bound}/remote`,
    close: () =>
      new Promise<void>(resolve => {
        server.close(() => {
          backend.close()
          resolve()
        })
      }),
  }
}
