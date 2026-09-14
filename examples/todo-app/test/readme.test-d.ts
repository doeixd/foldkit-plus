/**
 * The "Sixty seconds of code" sample in the repository README, type-checked so
 * the project's front page cannot drift from the API. The Model, Message union,
 * and `update` stand in for the ones the README says are the application's own;
 * everything below them is the sample verbatim.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Agent } from 'foldkit-agent'
import { Mirror } from 'foldkit-mirror'
import { Capability, Slot, Slots, Style } from 'foldkit-mixins'
import { SurfaceView } from 'foldkit-mixins-surface'
import { MessageSet, Module, Projection, Surface } from 'foldkit-surface'
import { DocumentId, Sync } from 'foldkit-sync'

const Todo = Schema.Struct({ id: Schema.String, title: Schema.String, done: Schema.Boolean })
const Model = Schema.Struct({
  todos: Schema.Array(Todo),
  filter: Schema.Literals(['all', 'active', 'done']),
  draft: Schema.String,
})
const Message = defineMessageUnion({
  ...Mirror.messages,
  RequestedTodo: { title: Schema.String },
  SubmittedTodo: { id: Schema.String, title: Schema.String },
  ToggledTodo: { id: Schema.String },
  DeletedTodo: { id: Schema.String },
})
const initial: typeof Model.Type = { todos: [], filter: 'all', draft: '' }

const update = (model: typeof Model.Type, message: typeof Message.Type) => {
  switch (message._tag) {
    case 'RequestedTodo':
      return { model }
    case 'SubmittedTodo':
      return {
        model: {
          ...model,
          todos: [...model.todos, { id: message.id, title: message.title, done: false }],
        },
      }
    case 'ToggledTodo':
      return {
        model: {
          ...model,
          todos: model.todos.map(todo =>
            todo.id === message.id ? { ...todo, done: !todo.done } : todo,
          ),
        },
      }
    case 'DeletedTodo':
      return { model: { ...model, todos: model.todos.filter(todo => todo.id !== message.id) } }
    default:
      return { model }
  }
}

// --- the README sample ------------------------------------------------------

type Principal = { readonly role: 'owner' | 'guest' }
const isOwner = (principal: Principal) => principal.role === 'owner'

// 1. This is still the application: one Model, one Message union, one update.
// Surface adds typed references and inspection metadata; it does not add runtime state.
const App = Surface.application({ Model, Message, initial, update })

// 2. A Surface is a public boundary for a feature: what it may observe and cause.
// A renderer bound to Board can only construct these two Messages.
const Board = App.surface('Board', {
  model: ({ model }) => ({ todos: model.todos, filter: model.filter }),
  messages: [Message.ToggledTodo, Message.DeletedTodo],
})

// A read-only Surface can be reused by something that only needs context.
const Overview = App.surface('Overview', {
  model: ({ model }) => ({ todos: model.todos, filter: model.filter }),
})

// 3. Mixins let the view publish typed extension points once. The view owns
// markup; Style owns appearance. Neither gets another place to keep state.
const BoardSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  list: Slot.make({ capability: Capability.Collection }),
})

const BoardStyle = Style.forSlots(BoardSlots)({
  root: Style.class('todo-board'),
  list: Style.inline({ margin: '0', padding: '0', listStyle: 'none' }),
})

export const BoardView = SurfaceView.define(Board, BoardSlots, (model, slots, h) =>
  h.section(slots.root.attrs(), [
    h.ul(
      slots.list.attrs(),
      model.todos.map(todo => h.li([], [todo.title])),
    ),
  ]),
).pipe(Style.attach(BoardStyle))

// Behavior attaches element-level interaction through the same slots when needed;
// application state and transitions still belong to Model / Message / update.

// 4. Sync declares ownership of one writable slice and the facts that change it.
// Projection.pick is writable because checkpoints must install back into Model;
// replay still runs these Messages through the application's own update.
const TodoSync = Sync.forApplication(App)
  .withPrincipal<Principal>()
  .make({
    documentId: DocumentId.make('todos'),
    shared: Projection.pick(App.fields.todos),
    durable: MessageSet.make(App, [
      Message.SubmittedTodo,
      Message.ToggledTodo,
      Message.DeletedTodo,
    ]),
    authorize: {
      // Policy lives on the contract and is enforced by the server journal.
      DeletedTodo: ({ principal }) => isOwner(principal),
    },
  })

// The server gets codecs, empty snapshot, replay, and authorization from Sync.
// There is no second server-side reducer to keep in agreement.
TodoSync.journalContract()

// 5. First specialize the Agent API to this application and Principal type.
// `forApplication(...).withPrincipal(...)` does NOT create an agent; it creates
// a typed builder whose helpers know App's Model, Message union, and Principal.
const AgentBuilder = Agent.forApplication(App).withPrincipal<Principal>()

// `make` creates the concrete agent contract that MCP/WebMCP/A2A/etc. can serve:
// what this agent sees, which existing Messages it may cause, and their policy.
const AssistantAgent = AgentBuilder.make({
  context: Overview,
  messages: AgentBuilder.expose(Message, {
    RequestedTodo: Agent.variant({
      name: 'add_todo',
      description: 'Add a todo with the given title',

      // The protocol input can be smaller than the internal Message.
      input: Schema.Struct({ title: Schema.String }),
      toMessage: ({ title }) => ({ title }),

      // RequestedTodo is an intent. The tool call completes when update later
      // applies the correlated durable fact produced by the application's Command.
      completion: {
        success: Message.SubmittedTodo,
        correlate: (request, result) => request.title.trim() === result.title,
      },
    }),
    ToggledTodo: { name: 'toggle_todo', description: 'Toggle a todo' },
    DeletedTodo: {
      name: 'delete_todo',
      description: 'Delete a todo (owner only)',
      // Same rule, checked early at the agent boundary; the journal still owns trust.
      authorize: ({ principal }) => isOwner(principal),
    },
  }),
})

// 6. Mirrors do not own state. They are secondary representations of Model fields.
const Filters = Mirror.url(App, {
  name: 'filters',
  fields: [App.fields.filter], // linkable: ?filter=active
})
const Prefs = Mirror.kv(App, {
  key: 'todo/prefs',
  fields: [App.fields.draft], // remembered on this device
})

// 7. The architecture itself is data. Validate ownership/capability relationships,
// or turn the same declarations into documentation and tooling input.
const Project = Module.make(App, [
  Board,
  Overview,
  TodoSync,
  AssistantAgent,
  Filters.contract,
  Prefs.contract,
])

Module.validate(Project) // []
Module.toMermaid(Project) // architecture generated from the declarations above
