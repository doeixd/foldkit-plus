/**
 * The browser entry: inject the compiled stylesheet, open the replica on
 * IndexedDB, mount the app, start the exchange loop, and expose the same
 * contract as WebMCP tools.
 */
import { Effect, Scope } from 'effect'
import { AgentWebMcp } from 'foldkit-agent-webmcp'
import { Sync } from 'foldkit-sync'
import { AddTodoForm, AppAgent, bindAgent } from './agent.js'
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

// The token names the person; the replica is this tab's store, and its id is
// the store's own, so a second browser for the same person is a second replica.
// A reload opens the same store, unsent operations included.
const storageScope = Effect.runSync(Scope.make())
const replica = await Effect.runPromise(
  Sync.tabStorage('foldkit-todo-app').pipe(
    Effect.flatMap(TodoSync.openReplica),
    Effect.provideService(Scope.Scope, storageScope),
  ),
)

const container = document.querySelector<HTMLElement>('#app')
if (container === null) throw new Error('#app is missing from the page')

const mounted = mountApp(replica, container, { as: token })

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
const modelContext = AgentWebMcp.pageModelContext()
if (modelContext !== undefined) {
  const registration = AgentWebMcp.register({ agent, modelContext, forms: [AddTodoForm] })
  void registration.refresh()
  window.addEventListener('beforeunload', () => registration.unregister())
}
