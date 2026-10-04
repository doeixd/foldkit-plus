/**
 * The server on one port: Remote's reads at `/remote`, reached by
 * `transport.ts`, and the edits' journal at `/sync`, a WebSocket the replica
 * exchanges over. Authentication would choose the principal here; this
 * example has none.
 */
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Effect } from 'effect'
import { RemoteServer } from 'foldkit-remote-server'
import { Sequence, Sync, type SocketLike } from 'foldkit-sync'
import { type WebSocket, WebSocketServer } from 'ws'
import { openJournal } from './journal.js'
import { openServer } from './server.js'
import type { Operation } from './transport.js'

/** Adapts one `ws` socket to the transport's minimal socket. */
const socketLike = (socket: WebSocket): SocketLike => ({
  send: data => socket.send(data),
  close: () => socket.close(),
  onMessage: listener => {
    const handler = (data: unknown): void => listener(String(data))
    socket.on('message', handler)
    return () => socket.off('message', handler)
  },
  onClose: listener => {
    socket.on('close', listener)
    return () => socket.off('close', listener)
  },
})

export const startHttpServer = async (
  port: number,
): Promise<{
  readonly url: string
  readonly syncUrl: string
  readonly close: () => Promise<void>
}> => {
  const backend = openServer()
  const journal = openJournal(backend.apply)
  const handlers = RemoteServer.handlers(backend.server, null)
  const run: Readonly<
    Record<Operation, (payload: never) => Effect.Effect<unknown, { readonly message: string }>>
  > = {
    read: payload => handlers.FoldkitRemoteRead(payload).pipe(Effect.provide(backend.layer)),
    query: payload => handlers.FoldkitRemoteQuery(payload).pipe(Effect.provide(backend.layer)),
    mutate: payload => handlers.FoldkitRemoteMutate(payload).pipe(Effect.provide(backend.layer)),
  }

  const isOperation = (name: string): name is Operation => Object.hasOwn(run, name)

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
            readonly operation: string
            readonly payload: never
          }
          // The name is the client's: one the table does not own (`constructor`) is no operation.
          if (!isOperation(operation)) return reply(400, { error: 'unknown operation' })
          const result = await Effect.runPromise(
            run[operation](payload).pipe(
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

  // Each socket exchanges with the journal, and is woken when another commits.
  const sockets = new WebSocketServer({ server, path: '/sync' })
  sockets.on('connection', socket => {
    const stop = Sync.transport.serve(socketLike(socket), {
      exchange: (cursor, pending) => journal.transport.exchange(Sequence.make(cursor), pending),
      changes: journal.changes,
    })
    socket.on('close', stop)
  })

  await new Promise<void>(resolve => server.listen(port, '127.0.0.1', resolve))
  const { port: bound } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${bound}/remote`,
    syncUrl: `ws://127.0.0.1:${bound}/sync`,
    close: () =>
      new Promise<void>(resolve => {
        for (const socket of sockets.clients) socket.terminate()
        sockets.close()
        server.close(() => {
          journal.close()
          backend.close()
          resolve()
        })
      }),
  }
}
