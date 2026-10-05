/**
 * One device of the registry in a page: its replica on IndexedDB, the
 * application mounted over it, and the exchange loop over its transport,
 * paused while the device works offline. `client.ts` starts one against
 * `pnpm dev`'s server; the sandbox starts two against its host.
 */
import { Effect, Layer, Scope } from 'effect'
import type { RemoteClient } from 'foldkit-remote'
import { ReplicaId, Sync, type Mounted, type Transport, type TransportError } from 'foldkit-sync'
import type { Message, Model } from './app.js'
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
  return mounted
}
