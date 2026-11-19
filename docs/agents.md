# Agents: expose your application instead of reimplementing it

Integrating an AI agent directly through custom tool handlers quickly creates a second copy of your application: tools reimplement transitions the UI already owns, pull the whole `Model` for lack of a focused context, confuse internal fact messages with user actions, and duplicate authorization across MCP, WebMCP, and A2A.

`foldkit-agent` turns subsets of what your Foldkit app already has—a `Model` projection for what an agent may observe, and selected `Message` variants for what it may trigger—into one **protocol-neutral agent contract**. Adapters for WebMCP, MCP, A2A, and Agent Native then serve that contract without duplicating business logic.

> **An agent capability is an application Message, never a second implementation.**

Human clicks and agent calls pass through the exact same `update`, tests, authorization, and replay.

## Four values from application to live runtime

Agent code separates four values cleanly:

1. **Application (`App`):** Captured with `Surface.application({ Model, Message, initial, update })`.
2. **Builder (`AgentBuilder`):** `Agent.forApplication(App).withPrincipal<Principal>()` creates a typed DSL bound to your app's `Model`, `Message`, and `Principal` types.
3. **Contract (`AssistantAgent`):** `AgentBuilder.make(...)` declares the agent's `context`, exposed `messages`, `authorize` policies, `completion` rules, and read-only `resources`.
4. **Live runtime (`agentRuntime`):** `AgentBuilder.bind({ definition: AssistantAgent, host })` connects the static contract to a running Foldkit app or `Sync.mount` host, then mounts protocol adapters.

## A first end-to-end agent

Start from an application with a `Todo` list, a `Surface` projection (`Overview`) that hides internal UI state like form drafts, and a `Principal` type:

```ts
import { Duration, Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { Agent } from 'foldkit-agent'
import { Entity, Expr, Write } from 'foldkit-entity'
import { Mutation, Remote } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import type { Mounted } from 'foldkit-sync'

const Todo = Schema.Struct({ id: Schema.String, title: Schema.String, completed: Schema.Boolean })
const Model = Schema.Struct({
  listTitle: Schema.String,
  todos: Schema.Array(Todo),
  filter: Schema.Literals(['all', 'active', 'done']),
  remote: Remote.Model,
})
type Model = typeof Model.Type

const Message = defineMessageUnion({
  ...Remote.messages,
  RequestedTodo: { title: Schema.String },
  SubmittedTodo: { id: Schema.String, title: Schema.String, createdAt: Schema.Number },
  ToggledTodo: { id: Schema.String },
  ClearedCompleted: {},
  RequestedDeleteTodo: { id: Schema.String },
  RequestedCompleteTask: { id: Schema.String },
})
type Message = typeof Message.Type

const initial: Model = { listTitle: 'Todos', todos: [], filter: 'all', remote: Remote.initial }
const update = (model: Model, _message: Message): Update.Return<Model, Message> => ({ model })

const App = Surface.application({ Model, Message, initial, update })

const Overview = App.surface('Overview', {
  model: ({ model }) => ({
    listTitle: model.listTitle,
    todos: model.todos,
    filter: model.filter,
  }),
})

type Principal = { readonly actorId: string; readonly canWrite: boolean }
const isOwner = (principal: Principal) => principal.actorId === 'owner'
```

Specialize the builder, declare the contract exposing three capabilities, and bind it to a live host (`mounted` from `Sync.mount`, or `Agent.host(config)` / `Agent.headless(config)`):

<!-- docs-check
declare const mounted: Mounted<Model, Message, { readonly todos: ReadonlyArray<typeof Todo.Type> }>
declare const principal: Principal
-->

