import { Context, Effect, Layer, Schema, Scope } from 'effect'
import { ReplicaId, Sync, Transport } from 'foldkit-sync'
import { Message, PeerPresence } from './app.js'
import { mountPages, PagesSync } from './contract.js'
import { view } from './view.js'

/** Holds a tab's name for the page's lifetime; false when another tab holds it already. */
const claim = (name: string): Promise<boolean> =>
  new Promise(resolve => {
    void navigator.locks.request(`pages-tab:${name}`, { ifAvailable: true }, lock => {
      resolve(lock !== null)
      // Held until the page goes: the lock is released with it.
      return lock === null ? undefined : new Promise<never>(() => {})
    })
  })

/**
 * A tab keeps its replica, and with it every edit the server has not yet taken, across a
 * reload: its name lives in `sessionStorage`. A duplicated tab copies that storage, and two
 * writers on one replica's storage refuse each other's saves, so a name another tab holds
 * is not reused: this tab takes a new one, with a replica of its own. Each load also mints
 * under a new session, so a reload never reuses an id the last one minted.
 */
const kept = sessionStorage.getItem('pages-tab')
const tab = kept !== null && (await claim(kept)) ? kept : `tab-${crypto.randomUUID()}`
if (tab !== kept) await claim(tab)
sessionStorage.setItem('pages-tab', tab)
const session = `s${crypto.randomUUID().replaceAll('-', '')}`

// The storage connection lives for the page.
const scope = Effect.runSync(Scope.make())
const replica = await Effect.runPromise(
  Effect.gen(function* () {
    const storage = yield* Effect.provideService(Sync.indexedDb(`pages/${tab}`), Scope.Scope, scope)
    return yield* PagesSync.openReplica(ReplicaId.make(tab), storage)
  }),
)
const mounted = mountPages(session, replica, {
  container: document.getElementById('pages')!,
  view,
})
// `start` exchanges after each local edit and whenever the server announces a commit, and
// retries on a backoff while the server is down; the socket reconnects on its own. The
// edits wait in the replica's outbox meanwhile, across reloads too. The transport is built
// once, so presence can share its connection.
const transport = Context.get(
  await Effect.runPromise(
    Layer.buildWithScope(
      Sync.transport.socket({ url: `ws://127.0.0.1:8787/?tab=${encodeURIComponent(tab)}` }),
      scope,
    ),
  ),
  Transport,
)
Effect.runFork(replica.start.pipe(Effect.provideService(Transport, transport)))

// Presence, on the same connection: where this tab's caret is, and where the others' are.
// It is ephemeral, so nothing of it is journaled; a tab that goes quiet drops out.
const presence = await Effect.runPromise(
  Effect.gen(function* () {
    const channel = yield* Sync.presence.socketChannel<PeerPresence>(transport.socket!)
    return yield* Sync.presence.make({
      id: tab,
      ttl: '30 seconds',
      // A caret moves with every keystroke; peers need only the latest, a few times a second.
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
  const value: PeerPresence = { name, page: model.open, selection: model.selection }
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
