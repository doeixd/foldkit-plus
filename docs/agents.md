# Agents: expose the application, do not reimplement it

A Foldkit application already has the two things an agent needs:

```text
Model         -> information the agent may observe
Message union -> actions the agent may cause
```

`foldkit-agent` turns deliberate subsets of those into one **protocol-neutral
agent contract**. WebMCP, MCP, A2A, and Agent Native then serve that same
contract without adding application behaviour of their own.

The important architectural rule is simple:

> **An agent capability is an application Message, not a second implementation
> of the feature.**

The UI and the agent therefore meet at the same `update`. If a person and an
agent both rename a todo, there is still one rename transition to understand,
test, authorize, replay, and debug.

## The mental model

There are four different values in normal agent code. Keeping them separate
makes the API much easier to read:

```text
Foldkit application
        App
         |
         | Agent.forApplication(App)
         v
application-specialized builder
     AgentBuilder
         |
         | .make(...)
         v
protocol-neutral contract
    AssistantAgent
         |
         | .bind({ host })
         v
live AgentRuntime
         |
         +--> WebMCP
         +--> MCP
         +--> A2A
         +--> Agent Native
```

A useful naming rule is **builder first, contract second**:

```ts sketch
const AgentBuilder = Agent.forApplication(App).withPrincipal<Principal>()

const AssistantAgent = AgentBuilder.make({
  // ...the actual agent contract
})
```

`AgentBuilder` is **not an agent**. It is a typed DSL specialized to this
application's Model, Message union, and Principal type. Its helpers such as
`make`, `expose`, and `bind` now know those types.

`AssistantAgent` is the actual contract: what this agent may see, what it may do,
which policies apply, how completion is recognized, and which read-only
resources it exposes. This is the value adapters describe and serve.

Binding that contract to a running application produces the live runtime that
can read the current Model and dispatch Messages.

## Why have a contract at all?

A direct "LLM tool -> application code" integration tends to grow a second
application by accident:

- a tool handler reimplements a transition the UI already has;
- the tool receives the whole Model because selecting a safe context is work;
- fact Messages containing ids or timestamps become callable like intents;
- each transport invents its own authorization and error mapping;
- dispatching a Message is mistaken for finishing the operation;
- WebMCP, MCP, A2A, and other integrations each grow their own schema and
  handler layer.

The agent contract fixes that by declaring two boundaries once:

```text
information boundary
  "What may this agent know?"
        -> Surface / Projection

capability boundary
  "What may this agent cause?"
        -> selected application Messages
```

Everything after that is interpretation and transport.

## A small end-to-end example

Assume an ordinary Foldkit application has already been captured with
`Surface.application`:

<!-- docs-check
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { Agent } from 'foldkit-agent'
import { Surface } from 'foldkit-surface'
import type { Mounted } from 'foldkit-sync'

const Todo = Schema.Struct({ id: Schema.String, title: Schema.String, completed: Schema.Boolean })
const Model = Schema.Struct({
  listTitle: Schema.String,
  todos: Schema.Array(Todo),
  filter: Schema.Literals(['all', 'active', 'done']),
})
type Model = typeof Model.Type
const Message = defineMessageUnion({
  RequestedTodo: { title: Schema.String },
  SubmittedTodo: { id: Schema.String, title: Schema.String, createdAt: Schema.Number },
  ToggledTodo: { id: Schema.String },
  ClearedCompleted: {},
})
type Message = typeof Message.Type
const initial: Model = { listTitle: 'Todos', todos: [], filter: 'all' }
const update = (model: Model, _message: Message): Update.Return<Model, Message> => ({ model })
declare const mounted: Mounted<Model, Message, { readonly todos: ReadonlyArray<typeof Todo.Type> }>
declare const principal: Principal
-->

```ts
const App = Surface.application({ Model, Message, initial, update })
```

A Surface can describe the read model an agent is allowed to see:

```ts
const Overview = App.surface('Overview', {
  model: ({ model }) => ({
    listTitle: model.listTitle,
    todos: model.todos,
    filter: model.filter,
  }),
})
```

Notice what is missing. If the root Model also contains editor state, a pending
form error, or internal bookkeeping, none of it becomes agent context merely
because it exists.

For the examples below, assume the application identifies callers like this:

```ts
type Principal = { readonly actorId: string }
const isOwner = (principal: Principal) => principal.actorId === 'owner'
```

Now specialize the agent API to this application:

```ts
const AgentBuilder = Agent
  .forApplication(App)
  .withPrincipal<Principal>()
```

