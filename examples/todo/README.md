# Todo agent example

A focused `foldkit-agent` example: one ordinary Foldkit state machine, driven by
both a human and an agent, then exposed to a browser agent through WebMCP.

Nothing else is wired in—no Sync, Remote, server journal, or view system—so the
agent boundary is easy to see in isolation. [`examples/todo-app`](../todo-app)
puts the same ideas inside a full application.

## The whole architecture

```text
app.ts
Model + Message + update
       |
       v
Surface.application(App)
       |
       v
TodoAgent                  Agent builder specialized to App + Principal
       |
       | .make(...)
       v
AppAgent                   protocol-neutral agent contract
       |
       | bindAgent(...)
       v
AgentRuntime               live Model + dispatch + principal
       |
       +---- in-process calls
       |
       +---- WebMCP tools
       v
existing Message -> update
```

The names in the source are older than the generic names used in the conceptual
guide, but the roles are the same:

```text
TodoAgent  = AgentBuilder
AppAgent   = concrete AssistantAgent contract
bound value = AgentRuntime
```

The important invariant is that **a capability is an existing application
Message**, not a second implementation of the feature.

## Trace the smallest call

Follow one immediate capability from [agent.ts](src/agent.ts) into
[app.ts](src/app.ts): input is decoded, the bound principal is checked, and the
existing Message reaches `update`. Read the projected context again to observe
the change. Declaring the capability alone executes none of these steps.

Then compare the asynchronous add capability. Dispatch is only the start: its
completion waits for the correlated application result. This is why a host
must report Messages as well as expose the current Model. The WebMCP adapter
uses this same bound runtime rather than implementing a second todo service.

## Run it

From the repository root:

```bash
pnpm install && pnpm build
pnpm --filter foldkit-example-todo demo
```

The demo prints a deterministic transcript; `test/demo.test.ts` pins the
important lines.

Read [`src/agent.ts`](./src/agent.ts) first. It is the entire agent declaration in
one file.

## Files in reading order

| File | What it shows |
| --- | --- |
| [`src/app.ts`](./src/app.ts) | an ordinary Foldkit Model, Message union, and `update`; no agent code |
| [`src/agent.ts`](./src/agent.ts) | the application-specialized builder and concrete agent contract |
| [`src/store.ts`](./src/store.ts) | the host seam that gives the contract a live Model and dispatch function |
| [`src/demo.ts`](./src/demo.ts) | direct invocation, availability, authorization, WebMCP, and invalid input end to end |

## The contract: what may the agent see and do?

`src/agent.ts` first specializes the agent API to this application and principal:

```ts
const TodoAgent = Agent.forApplication(App).withPrincipal<Principal>()
```

`TodoAgent` is **not an agent yet**. It is the builder that already knows this
application's Model, Message union, and Principal type.

The concrete contract is:

```ts
export const AppAgent = TodoAgent.make({
  context: Projection.pick(App.fields.todos, App.fields.selectedTodoId),
  messages: TodoAgent.expose(Message, {
    // selected application Messages only
  }),
})
```

That declaration establishes two boundaries:

```text
information boundary
  context Projection
  -> what the agent may observe

capability boundary
  exposed Messages
  -> what the agent may cause
```

`lastError` exists in the application Model but is omitted from the Projection,
so the agent cannot read it. Messages not listed in `TodoAgent.expose(...)` are
not capabilities, even though the application itself may handle them.

## Binding makes the contract live

The contract is pure data until it is bound to a running application.

This example exports:

```ts
export const bindAgent = TodoAgent.bind
```

and the host supplies the runtime seams:

```ts
const agentRuntime = bindAgent({
  definition: AppAgent,
  host: {
    model: () => currentModel,
    dispatch: message => sendIntoTheRuntime(message),
    subscribe: listener => onModelChange(listener), // optional
    principal: () => currentPrincipal,              // when policy needs it
  },
})
```

`src/store.ts` is a tiny stand-in for a real Foldkit runtime. It reads and writes
through the **same `update`** the human-facing application would use.

The host seam does not give the agent a second reducer:

```text
human action ----\
                  > Message -> update -> Model
agent capability-/
```

## Two capability shapes

The example intentionally includes both an explicit and a contextual capability.

### Explicit target

`rename_todo` receives the todo id in its input. It can rename a todo regardless
of what the UI currently has selected.

```text
caller input
  id + title
      |
      v
RequestedRenameTodo
```

### Contextual target

`delete_selected_todo` derives its target from the current Model instead:

```ts
RequestedDeleteTodo: {
  name: 'delete_selected_todo',
  description: 'Delete the currently selected todo',
  available: model => Option.isSome(model.selectedTodoId),
  input: Schema.Struct({}),
  toMessage: (_, { model }) => ({
    id: Option.getOrThrow(model.selectedTodoId),
  }),
  authorize: ({ principal }) => principal.canDelete,
}
```

That example demonstrates three separate ideas:

```text
available(model)
  does this capability exist right now?

input / toMessage
  how does protocol input become the existing application Message?

authorize(...)
  may this caller use the capability?
```

Without a selected todo, `delete_selected_todo` is neither advertised nor
invocable. Once one is selected, the capability exists—but authorization is
still a separate check.

## What the demo walks through

The transcript follows the agent architecture in eight steps:

1. **The contract is data.** `Agent.messages(AppAgent)` can inspect capability
   names, tags, and descriptions without an LLM or running protocol adapter.
2. **One state machine.** A todo added from the human/application side appears in
   the agent's projected context because both read the same Model.
3. **The agent causes the same transition.** Direct runtime dispatch produces an
   existing application Message rather than an agent-specific action.
4. **Availability follows the Model.** `delete_selected_todo` appears only when a
   selection exists.
5. **Availability is not authorization.** A caller may see an available
   capability and still be refused by policy; refusal dispatches no Message.
6. **WebMCP is only an adapter.** The same contract becomes browser tools, with
   input Schema derived instead of rewritten.
7. **Tool registration follows availability.** Deleting the selected todo clears
   the selection in `update`, so the WebMCP tool disappears too.
8. **Untrusted input is decoded at the boundary.** Invalid protocol input is
   refused before a Message reaches `update`.

## From contract to WebMCP

The WebMCP part does not declare the capabilities again:

```text
AppAgent
   |
bound AgentRuntime
   |
foldkit-agent-webmcp
   |
document.modelContext tools
```

The adapter derives tool names, descriptions, and schemas from `AppAgent` and
delegates execution back to the runtime. If availability or authorization
changes, the adapter does not get independent authority to override it.

## Notes

`update` in this small example returns only a Model. A production Foldkit update
may also return Commands; that does not change the agent layer. The agent still
only dispatches Messages and lets the application decide what those Messages
mean.

`RequestedCreateTodo` uses the description shorthand, so its protocol-facing
name is the normalized Message tag (`requested_create_todo`). Capabilities that
want a different public name specify one explicitly, as `rename_todo` and
`delete_selected_todo` do.

Selecting is its own capability. An agent does not have to manipulate UI state
as a hidden prerequisite for a domain operation; the contract can expose either
explicit-target or contextual capabilities according to what makes sense for the
application.

## See also

- [Agents guide](../../docs/agents.md) — the full builder → contract → runtime mental model.
- [`foldkit-agent`](../../packages/agent) — contract/runtime reference.
- [`foldkit-agent-webmcp`](../../packages/agent-webmcp) — the browser adapter used here.
- [`examples/todo-app`](../todo-app) — the same pattern inside a complete local-first application.
