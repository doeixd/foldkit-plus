# `foldkit-agent-mcp`

Serves a [`foldkit-agent`](../agent) runtime over the Model Context Protocol
(`2025-06-18`).

Use it when an external assistant or tool host should discover and invoke the
same capabilities your Foldkit application already exposes. This package does
not define tools independently. It maps the protocol-neutral agent contract onto
MCP tools/resources and delegates every invocation back to the bound
`AgentRuntime`.

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
foldkit-agent-mcp           adapter
       |
       +---- stdio
       |
       +---- Streamable HTTP
       v
MCP client
```

The contract remains the authority. MCP adds transport, sessions, protocol error
mapping, and discovery; it does not add application capabilities.

## Install

```bash
pnpm add foldkit-agent foldkit-agent-mcp
```

`foldkit`, `effect`, and `foldkit-agent` are peer dependencies.

## Sixty seconds: serve a bound runtime

Start with the [Agent contract and host guide](../agent/README.md#usage).
The integration below assumes `AssistantAgent` is your declared contract and
`AgentBuilder` is its application-specialized builder. `agentRuntime` is the
result of binding that contract to your live host and verified principal.


The smallest MCP server is stdio:

```ts
import { AgentMcp } from 'foldkit-agent-mcp'

const server = AgentMcp.stdio({ agent: agentRuntime })
```

`stdio` attaches to the process streams immediately. Retain the returned
handle and call `server.close()` on application shutdown. Keep application
logs on stderr so stdout remains the MCP protocol stream.

That gives an MCP client the capabilities/resources derived from the same
contract used by every other adapter.

For embedding or tests, the protocol mapping is also exposed without a
transport:

```ts
const served = AgentMcp.handler({
  agent: agentRuntime,
  onNotification: send,
})

await served.handle({
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/list',
})
```

## What the contract becomes

| MCP | `foldkit-agent` |
| --- | --- |
| `tools/list` | capabilities currently `available` in the Model |
| `tools/call` | `AgentRuntime` dispatch by protocol name |
| `resources/list` / `resources/read` | named resources plus `app://context` |
| `notifications/tools/list_changed` | advertised capability set changed |
| `notifications/cancelled` | abort the matching invocation |

The adapter derives input schemas from the capability's Effect Schema. A
capability with a completion contract resolves after its correlated success or
failure Message; otherwise validated dispatch is the completion boundary.

## Protocol errors vs application refusals

MCP distinguishes a malformed/invalid protocol call from a valid call the
application refuses. This adapter preserves that distinction:

| Situation | MCP result |
| --- | --- |
| unknown tool name | JSON-RPC error `-32602` |
| arguments fail the advertised input schema | JSON-RPC error `-32602` |
| capability is currently unavailable | tool result with `isError: true` |
| principal is unauthorized | tool result with `isError: true` |
| invocation is cancelled | tool result with `isError: true` |
| declared completion fails | tool result with `isError: true` |

That matters because a client may treat JSON-RPC errors as malformed requests or
transport/protocol faults. An authorization refusal is an application decision,
not a broken MCP call.

A capability can also disappear between `tools/list` and `tools/call`. That
call remains syntactically valid, so it returns a tool error rather than
`-32602`.

## Availability follows the Model

`tools/list` is dynamic. If a capability's `available(model)` changes, the tool
appears or disappears with the live application state.

The adapter emits `notifications/tools/list_changed` only when that advertised
set actually changes, not on every Model transition. Use `debounceMs` when the
capability set itself can flap rapidly.

Availability is also enforced at invocation time. Knowing a previously
advertised tool name does not bypass the current Model boundary.

## Streamable HTTP

Use `httpApp` when the MCP server should run behind an Effect HTTP server or be
converted to a web-standard `Request -> Response` handler:

```ts
import * as HttpEffect from 'effect/unstable/http/HttpEffect'
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

Unlike stdio, HTTP is multi-session. `createAgent` runs for a session under the
principal returned by `authenticate`, so different callers do not accidentally
share a bound application runtime.

Underneath, `httpHandler` exposes the same session/security machinery against a
transport-neutral request shape. Use it when integrating with a server stack
that is not Effect HTTP:

```ts
const server = AgentMcp.httpHandler({
  authenticate: request => verify(request.headers['authorization']),
  createAgent: ({ principal }) => bindAgentFor(principal),
  allowedOrigins: ['https://app.example'],
})

const response = await server.handle({ method, headers, body })
```

## HTTP identity and sessions

`initialize` creates a session, identified afterwards by `Mcp-Session-Id`.
Unknown or expired sessions return 404 so the client can re-initialize; `DELETE`
terminates one.

A session id is **not** a bearer token. The authenticated principal owns the
session. If a different principal presents the same id, the server treats it as
unknown rather than revealing that the session exists.

When a principal contains request-varying fields, provide `principalId` so the
adapter knows which stable identity should own the session.

`GET` opens the SSE notification stream. Events have ids; reconnecting with
`Last-Event-ID` replays missed events without replaying ones already seen. An
event is delivered to one stream for that session, not broadcast across every
open connection.

### HTTP security rules

The adapter deliberately keeps protocol identity separate from caller-provided
payloads:

- **Authentication is the source of principal identity.** A principal supplied
  inside request params is ignored.
- **Browser `Origin` values must be allowlisted.** An Origin-bearing request is
  refused when its origin is not configured. Non-browser clients usually send
  no Origin and are unaffected.
- **A local unauthenticated server should stay local.** Bind to localhost; use
  authentication when exposing the server beyond it.

These rules exist so MCP transport details cannot silently widen the authority
already declared by `foldkit-agent`.

## Stdio notes

Stdio has one caller-provided runtime and no HTTP session layer.

`stdout` is reserved for MCP messages. A stray `console.log` corrupts the
protocol stream; write diagnostics to `stderr`.

## Choosing an adapter

All four adapters serve the same `AssistantAgent` contract through a bound
runtime.

| Where the agent runs | Adapter |
| --- | --- |
| In the page, beside the user | [`foldkit-agent-webmcp`](../agent-webmcp) |
| An external MCP client, over stdio or HTTP | `foldkit-agent-mcp` |
| Another agent, over A2A | [`foldkit-agent-a2a`](../agent-a2a) |
| An Agent Native host | [`foldkit-agent-native`](../agent-native) |

## See also

- [Agents guide](../../docs/agents.md) — builder → contract → runtime and the authority model.
- [`foldkit-agent`](../agent) — the protocol-neutral contract and runtime.
- [`examples/todo`](../../examples/todo) — a focused contract served through adapters.
