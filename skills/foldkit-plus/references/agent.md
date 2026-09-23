# foldkit-agent and its adapters

Packages: `foldkit-agent` (the contract and runtime), plus the adapters `foldkit-agent-webmcp`, `foldkit-agent-mcp`, `foldkit-agent-a2a`, and `foldkit-agent-native`. Peers: `foldkit`, `effect` (v4); adapters also peer on `foldkit-agent`. `foldkit-surface` is a regular dependency of `foldkit-agent`.

## 1. Purpose

An agent drives a Foldkit app **only through Messages `update` already handles**. A capability *is* a Message, so there is no second implementation to keep in step. The contract has two boundaries:

```text
Model         -> context (a foldkit-surface Projection/Surface)   what an agent may see
Message union -> Agent.expose (opt-in; there is no exposeAll)     what an agent may do
```

`update` stays the single owner of every transition. Adapters translate a protocol into the runtime's pipeline and add **no authority**: they do not decide input validity, availability, or authorization.

Use it when an assistant, a copilot, or another service should operate the app the way a person does; not for DOM automation (add the Message first), exposing the whole Model, exactly-once external effects (completion is not idempotency), or a stateless function with no Model/Message boundary.

## 2. Mental model

```text
Agent.forApplication(App)[.withPrincipal<P>()]   builder: infers Model (and fixes Principal)
  .make({ context, messages, resources })        Definition: pure data, no I/O, no state
  .bind({ definition, host, audit? })            AgentRuntime: live policy over a host
      host = { model, dispatch, subscribe?, observe?, principal? }
  -> adapter (WebMCP / MCP / A2A / Agent Native)  translation only
```

Each call runs the same pipeline: **resolve** the capability (by constructor or name), check **`available(model)`**, **decode** the input, check **`authorize`**, **construct and dispatch** the Message, then **await completion** if one is declared. A refusal before dispatch sends no Message. Steps 2 to 5 read **one Model snapshot**, taken once per invocation.

Host fields: `model()` returns an immutable current Model. `dispatch(message)` may return void, a Promise, or an Effect. `subscribe` is needed for `Agent.when({ projection })` and for tools that follow the Model. `observe` sees every applied Message and is needed for Message completion. `principal(invocation)` is required when any hook reads a principal. `Sync.mount` returns a host of this shape.

## 3. Minimal example

```ts
import { Effect, Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Agent } from 'foldkit-agent'
import { Projection, Surface } from 'foldkit-surface'

const Model = Schema.Struct({
  todos: Schema.Array(Schema.Struct({ id: Schema.String, title: Schema.String })),
  selectedTodoId: Schema.Option(Schema.String),
  lastError: Schema.Option(Schema.String),
})
type Model = typeof Model.Type

const Message = defineMessageUnion({
  RequestedCreateTodo: { title: Schema.String },
  RequestedDeleteTodo: { id: Schema.String },
  FailedToLoadTodos: { message: Schema.String }, // not exposed: unreachable by agents
})
type Message = typeof Message.Type

const App = Surface.application({ Model, Message })
const TodoAgent = Agent.forApplication(App)

const AppAgent = TodoAgent.make({
  context: Projection.pick(App.model.todos, App.model.selectedTodoId), // lastError hidden
  messages: TodoAgent.expose(Message, {
    RequestedCreateTodo: 'Create a new todo', // name defaults to requested_create_todo
    RequestedDeleteTodo: {
      name: 'delete_todo',
      description: 'Delete a todo',
      available: model => model.todos.length > 0,
    },
  }),
})

// The contract joins an assembly contract-only, so the Module sees it.
const wiring = AppAgent.wiring()

declare const currentModel: () => Model
declare const sendToRuntime: (message: Message) => void
declare const onModelChange: (listener: () => void) => () => void

const agentRuntime = TodoAgent.bind({
  definition: AppAgent,
  host: { model: currentModel, dispatch: sendToRuntime, subscribe: onModelChange },
})

// Both forms are type-checked. The constructor form survives renames.
await Effect.runPromise(agentRuntime.messages.dispatch(Message.RequestedDeleteTodo, { id: 't1' }))
await Effect.runPromise(agentRuntime.messages.dispatch('delete_todo', { id: 't1' }))
```

`make` only describes. `bind` performs no I/O. `dispatch` returns an `Effect` that fails with tagged errors: `AgentUnknownCapabilityError`, `AgentCapabilityUnavailableError`, `AgentInvalidInputError`, `AgentAuthorizationError`, `AgentCancelledError`, `AgentCompletionTimeoutError`. Use `Effect.catchTag` to handle them. Adapters that read an unchecked name and payload off the wire call `agentRuntime.messages.dispatchUnknown(name, payload, invocation)`. `messages.available` lists the capabilities offered in the current Model.

## 4. Common tasks

### Variant config, principal, mapped input

