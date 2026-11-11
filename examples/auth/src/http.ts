/**
 * The host (`host.ts`) as a Node server, with the board's socket beside it:
 * Yielded's routes under `/auth`, Remote at `/remote`, and an upgrade to
 * `/sync`. Vite draws the pages and proxies the rest here, so the page, its
 * cookie and these requests share one origin.
 */
import { STATUS_CODES, createServer, type IncomingMessage, type Server } from 'node:http'
import type { Duplex } from 'node:stream'
import { Result } from 'effect'
import { Host } from 'foldkit-host'
import type { HostSocket } from 'foldkit-sync/journal'
import { WebSocketServer, type WebSocket } from 'ws'
import type { AddressInfo } from 'node:net'
import { openHost } from './host.js'

/** The headers of an upgrade request, as a Fetch API `Headers`. */
const headersOf = (request: IncomingMessage): Headers => {
  const headers = new Headers()
  for (const [name, value] of Object.entries(request.headers)) {
    for (const each of [value ?? []].flat()) headers.append(name, each)
  }
  return headers
}

/** One `ws` socket as the host serves on it. */
const hostSocket = (socket: WebSocket): HostSocket => ({
  send: data => socket.send(data),
  close: () => socket.close(),
  closeWith: (code, reason) => socket.close(code, reason),
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

/** A refusal written on the raw connection, before any socket opened on it. */
const refuseUpgrade = async (connection: Duplex, response: Response): Promise<void> => {
  const body = await response.text()
  connection.end(
    `HTTP/1.1 ${response.status} ${STATUS_CODES[response.status] ?? ''}\r\n` +
      `content-type: application/json\r\ncontent-length: ${Buffer.byteLength(body)}\r\n` +
      `connection: close\r\n\r\n${body}`,
  )
}

export const startHttpServer = async (
  port: number,
  origin: string,
): Promise<{ readonly url: string; readonly close: () => Promise<void> }> => {
  // Vite draws the pages in development, and proxies the rest here.
  const host = await openHost(origin, {
    fetch: async () => Response.json({ error: 'not found' }, { status: 404 }),
  })

  const server: Server = createServer(
    Host.node((request: Request) => host.fetch(request), {
      env: { ORIGIN: origin },
      origin: 'ORIGIN',
    }),
  )

  // The board's socket: asked whom it serves before it opens, as `documentHost` decides.
  const sockets = new WebSocketServer({ noServer: true })
  server.on('upgrade', (request: IncomingMessage, connection: Duplex, head: Buffer) => {
    // Node takes its own error listener off an upgraded connection; a reset must not crash it.
    connection.on('error', () => connection.destroy())
    if (new URL(request.url ?? '/', origin).pathname !== '/sync') return void connection.destroy()
    host
      .sync(new Request(`${origin}${request.url}`, { headers: headersOf(request) }))
      .then(answered =>
        Result.match(answered, {
          onFailure: response => refuseUpgrade(connection, response),
          onSuccess: ({ serve, abandon }) => {
            // `ws` drops the callback for a client gone while the resolver ran,
            // a bad handshake or a closing server: what the upgrade built goes.
            if (connection.destroyed) return abandon()
            let served = false
            connection.once('close', () => {
              if (!served) abandon()
            })
            sockets.handleUpgrade(request, connection, head, socket => {
              served = true
              serve(hostSocket(socket))
            })
          },
        }),
      )
      .catch((error: unknown) => {
        console.error('examples/auth: an upgrade failed', error)
        connection.destroy()
      })
  })

  await new Promise<void>(resolve => server.listen(port, '127.0.0.1', resolve))
  const { port: bound } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${bound}`,
    close: () =>
      new Promise<void>(resolve => {
        for (const socket of sockets.clients) socket.terminate()
        server.closeAllConnections()
        server.close(() => void host.close().finally(resolve))
      }),
  }
}