```ts
const AgentBuilder = Agent.forApplication(App).withPrincipal<Principal>()

const AssistantAgent = AgentBuilder.make({
  name: 'assistant',
  context: Overview,

  messages: AgentBuilder.expose(Message, {
    RequestedTodo: Agent.variant({
      name: 'add_todo',
      description: 'Add a todo with the given title',
      input: Schema.Struct({ title: Schema.String }),
      toMessage: ({ title }) => ({ title }),
      completion: {
        success: Message.SubmittedTodo,
        correlate: (request, result) => request.title.trim() === result.title,
      },
    }),

    ToggledTodo: {
      name: 'toggle_todo',
      description: 'Mark a todo done, or undo that',
    },

    ClearedCompleted: {
      name: 'clear_completed',
      description: 'Delete every completed todo (owner only)',
      authorize: ({ principal }) => isOwner(principal),
    },
  }),
})

const host = {
  model: mounted.model,
  dispatch: (message: Message) => {
    mounted.dispatch(message)
  },
  subscribe: mounted.subscribe,
  observe: mounted.observe,
  principal: () => principal,
}

const agentRuntime = AgentBuilder.bind({ definition: AssistantAgent, host })
```

Notice what stays explicit:

- **`context: Overview`** exposes only the projected fields rather than the full `Model`.
- **`AgentBuilder.expose`** opts in specific `Message` variants (`RequestedTodo`, `ToggledTodo`, `ClearedCompleted`)—there is no `exposeAll`.
- **`input` / `toMessage`** exposes a clean protocol schema (`{ title }`) for intents whose `update` generates IDs and timestamps before emitting `SubmittedTodo`.
- **`authorize`** enforces caller permissions per capability.
- **`completion`** tells the runtime which resulting fact (`SubmittedTodo`) ends the call.

