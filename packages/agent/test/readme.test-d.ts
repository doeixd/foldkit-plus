/**
 * The usage example from this package's README, type-checked so the
 * documentation cannot drift from the API.
 */
import { Effect, Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Action, Projection, Surface, type Wiring } from 'foldkit-surface'
import type { Document, HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import type * as Update from 'foldkit/update'
import { Agent } from '../src/index.js'

const Todo = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  completed: Schema.Boolean,
})

const Model = Schema.Struct({
  todos: Schema.Array(Todo),
  selectedTodoId: Schema.Option(Schema.String),
})

type Model = typeof Model.Type

const Message = defineMessageUnion({
  RequestedCreateTodo: { title: Schema.String },
  RequestedRenameTodo: { id: Schema.String, title: Schema.String },
  RequestedDeleteTodo: { id: Schema.String },
  ReceivedTodos: { todos: Schema.Array(Todo) },
  FailedToLoadTodos: { message: Schema.String },
})

type Message = typeof Message.Type

const App = Surface.application({ Model, Message })

const TodoAgent = Agent.forApplication(App)

const AppAgent = TodoAgent.make({
  context: Projection.pick(App.model.todos, App.model.selectedTodoId),

  messages: TodoAgent.expose(Message, {
    RequestedCreateTodo: 'Create a new todo',
    RequestedRenameTodo: 'Rename an existing todo',
    RequestedDeleteTodo: {
      name: 'delete_todo',
      description: 'Delete the selected todo',
      available: model => Option.isSome(model.selectedTodoId),
    },
  }),
})

declare const init: () => Update.Return<Model, Message>
declare const update: (model: Model, message: Message) => Update.Return<Model, Message>
declare const view: (model: Model, h: HtmlBuilder<Message>) => Document
declare const container: HTMLElement

const { config, host } = Agent.host({ Model, init, update, view, container })
Runtime.run(Runtime.makeApplication(config))

export const agentRuntime = TodoAgent.bind({ definition: AppAgent, host })

// The same application with no view, for a test or a server.
{
  const app = Agent.headless({ init, update })
  TodoAgent.bind({ definition: AppAgent, host: app.host })
  await app.dispose()
}

// The contract joins an assembly contract-only, so the Module sees it.
const agentWiring: Wiring<Model, never> = AppAgent.wiring()

void agentWiring

const result = await Effect.runPromise(
  agentRuntime.messages.dispatch(Message.RequestedCreateTodo, { title: 'Read the guide' }),
)
void result

// An Action exposed as a capability.
{
  const Cart = defineMessageUnion({ AddedToCart: { productId: Schema.String } })
  const AddToCart = Action.define({
    name: 'addToCart',
    description: 'Add a product to the cart',
    input: Schema.Struct({ productId: Schema.String }),
    toMessage: input => Cart.AddedToCart(input),
  })
  interface Shopper {
    readonly canBuy: boolean
  }
  const exposed = Agent.expose(Cart, {
    AddedToCart: Agent.action(AddToCart, {
      // Give the principal its type: an Action's extras are not tied to an application.
      authorize: ({ principal }: { readonly principal: Shopper }) => principal.canBuy,
    }),
  })
  void exposed
}
