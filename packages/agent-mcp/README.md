# `foldkit-agent-mcp`

Exposing a Foldkit app to desktop or IDE assistants over the Model Context Protocol (MCP) usually means building and maintaining a parallel tool server whose schemas, permissions, and handlers drift from your UI. You want MCP clients to discover and invoke the exact capabilities your application already enforces.

`foldkit-agent-mcp` serves any bound [`foldkit-agent`](../agent) runtime over MCP (`2025-06-18`) via stdio or Streamable HTTP. Your `AssistantAgent` contract stays the authority for input schemas, availability, authorization, and completion, while this adapter maps capabilities to `tools/list`, `tools/call`, and `resources/read`. See agent contracts in action in [the live Todo agent demo](https://foldkit-todo-demo.pages.dev/).

## Install

```bash
pnpm add foldkit-agent foldkit-agent-mcp
```

`foldkit`, `effect`, and `foldkit-agent` are peer dependencies.

## A first MCP server

Bind an agent contract to a Foldkit host and serve it over stdio (start with the [Agent contract guide](../agent/README.md#a-first-agent-contract) for full contract options):

```ts
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Agent } from 'foldkit-agent'
import { AgentMcp } from 'foldkit-agent-mcp'

const Model = Schema.Struct({ todos: Schema.Array(Schema.String) })
const Message = defineMessageUnion({ RequestedCreateTodo: { title: Schema.String } })
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

const server = AgentMcp.stdio({ agent: agentRuntime })
```

`AgentMcp.stdio` attaches to stdin/stdout immediately and exposes `requested_create_todo` over JSON-RPC to any connected MCP client. Retain `server` and call `server.close()` on shutdown, and route your own application logs to `stderr` so `stdout` stays clean for MCP messages (the adapter sends its own [diagnostics](#diagnostics) to `stderr` by default).

For embedding or tests without stdio, use `AgentMcp.handler`:

```ts
const served = AgentMcp.handler({ agent: agentRuntime })

await served.handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
```

## How the contract maps to MCP

| MCP method or notification | `foldkit-agent` source |
| --- | --- |
| `tools/list` | Capabilities currently `available` in the Model |
| `tools/call` | `AgentRuntime` dispatch by protocol name |
| `resources/list` / `resources/read` | Named resources, `app://context`, and `app://parts` |
| `notifications/tools/list_changed` | Emitted when the advertised tool set changes |
| `notifications/cancelled` | Aborts the matching in-flight invocation |

When bound with Parts, `app://parts` serves `runtime.parts.list` as JSON—one entry per part (and per occurrence of repeated parts) with `id`, `occurrence`, `label`, `role`, `capability`, and `value` (omitting absent fields so `null` stays distinct). Parts add no extra tools beyond the capabilities they invoke; a resource explicitly named `parts` or `context` takes precedence over the built-in URI.

Input schemas derive directly from each capability's Effect Schema. Capabilities with a completion contract resolve after their correlated success or failure Message arrives; others resolve after validated dispatch.

## Distinguish protocol errors from application refusals

MCP separates malformed protocol requests from valid tool calls refused by application policy:

| Situation | MCP response |
| --- | --- |
| Unknown tool name | JSON-RPC error `-32602` |
| Arguments fail input schema | JSON-RPC error `-32602` |
| Capability unavailable in Model | Tool result with `isError: true` |
| Principal unauthorized | Tool result with `isError: true` |
| Invocation cancelled | Tool result with `isError: true` |
| Declared completion failed | Tool result with `isError: true` |

Returning authorization or availability refusals as tool errors prevents clients from misinterpreting policy decisions as broken transport calls—including when a capability becomes unavailable between `tools/list` and `tools/call`.

## Update tools dynamically with the Model

`tools/list` reflects live `available(model)` predicates. As capabilities appear or disappear across Model transitions, `notifications/tools/list_changed` fires only when the advertised tool set actually changes. Set `debounceMs` if rapid state transitions would otherwise emit bursts of notifications. Availability is checked again at call time so knowing a previously advertised tool name never bypasses current Model state.

## Serve multiple callers over Streamable HTTP

Use `AgentMcp.httpApp` behind an Effect HTTP server (or convert it to a web-standard `Request => Promise<Response>` handler) for multi-session HTTP clients:

<!-- docs-check standalone
import { Effect, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Agent } from 'foldkit-agent'
import type { Unauthenticated } from 'foldkit-agent-mcp'
const Model = Schema.Struct({ todos: Schema.Array(Schema.String) })
const Message = defineMessageUnion({ RequestedCreateTodo: { title: Schema.String } })
type Model = typeof Model.Type
type Message = typeof Message.Type
interface Principal { readonly user: string }
const TodoAgent = Agent.forModel<Model, Principal>()
const AppAgent = TodoAgent.make({
  messages: TodoAgent.expose(Message, { RequestedCreateTodo: 'Create a todo' }),
})
declare const bindAgentFor: (principal: Principal) => ReturnType<typeof TodoAgent.bind>
declare const verify: (header: string | undefined) => Effect.Effect<Principal, Unauthenticated>
declare const request: Request
declare const method: string
declare const headers: Readonly<Record<string, string | undefined>>
declare const body: string
-->
```ts
import * as HttpEffect from 'effect/http/HttpEffect'
import { AgentMcp } from 'foldkit-agent-mcp'

const handler = HttpEffect.toWebHandler(
  AgentMcp.httpApp({
    authenticate: request => verify(request.headers['authorization']),
    createAgent: ({ principal }) => bindAgentFor(principal),
    allowedOrigins: ['https://app.example'],
  }),
)

const response = await handler(request)
```

`createAgent` runs per session under the authenticated `principal` so callers stay isolated. Failing `authenticate` with `AgentMcp.unauthenticated(reason?)` (or `RemoteUnauthenticated`) returns HTTP 401 with `reason`, while unexpected defects return HTTP 500 without leaking internals and emit an `AuthenticateDefect` diagnostic. Build any store references `verify` reads once at startup.

For non-Effect HTTP servers, `AgentMcp.httpHandler` exposes the same session and security layer over `{ method, headers, body }`:

```ts
const mcp = AgentMcp.httpHandler({
  authenticate: request => verify(request.headers['authorization']),
  createAgent: ({ principal }) => bindAgentFor(principal),
  allowedOrigins: ['https://app.example'],
})

const answer = await mcp.handle({ method, headers, body })
```

## HTTP identity, sessions, and origin security

`initialize` creates a session tracked by `Mcp-Session-Id`; unknown or expired sessions return HTTP 404 so clients re-initialize, and `DELETE` closes the session.

A session ID is bound to the authenticated principal—never treated as a bearer token—so another principal presenting the same ID receives 404. Provide `principalId` when your principal object contains per-request fields. `GET` opens an SSE notification stream supporting `Last-Event-ID` replay, delivering each event to one stream per session.

Three HTTP rules keep transport headers from widening contract authority:

- **Identity comes from `authenticate`:** Any principal fields inside JSON-RPC params are ignored.
- **Browser `Origin` must be allowlisted:** Requests carrying an `Origin` header outside `allowedOrigins` are refused.
- **Unauthenticated servers stay local:** Bind local development servers to localhost and require `authenticate` anywhere exposed over a network.

## Keep stdout clean over stdio

`stdio` serves one caller-provided runtime with no HTTP session layer. Because `stdout` carries JSON-RPC frames and Effect's default Node logger writes to `stdout`, avoid `console.log` and let `stdio` send its diagnostics to `stderr` (or pass a custom `diagnostics` handler).

## Diagnostics

Failures whose causes may contain internal details return generic client errors while emitting typed diagnostics via `foldkit-surface`'s `Diagnostics` channel:

| `_tag` | `level` | Trigger |
| --- | --- | --- |
| `AuthenticateDefect` | `error` | `authenticate` threw; answered HTTP 500 |
| `CapabilityDefect` | `error` | Capability dispatch threw; returned opaque tool error |
| `RequestDefect` | `error` | Request projection or resource read threw |
| `ToolListDefect` | `error` | Listing tools failed after Model change; notification skipped |
| `TransportEndDefect` | `warning` | Client transport `end` threw while closing session |

Pass `diagnostics` on `handler`, `httpHandler`, `httpApp`, or `stdio` (or `Diagnostics.collect().report` in tests) to capture them:

```ts
const reported = AgentMcp.httpHandler({
  authenticate: request => verify(request.headers['authorization']),
  createAgent: ({ principal }) => bindAgentFor(principal),
  diagnostics: diagnostic => Effect.logError(`mcp: ${diagnostic.message}`),
})
```

## Choose an agent adapter

| Where the agent runs | Adapter |
| --- | --- |
| In the page beside the user | [`foldkit-agent-webmcp`](../agent-webmcp) |
| External MCP client over stdio or HTTP | `foldkit-agent-mcp` |
| Another agent over A2A | [`foldkit-agent-a2a`](../agent-a2a) |
| An Agent Native host | [`foldkit-agent-native`](../agent-native) |

## Next

- Define capabilities, completion contracts, and audit logs: [`foldkit-agent`](../agent)
- Expose the same contract in the browser: [`foldkit-agent-webmcp`](../agent-webmcp)
- Read the architecture guide: [Agents guide](../../docs/agents.md)