Then create one concrete contract:

```ts
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
        correlate: (request, result) =>
          request.title.trim() === result.title,
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
```

Read this literally:

```text
context: Overview
  -> this is what the agent may observe

RequestedTodo / ToggledTodo / ClearedCompleted
  -> these are the only application Messages it may cause

input / toMessage
  -> this is the protocol-facing input boundary

authorize
  -> this is policy for one capability

completion
  -> this is how dispatch becomes a meaningful operation result
```

There is deliberately no `exposeAll`. A Message is unreachable unless the
contract opts into it.

Finally, bind the static contract to the live application:

```ts
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

The contract is static application architecture. The host supplies runtime
facts: the current Model, how to dispatch, how to follow Model changes, how to
observe Messages for completion, and who the current principal is.

`mounted` above is what `Sync.mount` returns. An application on Foldkit's own
runtime gets its host from `Agent.host(config)`, which returns the config to
start and a host over the runtime started from it; a test or a server runs the
same `init`, `update`, Commands and Subscriptions with no view through
`Agent.headless(config)`. Either way the runtime owns the Model, and the host
only reads what it committed and queues Messages into it
([the package README](../packages/agent/README.md#the-host)).

A host only needs the capabilities the contract actually uses. For example,
`observe` matters when a capability declares completion, while `subscribe`
lets adapters such as WebMCP follow capabilities whose availability changes with
the Model.

## What an agent may see: context and resources

The contract's `context` is a `foldkit-surface` Surface or Projection. This is
usually the best place to reuse an existing feature boundary:

```ts sketch
context: Overview
```

That gives the agent a coherent read model without giving it the root Model.
The same projection can also be rendered by a view, inspected by tooling, or
used by another Foldkit Plus package.

This matters because an agent does not need access to state merely because the
application has it. Treat context like an API response: include the information
required to reason about the task and leave everything else out.

For additional named reads, use resources:

```ts sketch
resources: [
  Agent.resource('counts', {
    description: 'How many todos are active and completed',
    schema: Schema.Struct({
      total: Schema.Number,
      active: Schema.Number,
      completed: Schema.Number,
    }),
    read: model => counts(model),
  }),
]
```

A useful distinction is:

```text
context  = the default read model for this agent
resource = an additional named, read-only piece of information
message  = a capability that may change the application
```

## What an agent may do: expose Messages

`AgentBuilder.expose(Message, ...)` selects application Message variants and
gives them protocol-facing metadata.

That is the core safety property of the package: **the agent cannot invent a
new transition path around the application**. It can only request transitions
already represented in the Message union and already handled by `update`.

### Expose intents, not facts

Suppose creating a todo requires generating an id:

```text
RequestedTodo
    |
    | update starts Command
    v
Command generates id + timestamp
    |
    v
SubmittedTodo { id, title, createdAt }
```

The agent should normally expose `RequestedTodo`, not `SubmittedTodo`.
`SubmittedTodo` is a fact whose id and timestamp were minted by application
logic. Letting an agent manufacture it would move nondeterminism and invariants
out of the state machine and into the protocol boundary.

Mapped input makes that explicit:

```ts sketch
RequestedTodo: Agent.variant({
  name: 'add_todo',
  description: 'Add a todo with the given title',
  input: Schema.Struct({ title: Schema.String }),
  toMessage: ({ title }) => ({ title }),
})
```

The external tool schema can therefore be simpler than the eventual durable
fact, and decoding happens before a Message is constructed.

## Dispatch is not always completion

For an immediate Message, "dispatch succeeded" may be enough. But an intent can
start Commands and finish later:

```text
agent calls add_todo
        |
        v
RequestedTodo dispatched
        |
        v
update starts Command
        |
        v
SubmittedTodo applied
        |
        v
