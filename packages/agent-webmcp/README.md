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

The adapter uses the WebMCP producer API when the host exposes it. Feature
detect `document.modelContext` at runtime; tool registration is optional
for browsers that do not provide it.

## Install

```bash
pnpm add foldkit-agent foldkit-agent-webmcp
```

`foldkit`, `effect`, and `foldkit-agent` are peer dependencies.

## Sixty seconds: publish a bound runtime

Start with the [Agent contract and host guide](../agent/README.md#usage).
The integration below assumes `AssistantAgent` is your declared contract and
`AgentBuilder` is its application-specialized builder. `mounted` below
is an application host (for example, the value returned by `Sync.mount`),
not an arbitrary Foldkit runtime handle.


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
    observe: mounted.observe, // Message-based completion
    principal: () => currentPrincipal, // your authenticated application principal
  },
})

const modelContext = AgentWebMcp.pageModelContext()

if (modelContext !== undefined) {
  const registration = AgentWebMcp.register({
    agent: agentRuntime,
    modelContext,
  })

  await registration.refresh()
  window.addEventListener('pagehide', () => registration.unregister())
}
```

Also call `registration.unregister()` when the owning component or runtime
is disposed; a page unload listener alone does not handle in-page teardown.
`currentPrincipal` above comes from your application, not tool arguments.

That is the whole architecture: the contract remains protocol-neutral, the
runtime remains the one authority for availability/authorization/dispatch, and
this package translates it to the browser API.

`pageModelContext()` is `document.modelContext`, where the spec and Chromium
150 put it, or else `navigator.modelContext`, the older name that earlier
Chromium and agent extensions providing WebMCP still expose. It is safe during
SSR and returns `undefined` when neither exists. Calling `register()` without a model context
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

## Forms as declarative tools

WebMCP also proposes a declarative API: a form carrying `toolname` and
`tooldescription`, with fields named by `name` and described by
`toolparamdescription`, is a tool the browser derives from the markup. The
browser fills the fields and submits; the person can see the form as it is
filled. `formTool` draws a capability that way, from the same contract, so the
form and the registered tool cannot name or describe it differently:

```ts
const CreateTodoForm = AgentWebMcp.formTool(AppAgent, 'requested_create_todo')

// In the view: the form and each field the input names. `DraftSubmitted` and
// `model.draft` are the application's own submit and draft, as before.
h.form([...CreateTodoForm.form(h), h.OnSubmit(Message.DraftSubmitted())], [
  h.input([...CreateTodoForm.field('title', h), h.Value(model.draft)]),
])

// Beside `register`, which then answers the form's agent submissions.
AgentWebMcp.register({ agent, forms: [CreateTodoForm] })
```

`formTool` only writes attributes; it registers nothing and listens to nothing.
`register({ forms })` listens for `submit` on the document in the capture phase,
ahead of the application's own handler. A submission the browser marks
`agentInvoked` is answered as the tool call would be: the fields the input names
are read from the form as text, decoded, authorized and dispatched as the
capability, and the result goes back through `respondWith`. The application's
`OnSubmit` does not run for it, so an agent's submission never depends on the
Model having seen the browser fill the fields. A person's submission is the
application's as before.

In a browser whose `SubmitEvent` has `agentInvoked`
(`AgentWebMcp.declarativeTools()`), a form's capability is not also registered
imperatively, since the form is the tool. Elsewhere it is registered as usual.
A field's value arrives as text, as every form submits it: give such a
capability text fields, or a transforming Schema (`Schema.NumberFromString`).
The declarative API is an early proposal whose form-to-schema rules are still
open, so treat it as a second way in, not the only one.

`formTool(definition, name, { autosubmit: true })` adds `toolautosubmit`, which
lets the agent submit without the person's review. It throws for a name the
contract does not expose and for an input that is not an object of fields;
`field` throws for a key the input lacks, and its type takes only the input's
keys.

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
| `modelContext` | `pageModelContext()` | Producer surface to register against; pass a stand-in in tests. |
| `followModel` | `true` | Reconcile tools as capability availability changes. |
| `signal` | — | Unregister everything when aborted. |
| `invocationId` | `crypto.randomUUID()` | Supplies protocol invocation ids. |
| `onError` | — | Receives failures from background reconciliation. |
| `forms` | — | Capabilities drawn as forms (`formTool`): agent submissions are answered, and declarative browsers get no second, imperative tool. |

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
