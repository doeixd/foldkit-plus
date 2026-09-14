# `foldkit-agent-a2a`

Serves a [`foldkit-agent`](../agent) runtime as an A2A agent.

Use it when **another agent** should discover and call the same capabilities
your Foldkit application already exposes. This package derives an A2A Agent Card
from the protocol-neutral contract and turns A2A tasks into invocations of the
bound `AgentRuntime`.

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
foldkit-agent-a2a           adapter
       |
       +---- Agent Card
       |
       +---- tasks / message/send
       v
other agent
```

A2A describes the contract; it does not redefine it. Availability,
authorization, input validation, cancellation, and completion remain in
`foldkit-agent`.

## Install

```bash
pnpm add foldkit-agent foldkit-agent-a2a
```

`foldkit`, `effect`, and `foldkit-agent` are peer dependencies.

## Sixty seconds: card + task handler

Assume the application already declared a contract and bound it to a live host:

```ts
const AgentBuilder = Agent.forApplication(App).withPrincipal<Principal>()
const AssistantAgent = AgentBuilder.make({ ... })

const agentRuntime = AgentBuilder.bind({
  definition: AssistantAgent,
  host,
})
```

Generate the static Agent Card from the contract:

```ts
import { AgentA2a } from 'foldkit-agent-a2a'

const card = AgentA2a.agentCard(AssistantAgent, {
  name: 'Todos',
  description: 'A todo list',
  url: 'https://todos.example/a2a',
  securitySchemes: {
    bearer: { type: 'http', scheme: 'bearer' },
  },
  security: [{ bearer: [] }],
})
```

Serve it from `AgentA2a.AGENT_CARD_PATH` (`/.well-known/agent-card.json`).

Then serve task calls through the bound runtime:

```ts
const served = AgentA2a.handler({ agent: agentRuntime })

await served.handle({
  jsonrpc: '2.0',
  id: 1,
  method: 'message/send',
  params: {
    message: {
      kind: 'message',
      role: 'user',
      messageId: 'm-1',
      parts: [
        {
          kind: 'data',
          data: {
            skill: 'delete_todo',
            input: { id: 'todo-1' },
          },
        },
      ],
    },
  },
})
```

One A2A skill maps to one exposed capability. The request still goes through the
same runtime checks as WebMCP, MCP, Agent Native, or an in-process caller.

## Static card, dynamic application

An Agent Card is static metadata, while Foldkit capability availability may
depend on the current Model.

The card therefore describes declared capabilities, not a promise that every
skill can run in every Model state:

- a capability with `available(model)` is tagged `conditional`;
- a capability with `authorize` is tagged `authorized`;
- both are still checked against the live runtime at invocation time.

This preserves the contract's dynamic authority boundary without making the
published Agent Card depend on one transient Model snapshot.

## Tasks and completion

A `message/send` produces a task. `tasks/get` reads it later and `tasks/cancel`
aborts one that is still running. Tasks are kept in a bounded buffer.

The important distinction is **rejected** vs **failed**:

| Outcome | A2A task state |
| --- | --- |
| unknown skill | `rejected` |
| input fails the capability schema | `rejected` |
| current principal is unauthorized | `rejected` |
| capability is unavailable in the current Model | `rejected` |
| declared failure Message arrives | `failed` |
| completion times out after dispatch | `failed` |
| invocation is cancelled | `canceled` |
| validated dispatch, with no completion contract | `completed` |
| correlated success Message arrives | `completed` |

`rejected` means the runtime declined to start the requested operation. `failed`
means the operation was accepted but did not successfully complete. A client can
make different retry or fallback decisions from that distinction.

A capability without a completion contract is complete at validated dispatch. A
capability with one stays in flight until its correlated success/failure Message,
timeout, or cancellation settles the task.

## What is deliberately not implemented

The adapter advertises only the A2A features it actually supports:

- `streaming: false`
- `pushNotifications: false`
- `message/stream` is refused
- multi-turn `input-required` / `auth-required` flows are out of scope
- file parts and artifacts are out of scope

It is better for the card to describe a smaller truthful surface than to expose
protocol features the underlying application adapter does not implement.

## Choosing an adapter

All four adapters serve the same `AssistantAgent` contract through a bound
runtime.

| Where the agent runs | Adapter |
| --- | --- |
| In the page, beside the user | [`foldkit-agent-webmcp`](../agent-webmcp) |
| An external MCP client, over stdio or HTTP | [`foldkit-agent-mcp`](../agent-mcp) |
| Another agent, over A2A | `foldkit-agent-a2a` |
| An Agent Native host | [`foldkit-agent-native`](../agent-native) |

## See also

- [Agents guide](../../docs/agents.md) — builder → contract → runtime and the authority model.
- [`foldkit-agent`](../agent) — the protocol-neutral contract and runtime.
- [`examples/todo`](../../examples/todo) — a focused contract served through adapters.