operation is complete
```

A completion contract teaches the runtime which later Message means the
operation actually finished:

```ts sketch
completion: {
  success: Message.SubmittedTodo,
  correlate: (request, result) =>
    request.title.trim() === result.title,
  timeout: Duration.seconds(10),
}
```

A completion may also declare one or more failure Messages when the application
has explicit failure facts.

`correlate` matters whenever multiple calls can be in flight. Without it, the
first matching completion Message wins.

### Completing on state instead of a Message

A completion Message names one implementation path. Sometimes what matters is
the outcome, whoever produced it: a Command result, a live update, a Sync
exchange, another device. A state contract completes when a condition holds:

```ts sketch
RequestedDeleteTodo: {
  description: 'Delete a todo',
  completion: Agent.when({
    projection: TodoList,
    predicate: (value, request) =>
      value.todos.every(todo => todo.id !== request.id),
  }),
}
```

`projection` reads the application's Model, so the host must provide
`subscribe`; `bind` refuses the contract otherwise. A value that lives outside
the Model reads through a `source` instead, such as `foldkit-sync`'s
`mounted.committed` (the server-confirmed shared slice):

```ts sketch
completion: Agent.when({
  source: mounted.committed,
  predicate: (shared, request) =>
    shared.todos.some(todo => todo.id === request.id),
})
```

Both accept the same optional `timeout`. Neither declares failure; a state that
never arrives ends at the deadline.

Choose by what identifies this call's outcome:

```text
the outcome is a checkable condition    -> Agent.when
  (renamed, deleted, confirmed by server)

only the resulting fact says which      -> success Message + correlate
record is this call's (a creation with
an id minted by update)
```

"Completed" means the condition holds, **not** that this call made it true. The
runtime subscribes before dispatching and checks again when it starts waiting,
so a state that already holds completes at once. Write a predicate only this
call can make true.

Predicates are ordinary functions over plain data, so guard lookups by key:
`value[request.title]` is truthy for a title of `'constructor'`, because it
reads an inherited property. Use `Object.hasOwn` or a `Map`. A predicate that
throws fails that invocation as a defect; it does not break the code that
changed the state.

Completion does **not** make the operation transactional or exactly-once.

The deadline runs from the moment the host's `dispatch` is called, so it bounds
sending and waiting together; a host that never returns does not hang the call.
A timeout or cancellation after the host returned means the runtime stopped
waiting: the Message reached `update`, and nothing is rewound. A timeout or
abort **before** the host returned means delivery is unknown: the timeout error
says so, `AgentCancelledError` carries `dispatched: false`, and the audit records
`decision: 'unknown'`. Neither case makes an external effect idempotent.

## Availability and authorization are different questions

A capability can depend on the current Model:

```ts sketch
ClearedCompleted: {
  name: 'clear_completed',
  description: 'Delete every completed todo',
  available: model => model.todos.some(todo => todo.completed),
  authorize: ({ principal }) => isOwner(principal),
}
```

These predicates answer different questions, and a third answers one neither
can, since `available` sees no input:

```text
available(model)
  "Does this action exist in the application's current state?"

authorize(...)
  "May this principal invoke it?"

applies({ model, input, principal })
  "Does this call fit what the Model holds?" (the row its input names)
```

Availability runs first. An unavailable capability is omitted from discovery
and refused by name before authorization is evaluated. That prevents the
authorization result for an action that does not currently exist from becoming
an information leak.

`applies` runs last, after `authorize`, and never for a call `authorize`
refused: whether a call fits says what the row holds, which a caller who may
not act on it must not learn. Its refusal is `AgentCapabilityUnavailableError`,
with the `reason` it gives as the message. A capability that declares it is
described as `inputDependent`, beside `modelDependent`.

One invocation reads one Model snapshot for `available`, input decoding,
`authorize`, `applies` and `toMessage`, so policy does not accidentally reason
over several different application states.

### A capability over a declared write

A capability that dispatches a declared write (`Mutation.write`) need not
restate when the write is refused. `foldkit-remote` judges it from what the
client holds (`Data.can`) and gives the checks in the shape a variant takes.
Those checks judge as **the Model's viewer**, the person signed in to the
page, not as the agent's principal. Used as a capability's only `authorize`,
`Data.capability` hands the agent everything the viewer may write. Compose it
with your own principal check, written after the spread so it replaces the
`authorize` the spread gave (`examples/kitchen-sink`'s `agent.ts`):

```ts sketch
const completeTask = Data.capability(CompleteTask, ({ input }: { input: { readonly id: string } }) => ({
  id: input.id,
  status: 'done',
}))

