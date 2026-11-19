# `foldkit-agent-a2a`

Letting another AI agent discover and delegate tasks to your Foldkit app over the Agent-to-Agent (A2A) protocol usually requires hand-authoring an Agent Card JSON document and writing a separate JSON-RPC task handler that can drift from your permissions. You want one source of truth for both discovery metadata and runtime execution.

`foldkit-agent-a2a` generates an A2A Agent Card from your [`foldkit-agent`](../agent) contract and maps A2A `message/send`, `tasks/get`, and `tasks/cancel` requests directly to your bound `AgentRuntime`. Availability, authorization, input decoding, cancellation, and completion stay inside your contract. See agent contracts in action in [the live Todo agent demo](https://foldkit-todo-demo.pages.dev/).

## Install

```bash
pnpm add foldkit-agent foldkit-agent-a2a
```

`foldkit`, `effect`, and `foldkit-agent` are peer dependencies.

## A first Agent Card and task handler

Build an `AssistantAgent` contract (see the [Agent contract guide](../agent/README.md#a-first-agent-contract)), generate its static Agent Card, and handle an A2A `message/send` call:

```ts
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Agent } from 'foldkit-agent'
import { AgentA2a } from 'foldkit-agent-a2a'

const Model = Schema.Struct({ selectedTodoId: Schema.Option(Schema.String) })
const Message = defineMessageUnion({ RequestedDeleteTodo: { id: Schema.String } })
const TodoAgent = Agent.forModel<typeof Model.Type>()
const AssistantAgent = TodoAgent.make({
  messages: TodoAgent.expose(Message, {
    RequestedDeleteTodo: {
      name: 'delete_todo',
      description: 'Delete the selected todo',
      available: model => Option.isSome(model.selectedTodoId),
    },
  }),
})

const card = AgentA2a.agentCard(AssistantAgent, {
  name: 'Todos',
  description: 'A todo list',
  url: 'https://todos.example/a2a',
  securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } },
  security: [{ bearer: [] }],
})
```

`card` is plain JSON metadata to serve at `AgentA2a.AGENT_CARD_PATH` (`/.well-known/agent-card.json`). Generating the card starts no HTTP server, and your HTTP layer handles authentication and principal binding for incoming requests.

Next, bind the contract to a host and handle incoming A2A JSON-RPC calls:

```ts
type AppModel = typeof Model.Type
const { host } = Agent.headless({
  init: (): { model: AppModel; commands: [] } => ({
    model: { selectedTodoId: Option.some('todo-1') },
    commands: [],
  }),
  update: (model: AppModel) => ({ model, commands: [] }),
})
const agentRuntime = TodoAgent.bind({ definition: AssistantAgent, host })
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
      parts: [{ kind: 'data', data: { skill: 'delete_todo', input: { id: 'todo-1' } } }],
    },
  },
})
```

Each A2A skill maps to one exposed capability and passes through the same runtime checks as MCP, WebMCP, and in-process calls. Call `served.close()` when shutting down; the handler keeps tasks in an in-memory bounded buffer rather than a durable store.

## Static card metadata vs. dynamic availability

An Agent Card is static discovery metadata, whereas Foldkit capabilities can depend on live Model state or the caller's principal. The generated card marks dynamic capabilities accurately without locking discovery to a single Model snapshot:

- Capabilities with `available(model)` are tagged `conditional`.
- Capabilities with `authorize` are tagged `authorized`.
- Both checks still run against live state on every `message/send`.

## Task states and completion outcomes

`message/send` creates a task readable with `tasks/get` and abortable with `tasks/cancel`. The adapter distinguishes **rejected** (declined before running) from **failed** (accepted, then failed during completion):

| Outcome | A2A task state |
| --- | --- |
| Unknown skill | `rejected` |
| Input fails capability schema | `rejected` |
| Caller unauthorized | `rejected` |
| Capability unavailable in Model | `rejected` |
| Declared failure Message arrives | `failed` |
| Completion times out after dispatch | `failed` |
| Invocation cancelled | `canceled` |
| Validated dispatch without completion contract | `completed` |
| Correlated success Message arrives | `completed` |

Capabilities without a completion contract finish at validated dispatch; capabilities with one wait until their correlated success/failure Message, timeout, or cancellation settles the task.

## Supported A2A features and limits

The generated Agent Card advertises only what the adapter implements:

- `streaming: false` and `pushNotifications: false` (`message/stream` is refused).
- Multi-turn `input-required` / `auth-required` flows, file parts, and artifacts are omitted.

## Choose an agent adapter

| Where the agent runs | Adapter |
| --- | --- |
| In the page beside the user | [`foldkit-agent-webmcp`](../agent-webmcp) |
| External MCP client over stdio or HTTP | [`foldkit-agent-mcp`](../agent-mcp) |
| Another agent over A2A | `foldkit-agent-a2a` |
| An Agent Native host | [`foldkit-agent-native`](../agent-native) |

## Next

- Define capabilities, completion contracts, and audit logs: [`foldkit-agent`](../agent)
- Serve the same contract over MCP: [`foldkit-agent-mcp`](../agent-mcp)
- Read the architecture guide: [Agents guide](../../docs/agents.md)
