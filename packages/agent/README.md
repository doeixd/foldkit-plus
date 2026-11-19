# `foldkit-agent`

Letting an AI assistant or external service operate a web app usually ends up creating a second API layer with duplicated validation, separate authorization checks, and tool handlers that drift out of step with the UI. You want an assistant to use the exact same state transitions your buttons trigger, while seeing only the fields you choose to share.

`foldkit-agent` turns your Foldkit `Model` (your application state) and `Message` union (the actions sent to `update`) into a typed, protocol-neutral agent contract. You pick a read-only `Projection` from `foldkit-surface` for what the agent may read, expose selected Message variants with `Agent.expose` for what it may do, and bind the contract to your running app with `Agent.host` or `Agent.headless`. Protocol adapters (`foldkit-agent-mcp`, `foldkit-agent-webmcp`, `foldkit-agent-a2a`, `foldkit-agent-native`) serve that single contract over MCP, browser WebMCP, A2A, and Agent Native. See it running in [the live Todo agent demo](https://foldkit-todo-demo.pages.dev/).

## Install

```bash
pnpm add foldkit-agent
```

`foldkit` and `effect` are peer dependencies.

## A first agent contract

Declare your `Model` and `Message` union, select which slice of state agents can read with `Projection.pick`, and expose only the Messages an agent is allowed to send:

```ts
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Agent } from 'foldkit-agent'
import { Projection, Surface } from 'foldkit-surface'

const Todo = Schema.Struct({ id: Schema.String, title: Schema.String, completed: Schema.Boolean })
const Model = Schema.Struct({ todos: Schema.Array(Todo), selectedTodoId: Schema.Option(Schema.String) })
const Message = defineMessageUnion({
  RequestedCreateTodo: { title: Schema.String },
  RequestedDeleteTodo: { id: Schema.String },
  ReceivedTodos: { todos: Schema.Array(Todo) },
})

const App = Surface.application({ Model, Message })
const TodoAgent = Agent.forApplication(App)
const AppAgent = TodoAgent.make({
  context: Projection.pick(App.model.todos, App.model.selectedTodoId),
  messages: TodoAgent.expose(Message, {
    RequestedCreateTodo: 'Create a new todo',
    RequestedDeleteTodo: {
      name: 'delete_todo',
      description: 'Delete a todo',
      available: model => model.selectedTodoId._tag === 'Some',
    },
  }),
})
```

`AppAgent` now defines two agent capabilities (`requested_create_todo` and `delete_todo`) with JSON Schemas derived from `Message`, plus a read-only `todos` and `selectedTodoId` context. `ReceivedTodos` stays internal and cannot be invoked by an agent because exposure is opt-in.

Bind the contract to a live Foldkit runtime using `Agent.host`, then dispatch capabilities through `agentRuntime.messages.dispatch`:

<!-- docs-check
import type { Document, HtmlBuilder } from 'foldkit/html'
import type * as Update from 'foldkit/update'
type Model = typeof Model.Type
type Message = typeof Message.Type
declare const init: () => Update.Return<Model, Message>
declare const update: (model: Model, message: Message) => Update.Return<Model, Message>
declare const view: (model: Model, h: HtmlBuilder<Message>) => Document
declare const container: HTMLElement
-->
```ts
import { Effect } from 'effect'
import * as Runtime from 'foldkit/runtime'

const { config, host } = Agent.host({ Model, init, update, view, container })
Runtime.run(Runtime.makeApplication(config))

const agentRuntime = TodoAgent.bind({ definition: AppAgent, host })

const result = await Effect.runPromise(
  agentRuntime.messages.dispatch(Message.RequestedCreateTodo, { title: 'Read the guide' }),
)
```

Running `dispatch` decodes the payload against `RequestedCreateTodo`'s schema, verifies `available`, sends the Message into the runtime's queue so `update`, Commands, and Subscriptions run just as they do for a user click, and resolves once the transition completes. When an operation finishes asynchronously in a later Message or state change, add a completion contract so `dispatch` waits for the outcome.

`Agent.bind` requires the host to accept every Message the contract can emit and—when variants declare `authorize`—provide a `principal` callback returning the matching principal type.

### The host

`Agent.bind` accepts any `{ model, dispatch, subscribe?, observe?, principal? }` host:

| Where the app runs | Host |
| --- | --- |
| Browser page on Foldkit runtime | `Agent.host(config).host` |
| Tests or server with no view | `Agent.headless({ init, update, subscriptions?, resources? }).host` |
| Local-first Sync replica | Return value of `Sync.mount` |

Across all hosts, `model()` reads the last committed `Model`, `dispatch(message)` resolves after `update` applies the Message (rejecting if the runtime stops or crashes first), `subscribe` fires on Model changes, and `observe` fires on every applied Message so completion contracts work.

Authorization belongs in the contract rather than the host: pass the current caller via `host: { ...host, principal: () => principal }`.

Each `Agent.host(config)` wraps a single runtime; call `Agent.host` separately for each runtime instance rather than reusing one wrapped config across two starts.

`Agent.headless` runs `init`, `update`, Commands, and Subscriptions with `resources` initialized once for its lifetime and no DOM. Server-side per-session agents typically bind one headless host per authenticated caller with that caller's `RemoteClient`. It omits `managedResources`, `routing`, `ports`, and keyed interruptible Commands (enforced by types and runtime checks). Calling `dispose()` stops the host and releases resources.

### Join a `foldkit-bundle` assembly

Register the contract in a Bundle assembly via `AppAgent.wiring()` so module introspection sees the contract; it adds no Model fields or Subscriptions of its own.

## Choose the completion boundary

| Capability behavior | What success means | Required host hooks |
| --- | --- | --- |
| Synchronous transition | Validated dispatch finished | `model`, `dispatch` |
| Emits later result Message | Matching result Message seen | Add `observe` + `correlate` |
| Reaches a state condition | Predicate holds on state | Add `subscribe` (or `source`) |

Timeouts or cancellations after dispatch stop waiting without rolling back `update`. Read current state before retrying side-effectful calls.

## Configure capabilities, authorization, and completion

`Agent.expose` lets you configure each exposed variant inline with `name`, `description`, `available`, `authorize`, `applies`, `input`, `toMessage`, and `completion`:

<!-- docs-check
import { Option } from 'effect'
interface Caller { readonly id: string; readonly canDelete: boolean }
const AuthorizedAgent = TodoAgent.withPrincipal<Caller>()
const DetailedMessage = defineMessageUnion({
  RequestedCreateTodo: { title: Schema.String, requestId: Schema.String },
  RequestedDeleteTodo: { id: Schema.String, source: Schema.Literal('Agent') },
  DeletedTodo: { id: Schema.String },
  FailedDeleteTodo: { id: Schema.String, reason: Schema.String },
  SubmittedTodo: { requestId: Schema.String },
})
-->
```ts
const ProtectedAgent = AuthorizedAgent.make({
  messages: AuthorizedAgent.expose(DetailedMessage, {
    RequestedDeleteTodo: {
      name: 'delete_todo',
      description: 'Delete a todo',
      available: model => Option.isSome(model.selectedTodoId),
      authorize: ({ principal }) => principal.canDelete,
      applies: ({ input, model }) => model.todos.some(t => t.id === input.id),
      input: Schema.Struct({ id: Schema.String }),
      toMessage: ({ id }) => ({ id, source: 'Agent' as const }),
    },
  }),
})
```

- **`input` and `toMessage`** always go together when the external tool schema differs from the internal Message payload (for example, hiding an internal `source` tag or injecting `invocation.id`). Written inline, `toMessage`, `authorize`, and `applies` infer the decoded `input` type automatically.
- **`authorize`** returns `true`, `false`, `{ allowed: false, reason }`, or an `Effect` of one. Returning a `reason` sets the `AgentAuthorizationError` message shown to the caller.
- **`applies`** checks row-level preconditions against the Model after `authorize` succeeds (returning `AgentCapabilityUnavailableError`), preventing unauthorized callers from probing record existence.
- **`name`** defaults to snake_case from the tag (`RequestedDeleteTodo` → `requested_delete_todo`) and must match `[a-zA-Z0-9_-]{1,128}`.

### Narrow completion correlation with `Agent.variant`

When declaring a Message-based `completion` contract, wrap the entry in `Agent.variant(...)` so `correlate` narrows `result` to the declared `success` / `failure` Messages instead of the entire `Message` union:

```ts
import { Duration } from 'effect'

const CorrelatedAgent = AuthorizedAgent.make({
  messages: AuthorizedAgent.expose(DetailedMessage, {
    RequestedDeleteTodo: Agent.variant({
      description: 'Delete a todo',
      input: Schema.Struct({ id: Schema.String }),
      toMessage: ({ id }) => ({ id, source: 'Agent' as const }),
      completion: {
        success: DetailedMessage.DeletedTodo,
        failure: DetailedMessage.FailedDeleteTodo,
        correlate: (request, result) => request.id === result.id,
        timeout: Duration.seconds(10),
      },
    }),
  }),
})
```

Use `Agent.variant` whenever `correlate` reads fields on the completion Message. Dispatched by Message constructor, `result.completion` is typed by the contract (`completed` carries the success Message, `failed` carries the failure Message). Give `correlate` whenever two calls can run concurrently—pass `invocation.id` in `toMessage` and match it on the resulting Message when inputs alone cannot distinguish calls.

Waiting defaults to 30 seconds from `host.dispatch`. `AgentCompletionTimeoutError` and `AgentCancelledError` stop waiting without rolling back a Message that already reached `update`.

### Complete on state with `Agent.when`

When success means reaching a Model condition regardless of which Message or live sync caused it, complete on a `Projection` instead:

```ts
const TodoSlice = Projection.of(Model)({ todos: true })

const StateCompletedAgent = TodoAgent.make({
  messages: TodoAgent.expose(Message, {
    RequestedCreateTodo: {
      description: 'Create a todo',
      completion: Agent.when({
        projection: TodoSlice,
        predicate: ({ todos }, _request) => todos.length > 0,
      }),
    },
  }),
})
```

`Agent.when` requires a host with `subscribe`, subscribes before dispatch, and checks once immediately after so synchronous updates or already-satisfied conditions resolve right away. For values outside the Model (such as `Sync.mount`'s `committed` state), pass `source: { get, subscribe }` instead of `projection`.

### Reuse `foldkit-surface` Actions

Expose an existing `foldkit-surface` Action under its matching Message tag with `Agent.action(action, { available?, authorize?, applies? })`. Using a mismatched tag fails at compile time and at dispatch.

## Name UI controls with Parts

Parts map exposed capabilities and context fields onto screen controls (`label`, `role`, `field`, `invokes`, `each`, `key`) so in-page adapters or tests can locate them without adding separate authority:

```ts
const AppParts = TodoAgent.parts(AppAgent, {
  selected: Agent.part({ label: 'Selected todo', role: 'status', field: 'selectedTodoId' }),
  create: Agent.part({ label: 'New todo', role: 'button', invokes: Message.RequestedCreateTodo }),
  remove: Agent.part({
    role: 'button',
    invokes: Message.RequestedDeleteTodo,
    each: context => context.todos,
    key: todo => todo.id,
    label: todo => `Delete ${todo.title}`,
    input: todo => ({ id: todo.id }),
  }),
})

const partsRuntime = TodoAgent.bind({ definition: AppAgent, host, parts: AppParts })
const found = await Effect.runPromise(partsRuntime.parts.find({ label: 'Delete Milk' }))
const named = Agent.Found.$match(found, {
  One: ({ part }) => part.capability,
  Ambiguous: () => Option.none(),
  None: () => Option.none(),
})
```

`AppParts.attributes(h, 'create')` (or `attributes(h, 'remove', todo.id)`) adds `data-fk-part` and `data-fk-part-key` attributes in views. `runtime.parts.list` reads the projected context snapshot (filtering unavailable capabilities) and `foldkit-agent-mcp` serves it at `app://parts`.

## How dispatch executes and fails

Every invocation runs six steps against a single Model snapshot captured at the start of dispatch:

1. **Resolve** the capability by Message constructor or protocol name (`AgentUnknownCapabilityError`).
2. **Check `available(model)`** before `authorize` so unavailable tools report as unavailable rather than leaking authorization status (`AgentCapabilityUnavailableError`).
3. **Decode** input strictly through the capability's Effect Schema, rejecting excess fields (`AgentInvalidInputError`).
4. **Check `authorize`** (`AgentAuthorizationError`).
5. **Check `applies`** against the snapshot and decoded input (`AgentCapabilityUnavailableError`).
6. **Construct and dispatch** the Message into `host.dispatch`.

Because `available`, `authorize`, and `toMessage` share one immutable Model snapshot, contextual checks like reading `Option.getOrThrow(model.selectedTodoId)` after checking `Option.isSome(model.selectedTodoId)` stay consistent across async `authorize` calls.

All failures are tagged, Schema-backed errors (`AgentUnknownCapabilityError`, `AgentCapabilityUnavailableError`, `AgentInvalidInputError`, `AgentAuthorizationError`, `AgentCancelledError`, `AgentCompletionTimeoutError`, `AgentResourceError`) narrowable with `Effect.catchTag`:

```ts
agentRuntime.messages
  .dispatch(Message.RequestedCreateTodo, { title: 'x' })
  .pipe(
    Effect.catchTag('AgentCapabilityUnavailableError', error =>
      Effect.succeed(`${error.capability} is not available`),
    ),
  )
```

Dispatch also accepts a third `invocation` argument (`{ id, transport, signal }`) and exposes `dispatchUnknown(name, payload, invocation)` for protocol adapters reading unvalidated wire payloads. Input types reflect the **encoded** side of the Schema so transforming codecs (such as `Schema.NumberFromString`) accept wire strings.

## Record decisions with the audit log

Attach `Agent.auditLog({ capacity, principal, includeInput?, redact? })` when binding to record every accepted, refused, and unknown outcome in a bounded ring buffer:

```ts
type User = { readonly id: string }
const UserAgent = Agent.forApplication(App).withPrincipal<User>()
const audit = Agent.auditLog({
  capacity: 500,
  principal: (caller: User) => caller.id,
})

const audited = UserAgent.bind({
  definition: UserAgent.make({
    messages: UserAgent.expose(Message, { RequestedCreateTodo: 'Create a new todo' }),
  }),
  host: { ...host, principal: () => ({ id: 'user-1' }) },
  audit,
})
```

By default the log omits raw inputs (opt in with `includeInput: true` and `redact`), requires an explicit `principal` projector, and never stores the Model. A failing `AuditSink` never breaks dispatch.

## Generate manifests and inspect contracts

Contracts are inspectable data, testable without an LLM, and exportable as committed snapshots:

```ts
Agent.messages(AppAgent).map(message => message.name)
// ['requested_create_todo', 'delete_todo']

const manifestJson = JSON.stringify(Agent.toManifest(AppAgent), null, 2)
const markdownDocs = Agent.toMarkdown(AppAgent)
```

## Main exports

- **Contract builders:** `Agent.forApplication(App)`, `Agent.forModel<Model>()`, `Agent.make`, `Agent.expose`, `Agent.exposeSubset`, `Agent.variant`, `Agent.action`, `Agent.resource`, `Agent.when`
- **UI parts:** `Agent.part`, `Agent.parts`, `Agent.Found`
- **Runtime hosts:** `Agent.host`, `Agent.headless`, `Agent.bind`
- **Introspection and audit:** `Agent.messages`, `Agent.resources`, `Agent.schema`, `Agent.contextSchema`, `Agent.toManifest`, `Agent.toMarkdown`, `Agent.auditLog`, `Agent.summarize`, `Agent.newInvocationId`

## Why capabilities are Messages and hosts wrap config

- **Messages over Model setters:** Exposing Messages keeps every transition inside `update`, preserving replay, validation, and side effects rather than adding a second mutation path.
- **`Agent.host` wrapping:** Foldkit's `makeApplication` returns a handle without direct `model()` or `dispatch()` accessors, so `Agent.host(config)` instruments `update` and `subscriptions` once before `run`, `hydrate`, `embed`, or `SSR.hydrate`.
- **`forApplication` / `forModel` inference:** Fixing `Model` upfront lets TypeScript infer `model` inside inline `available`, `authorize`, and `applies` callbacks without type annotations.

## Next

- Serve the contract over stdio or HTTP MCP: [`foldkit-agent-mcp`](../agent-mcp)
- Publish tools in the browser with WebMCP: [`foldkit-agent-webmcp`](../agent-webmcp)
- Serve A2A tasks or Agent Native actions: [`foldkit-agent-a2a`](../agent-a2a), [`foldkit-agent-native`](../agent-native)
- Read the end-to-end architecture guide: [Agents guide](../../docs/agents.md)
