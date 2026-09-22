# `foldkit-agent-native`

Compiles a [`foldkit-agent`](../agent) contract into [Agent Native](https://github.com/BuilderIO/agent-native)
actions.

Use it when the host application already uses Agent Native's action registry and
you want those actions to be the **same capabilities** your Foldkit application
already exposes. The generated action delegates validation, availability,
authorization, dispatch, and completion back to a bound `AgentRuntime`; it does
not reimplement application behavior.

```text
Foldkit application
       |
       v
AssistantAgent              protocol-neutral contract
       |
       | AgentBuilder.bind(...)
       v
AgentRuntime                live Model + dispatch + policy
       ^
       |
resolveRuntime(ctx)
       |
foldkit-agent-native        adapter
       |
       v
Agent Native action registry
```

Application behavior still ends in the existing Foldkit Message and `update`.
This package is an adapter, not a second agent architecture.

## Install

```bash
pnpm add foldkit-agent foldkit-agent-native @agent-native/core
```

`foldkit`, `effect`, `foldkit-agent`, and `@agent-native/core` are peer
dependencies.

## Sixty seconds: generate actions

Start with the [Agent contract and host guide](../agent/README.md#usage).
The integration below assumes `AssistantAgent` is your declared contract and
`AgentBuilder` is its application-specialized builder. The host-specific
`runtimeFor(context)` below resolves the caller to that live application.


Agent Native needs a static action registry, but the live Model and principal
belong to the caller. Register the contract once and resolve the bound runtime
per invocation:

```ts
import { AgentNative } from 'foldkit-agent-native'
import { registerPackageActions } from '@agent-native/core/server'

registerPackageActions(
  AgentNative.actions({
    definition: AssistantAgent,
    resolveRuntime: context => runtimeFor(context),
  }),
)
```

`runtimeFor(context)` returns an `AgentRuntime` already bound to the correct live
application and principal:

```ts
const runtimeFor = (context: HostContext) =>
  AgentBuilder.bind({
    definition: AssistantAgent,
    // The principal is part of the host, beside `model` and `dispatch`.
    host: { ...hostFor(context), principal: () => principalFor(context) },
  })
```

That distinction is the heart of this adapter:

```text
static
AssistantAgent
      |
      v
Agent Native action descriptions

per invocation
verified host caller/context
      |
      v
resolveRuntime(ctx)
      |
      v
AgentRuntime
      |
      v
availability -> authorization -> Message -> update
```

The registry describes capabilities. The bound runtime decides whether a
particular caller may use one **right now**.

## Verify one action before adding the registry

Start with one capability and a runtime bound to a known caller. Invoke the
generated action with valid input, then with a value its schema rejects.
The first must reach your existing Message handler; the second must leave the
Model unchanged. Next switch to a principal your contract refuses. Registration
is static, so an action's presence never implies that this caller may execute it.

`actions` builds descriptors. `registerPackageActions` installs them in the host.
`resolveRuntime` runs for an invocation, so resolve the verified caller there
rather than capturing one user's runtime in a process-wide registry.

## What a capability becomes

One exposed capability becomes one Agent Native action keyed by capability
name:

| `foldkit-agent` | Agent Native |
| --- | --- |
| capability name | action name |
| description | action description |
| encoded input Schema | action parameter schema |
| `AgentRuntime` dispatch | `run` |
| completion contract | returned success/failure outcome |

Each generated entry declares `http: POST`, `requiresAuth: true`, and
`readOnly: false`. A capability can dispatch a Message, so advertising it as
read-only could let a planning surface execute real application behavior under
the wrong assumption.

Nothing is written to disk. The adapter returns the action record Agent Native
expects; the host decides how that registry is loaded and deployed.

## Runtime and identity

`resolveRuntime` runs **per invocation**, not once when actions are registered.
That is necessary because the action description is static while the Model and
principal are caller-specific.

When a contract declares `authorize`, the runtime must be bound with a principal
provider of the matching type. This adapter intentionally does not infer
application identity from arbitrary Agent Native context fields such as an email
address. Mapping an authenticated host caller to your application principal
belongs to the host/application boundary.

Availability is dynamic too. A capability can remain present in the static Agent
Native registry while being unavailable in the current Model; the bound runtime
refuses it at call time.

## What `run` returns

Application refusals are returned as application output, not thrown as adapter
crashes:

```ts
{ ok: false, message: '…' }
```

That includes unavailable, unauthorized, cancelled, invalid-input, and failed
completion outcomes.

A successful dispatch/completion returns `ok: true`. Agent Native may consider
the framework-level action invocation itself complete, so consumers should read
the returned `ok` value rather than assuming framework completion means the
application accepted or completed the operation.

Only host/adapter defects are flattened to a generic failure message. Internal
application errors are not exposed to the caller.

## Why generate actions instead of writing them twice?

The dependency direction stays one-way:

```text
Foldkit Message + update
        |
foldkit-agent capability
        |
Agent Native action
```

Availability, authorization, input validation, and completion remain in the
contract/runtime. The generated action adds no authority and no second
implementation of the transition.

If the contract changes, the generated registry changes with it instead of
leaving a hand-written action beside the application that can drift.

An application-local Agent Native action can still override an inherited/package
action according to Agent Native's own registry rules.

## Schema bridge

This section is implementation/compatibility detail; it is not required to use
the adapter.

The adapter exposes the capability's **encoded** input Schema as a Standard
Schema validator and advertises the corresponding JSON Schema to Agent Native.
That preserves the same boundary `foldkit-agent` uses for transforming schemas
such as `NumberFromString`: Agent Native validates the encoded input, then the
bound runtime performs the application's single decode before dispatch.

Agent Native's current schema integration needs validation and JSON Schema
metadata on the same schema object. With Effect, the two conversion helpers
provide different halves:

| Conversion | `validate` | advertised parameters |
| --- | --- | --- |
| `toStandardSchemaV1` | yes | empty |
| `toStandardJSONSchemaV1` | no | full |
| copied into a fresh object | yes | empty |
| both called on the same schema object | yes | full |

The adapter therefore calls both helpers on the same Effect schema object so its
identity—and the metadata associated with it—survives.

Extra input fields are rejected. Only object input schemas are supported because
that is the shape Agent Native currently includes in its tool list.

## Compatibility proof

The adapter is checked against `@agent-native/core@0.177.1` using the real Agent
Native registry, tool runtime, and schema wrapper rather than stand-ins.

Run from the repository root:

```bash
pnpm exec vitest run packages/agent-native/test/framework.test.ts
```

No LLM credentials or network server are required; the suite uses an in-memory
PGlite database for Agent Native's internal metadata lookups.

| Framework surface | What the test proves |
| --- | --- |
| Package registry | `registerPackageActions` + `autoDiscoverActions` discovers the generated entry; an app-local action file wins a name collision. |
| Agent tool runtime | `actionsToEngineTools` advertises the encoded schema; `executeAgentToolCall` changes the Foldkit Model for an authorized caller and refuses another caller. |
| Schema wrapper | `defineAction` derives parameters, preserves transforming input for the one decode in Foldkit, and rejects excess fields. |

The public adapter types are checked against Agent Native's real `ActionTool`
type. Agent Native remains a peer/development dependency of this adapter rather
than a dependency of core `foldkit-agent`.

## Limits

This package integrates the Agent Native **action registry and tool runtime**. It
does not claim to replace every Agent Native subsystem. HTTP deployment, MCP,
A2A, CLI, UI queries, authentication sessions, and deep links remain concerns of
the Agent Native host or Foldkit Plus's dedicated adapters.

Page-local browser state still belongs to WebMCP; this package does not add a
browser RPC bridge.

The Agent Native registry keeps the first registration of a name and skips names
inherited from `Object.prototype`, including `__proto__`. Avoid those names and
restart the host after changing a registered contract. The record produced here
preserves such keys, but cannot change downstream registry behavior.

Full HTTP/MCP/A2A deployment tests are outside this package's test suite. This
is the bounded integration originally tracked in
[issue #22](https://github.com/doeixd/foldkit-plus/issues/22), not a claim that
every Agent Native subsystem is independently reusable.

## Choosing an adapter

All four adapters serve the same `AssistantAgent` contract. Multiple adapters
mean multiple protocol interpretations of one definition, not multiple
capability declarations.

| Where the agent runs | Adapter |
| --- | --- |
| In the page, beside the user | [`foldkit-agent-webmcp`](../agent-webmcp) |
| An external MCP client, over stdio or HTTP | [`foldkit-agent-mcp`](../agent-mcp) |
| Another agent, over A2A | [`foldkit-agent-a2a`](../agent-a2a) |
| An Agent Native host | `foldkit-agent-native` |

## See also

- [Agents guide](../../docs/agents.md) — builder → contract → runtime and the authority model.
- [`foldkit-agent`](../agent) — the protocol-neutral contract and runtime.
- [`examples/todo`](../../examples/todo) — a focused contract served through adapters.
