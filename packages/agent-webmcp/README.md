# `foldkit-agent-webmcp`

Giving an AI assistant running inside the browser tab access to your application usually relies on fragile DOM scraping or maintaining a separate API client. You want browser-resident agents to call typed tools backed by your live application state and `update` loop.

`foldkit-agent-webmcp` publishes a bound [`foldkit-agent`](../agent) runtime onto WebMCP (`document.modelContext`) and declarative HTML forms. Tool calls from the browser pass through your contract's schema decode, availability, and authorization rules before dispatching Messages into your running Foldkit app. See it in action in [the live Todo agent demo](https://foldkit-todo-demo.pages.dev/).

## Install

```bash
pnpm add foldkit-agent foldkit-agent-webmcp
```

`foldkit`, `effect`, and `foldkit-agent` are peer dependencies.

## A first WebMCP registration

Bind a contract to your live host (or `Agent.headless` in a minimal script) and register its available tools when WebMCP is present in the browser (see the [Agent contract guide](../agent/README.md#a-first-agent-contract) for `Agent.host` and `Sync.mount` setup):

```ts
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Agent } from 'foldkit-agent'
import { AgentWebMcp } from 'foldkit-agent-webmcp'

const Model = Schema.Struct({ todos: Schema.Array(Schema.String) })
const Message = defineMessageUnion({
  RequestedCreateTodo: { title: Schema.String },
  DraftSubmitted: {},
})
const TodoAgent = Agent.forModel<typeof Model.Type>()
const AppAgent = TodoAgent.make({
  messages: TodoAgent.expose(Message, { RequestedCreateTodo: 'Create a todo' }),
})
type AppModel = typeof Model.Type
const { host } = Agent.headless({
  init: (): { model: AppModel; commands: [] } => ({ model: { todos: [] }, commands: [] }),
  update: (model: AppModel) => ({ model, commands: [] }),
})
const agentRuntime = TodoAgent.bind({ definition: AppAgent, host })

const modelContext = AgentWebMcp.pageModelContext()
if (modelContext !== undefined) {
  const registration = AgentWebMcp.register({ agent: agentRuntime, modelContext })
  await registration.refresh()
  window.addEventListener('pagehide', () => registration.unregister())
}
```

When the browser exposes `document.modelContext` (or `navigator.modelContext` in older WebMCP builds), `AgentWebMcp.register` registers `requested_create_todo` as a browser tool and reconciles whenever the Model changes. `pageModelContext()` returns `undefined` safely during SSR or in browsers without WebMCP; calling `register()` without a context throws rather than succeeding silently. Call `registration.unregister()` during component or runtime teardown as well as on `pagehide`, and call `await registration.refresh()` when callers need confirmation that the browser accepted the current tool set (passing `onError` for background reconcile errors).

## How capabilities map to WebMCP tools

| `foldkit-agent` | WebMCP tool |
| --- | --- |
| Capability name | Tool `name` |
| Variant description | `description` |
| Encoded input Schema | `inputSchema` |
| `AgentRuntime` dispatch | `execute` |
| Completion contract | Resolved tool outcome |

`execute` delegates directly to `AgentRuntime`, enforcing schema decoding, availability, authorization, cancellation, and Message or state completion without duplicating logic.

## Keep tools synchronized with the Model

Capabilities with an `available(model)` predicate appear and disappear automatically as application state changes:

```ts
import { Option } from 'effect'

const SelectionModel = Schema.Struct({ selectedTodoId: Schema.Option(Schema.String) })
const SelectionMessage = defineMessageUnion({ RequestedDeleteTodo: { id: Schema.String } })
const SelectionAgent = Agent.forModel<typeof SelectionModel.Type>()

const SelectionDef = SelectionAgent.make({
  messages: SelectionAgent.expose(SelectionMessage, {
    RequestedDeleteTodo: {
      name: 'delete_todo',
      description: 'Delete the selected todo',
      available: model => Option.isSome(model.selectedTodoId),
    },
  }),
})
```

With `followModel: true` (the default) and a host providing `subscribe`, selecting a todo registers `delete_todo` and clearing the selection unregisters it. Reconciliations run serially so rapid transitions never double-register a tool, and failed browser registrations retry on the next reconciliation. Invoking a tool name that disappeared between discovery and execution is still refused at dispatch time.

## Expose HTML forms as declarative tools

WebMCP also lets browsers derive tools directly from HTML forms carrying `toolname`, `tooldescription`, `name`, and `toolparamdescription` so users see the agent fill and submit the form on screen. `AgentWebMcp.formTool` generates those attributes from your contract so form markup and imperative tools share one definition:

<!-- docs-check
import type { HtmlBuilder } from 'foldkit/html'
declare const h: HtmlBuilder<typeof Message.Type>
declare const model: { readonly draft: string }
-->
```ts
const CreateTodoForm = AgentWebMcp.formTool(AppAgent, 'requested_create_todo')

h.form([...CreateTodoForm.form(h), h.OnSubmit(Message.DraftSubmitted())], [
  h.input([...CreateTodoForm.field('title', h), h.Value(model.draft)]),
])

AgentWebMcp.register({ agent: agentRuntime, forms: [CreateTodoForm] })
```

`formTool` only emits HTML attributes. When `register({ forms })` sees a capture-phase `submit` event flagged `agentInvoked`, it reads form fields as text, runs the capability's decode, authorization, and dispatch pipeline, and answers via `respondWith` while skipping your normal `OnSubmit` handler (human submissions continue through `OnSubmit` as usual).

On browsers supporting declarative `SubmitEvent.agentInvoked` (`AgentWebMcp.declarativeTools()`), capabilities passed in `forms` skip duplicate imperative registration. Because HTML forms submit string values, give form-backed capabilities string fields or transforming schemas like `Schema.NumberFromString`. Pass `{ autosubmit: true }` to add `toolautosubmit`.

## Manage registration lifecycle and options

<!-- docs-check
declare const registration: ReturnType<typeof AgentWebMcp.register>
-->
```ts
registration.registered()  // capability names currently registered
await registration.refresh() // reconcile against the current Model
registration.unregister()  // stop following and abort every registration
```

| Option | Default | Purpose |
| --- | --- | --- |
| `agent` | — | Bound `AgentRuntime` |
| `modelContext` | `pageModelContext()` | Target producer surface (pass a mock in tests) |
| `followModel` | `true` | Reconcile tools when availability changes |
| `signal` | — | Unregister all tools when aborted |
| `invocationId` | `crypto.randomUUID()` | Generates protocol invocation IDs |
| `onError` | — | Handles background reconciliation errors |
| `forms` | — | Declarative form tools wired via `formTool` |

Each registered tool holds its own registration `AbortController`, separate from the per-call execution `AbortSignal` forwarded to `AgentRuntime` as `Invocation.signal`.

## How errors map to tool callers

Policy and validation refusals return clear messages to the calling agent (`No such capability: ...`, `Capability "..." is not available right now`, `Not authorized to invoke "..."`, `Invalid input for "..."`, `Capability "..." failed unexpectedly`), while internal host or adapter defects flatten to a generic message so application internals stay private.

## Test without a browser

`modelContext` is the only browser seam. Pass a fake object implementing `registerTool` to inspect registered descriptors and invoke `execute` directly in unit tests:

<!-- docs-check
import type { ModelContext } from 'foldkit-agent-webmcp'
declare const fakeModelContext: ModelContext
-->
```ts
const tested = AgentWebMcp.register({
  agent: agentRuntime,
  modelContext: fakeModelContext,
})

await tested.refresh()
```

## Choose an agent adapter

| Where the agent runs | Adapter |
| --- | --- |
| In the page beside the user | `foldkit-agent-webmcp` |
| External MCP client over stdio or HTTP | [`foldkit-agent-mcp`](../agent-mcp) |
| Another agent over A2A | [`foldkit-agent-a2a`](../agent-a2a) |
| An Agent Native host | [`foldkit-agent-native`](../agent-native) |

## Isolate experimental WebMCP changes

Because the browser WebMCP specification is still evolving, keeping WebMCP registration in this adapter ensures upstream browser API changes stay isolated from your `foldkit-agent` contract and Foldkit Messages.

## Next

- Declare capabilities, completion contracts, and Parts: [`foldkit-agent`](../agent)
- Serve external clients over stdio or HTTP MCP: [`foldkit-agent-mcp`](../agent-mcp)
- Read the architecture guide: [Agents guide](../../docs/agents.md)
