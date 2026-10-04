/**
 * The browser entry: open the edits' replica on IndexedDB, mount the
 * application over it with Remote's HTTP transport beside, and start the
 * exchange loop over the journal's socket. `pnpm dev` serves it.
 */
import { Effect, Scope } from 'effect'
import { Style } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'
import { Theme } from 'foldkit-mixins/theme'
import { Remote } from 'foldkit-remote'
import { ReplicaId, Sync } from 'foldkit-sync'
import { RegistrySync, mountRegistry } from './sync.js'

// The theme's tokens, which the grid's default style reads.
Style.install(
  AppStyle.make({ palette: Theme.oklch({ accent: { h: 250, c: 0.12, l: '55%' } }) }).stylesheet,
)

const container = document.getElementById('app')
if (container === null) throw new Error('index.html has no #app')

// One replica per tab, and its storage named after it: a reload opens the same
// one, edits it has not sent included, while two tabs never write one storage.
// The id lives as long as the tab does.
const replicaKey = 'foldkit-registry/replica'
const replicaId = sessionStorage.getItem(replicaKey) ?? crypto.randomUUID()
sessionStorage.setItem(replicaKey, replicaId)
const storageScope = Effect.runSync(Scope.make())
const storage = await Effect.runPromise(
  Effect.provideService(
    Sync.indexedDb(`foldkit-registry/edits/${replicaId}`),
    Scope.Scope,
    storageScope,
  ),
)
const replica = await Effect.runPromise(
  RegistrySync.openReplica(ReplicaId.make(replicaId), storage),
)

// Vite proxies `/remote` and `/sync` to the server, so the browser talks to one origin.
mountRegistry(replica, { container, resources: Remote.clientLayer(Remote.http('/remote')) })

const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
Effect.runFork(
  Effect.provide(
    replica.start,
    Sync.transport.socket({ url: `${protocol}://${location.host}/sync` }),
  ),
)