Agent.expose(Message, {
  RequestedCompleteTask: {
    name: 'complete_task',
    description: 'Complete an open task',
    input: Schema.Struct({ id: Schema.String }),
    toMessage: input => input,
    ...completeTask,
    // The principal's own permission first, then the write's rules.
    authorize: request => (request.principal.canWrite ? completeTask.authorize(request) : false),
  },
})
```

`Data.capability(mutation, toInput)` returns `{ authorize, applies }`. A held
`may` that forbids the write refuses in `authorize`, with its words; a `when`
that does not hold, or an invariant the write would break, refuses in
`applies`. Where the client cannot tell (the row is not held, a field is
missing) both allow, and the server decides when the write is sent, as the
viewer's session. Annotate `toInput`'s request, as above: a spread gives the
call no type to infer it from.

For a capability over a row the Model alone names, such as the selected one,
`Data.available(mutation, model => Option<Partial<Input>>)` is its `available`:
false while no row is named or `Data.can` answers `No`, so a capability that
cannot succeed leaves discovery. Availability runs at discovery, before
`authorize`, and judges as the viewer too: whether the capability is listed
tells any caller whether the viewer's write would be refused. Give it only to
an agent whose callers may know that. `examples/kitchen-sink` declares one over
`CompleteTask`.

## Which control is which: parts

A capability says what an agent may do; nothing in it says which control on
the screen does it. An agent that reads "Delete Milk" on a button, or is asked
to "fill in the search box", needs that link. Parts declare it, from the
contract alone:

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

Read it as three references into what already exists:

```text
field: 'listTitle'           a key of the context: what the part shows
invokes / sets: a constructor a capability the contract exposes: what it does
each, key, label, input      read from the projected context, never the Model
```

`partsRuntime.parts.list` reads one Model snapshot and describes each part: its
id, its occurrence key when it repeats, its label and role, the capability it
names, and its value. It sends no Message. Discovery reads the declaration,
not the DOM, so it works headless, and a part is listed whether or not a page
draws it.

The rules keep a part from becoming a second way in:

- **A part gives no authority.** It names a capability; calling it is
  `messages.dispatch(name, input)`, through availability, decoding,
  `authorize` and completion, unchanged. A repeated part's `input` is a hint
  the dispatch decodes again.
- **A part follows availability.** One whose capability is not available in
  the snapshot is left out, as the tool list leaves the capability out.
- **A part sees what the context sees.** `value`, and what `each`, `key` and
  `label` are given, come from the context encoded through its Schema and
  decoded again, so a property the Schema leaves out is never there.
- **Identity is the id, and the occurrence key.** A label is text:
  `parts.find({ label })` answers `Ambiguous` with every match when two parts
  share one, never the first.

In a page, `AssistantParts.attributes(h, 'clear')` (and
`attributes(h, 'toggle', todo.id)`) writes `data-fk-part` and
`data-fk-part-key` on the drawn control, so an in-page adapter or a test can
find it. Nothing reads them for authority.

## The invocation pipeline

Every call goes through the same contract-owned pipeline regardless of adapter:

```text
1. resolve capability
2. check available(model)
3. decode protocol input
4. authorize principal
5. check applies(model, input, principal)
6. construct application Message
7. dispatch Message
8. if declared, wait for correlated completion
```

Anything refused before dispatch sends no Message.

That separation is important: adapters do not get to decide what counts as
valid input, whether an action is available, or whether the caller is allowed.
They only translate their protocol into this pipeline.

## Policy belongs beside the capability

`authorize` receives the principal, decoded input, Model snapshot, and transport.
That lets the contract reject an agent call early with a typed error.

For state that also has an authoritative server boundary, early agent policy is
not a replacement for server enforcement. For example, the todo app uses the
same owner predicate in the agent contract and in the Sync/Durable journal:

```text
agent boundary
  -> refuse unauthorized request early

server journal
  -> enforce authorization authoritatively
```

Those checks are complementary. A client-side agent contract improves the
interface; the trusted boundary still owns trust.

## Bind once, serve several protocols

Once a contract is bound to a live runtime, adapters are intentionally thin:

| Where the caller is | Adapter | What a capability becomes |
| --- | --- | --- |
| Agent running in the page | [`foldkit-agent-webmcp`](../packages/agent-webmcp) | WebMCP tool on `document.modelContext` |
| External MCP client | [`foldkit-agent-mcp`](../packages/agent-mcp) | `tools/list` / `tools/call` entry over stdio or Streamable HTTP |
| Another A2A agent | [`foldkit-agent-a2a`](../packages/agent-a2a) | skill on an Agent Card, invoked as a task |
| Agent Native host | [`foldkit-agent-native`](../packages/agent-native) | Agent Native action |

For example:

```ts
import { AgentA2a } from 'foldkit-agent-a2a'
import { AgentMcp } from 'foldkit-agent-mcp'
import { AgentWebMcp } from 'foldkit-agent-webmcp'