```ts
interface Principal { readonly userId: string; readonly isOwner: boolean }
const OwnedAgent = Agent.forApplication(App).withPrincipal<Principal>()

const Owned = OwnedAgent.make({
  messages: OwnedAgent.expose(Message, {
    RequestedDeleteTodo: {
      name: 'delete_selected_todo',          // must match [a-zA-Z0-9_-]{1,128}, checked at expose
      description: 'Delete the selected todo', // required
      available: model => Option.isSome(model.selectedTodoId), // does it exist right now?
      authorize: ({ principal, input, model, transport }) => principal.isOwner, // may this caller?
      input: Schema.Struct({}),               // external input; must be paired with toMessage
      toMessage: (_, { model }) => ({ id: Option.getOrThrow(model.selectedTodoId) }),
    },
  }),
})

declare const principalFromSession: () => Principal
const ownedRuntime = OwnedAgent.bind({
  definition: Owned,
  host: { model: currentModel, dispatch: sendToRuntime, principal: principalFromSession },
})
```

- `getOrThrow` is safe because `toMessage` sees the same snapshot `available` approved.
- `input` without `toMessage` is a type error and a runtime error.
- Input is typed as the schema's **encoded** side. For example, `NumberFromString` is sent as a string and reaches `update` as a number.
- A tag with an acronym normalizes badly (every capital starts a word), so give it an explicit `name`.
- `MessageSet.make(App, [...])` with `Agent.exposeSubset(subset, variants)` exposes a subset. `Agent.forModel<Model, Principal>()` covers the case where there is no `Surface.application`.

### Completion: resolve on the fact, not on receipt

Without a completion contract, a validated dispatch counts as done and `result.completion` is absent. On a Message contract the host must provide `observe`, or `bind` refuses it. Wrap the variant in `Agent.variant` so that `correlate` narrows to the named Messages:

```ts
const Messages2 = defineMessageUnion({
  RequestedDelete: { id: Schema.String },
  DeletedTodo: { id: Schema.String },
  FailedDeleteTodo: { id: Schema.String, reason: Schema.String },
})

const DeleteAgent = Agent.forModel<Model>()
const WithCompletion = DeleteAgent.make({
  messages: DeleteAgent.expose(Messages2, {
    RequestedDelete: Agent.variant({
      description: 'Delete a todo',
      input: Schema.Struct({ id: Schema.String }),
      toMessage: ({ id }) => ({ id }),
      completion: {
        success: Messages2.DeletedTodo,
        failure: Messages2.FailedDeleteTodo,
        correlate: (request, result) => request.id === result.id, // needed if calls can overlap
        timeout: '10 seconds', // default 30s, measured from host.dispatch
      },
    }),
  }),
})
```

The result carries `completion: { status: 'completed' | 'failed', message }`.

To complete on **state** instead, use `Agent.when`. The Model form needs `host.subscribe`:

```ts
RenamedList: {
  description: 'Rename the list',
  completion: Agent.when({
    projection: Projection.struct({ listTitle: App.model.listTitle }),
    predicate: ({ listTitle }, request) => listTitle === request.title.trim(),
  }),
}
// A value outside the Model: Agent.when({ source: mounted.committed, predicate }),
// where the source is foldkit-sync's server-confirmed slice ({ get, subscribe }).
```

- **Completed means the condition holds, not that this call made it true.** A state that already holds completes at once. Write a predicate only this call can satisfy. For creations, complete on the Message with `correlate`.
- A state result has `status: 'completed'` and no `message`. A predicate that throws fails only that invocation. `Agent.when` declares no failure, so an unmet state ends at the timeout.
- A timeout or an abort **does not undo** anything, because the Message already reached `update`. An abort before the host's `dispatch` returns means delivery is unknown: `AgentCancelledError` has `dispatched: false` and the audit records `decision: 'unknown'`. A signal that is already aborted is refused before the Model is read.

### Resources, audit, manifest

- `resources: [Agent.resource('todos', { description, schema: Model.fields.todos, read: model => model.todos })]` in `make`; MCP serves them as `app://<name>` and the context as `app://context`.
- `Agent.auditLog({ capacity, principal: p => p.userId, includeInput, redact: ['token'] })` passed as `bind({ audit })`; `audit.entries()` lists decisions. It never stores the Model, and a throwing sink never fails a dispatch.
- `Agent.toManifest(definition)` (agent.json, commit it so exposure changes show in review), `Agent.toMarkdown(definition)`, and `Agent.messages(definition)` for tests without an LLM.

## 5. Adapters (all serve one bound runtime)

| Where the caller runs | Adapter |
| --- | --- |
| An agent inside the page, beside the user | `foldkit-agent-webmcp` |
| An external MCP client (stdio or Streamable HTTP) | `foldkit-agent-mcp` |
| Another agent over A2A | `foldkit-agent-a2a` |
| An Agent Native action registry | `foldkit-agent-native` |

```ts
import { AgentWebMcp } from 'foldkit-agent-webmcp'
const modelContext = AgentWebMcp.documentModelContext() // undefined in SSR or without WebMCP support
if (modelContext !== undefined) {
  const registration = AgentWebMcp.register({ agent: agentRuntime, modelContext })
  await registration.refresh() // wait until the browser accepts the current tool set
  addEventListener('pagehide', () => registration.unregister())
}
```
WebMCP is experimental and no stable browser ships it, so always feature-detect it. `register` throws when there is no model context. Only **currently available** capabilities are registered. With `followModel: true` (the default) and `host.subscribe`, the tools are reconciled when the Model changes. For tests, pass a fake `{ registerTool }` as `modelContext`.

