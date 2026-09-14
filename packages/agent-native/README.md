# `foldkit-agent-native`

Compiles a [`foldkit-agent`](https://github.com/doeixd/foldkit-plus/tree/main/packages/agent)
contract into [Agent Native](https://github.com/BuilderIO/agent-native) actions.

Use it when your host application already uses Agent Native's action registry
and you want those actions to be the same capabilities your Foldkit application
already exposes. A capability becomes an Agent Native action; the generated
`run` validates/authorizes through the bound `foldkit-agent` runtime and then
**only dispatches the existing Foldkit Message**. Application behavior stays in
`update`.

```text
foldkit-agent contract
  capability + input + policy
            │
            ▼
foldkit-agent-native
            │
            ▼
Agent Native action
            │ run
            ▼
bound AgentRuntime -> Message -> update
```

This is an adapter, not an alternative agent architecture. If the agent runs in
the page, use `foldkit-agent-webmcp`; if an external client speaks MCP, use
`foldkit-agent-mcp`; if another agent speaks A2A, use `foldkit-agent-a2a`.

## Install

```bash
pnpm add foldkit-agent foldkit-agent-native @agent-native/core
```

`foldkit`, `effect`, `foldkit-agent`, and `@agent-native/core` are peer
dependencies.

## Quick start

```ts
import { AgentNative } from 'foldkit-agent-native'
import { registerPackageActions } from '@agent-native/core/server'

registerPackageActions(
  AgentNative.actions({
    definition: AppAgent,
    resolveRuntime: ctx => runtimeFor(ctx),
  }),
)
```

`AppAgent` is the protocol-neutral `foldkit-agent` definition. The adapter
returns the action record Agent Native expects; registering it does not write any
action files to disk.

One exposed capability becomes one entry, keyed by capability name, with its
description and input schema derived from the contract. Each entry states
`http: POST`, `requiresAuth: true`, and `readOnly: false`: a capability can
dispatch a Message, so claiming it is read-only could let a planning surface run
it for real.

## Runtime and identity

`resolveRuntime` runs **per invocation**, not once when actions are registered.
That distinction matters because an action description is static while the
Model/principal it should operate on depends on the caller.

The runtime you return must already be bound for that caller:

```text
verified Agent Native caller/context
              │
              ▼
      resolveRuntime(ctx)
              │
              ▼
Agent.bind({ definition, host, principal })
              │
              ▼
 availability / authorization / dispatch
```

When a contract declares `authorize`, `Agent.bind` requires a principal provider
of the right type. The adapter deliberately does not guess application identity
from fields such as `userEmail`; mapping an authenticated host caller to your
principal belongs to the application.

The registry is static — it describes all declared capabilities — while
availability is checked at invocation time against the current Model. A
capability that is currently unavailable remains an action in the registry but
is refused by the runtime when called.

## What `run` returns

A contract refusal is application output, not an adapter crash. Unavailable,
unauthorized, cancelled, failed completion, or runtime input rejection resolves
to:

```ts
{ ok: false, message: '…' }
```

A successful dispatch/completion resolves with `ok: true`. Agent Native records
the action call itself as completed, so a consumer must inspect the returned
`ok` rather than assuming the framework-level action status means the
application accepted the operation.

Only a host/adapter defect is flattened to a generic failure message; application
internals are not sent to the caller.

## Why generate actions instead of writing them twice?

The dependency direction stays one-way:

```text
Foldkit Message + update
        │
foldkit-agent capability
        │
Agent Native action
```

Availability, authorization, input validation, and completion all remain in the
contract. The action adds no authority and reimplements no transition. Removing
or changing a capability changes the generated registry entry rather than
leaving a hand-written action beside the application that can drift.

Nothing is written to disk. An application-local Agent Native action file may
still override an inherited/package action according to Agent Native's own
registry rules.

## The schema bridge

The adapter exposes the capability's **encoded** input schema as a Standard
Schema validator and advertises the corresponding JSON Schema to Agent Native.
This matters for transforming Effect schemas such as `NumberFromString`: the
host validates the encoded input, then `foldkit-agent` performs the application's
single decode before dispatch.

Agent Native's schema integration has a subtle requirement. Effect exposes two
conversions with different halves of what Agent Native needs:

| Conversion | `validate` | advertised parameters |
| --- | --- | --- |
| `toStandardSchemaV1` | yes | empty |
| `toStandardJSONSchemaV1` | no | full |
| copied into a fresh object | yes | empty |
| both called on the same schema object | yes | full |

The conversion reads/mutates metadata associated with the Effect schema, so
object identity has to survive. This adapter calls both helpers on the same
schema object and leaves one Standard Schema value carrying validation and JSON
Schema metadata. Extra input fields are rejected.

Only object input schemas are supported because that is what Agent Native
includes in its tool list.

## Compatibility and executable proof

The adapter is checked against `@agent-native/core@0.177.1`. The integration
suite uses the real Agent Native package registry, tool runtime, and schema
wrapper rather than stand-ins.

Run from the repository root:

```bash
pnpm exec vitest run packages/agent-native/test/framework.test.ts
```

No LLM credentials or network server are needed; the suite uses an in-memory
PGlite database for Agent Native's internal metadata lookups.

| Framework surface | What the test proves |
| --- | --- |
| Package registry | `registerPackageActions` + `autoDiscoverActions` discovers the generated entry; an actual app-local action file wins a name collision. |
| Agent tool runtime | `actionsToEngineTools` advertises the encoded schema; `executeAgentToolCall` changes the Foldkit Model for an authorized caller and refuses another caller. |
| Schema wrapper | `defineAction` derives parameters, preserves transforming input for the one decode in Foldkit, and rejects excess fields. |

The public adapter types are checked against Agent Native's real `ActionTool`
type. The framework is a development dependency and a pinned peer of this
adapter, not a dependency of `foldkit-agent` itself.

## Limits

This package proves/reuses the Agent Native **action registry and tool runtime**.
It does not claim to replace or integrate every Agent Native subsystem. HTTP,
MCP, A2A, CLI, UI queries, auth sessions, and deep-link deployment still belong
to the Agent Native host or to Foldkit Plus's dedicated adapters.

Page-local state still belongs to WebMCP; this package does not introduce a
browser RPC bridge.

The Agent Native package registry retains the first registration of a name and
skips names inherited from `Object.prototype`, including `__proto__`. Avoid
those names and restart the host after changing a registered contract. The
adapter's returned record preserves such keys, but cannot change downstream
registry behavior.

Full HTTP/MCP/A2A deployment tests are outside this package's test suite. This
is the bounded integration originally tracked in
[issue #22](https://github.com/doeixd/foldkit-plus/issues/22), not a claim that
every Agent Native subsystem is independently reusable.

## Choosing an adapter

All four serve the same `foldkit-agent` contract. Serving more than one is
multiple adapters over one definition, not multiple capability declarations.

| Where the agent runs | Adapter |
| --- | --- |
| In the page, beside the user | [`foldkit-agent-webmcp`](https://github.com/doeixd/foldkit-plus/tree/main/packages/agent-webmcp) |
| An external MCP client, over stdio or HTTP | [`foldkit-agent-mcp`](https://github.com/doeixd/foldkit-plus/tree/main/packages/agent-mcp) |
| Another agent, over A2A | [`foldkit-agent-a2a`](https://github.com/doeixd/foldkit-plus/tree/main/packages/agent-a2a) |
| An Agent Native host | [`foldkit-agent-native`](https://github.com/doeixd/foldkit-plus/tree/main/packages/agent-native) |

## See also

- [The agents guide](https://github.com/doeixd/foldkit-plus/blob/main/docs/agents.md) — what an agent may see and do, and why a capability is a Message.
- [`foldkit-agent`](https://github.com/doeixd/foldkit-plus/tree/main/packages/agent) — the contract this adapter serves and where `Agent.bind` produces the runtime it takes.
- [`examples/todo`](https://github.com/doeixd/foldkit-plus/tree/main/examples/todo) — a worked contract with a hand-written host.