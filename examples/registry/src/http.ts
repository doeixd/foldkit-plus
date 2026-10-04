/**
 * The server on one port: Remote's reads at `/remote`, reached by
 * `Remote.http`, and the edits' journal at `/sync`, a WebSocket the replica
 * exchanges over. Authentication would choose the principal here; this
 * example has none.
 */
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Effect } from 'effect'
import { RemoteServer } from 'foldkit-remote-server'
import type { SocketLike } from 'foldkit-sync'
import { type WebSocket, WebSocketServer } from 'ws'
import { openJournal } from './journal.js'
import { openServer } from './server.js'

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
      // Decoded by the protocol's own schemas, so an operation is one of three.
      void Effect.runPromise(
        RemoteServer.answer(handlers, body).pipe(Effect.provide(backend.layer)),
      ).then(answered => reply(answered.status, answered.body))
    })
  })

  // Each socket exchanges with the journal, and is woken when another commits.
  const sockets = new WebSocketServer({ server, path: '/sync' })
  sockets.on('connection', socket => {
    const stop = journal.serve(socketLike(socket))
    socket.on('close', stop)
  })

  // What the table holds is recorded in the journal every few seconds, not
  // per edit: each record is a commit every replica hears of. A failed one
  // is tried again on the next tick.
  const absorbing = setInterval(() => {
    void Effect.runPromise(journal.absorb).catch(error =>
      console.error('Could not record what the table holds', error),
    )
  }, 5_000)

  await new Promise<void>(resolve => server.listen(port, '127.0.0.1', resolve))
  const { port: bound } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${bound}/remote`,
    syncUrl: `ws://127.0.0.1:${bound}/sync`,
    close: () =>
      new Promise<void>(resolve => {
        clearInterval(absorbing)
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
