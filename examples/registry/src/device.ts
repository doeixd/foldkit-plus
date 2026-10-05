/**
 * One device of the registry in a page: its replica on IndexedDB, the
 * application mounted over it, and the exchange loop over its transport,
 * paused while the device works offline. `client.ts` starts one against
 * `pnpm dev`'s server; the sandbox starts two against its host.
 */
import { Context, Effect, Layer, Option, Schema, Scope } from 'effect'
import type { RemoteClient } from 'foldkit-remote'
import {
  ReplicaId,
  Sync,
  Transport,
  type Mounted,
  type SocketLike,
  type TransportError,
} from 'foldkit-sync'
import { Message, PeerPresence, type Model } from './app.js'
import { RegistrySync, mountRegistry, pausable } from './sync.js'

export const startDevice = async (options: {
  readonly container: HTMLElement
  /** Where the tab keeps this device's replica id, so a reload opens the same replica. */
  readonly key: string
  /** The name the device commits as, from its replica's id. */
  readonly name: (replicaId: string) => string
  readonly resources: Layer.Layer<RemoteClient>
  /** The device's way to the journal, as the name it commits as. */
  readonly transport: (device: string) => Layer.Layer<Transport, TransportError>
}): Promise<Mounted<Model, Message>> => {
  // One replica per device, and its storage named after it: a reload opens the
  // same one, edits it has not sent included, while two never write one storage.
  // The id lives as long as the tab does.
  const replicaId = sessionStorage.getItem(options.key) ?? crypto.randomUUID()
  sessionStorage.setItem(options.key, replicaId)
  // What the device opens (its storage, its socket) lives as long as the page.
  const scope = Effect.runSync(Scope.make())
  const storage = await Effect.runPromise(
    Effect.provideService(
      Sync.indexedDb(`foldkit-registry/${RegistrySync.documentId}/${replicaId}`),
      Scope.Scope,
      scope,
    ),
  )
  const replica = await Effect.runPromise(
    RegistrySync.openReplica(ReplicaId.make(replicaId), storage),
  )
  const device = options.name(replicaId)
  const { mounted } = mountRegistry(replica, {
    container: options.container,
    resources: options.resources,
    device,
  })

  // One connection for the device, paused while the offline switch is on, and
  // built once, so the exchange loop and a wake-up share it.
  const transport = pausable(options.transport(device), () => mounted.model().offline)
  const built = await Effect.runPromise(Layer.buildWithScope(transport, scope))
  Effect.runFork(Effect.provide(replica.start, built))

  // Back online, exchange at once rather than at the end of the replica's backoff.
  let offline = mounted.model().offline
  mounted.subscribe(() => {
    const now = mounted.model().offline
    if (offline && !now) Effect.runFork(Effect.ignore(Effect.provide(replica.synchronize, built)))
    offline = now
  })

  // Presence, on the same connection: the cell this device has focused, and
  // where the others are. It is passing, so nothing of it is journaled, and a
  // device that goes quiet drops out. A transport with no socket has none.
  const socket = Context.get(built, Transport).socket
  if (socket !== undefined) await sharePresence(mounted, socket, device, scope)
  return mounted
}

const decodePeer = Schema.decodeUnknownSync(PeerPresence)

const sharePresence = async (
  mounted: Mounted<Model, Message>,
  socket: SocketLike,
  device: string,
  scope: Scope.Closeable,
) => {
  const presence = await Effect.runPromise(
    Effect.gen(function* () {
      const channel = yield* Sync.presence.socketChannel<PeerPresence>(socket)
      return yield* Sync.presence.make({
        id: device,
        ttl: '30 seconds',
        // A focus moves with every key; the others need only the latest, ten times a second.
        throttle: '100 millis',
        decodeValue: decodePeer,
        channel,
      })
    }).pipe(Effect.provideService(Scope.Scope, scope)),
  )
  // Said only when it changed, and not at all offline: working offline is
  // being away, so the device leaves, and shows no one.
  let said: string | undefined
  const announce = () => {
    const model = mounted.model()
    if (model.offline) {
      if (said !== undefined) Effect.runFork(presence.leave)
      said = undefined
      if (model.peers.length > 0) mounted.dispatch(Message.PeersChanged({ peers: [] }))
      return
    }
    const cell = model.grid.focus.current
    const value: PeerPresence = {
      name: device,
      row: Option.match(cell, { onNone: () => null, onSome: ({ row }) => row }),
      column: Option.match(cell, { onNone: () => null, onSome: ({ column }) => column }),
    }
    const key = JSON.stringify(value)
    if (key === said) return
    said = key
    Effect.runFork(presence.set(value))
  }
  mounted.subscribe(announce)
  announce()
  // A refresh within the time to live, which also re-announces after a reconnect.
  setInterval(() => {
    said = undefined
    announce()
    Effect.runFork(presence.prune)
  }, 10_000)
  presence.subscribe(() => {
    if (mounted.model().offline) return
    const peers = Effect.runSync(presence.peers).flatMap(peer =>
      peer.id === device || peer.value.row === null || peer.value.column === null
        ? []
        : [{ name: peer.value.name, row: peer.value.row, column: peer.value.column }],
    )
    mounted.dispatch(Message.PeersChanged({ peers }))
  })
  addEventListener('pagehide', () => Effect.runFork(presence.leave))
}
