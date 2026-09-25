/**
 * The usage example from this package's README, type-checked so the
 * documentation cannot drift from the API.
 */
import { Effect, Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Action, Projection, Surface, type Wiring } from 'foldkit-surface'
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

declare const currentModel: () => Model
declare const sendToRuntime: (message: Message) => void
declare const onModelChange: (listener: () => void) => () => void

export const agentRuntime = TodoAgent.bind({
  definition: AppAgent,
  host: {
    model: currentModel,
    dispatch: sendToRuntime,
    subscribe: onModelChange,
  },
})

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
