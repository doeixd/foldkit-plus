/**
 * The server behind one HTTP endpoint: the same `RemoteServer` handlers the
 * in-process demo calls, reached by `transport.ts`. Authentication would choose
 * the principal here; this example has none.
 */
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Effect } from 'effect'
import { RemoteServer } from 'foldkit-remote-server'
import { openServer } from './server.js'
import type { Operation } from './transport.js'

export const startHttpServer = async (
  port: number,
): Promise<{ readonly url: string; readonly close: () => Promise<void> }> => {
  const backend = openServer()
  const handlers = RemoteServer.handlers(backend.server, null)
  const run = (
    operation: Operation,
    payload: never,
  ): Effect.Effect<unknown, { readonly message: string }> =>
    operation === 'read'
      ? handlers.FoldkitRemoteRead(payload).pipe(Effect.provide(backend.layer))
      : operation === 'query'
        ? handlers.FoldkitRemoteQuery(payload).pipe(Effect.provide(backend.layer))
        : handlers.FoldkitRemoteMutate(payload).pipe(Effect.provide(backend.layer))

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
      void (async () => {
        try {
          const { operation, payload } = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
            readonly operation: Operation
            readonly payload: never
          }
          const result = await Effect.runPromise(
            run(operation, payload).pipe(
              Effect.map(value => ({ status: 200, body: { result: value } })),
              Effect.catch(error =>
                Effect.succeed({ status: 500, body: { error: error.message } }),
              ),
            ),
          )
          reply(result.status, result.body)
        } catch (error) {
          reply(400, { error: error instanceof Error ? error.message : String(error) })
        }
      })()
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
