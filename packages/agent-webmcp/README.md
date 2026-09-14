# `foldkit-agent-webmcp`

Publishes a [`foldkit-agent`](../agent) runtime as browser-native WebMCP tools.

Use it when an agent runs **inside the page** and should operate the same live
Foldkit application the person is using. This package does not define new agent
capabilities and does not automate the DOM. It translates the capabilities your
agent contract already exposes into `document.modelContext` tools.

```text
Foldkit application
       |
       v
AssistantAgent              protocol-neutral contract
       |
       | AgentBuilder.bind(...)
       v
AgentRuntime                live Model + dispatch + policy
       |
       v
foldkit-agent-webmcp        adapter only
       |
       v
document.modelContext      browser tools
       |
       v
Message -> update -> Model + Commands
```

The authority boundary stays in `foldkit-agent`: the contract decides what the
agent may observe and which Messages it may cause. WebMCP only makes those
capabilities available to a browser-resident agent.

[WebMCP](https://github.com/webmachinelearning/webmcp) is an experimental web
platform proposal. No stable browser ships it today, so feature detection is
part of the normal integration path.

## Install

```bash
pnpm add foldkit-agent foldkit-agent-webmcp
```

`foldkit`, `effect`, and `foldkit-agent` are peer dependencies.

## Sixty seconds: publish a bound runtime

Assume the application already declared a protocol-neutral contract:

```ts
const AgentBuilder = Agent.forApplication(App).withPrincipal<Principal>()
const AssistantAgent = AgentBuilder.make({ ... })
```

Bind that contract to the running application, then register its currently
available capabilities with WebMCP:

```ts
import { AgentWebMcp } from 'foldkit-agent-webmcp'

const agentRuntime = AgentBuilder.bind({
  definition: AssistantAgent,
  host: {
    model: mounted.model,
    dispatch: message => mounted.dispatch(message),
    subscribe: mounted.subscribe,
    observe: mounted.observe, // required only by capabilities with completion contracts
  },
})

const modelContext = AgentWebMcp.documentModelContext()

if (modelContext !== undefined) {
  const registration = AgentWebMcp.register({
    agent: agentRuntime,
    modelContext,
  })

  window.addEventListener('beforeunload', () => registration.unregister())
}
```

That is the whole architecture: the contract remains protocol-neutral, the
runtime remains the one authority for availability/authorization/dispatch, and
this package translates it to the browser API.

`documentModelContext()` is safe during SSR and returns `undefined` when no
WebMCP producer surface exists. Calling `register()` without a model context
throws rather than silently pretending registration succeeded.

Registration starts immediately, but browser registration is asynchronous.
`register()` returns after reconciliation is scheduled; use
`await registration.refresh()` when the caller needs to know that the browser
has accepted the current tool set, and `onError` for background reconcile
failures.

## What a capability becomes

Each **currently available** capability becomes one WebMCP tool:

```text
foldkit-agent                    WebMCP

capability name          ->      tool name
variant description      ->      description
encoded input Schema     ->      inputSchema
AgentRuntime dispatch    ->      execute
completion contract      ->      resolved tool outcome
```

No input schema or handler is written again. `execute` delegates to the bound
runtime, which performs the same decode, availability check, authorization,
dispatch, cancellation, and completion handling as every other adapter.

A capability with a completion contract resolves when its correlated success or
failure Message is observed. Without one, validated dispatch is the completion
boundary.

## Tools follow the Model

Availability is Model-dependent, so the advertised WebMCP tool set may change as
the application changes:

```ts
RequestedDeleteTodo: {
  name: 'delete_todo',
  description: 'Delete the selected todo',
  available: model => Option.isSome(model.selectedTodoId),
}
```

```text
no selection       tools: create_todo
       |
user selects todo
       v
selected todo      tools: create_todo, delete_todo
```

With `followModel: true` (the default) and a host with `subscribe`, a Model
change reconciles registrations. A capability that disappears is unregistered;
a newly available capability is registered.

Availability is stronger than discoverability. A capability absent from the
tool list is also refused if a caller somehow invokes its known name.

Reconciliation is serialized, so overlapping Model changes cannot register the
same capability twice. A failed browser registration is not recorded as live and
is retried on a later reconcile.

## Registration lifecycle

`AgentWebMcp.register` returns:

```ts
registration.registered()  // capability names currently registered
await registration.refresh() // reconcile against the current Model
registration.unregister()  // stop following and abort every registration
```

The main options are:

| Option | Default | Purpose |
| --- | --- | --- |
| `agent` | — | The bound `AgentRuntime`. |
| `modelContext` | `document.modelContext` | Producer surface to register against; pass a stand-in in tests. |
| `followModel` | `true` | Reconcile tools as capability availability changes. |
| `signal` | — | Unregister everything when aborted. |
| `invocationId` | `crypto.randomUUID()` | Supplies protocol invocation ids. |
| `onError` | — | Receives failures from background reconciliation. |

Each registered tool has its own registration `AbortController`. That signal is
for the WebMCP registration itself. It is distinct from a tool invocation's
execution signal, which is forwarded to `AgentRuntime` as `Invocation.signal`.

## Errors

Application refusals become tool errors the calling agent can reason about:

```text
No such capability: delete_todo
Capability "delete_todo" is not available right now
Not authorized to invoke "delete_todo"
Invalid input for "create_todo"
Capability "create_todo" failed unexpectedly
```

`execute` does not expose underlying application errors to the caller. A host or
adapter defect is flattened to a generic failure; the detailed error stays in
the application.

## Testing without a browser

`modelContext` is the only browser-specific seam this package needs. Pass an
object with `registerTool` to capture descriptors and invoke their `execute`
functions directly:

```ts
const registration = AgentWebMcp.register({
  agent: agentRuntime,
  modelContext: fakeModelContext,
})

await registration.refresh()
```

That is how the package test suite and [`examples/todo`](../../examples/todo)
exercise the real adapter path without requiring browser support.

[`examples/todo-app`](../../examples/todo-app) shows the same adapter attached to
a real local-first Foldkit application.

## Choosing an adapter

All four adapters serve the same `AssistantAgent` contract through a bound
runtime. Serving more than one does not duplicate capability declarations.

| Where the agent runs | Adapter |
| --- | --- |
| In the page, beside the user | `foldkit-agent-webmcp` |
| An external MCP client, over stdio or HTTP | [`foldkit-agent-mcp`](../agent-mcp) |
| Another agent, over A2A | [`foldkit-agent-a2a`](../agent-a2a) |
| An Agent Native host | [`foldkit-agent-native`](../agent-native) |

## Why this stays an adapter

WebMCP is experimental and may change independently of Foldkit Plus. Its browser
shape is intentionally isolated here. If the proposal changes, this adapter can
change without changing the protocol-neutral `foldkit-agent` contract or the
application's Messages.

## See also

- [Agents guide](../../docs/agents.md) — the full builder → contract → runtime mental model.
- [`foldkit-agent`](../agent) — declares and binds the contract this package serves.
- [WebMCP](https://github.com/webmachinelearning/webmcp) — the browser proposal.
