/**
 * The sync server: the journal behind a WebSocket. It runs apart from the page's server, so
 * stopping it shows what a replica does offline: edits go on, and are kept, until it is back.
 */
import { fileURLToPath } from 'node:url'
import { Sequence, Sync, type SocketLike } from 'foldkit-sync'
import { WebSocketServer, type WebSocket } from 'ws'
import { openJournal } from './journal.js'

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

// The journal is a file, so pages outlive the server.
const journal = openJournal(fileURLToPath(new URL('../pages.sqlite', import.meta.url)))
// Presence fans out to every tab; each tab validates what it receives.
const presence = Sync.presence.hub<unknown>()
const sockets = new WebSocketServer({ host: '127.0.0.1', port: 8787 })
sockets.on('connection', (socket, request) => {
  // A real deployment authenticates here; this one trusts the tab's name.
  const actor = new URL(request.url ?? '', 'ws://localhost').searchParams.get('tab') ?? 'guest'
  const transport = journal.transport(actor)
  // Each commit is announced to every tab, so a tab that is only reading sees others' typing.
  const stops = [
    Sync.transport.serve(socketLike(socket), {
      exchange: (cursor, pending) => transport.exchange(Sequence.make(cursor), pending),
      changes: journal.subscribe,
    }),
    // On the same socket: the connection's tab is the identity its presence goes out under.
    Sync.presence.serve(socketLike(socket), presence, { peerId: actor }),
  ]
  socket.on('close', () => {
    for (const stop of stops) stop()
  })
})

console.log('Sync server on ws://127.0.0.1:8787')