AgentWebMcp.register({ agent: agentRuntime })
AgentMcp.stdio({ agent: agentRuntime })
AgentA2a.handler({ agent: agentRuntime })
```

Agent Native differs slightly because the host may resolve a runtime per caller:

<!-- docs-check
import type { ActionRunContext } from 'foldkit-agent-native'
const resolveRuntime = (_context: ActionRunContext) => agentRuntime
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

Serving the same application through two protocols is therefore two adapter
calls, not two contracts.

Adapters derive their schemas and call the same runtime. They do not repeat
business logic, authorization, or input validation.

## Dynamic capabilities

`available(model)` can make a capability appear or disappear as the application
moves through states.

With WebMCP, for example, a host that supplies `subscribe` lets the adapter
reconcile tool registration when the Model changes:

```text
no completed todos
  tools: add_todo

a todo becomes completed
  Model changes
  tools: add_todo, clear_completed
```

This is not merely presentation. Calling `clear_completed` by name while it is
unavailable still fails with `AgentCapabilityUnavailableError`.

## Audit without capturing the Model

Every decision can be recorded, including refusals:

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

The built-in log is deliberately conservative:

- the Model is never stored;
- the principal is stored only through an explicit projection;
- input is opt-in and can be redacted;
- the buffer is bounded;
- a failing audit sink never fails the application dispatch.

Audit is accountability, not replay. Re-dispatching an old invocation remains
an explicit application decision.

## The contract is inspectable data

The contract can be inspected without an LLM or a running transport:

```ts
Agent.messages(AssistantAgent)
Agent.schema(AssistantAgent)
Agent.contextSchema(AssistantAgent)
Agent.toManifest(AssistantAgent)
Agent.toManifest(AssistantAgent, AssistantParts) // with the parts, as `parts`
Agent.toMarkdown(AssistantAgent)
```

This is useful in tests and code review. Committing a generated manifest turns
"the agent can now do X" into an ordinary diff instead of a hidden runtime
change.

The contract also contributes architecture metadata to `foldkit-surface`'s
`Module`, so the application can inspect which Model paths an agent observes and
which Message tags it exposes.

## Local-first applications

`foldkit-agent` does not care whether the live host is a simple in-memory
runtime or a replicated application.

`Sync.mount` already exposes the runtime-shaped pieces an agent needs: current
Model access, dispatch, subscription, and Message observation. That means a
local-first app can give a human and an agent the same application seam:

```text
human UI ---------> Messages ----+
                                 |
agent contract ---> Messages ----+--> update / replica
```

The agent does not need a second server API that reimplements the state
transitions merely because the application is synchronized.

## How this relates to Surface

Surface and Agent answer different questions:

```text
Surface
  "What may this feature observe and which application Messages may it cause?"

Agent
  "How should part of that application boundary be exposed safely to an agent?"
```

A Surface makes an excellent agent context because it is already an inspectable
consumer-facing projection of application state. Agent then adds protocol input,
availability, authorization, completion, resources, audit, and adapter-facing
metadata around the application's existing Messages.

The agent contract does not become a second owner of the state it observes.
Submodels, Sync, Remote, or plain application `update` still own their respective
transitions.

## When not to use this

- **You want DOM automation.** `foldkit-agent` dispatches application Messages;
  it does not click buttons or scrape the page. If an important operation has no
  Message, model it as application behaviour first.
- **You want to expose the entire Model.** Usually that means the information
  boundary has not been designed yet. Give the agent a Surface or Projection
  that contains what the task requires.
- **You need exactly-once external effects.** Completion observes application
  facts; it is not an idempotency or effect-recovery protocol. See
  [Durable effect recovery](../packages/durable/README.md#external-effects-and-the-crash-gap).
- **You are only wrapping a stateless function.** If there is no meaningful
  application Model/Message boundary to preserve, a normal tool definition may
  be simpler.

## Choosing what to read next

- [`examples/todo-app/src/agent.ts`](../examples/todo-app/src/agent.ts) — the
  clearest concrete contract: Surface context, intent/fact completion,
  authorization, and resources.
- [`examples/todo`](../examples/todo) — a hand-written host and adapter path,
  useful for understanding binding without Sync.
- [`examples/todo-app`](../examples/todo-app) — a real browser application where
  the same state is used by the UI, replication, and agent.
- [`packages/agent/README.md`](../packages/agent/README.md) — the full API,
  dispatch errors, schemas, audit options, and completion semantics.
- Adapter READMEs: [WebMCP](../packages/agent-webmcp),
  [MCP](../packages/agent-mcp), [A2A](../packages/agent-a2a), and
  [Agent Native](../packages/agent-native).
