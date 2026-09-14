/**
 * The usage examples from this package's README, type-checked so the
 * documentation cannot drift from the API.
 */
import { Agent } from 'foldkit-agent'
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { AgentWebMcp } from '../src/index.js'
import type { ModelContext, ToolDescriptor } from '../src/index.js'

const Message = defineMessageUnion({
  RequestedCreateTodo: { title: Schema.String },
  RequestedDeleteTodo: { id: Schema.String },
})

type Message = typeof Message.Type

interface Model {
  readonly selectedTodoId: Option.Option<string>
}

const TodoAgent = Agent.forModel<Model>()

const AppAgent = TodoAgent.make({
  messages: TodoAgent.expose(Message, {
    RequestedCreateTodo: 'Create a todo',

    // The dynamic availability example.
    RequestedDeleteTodo: {
      name: 'delete_todo',
      description: 'Delete the selected todo',
      available: model => Option.isSome(model.selectedTodoId),
    },
  }),
})

// The Usage section's host: `mounted` stands for a Foldkit runtime handle, which
// `Sync.mount` returns and `examples/todo` writes by hand.
declare const mounted: {
  readonly model: () => Model
  readonly dispatch: (message: Message) => void
  readonly subscribe: (listener: () => void) => () => void
  readonly observe: (listener: (message: Message) => void) => () => void
}

const agent = TodoAgent.bind({
  definition: AppAgent,
  host: {
    model: mounted.model,
    dispatch: (message: Message) => {
      mounted.dispatch(message)
    },
    subscribe: mounted.subscribe,
    observe: mounted.observe,
  },
})

// Feature detection: `register` throws when there is no model context.
declare const addEventListener: (type: string, listener: () => void) => void
const modelContext = AgentWebMcp.documentModelContext()
if (modelContext !== undefined) {
  const live = AgentWebMcp.register({ agent, modelContext })
  addEventListener('beforeunload', () => live.unregister())
}

const agentRuntime = agent

// Usage.
const registration = AgentWebMcp.register({ agent: agentRuntime })

// The returned registration.
await registration.refresh() // reconcile against the current Model
const registered: ReadonlyArray<string> = registration.registered() // capability names currently registered
registration.unregister() // abort every registration and stop following

void registered

// The registration signal goes in `registerTool`'s options bag, not on the
// descriptor.
declare const document: { readonly modelContext: ModelContext }
declare const tool: ToolDescriptor
declare const controller: AbortController

await document.modelContext.registerTool(tool, { signal: controller.signal })
