# `foldkit-agent-webmcp`

Turns a [`foldkit-agent`](https://github.com/doeixd/foldkit-plus/tree/main/packages/agent)
contract into browser tools, so an agent running **inside the page** can use the
application the person in front of it is already using.

[WebMCP](https://github.com/webmachinelearning/webmcp) is an experimental web
platform proposal: a page publishes tools on `document.modelContext`, and a
browser-resident agent calls them. Because the tool runs in the page, its
`execute` dispatches a Message straight into the live Foldkit Runtime. There is
no DOM automation, no scraping, no second copy of the application's logic, and
no browser-session bridge.

```text
browser agent -> document.modelContext -> foldkit-agent-webmcp
              -> Foldkit AgentRuntime  -> Message -> update -> Model + Commands
```

The agent can only do what the contract exposes, and the contract only exposes
Messages `update` already handles. Everything an agent may see or do is decided
in `foldkit-agent`; this package translates and nothing else.

## Install

```bash
pnpm add foldkit-agent foldkit-agent-webmcp
```

`foldkit`, `effect`, and `foldkit-agent` are peer dependencies.

## Usage

The whole path, from a declared contract to live tools:

```ts
import { AgentWebMcp } from 'foldkit-agent-webmcp'

// 1. Bind the contract to the running application. `TodoAgent` is
//    `Agent.forApplication(App)`, or `Agent.forModel<Model>()` without one.
const agent = TodoAgent.bind({
  definition: AppAgent,
  host: {
    model: mounted.model,
    dispatch: (message: Message) => {
      mounted.dispatch(message)
    },
    subscribe: mounted.subscribe, // lets tools appear and disappear with the Model
    observe: mounted.observe, // required by a capability with a completion contract
  },
})

// 2. Publish it, if this browser speaks WebMCP.
const modelContext = AgentWebMcp.documentModelContext()
if (modelContext !== undefined) {
  const registration = AgentWebMcp.register({ agent, modelContext })
  window.addEventListener('beforeunload', () => registration.unregister())
}
```

**Check for support first.** WebMCP ships in no stable browser today, so
`document.modelContext` is usually absent. `documentModelContext()` returns it
or `undefined`, and is safe on a server, where there is no `document` at all.
Calling `register()` without a model context **throws**, on the grounds that
silently registering nothing would look like a working integration. Feature-detect,
or pass a `modelContext` of your own.

Registration begins immediately and in the background: `register` returns as
soon as the reconcile is scheduled, not when the browser has accepted the tools.
Pass `onError` to hear about a failure in that first pass, or `await
registration.refresh()` when you want to know the tools are live.

[`examples/todo`](https://github.com/doeixd/foldkit-plus/tree/main/examples/todo)
registers a real contract and executes the resulting tools;
[`examples/todo-app`](https://github.com/doeixd/foldkit-plus/tree/main/examples/todo-app)
does it in a real browser over a local-first replica.

## What a capability becomes

Each **currently available** capability becomes one tool:

```text
capability name     -> tool name
variant description -> description
derived JSON Schema -> inputSchema
Runtime dispatch    -> execute
```

No schema and no handler is written twice. `execute` decodes its input through
the capability's own Effect Schema, runs `available` and `authorize`, and
dispatches; a capability with a `completion` contract resolves when the
correlated Message is applied, so the agent learns the outcome rather than that
the call was received.

### Options

| Option | Default | Purpose |
| --- | --- | --- |
| `agent` | — | The bound `AgentRuntime`. |
| `modelContext` | `document.modelContext` | The WebMCP producer surface. Pass one to target a different surface, or to drive the adapter in a test. |
| `signal` | — | Unregisters everything when aborted. An already-aborted signal unregisters at once. |
| `followModel` | `true` | Reconcile registrations as the Model changes. Inert unless the host supports `subscribe`. |
| `invocationId` | `crypto.randomUUID()` | Supplies the invocation id. |
| `onError` | — | Reports a failure from a reconcile no caller is awaiting: the initial registration, or one a Model change triggered. |

### The returned registration

```ts
registration.refresh() // Promise: reconcile against the current Model
registration.registered() // the capability names currently registered
registration.unregister() // abort every registration and stop following
```

## Tools appear and disappear with the Model

Availability is a projection of Model state, which falls out of the
architecture rather than needing its own mechanism:

```ts
RequestedDeleteTodo: {
  name: 'delete_todo',
  description: 'Delete the selected todo',
  available: model => Option.isSome(model.selectedTodoId),
}
```

```text
Todo list          tools: create_todo
user selects todo  -> Model changes
                   -> tools: create_todo, delete_todo
```

With `followModel` left on and a host that supports `subscribe`, every
transition reconciles the registrations: capabilities that are gone have their
registration signal aborted, and capabilities that have appeared are registered.
Availability is stronger than visibility. A capability the Model does not
currently offer is absent from the tool list **and** refused if called by name.

The adapter holds one `AbortController` per registered tool and passes its
signal in the options bag, where `registerTool` takes it:

```ts
await document.modelContext.registerTool(tool, { signal: controller.signal })
```

Aborting that signal is what unregisters the tool, so it must not go on the
descriptor. This is the registration signal, distinct from the execution signal
passed to `execute`, which is forwarded as `Invocation.signal` so an agent can
cancel a call in flight.

Reconciles are serialized, and a capability is recorded as registered only once
`registerTool` resolves, so two overlapping reconciles cannot register one tool
twice. A registration the browser refuses is not recorded and is retried on the
next reconcile; `refresh()` rejects with the first failure after attempting the
rest. Nothing is registered once `unregister()` has run, and a registration that
was in flight when it ran is aborted.

## Errors

A dispatch failure comes back as a tool error rather than a rejection, so the
calling agent can read it and decide what to do:

```text
No such capability: delete_todo
Capability "delete_todo" is not available right now
Not authorized to invoke "delete_todo"
Invalid input for "create_todo"
Capability "create_todo" failed unexpectedly
```

The last covers an unexpected defect, such as the host's `dispatch` throwing.
`execute` never rejects, and never echoes the underlying error back to the
caller: the detail stays in the application, and the agent gets a message
written for it.

## Testing without a browser

`modelContext` is the only thing this package needs from the platform, so pass
your own object with a `registerTool` method to capture the descriptors and call
their `execute` directly. That is how this package's own suite and
[`examples/todo`](https://github.com/doeixd/foldkit-plus/tree/main/examples/todo)
exercise the real registration path with no browser involved.

## Choosing an adapter

| Where the agent runs | Adapter |
| --- | --- |
| In the page, beside the user | `foldkit-agent-webmcp` |
| An external MCP client, over stdio or HTTP | [`foldkit-agent-mcp`](https://github.com/doeixd/foldkit-plus/tree/main/packages/agent-mcp) |
| Another agent, over A2A | [`foldkit-agent-a2a`](https://github.com/doeixd/foldkit-plus/tree/main/packages/agent-a2a) |
| An Agent Native host | [`foldkit-agent-native`](https://github.com/doeixd/foldkit-plus/tree/main/packages/agent-native) |

They share one contract, so serving two at once is two calls, not two
definitions.

## Why this stays an adapter

WebMCP is experimental and still changing. The types it needs are declared
locally in `src/webmcp.ts` rather than imported, so the browser API can move
without the Foldkit agent contract moving with it. If the proposal changes
shape, this package changes and nothing else does.

## See also

- [The agents guide](https://github.com/doeixd/foldkit-plus/blob/main/docs/agents.md)
  — what an agent may see and do, and why a capability is a Message.
- [`foldkit-agent`](https://github.com/doeixd/foldkit-plus/tree/main/packages/agent)
  — the contract this adapter serves.
- [WebMCP](https://github.com/webmachinelearning/webmcp) — the proposal.
