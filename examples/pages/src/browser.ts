import { Context, Effect, Layer, Option, Schema, Scope, Stream } from 'effect'
import { Style } from 'foldkit-mixins'
import { Sync, Transport, TransportSocket } from 'foldkit-sync'
import { Message, PeerPresence } from './app.js'
import { mountPages, PagesSync } from './contract.js'
import { sandboxSocket } from './sandbox/connection.js'
import { stylesheet } from './style.js'
import { view } from './view.js'

Style.install(stylesheet)

/**
 * A tab keeps its store, and with it every edit the server has not yet taken, across a
 * reload; a duplicated tab, which copies the first one's `sessionStorage`, opens a store of
 * its own (`Sync.tabStorage`). The replica's id is the store's, and the tab commits and
 * announces its presence under it. Each load also mints under a new session, so a reload
 * never reuses an id the last one minted.
 */
// The storage connection lives for the page.
const scope = Effect.runSync(Scope.make())
const replica = await Effect.runPromise(
  Sync.tabStorage('pages').pipe(
    Effect.flatMap(PagesSync.openReplica),
    Effect.provideService(Scope.Scope, scope),
  ),
)
const tab = `tab-${replica.replicaId}`
const session = `s${crypto.randomUUID().replaceAll('-', '')}`

const mounted = mountPages(session, replica, {
  container: document.getElementById('pages')!,
  view,
})
// `start` exchanges after each local edit and whenever the server announces a commit, and
// retries on a backoff while the server is down; the socket reconnects on its own. The
// edits wait in the replica's outbox meanwhile, across reloads too. The transport is built
// once, so presence can share its connection.
const built = await Effect.runPromise(
  Layer.buildWithScope(
    // The sandbox build (`--mode sandbox`) runs the journal in the browser, one for
    // every tab; `pnpm dev` reaches the Node server over a WebSocket.
    import.meta.env.MODE === 'sandbox'
      ? Sync.transport.socket({ makeSocket: sandboxSocket(tab) })
      : Sync.transport.socket({
          url: `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/sync?tab=${encodeURIComponent(tab)}`,
        }),
    scope,
  ),
)
const transport = Context.get(built, Transport)
Effect.runFork(replica.start.pipe(Effect.provideService(Transport, transport)))
// Its status counts an edit only once storage has it, so "saved" never runs ahead of the disk.
Effect.runFork(
  Stream.runForEach(replica.statusChanges, ({ pending, lastError }) =>
    Effect.sync(() =>
      mounted.dispatch(
        Message.ExchangeChanged({ pending, error: Option.fromUndefinedOr(lastError) }),
      ),
    ),
  ),
)

// Presence, on the same connection: where this tab's caret is, and where the others' are.
// It is ephemeral, so nothing of it is journaled; a tab that goes quiet drops out.
const socket = Context.get(built, TransportSocket)
const presence = await Effect.runPromise(
  Effect.gen(function* () {
    const channel = yield* Sync.presence.socketChannel<PeerPresence>(socket)
    return yield* Sync.presence.make({
      id: tab,
      ttl: '30 seconds',
      // A caret moves with every keystroke; peers need only the latest, 20 times a second.
      throttle: '50 millis',
      decodeValue: Schema.decodeUnknownSync(PeerPresence),
      channel,
    })
  }).pipe(Effect.provideService(Scope.Scope, scope)),
)
const name = `Guest ${tab.slice(-4)}`
let announced: string | undefined
const announce = (): void => {
  const model = mounted.model()
  const value: PeerPresence = {
    name,
    page: Option.getOrNull(model.open),
    selection: model.selection,
  }
  const key = JSON.stringify(value)
  if (key === announced) return
  announced = key
  Effect.runFork(presence.set(value))
}
mounted.subscribe(announce)
// A refresh within the time to live, which also re-announces after a reconnect.
setInterval(() => {
  announced = undefined
  announce()
  Effect.runFork(presence.prune)
}, 10_000)
presence.subscribe(() => {
  const peers = Effect.runSync(presence.peers)
    .filter(peer => peer.id !== tab)
    .map(peer => ({ id: peer.id, ...peer.value }))
  mounted.dispatch(Message.GotPeers({ peers }))
})
addEventListener('pagehide', () => Effect.runFork(presence.leave))
