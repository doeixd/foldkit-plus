/**
 * The server on one port: Remote's reads and live streams at `/remote`,
 * reached by `Remote.httpWithLive`, and the edits' journal at `/sync`, a WebSocket the replica
 * exchanges over. Authentication would choose the principal here; this
 * example has none.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Effect } from 'effect'
import { serveFetch } from 'foldkit-remote-server/fetch'
import type { SocketLike } from 'foldkit-sync'
import { type WebSocket, WebSocketServer } from 'ws'
import { memoryJournal } from './journalNode.js'
import { openServer } from './server.js'
import { memorySqlite } from './sqliteNode.js'
import { everyone } from './sync.js'

/**
 * One Node request answered by a Fetch handler: its body read whole, the
 * answer's bytes written as they come, so a live stream reaches the page as
 * it goes. A page that leaves cancels the answer, which ends its stream.
 */
const respond = async (
  answer: (request: Request, env: undefined) => Promise<Response>,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> => {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(chunk as Buffer)
  const headers = new Headers()
  for (const [name, value] of Object.entries(request.headers)) {
    if (typeof value === 'string') headers.set(name, value)
  }
  const answered = await answer(
    new Request(`http://localhost${request.url ?? '/'}`, {
      method: request.method ?? 'GET',
      headers,
      ...(request.method === 'POST' ? { body: Buffer.concat(chunks) } : {}),
    }),
    undefined,
  )
  response.writeHead(answered.status, Object.fromEntries(answered.headers))
  if (answered.body === null) return void response.end()
  const reader = answered.body.getReader()
  response.on('close', () => void reader.cancel())
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    response.write(value)
  }
  response.end()
}

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
  const backend = openServer(memorySqlite())
  const journal = memoryJournal(backend)
  // Reads, queries and mutations answered as JSON; live requirements as a
  // stream of events, which the table's writes reach through the hub.
  const answer = serveFetch({
    server: backend.server,
    resolvePrincipal: () => null,
    layer: () => backend.layer,
    live: backend.live,
  })

  const server: Server = createServer((request, response) => {
    // A stream that breaks partway ends the response; the page's live entry
    // resubscribes. Before the head is sent, it is this side's failure.
    respond(answer, request, response).catch(() => {
      if (!response.headersSent) response.writeHead(500)
      response.end()
    })
  })

  // Each socket exchanges with the journal, and is woken when another commits.
  const sockets = new WebSocketServer({ server, path: '/sync' })
  // A connection names its device (`?device=tab-1a2b`), and commits as it, so
  // a page can tell another device's edit from its own. Nothing checks the
  // name: a real deployment would authenticate here.
  sockets.on('connection', (socket, request) => {
    const named = new URL(request.url ?? '', 'ws://localhost').searchParams.get('device')
    const principal = named !== null && /^[\w-]{1,40}$/.test(named) ? { actorId: named } : everyone
    const stop = journal.serve(socketLike(socket), principal)
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