A host only supplies the hooks your contract uses: `observe` for completion contracts, and `subscribe` when dynamic availability or state completion watches `Model` changes. See [the package README](../packages/agent/README.md#the-host) for `Agent.host` and `Agent.headless`.

## What an agent can read: context and resources

`context` defines the agent's primary read model using any `foldkit-surface` Surface or Projection, keeping internal UI fields private. Add named read-only `resources` alongside `context` for secondary summaries such as counts:

```ts
const CountsAgent = AgentBuilder.make({
  name: 'counts-assistant',
  context: Overview,
  resources: [
    Agent.resource('counts', {
      description: 'How many todos are active and completed',
      schema: Schema.Struct({
        total: Schema.Number,
        active: Schema.Number,
        completed: Schema.Number,
      }),
      read: model => ({
        total: model.todos.length,
        active: model.todos.filter(todo => !todo.completed).length,
        completed: model.todos.filter(todo => todo.completed).length,
      }),
    }),
  ],
  messages: AgentBuilder.expose(Message, {
    ToggledTodo: { name: 'toggle_todo', description: 'Toggle a todo' },
  }),
})
```

In short: `context` is the default read model, `resources` are additional named reads, and `messages` are capabilities that trigger `update`.

## Exposing intents rather than internal facts

Expose intent Messages (such as `RequestedTodo`) instead of result facts (`SubmittedTodo`). If creating a todo generates an ID and timestamp via a Command inside `update`, letting an agent construct `SubmittedTodo` directly would bypass that logic and push nondeterminism into the protocol layer. Use `Agent.variant` with `input` and `toMessage` so decoding happens cleanly before `update` runs.

## Waiting for Commands and state changes to finish

When a Message triggers asynchronous Commands, "dispatched" finishes before the real operation completes. Declare a `completion` rule on the capability using one of two styles:

- **Correlated fact Message:** Best when `update` mints a new ID and emits a distinct success (or failure) fact Message. Pass `correlate` and an optional `timeout` so concurrent invocations resolve their own call:

```ts
const TimedAddAgent = AgentBuilder.make({
  name: 'timed-add',
  context: Overview,
  messages: AgentBuilder.expose(Message, {
    RequestedTodo: Agent.variant({
      name: 'add_todo',
      description: 'Add a todo and wait for persistence',
      input: Schema.Struct({ title: Schema.String }),
      toMessage: ({ title }) => ({ title }),
      completion: {
        success: Message.SubmittedTodo,
        correlate: (request, result) => request.title.trim() === result.title,
        timeout: Duration.seconds(10),
      },
    }),
  }),
})
```

- **State condition (`Agent.when`):** Best when completion is a checkable condition on a `Projection` (`Overview`) or an external `source` (such as Sync's `mounted.committed`), regardless of whether a Command, live stream, or peer edit satisfied it:

```ts sketch
const StateCompletionAgent = AgentBuilder.make({
  name: 'state-completion',
  context: Overview,
  messages: AgentBuilder.expose(Message, {
    RequestedDeleteTodo: {
      description: 'Delete a todo',
      completion: Agent.when({
        projection: Overview,
        predicate: (value, request) => value.todos.every(todo => todo.id !== request.id),
      }),
    },
    RequestedTodo: Agent.variant({
      name: 'add_todo',
      description: 'Add a todo confirmed by Sync',
      input: Schema.Struct({ title: Schema.String }),
      toMessage: ({ title }) => ({ title }),
      completion: Agent.when({
        source: mounted.committed,
        predicate: (shared, request) => shared.todos.some(todo => todo.title === request.title),
        timeout: Duration.seconds(10),
      }),
    }),
  }),
})
```

Two safeguards when writing `Agent.when` predicates:

- **Condition-based:** Because the runtime subscribes before dispatch and immediately checks the current snapshot, write predicates that hold only after this specific call's effect lands.
- **Safe key lookups:** Use `Object.hasOwn` or a `Map` instead of `obj[userInput]` so keys like `'constructor'` never match prototype properties. Any exception thrown in a predicate fails only that invocation.

Completion waits for an outcome without making external side effects transactional. Timeouts cover both `dispatch` and waiting: timing out *after* `dispatch` returns leaves the Message in `update`, while cancelling *before* `dispatch` completes reports `AgentCancelledError` with `dispatched: false` and `decision: 'unknown'`.

## Availability, authorization, and `applies`

Capabilities separate three distinct checks evaluated in order on a single `Model` snapshot:

1. **`available(model)`:** Is this action currently valid in the app's state? Unavailable tools drop from discovery and fail before `authorize` runs so disabled features leak no permission info.
2. **`authorize({ principal, input, model })`:** May this principal call this action?
3. **`applies({ model, input, principal })`:** Does the specific decoded `input` match the row state in `model`? Runs after `authorize` (and marks the capability `inputDependent`), returning `AgentCapabilityUnavailableError` with `reason`.

```ts
const GatedAgent = AgentBuilder.make({
  name: 'gated',
  context: Overview,
  messages: AgentBuilder.expose(Message, {
    ClearedCompleted: {
      name: 'clear_completed',
      description: 'Delete every completed todo',
      available: model => model.todos.some(todo => todo.completed),
      authorize: ({ principal }) => isOwner(principal),
    },
  }),
})
```

### A capability over a declared write

For capabilities backed by a declared `Mutation.write` (`foldkit-remote`), `Data.capability` reuses your Entity's held `may` flags (`authorize`), `when` preconditions, and invariants (`applies`) automatically—judged as the page's current **viewer**. Spread `...completeTask` and compose your agent's own `principal` check afterward:

```ts
const Task = Entity.define(
  'Task',
  Schema.Struct({ id: Schema.String, status: Schema.Literals(['open', 'done']) }),
)
const CompleteTask = Mutation.write(
  'CompleteTask',
  Write.update(
    Entity.input(Task, Schema.Struct({ id: Schema.String, status: Schema.Literal('done') })),
    { id: 'id' },
  ),
)
const Data = Remote.make({
  model: App.model.remote,
  entities: [Task],
  mutations: [CompleteTask],
})

const completeTask = Data.capability(CompleteTask, ({ input }: { input: { readonly id: string } }) => ({
  id: input.id,
  status: 'done' as const,
}))

const TaskAgent = AgentBuilder.make({
  name: 'tasks',
  context: Overview,
  messages: AgentBuilder.expose(Message, {
    RequestedCompleteTask: {
      name: 'complete_task',
      description: 'Complete an open task',
      input: Schema.Struct({ id: Schema.String }),
      toMessage: input => input,
      ...completeTask,
      authorize: request => (request.principal.canWrite ? completeTask.authorize(request) : false),
    },
  }),
})
```

Annotate `toInput`'s `request` parameter so TypeScript preserves the input type across the object spread. When a row or field is missing locally, both `authorize` and `applies` let the request proceed so the server decides authoritatively.

If the target row is already named in `Model` (such as a selected task), pass `Data.available(mutation, model => Option<Partial<Input>>)` as `available` so tools that `Data.can` already rejects disappear from discovery—only expose `Data.available` when callers are permitted to know whether the viewer's write applies.

## Linking capabilities to UI controls with parts

Capabilities name *what* an agent can do; **parts** map them to specific headings, buttons, or repeated rows from the contract alone:

```ts
const AssistantParts = AgentBuilder.parts(AssistantAgent, {
  title: Agent.part({ label: 'List title', role: 'heading', field: 'listTitle' }),
  clear: Agent.part({ label: 'Clear completed', role: 'button', invokes: Message.ClearedCompleted }),
  toggle: Agent.part({
    role: 'checkbox',
    invokes: Message.ToggledTodo,
    each: context => context.todos,
    key: todo => todo.id,
    label: todo => todo.title,
    input: todo => ({ id: todo.id }),
  }),
})

const partsRuntime = AgentBuilder.bind({ definition: AssistantAgent, host, parts: AssistantParts })
```

Parts reference `context` keys (`field`), exposed capability constructors (`invokes`/`sets`), and repeated context items (`each`, `key`, `label`, `input`):

- **Zero extra authority:** Invoking a part dispatches through `messages.dispatch` with full availability, schema decoding, `authorize`, and completion checks.
- **Follows availability and context schemas:** Unavailable capabilities drop from `parts.list`, and callbacks receive schema-filtered context data.
- **Ambiguity checks:** `parts.find({ label })` returns `Ambiguous` with all matches instead of picking arbitrarily when labels collide.
- **DOM test hooks:** `AssistantParts.attributes(h, 'clear')` and `attributes(h, 'toggle', todo.id)` emit `data-fk-part` and `data-fk-part-key` attributes for browser adapters and tests.

## How every call flows through the pipeline

Every adapter translates incoming protocol requests into one shared eight-step contract pipeline:

1. Resolve the capability by name.
2. Check `available(model)`.
3. Decode protocol `input` against its Schema.
4. Check `authorize` for the current `principal`.
5. Check `applies(model, input, principal)`.
6. Construct the application `Message` via `toMessage`.
7. Dispatch the `Message` to the host.
8. Wait for correlated `completion` if configured.

Any refusal prior to dispatch stops before reaching `update`, keeping validation and policy uniform across every transport.

## Complementary client and server policy

Client `authorize` checks refuse unauthorized tool calls early with typed errors. For server-backed or synchronized state, enforce the same predicate inside your server APIs or Sync journal (`authorize`) as well—the contract improves UX while the server remains the trusted boundary.

## Serving one contract across four protocols

Bind once, then mount any combination of protocol adapters:

| Caller environment | Package | Exposed surface |
| --- | --- | --- |
| In-page browser agent | [`foldkit-agent-webmcp`](../packages/agent-webmcp) | `document.modelContext` WebMCP tool |
| External MCP client | [`foldkit-agent-mcp`](../packages/agent-mcp) | `tools/list` / `tools/call` (stdio or HTTP) |
| External A2A agent | [`foldkit-agent-a2a`](../packages/agent-a2a) | Agent Card skill and task handler |
| Agent Native host | [`foldkit-agent-native`](../packages/agent-native) | Agent Native package action |

```ts
import { AgentA2a } from 'foldkit-agent-a2a'
import { AgentMcp } from 'foldkit-agent-mcp'
import { AgentWebMcp } from 'foldkit-agent-webmcp'

AgentWebMcp.register({ agent: agentRuntime })
AgentMcp.stdio({ agent: agentRuntime })
AgentA2a.handler({ agent: agentRuntime })
```

For multi-tenant hosts like Agent Native, resolve a runtime per caller:

<!-- docs-check
import type { ActionRunContext } from 'foldkit-agent-native'
const resolveRuntime = (_context: ActionRunContext) => agentRuntime
void [CountsAgent, TimedAddAgent, GatedAgent, TaskAgent, partsRuntime]
-->

```ts
import { AgentNative } from 'foldkit-agent-native'
import { registerPackageActions } from '@agent-native/core/server'

registerPackageActions(
  AgentNative.actions({
    definition: AssistantAgent,
    resolveRuntime,
  }),
)
```

Adapters derive tool schemas directly from your contract and forward calls straight into the shared pipeline.

## Dynamic capabilities and audit logging

When `available(model)` changes with application state (for example, `clear_completed` appearing once a todo is marked done) and the host provides `subscribe`, adapters like WebMCP update registered tools automatically—and calling an unavailable tool directly still fails with `AgentCapabilityUnavailableError`.

Attach `Agent.auditLog` to record every invocation and refusal without storing your `Model`:

```ts
const audit = Agent.auditLog<Principal>({
  capacity: 500,
  principal: principal => principal.actorId,
})

const auditedRuntime = AgentBuilder.bind({
  definition: AssistantAgent,
  host,
  audit,
})
```

Audit logs store only projected principal IDs, opt-in/redacted inputs, and bounded entries, and failing sinks never interrupt `dispatch`.

## Inspecting contracts without running an LLM

Extract schemas, manifests, and Markdown summaries statically for tests, PR diffs, and `foldkit-surface` `Module` validation:

```ts
Agent.messages(AssistantAgent)
Agent.schema(AssistantAgent)
Agent.contextSchema(AssistantAgent)
Agent.toManifest(AssistantAgent)
Agent.toManifest(AssistantAgent, AssistantParts)
Agent.toMarkdown(AssistantAgent)
```

## Works identically on local-first apps

Because `Sync.mount` provides `model`, `dispatch`, `subscribe`, and `observe`, both human UI controls and `foldkit-agent` feed Messages into the exact same `update` and Sync replica—no second server endpoint needed.

Similarly, `Surface` defines what a feature may observe and emit, while `Agent` wraps a Surface with protocol schemas, availability, authorization, completion, parts, and audit without taking state ownership away from `update`, Remote, or Sync.

## When to use another tool

- **DOM automation or scraping:** `foldkit-agent` dispatches `Message`s rather than clicking raw selectors; add `Message`s for actions you want agents to perform.
- **Exposing an unprojected `Model`:** Define a dedicated `Surface` or `Projection` carrying only what the task needs.
- **Exactly-once external effects:** Completion tracks state transitions, not transaction recovery; see [Durable effect recovery](../packages/durable/README.md#external-effects-and-the-crash-gap).
- **Stateless function tools:** Plain tool functions need less ceremony when there is no `Model` or `Message` boundary to preserve.

## Next

- Study a complete contract with Surface context, completion, authorization, and resources in [`examples/todo-app/src/agent.ts`](../examples/todo-app/src/agent.ts).
- See a standalone host setup in [`examples/todo`](../examples/todo) and a full replicated browser app in [`examples/todo-app`](../examples/todo-app).
- Read the [`foldkit-agent` README](../packages/agent/README.md) and adapter READMEs ([WebMCP](../packages/agent-webmcp), [MCP](../packages/agent-mcp), [A2A](../packages/agent-a2a), [Agent Native](../packages/agent-native)).