```ts
import { AgentMcp } from 'foldkit-agent-mcp'
import * as HttpEffect from 'effect/unstable/http/HttpEffect'
AgentMcp.stdio({ agent: agentRuntime }) // stdout carries the protocol, so log to stderr
const handler = HttpEffect.toWebHandler(AgentMcp.httpApp({
  authenticate: request => verify(request.headers['authorization']), // the only source of principal
  createAgent: ({ principal }) => bindAgentFor(principal),            // one runtime per session
  allowedOrigins: ['https://app.example'],
}))
```
- MCP handling: an unknown tool or bad arguments returns JSON-RPC `-32602`. An unavailable, unauthorized, cancelled, or failed call returns a tool result with `isError: true`.
- `tools/list` follows availability and emits `list_changed` only when that set changes.
- `AgentMcp.handler({ agent, onNotification })` is the transport-free handler. `httpHandler` provides the same logic for stacks without Effect HTTP.
- An HTTP session id is not a bearer token: a different principal presenting it gets a 404. Pass `principalId` when the principal has fields that vary per request.

```ts
import { AgentA2a } from 'foldkit-agent-a2a'
const card = AgentA2a.agentCard(AppAgent, { name: 'Todos', description: 'A todo list', url: 'https://todos.example/a2a' })
// serve `card` at AgentA2a.AGENT_CARD_PATH ('/.well-known/agent-card.json')
const served = AgentA2a.handler({ agent: agentRuntime }) // served.handle(jsonRpc): message/send, tasks/get, tasks/cancel
```
- The card is static. Capabilities are tagged `conditional` (they have `available`) or `authorized`, and both are re-checked at call time.
- A request refused before dispatch gives `rejected`. An accepted call whose failure Message arrives or that times out gives `failed`. `AgentCancelledError` gives `canceled`, and an unexpected defect gives `failed`.
- Streaming, push notifications, multi-turn flows, and file parts are not supported.

```ts
import { AgentNative } from 'foldkit-agent-native'
import { registerPackageActions } from '@agent-native/core/server'
registerPackageActions(AgentNative.actions({
  definition: Owned,
  resolveRuntime: context => OwnedAgent.bind({ // runs per invocation
    definition: Owned,
    host: { model: currentModel, dispatch: sendToRuntime, principal: () => principalFor(context) },
  }),
}))
```
- `principal` goes **inside `host`**, beside `model` and `dispatch`.
- Map the Agent Native caller to your principal yourself. The adapter never infers identity from fields such as `userEmail`.
- `run` returns `{ ok: false, message }` for refusals, so read `ok`: the framework can report a call as complete when the app refused it.
- Entries are `POST`, `requiresAuth: true`, and `readOnly: false`.
- Only object input schemas are supported, and excess fields are rejected.

## 6. Security and gotchas

- **Agent authorization improves the interface. The server still owns trust.** Apply the same predicate at the authoritative boundary too, for example the Sync/Durable journal: `examples/todo-app` uses `isOwner` in both places.
- `available` runs **before** `authorize`. An unavailable capability is hidden and refused by name (`AgentCapabilityUnavailableError`), so an authorization result for something that does not exist cannot leak. Knowing a tool name does not bypass the check.
- Decoding rejects undeclared fields, matching `additionalProperties: false`. A capability with no payload accepts only `{}`.
- Error messages are written for the calling agent and never repeat decode details, which stay on `cause`. Adapters flatten host defects into a generic failure.
- Expose **intents** such as `RequestedTodo`, not facts such as `SubmittedTodo`. Otherwise the agent mints ids and timestamps. Then complete on the fact.
- The host must accept every Message the contract can build: a wider union is fine, a narrower one is a type error. When a hook reads a principal, the host must have a `principal` provider.
- MCP over HTTP ignores a principal sent in request params and refuses an `Origin` that is not allowlisted. An unauthenticated server should listen on localhost only.
- Agent Native keeps the first registration of a name and skips `Object.prototype` names such as `__proto__`.

## 7. See also

- https://github.com/doeixd/foldkit-plus/blob/main/docs/agents.md
- https://github.com/doeixd/foldkit-plus/blob/main/packages/agent/README.md
- https://github.com/doeixd/foldkit-plus/blob/main/packages/agent-webmcp/README.md
- https://github.com/doeixd/foldkit-plus/blob/main/packages/agent-mcp/README.md
- https://github.com/doeixd/foldkit-plus/blob/main/packages/agent-a2a/README.md
- https://github.com/doeixd/foldkit-plus/blob/main/packages/agent-native/README.md
- https://github.com/doeixd/foldkit-plus/blob/main/examples/todo/src/agent.ts
- https://github.com/doeixd/foldkit-plus/blob/main/examples/todo-app/src/agent.ts
- https://github.com/doeixd/foldkit-plus/blob/main/docs/design/agent-DESIGN.md
