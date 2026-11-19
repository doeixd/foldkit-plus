# `foldkit-agent-native`

Integrating a Foldkit application into an [Agent Native](https://github.com/BuilderIO/agent-native) host shouldn't force you to write every capability twice—once as a Foldkit Message handler and again as a hand-coded Agent Native action that can drift in validation or authorization.

`foldkit-agent-native` compiles a [`foldkit-agent`](../agent) contract into Agent Native action descriptors while resolving the authenticated caller's bound `AgentRuntime` on every invocation. Every action call still validates, authorizes, and dispatches through your existing Foldkit `update` loop. See how agent contracts work in [the live Todo agent demo](https://foldkit-todo-demo.pages.dev/).

## Install

```bash
pnpm add foldkit-agent foldkit-agent-native @agent-native/core
```

`foldkit`, `effect`, `foldkit-agent`, and `@agent-native/core` are peer dependencies.

## A first action registry

Declare an agent contract (see the [Agent contract guide](../agent/README.md#a-first-agent-contract)), compile its static actions with `AgentNative.actions`, and resolve the caller's live runtime inside `resolveRuntime`:

<!-- docs-check
import type { ActionRunContext as HostContext } from 'foldkit-agent-native'
interface Caller { readonly email: string }
declare const hostFor: (context: HostContext) => {
  readonly model: () => { readonly todos: ReadonlyArray<string> }
  readonly dispatch: (message: { readonly _tag: 'RequestedCreateTodo'; readonly title: string }) => void
}
declare const principalFor: (context: HostContext) => Caller
-->
```ts
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Agent } from 'foldkit-agent'
import { AgentNative } from 'foldkit-agent-native'
import { registerPackageActions } from '@agent-native/core/server'

const Message = defineMessageUnion({ RequestedCreateTodo: { title: Schema.String } })
const TodoAgent = Agent.forModel<{ readonly todos: ReadonlyArray<string> }>()
const AssistantAgent = TodoAgent.make({
  messages: TodoAgent.expose(Message, { RequestedCreateTodo: 'Create a todo' }),
})

registerPackageActions(
  AgentNative.actions({
    definition: AssistantAgent,
    resolveRuntime: context =>
      TodoAgent.bind({
        definition: AssistantAgent,
        host: { ...hostFor(context), principal: () => principalFor(context) },
      }),
  }),
)
```

Statically, `AgentNative.actions` turns `AssistantAgent` into action records and installs them via `registerPackageActions`. At runtime, each action call invokes `resolveRuntime(context)` to obtain the caller's `AgentRuntime`, checking availability, authorization, and input schema before dispatching the Message to `update`.

## Verify one action before registering everything

Test a single generated action against a runtime bound to a known caller before wiring the full registry:

1. Invoke the action with valid input and confirm your Message handler runs.
2. Invoke it with invalid input and confirm the Model stays unchanged.
3. Switch to an unauthorized principal and confirm the bound runtime refuses the call—static action registration grants no execution permission by itself.

## How capabilities map to Agent Native actions

| `foldkit-agent` | Agent Native action |
| --- | --- |
| Capability name | Action name |
| Description | Action description |
| Encoded input Schema | Parameter schema |
| `AgentRuntime` dispatch | `run` handler |
| Completion contract | Returned `ok` outcome |

Each generated entry sets `http: 'POST'`, `requiresAuth: true`, and `readOnly: false` so planning layers treat Message-dispatching capabilities as state-mutating operations. `AgentNative.actions` returns plain action records in memory; the host controls loading and deployment.

## Resolve caller identity per invocation

Because the action registry is built once at startup while `Model` and principals vary per request, `resolveRuntime` runs **per invocation** rather than once at registration time.

Contracts declaring `authorize` require a host `principal` provider of matching type. Map your authenticated Agent Native caller to your application principal inside `resolveRuntime` rather than trusting arbitrary context fields like raw emails. Capabilities whose `available(model)` returns false remain listed in the static registry and are refused by the runtime when invoked.

## Read `run` return values

Application refusals (unavailable, unauthorized, cancelled, invalid input, or failed completion) return structured output (`{ ok: false, message: '...' }`) instead of throwing adapter exceptions. Successful dispatch or completion returns `{ ok: true, ... }`. Check the returned `ok` field rather than assuming framework-level completion means the application accepted the operation. Internal host defects flatten to a generic failure message so internal errors stay private.

## Keep one source of truth

The dependency flows strictly one way: your Foldkit `Message` + `update` defines the `foldkit-agent` contract, and `foldkit-agent-native` derives Agent Native actions from it. Whenever your contract changes, the generated actions update automatically with zero duplicate validation or permission code. Application-local Agent Native actions can still override package actions under Agent Native's standard registry rules.

## How Effect schemas bridge to Agent Native

Agent Native requires both Standard Schema validation and JSON Schema metadata on the same schema object. Calling Effect's `toStandardSchemaV1` and `toStandardJSONSchemaV1` on the same encoded schema preserves object identity so Agent Native sees full parameter metadata while Foldkit runs its single decode step before dispatch. Excess input fields are rejected, and object input schemas are required because Agent Native includes only object schemas in tool lists.

## Tested against `@agent-native/core`

The adapter test suite exercises the real `@agent-native/core` registry, tool runtime, and schema wrapper (backed by an in-memory database, with no network or LLM calls):

| Framework surface | Verified behavior |
| --- | --- |
| Package registry | `registerPackageActions` discovers entries; local overrides win |
| Agent tool runtime | Advertises encoded schema; authorizes or refuses by principal |
| Schema wrapper | `defineAction` derives params and rejects excess fields |

## Limits

- **Scope:** Covers Agent Native's action registry and tool runtime. HTTP, MCP, A2A, CLI, UI queries, auth sessions, and deep links belong to the Agent Native host or dedicated Foldkit Plus adapters (use [`foldkit-agent-webmcp`](../agent-webmcp) for in-page browser state).
- **Reserved names:** Agent Native skips `Object.prototype` property names (including `__proto__`) and keeps the first registration of any name; restart the host after contract updates.

## Choose an agent adapter

| Where the agent runs | Adapter |
| --- | --- |
| In the page beside the user | [`foldkit-agent-webmcp`](../agent-webmcp) |
| External MCP client over stdio or HTTP | [`foldkit-agent-mcp`](../agent-mcp) |
| Another agent over A2A | [`foldkit-agent-a2a`](../agent-a2a) |
| An Agent Native host | `foldkit-agent-native` |

## Next

- Declare capabilities, completion contracts, and audit logs: [`foldkit-agent`](../agent)
- Expose tools over MCP or WebMCP: [`foldkit-agent-mcp`](../agent-mcp), [`foldkit-agent-webmcp`](../agent-webmcp)
- Read the architecture guide: [Agents guide](../../docs/agents.md)
