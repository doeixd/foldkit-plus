/**
 * The browser entry: inject the compiled stylesheet, open the replica on
 * IndexedDB, mount the app, start the exchange loop, and expose the same
 * contract as WebMCP tools.
 */
import { Effect, Scope } from 'effect'
import { AgentWebMcp } from 'foldkit-agent-webmcp'
import { ReplicaId, Sync } from 'foldkit-sync'
import { AppAgent, bindAgent } from './agent.js'
import type { Message } from './app.js'
import type { Principal } from './principal.js'
import { mountApp } from './runtime.js'
import { sandboxSocket } from './sandbox/connection.js'
import { stylesheet } from './sheet.js'
import { TodoSync } from './sync.js'

// The rule-based styles (`pseudo`, `media`, `nest`) compiled to CSS once, at
// module load, from the same Style values the views resolve.
const styles = document.createElement('style')
styles.textContent = stylesheet
document.head.append(styles)

const token = new URLSearchParams(location.search).get('token') ?? 'owner'
// `pnpm dev` exchanges with the journal server over a WebSocket; the sandbox
// build (`--mode sandbox`) runs the journal in the browser, one for every tab.
const sandboxed = import.meta.env.MODE === 'sandbox'
const transport = sandboxed
  ? Sync.transport.socket({ makeSocket: sandboxSocket(token) })
  : Sync.transport.socket({
      url: `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/sync?token=${encodeURIComponent(token)}`,
    })

// The token names the person; the replica is this tab. Operation ids are the
// replica's id and a count, so a replica named by the token restarted its count
// in a second browser, and the journal refused each new operation as a reused
// id. A reload opens the same replica, unsent operations included.
const replicaKey = 'foldkit-todo-app/replica'
const replicaId = sessionStorage.getItem(replicaKey) ?? crypto.randomUUID()
sessionStorage.setItem(replicaKey, replicaId)
const storageScope = Effect.runSync(Scope.make())
// Opening IndexedDB and reading the replica back are asynchronous.
const storage = await Effect.runPromise(
  Effect.provideService(Sync.indexedDb(`foldkit-todo-app/${replicaId}`), Scope.Scope, storageScope),
)
const replica = await Effect.runPromise(TodoSync.openReplica(ReplicaId.make(replicaId), storage))

const container = document.querySelector<HTMLElement>('#app')
if (container === null) throw new Error('#app is missing from the page')

// The sandbox says what to try. The app draws it: its view is the whole body,
// so an element placed beside the app's container would not survive the first draw.
const mounted = mountApp(
  replica,
  container,
  sandboxed
    ? {
        note: `The server runs in this browser; nothing is sent anywhere. You are ${token}. Open this page in a second tab, or add ?token=${token === 'bob' ? 'alice' : 'bob'} to the address to be someone else, and a todo added in one shows in the other. Only owner may clear or rename the list.`,
      }
    : {},
)

// The exchange loop: once, then after every submit, until the page unloads.
// Committed operations from other replicas re-install the shared slice
// through the mount; nothing here has to forward them.
Effect.runFork(Effect.provide(replica.start, transport))

// The same contract, as browser tools, where the browser supports WebMCP. The
// host is the mount itself: `observe` lets `add_todo` wait for its fact.
const principal: Principal = { actorId: token }
const agent = bindAgent({
  definition: AppAgent,
  host: {
    model: mounted.model,
    dispatch: (message: Message) => {
      mounted.dispatch(message)
    },
    subscribe: mounted.subscribe,
    observe: mounted.observe,
    principal: () => principal,
  },
})
const modelContext = AgentWebMcp.documentModelContext()
if (modelContext !== undefined) {
  const registration = AgentWebMcp.register({ agent, modelContext })
  void registration.refresh()
  window.addEventListener('beforeunload', () => registration.unregister())
}
