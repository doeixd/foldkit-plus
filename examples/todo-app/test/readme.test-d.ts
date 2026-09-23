/** Composition fixture for Surface, Agent, Sync, Mirror, and Mixins. */
import { Schema } from 'effect'
import { modifyFields } from 'foldkit/struct'
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
        model: modifyFields(model, {
          todos: () => [...model.todos, { id: message.id, title: message.title, done: false }],
        }),
      }
    case 'ToggledTodo':
      return {
        model: modifyFields(model, {
          todos: () =>
            model.todos.map(todo =>
              todo.id === message.id ? { ...todo, done: !todo.done } : todo,
            ),
        }),
      }
    case 'DeletedTodo':
      return {
        model: modifyFields(model, {
          todos: () => model.todos.filter(todo => todo.id !== message.id),
        }),
      }
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

// 3. Mixins separate "where customization is allowed" from "what gets attached there."
//
// BoardSlots is the view's public customization contract. It renders nothing by
// itself. It only names the places the view agrees other code may extend later:
// `root` will be the outer <section>; `list` will be the <ul>.
// Capabilities describe what kind of element lives at each point so incompatible
// Styles or Behaviors can be rejected instead of silently doing the wrong thing.
const BoardSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  list: Slot.make({ capability: Capability.Collection }),
})

// Style is data written against that slot contract. Nothing is applied yet, and
// BoardStyle cannot read or change application state. Because it is created with
// `forSlots(BoardSlots)`, misspelling a slot or styling one Board never published
// is a type error rather than a convention.
const BoardStyle = Style.forSlots(BoardSlots)({
  root: Style.class('todo-board'), // contribute a class to the `root` slot
  list: Style.inline({ margin: '0', padding: '0', listStyle: 'none' }), // style `list`
})

// SurfaceView.define ties three boundaries together:
//   Board      -> the projected Model this view receives and the Messages it may emit
//   BoardSlots -> the places outside customization may attach
//   render fn  -> the actual markup
//
// So `model` is not the whole application Model; it is Board's { todos, filter }.
// And `h` is typed to the Messages Board declared above.
export const BoardView = SurfaceView.define(Board, BoardSlots, (model, slots, h) =>
  h.section(
    // `.attrs()` is the handoff point between markup and Mixins. It resolves the
    // view's own attributes plus every Style/Behavior attached to `root` into
    // ordinary Foldkit attributes for this <section>.
    slots.root.attrs(),
    [
      h.ul(
        // Same idea here: this exact DOM position is the published `list` slot.
        slots.list.attrs(),
        model.todos.map(todo => h.li([], [todo.title])),
      ),
    ],
  ),
).pipe(
  // Attach appearance from the outside. BoardView never imports CSS decisions into
  // its markup, so styles can be swapped/composed without copying the component or
  // adding a growing collection of styling props.
  Style.attach(BoardStyle),
)

// Behavior can attach element-level interaction through those same slots. It may
// contribute attributes, event handlers, or a Mount, but it still owns no Model;
// application state and transitions remain Model / Message / update.

// 4. Sync declares ownership of one writable slice and the facts that change it.
// Projection.pick is writable because checkpoints must install back into Model;
// replay still runs these Messages through the application's own update.
const TodoSync = Sync.forApplication(App)
  .withPrincipal<Principal>()
  .make({
    documentId: DocumentId.make('todos'),
    shared: Projection.pick(App.model.todos),
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
  fields: [App.model.filter], // linkable: ?filter=active
})
const Prefs = Mirror.kv(App, {
  key: 'todo/prefs',
  fields: [App.model.draft], // remembered on this device
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
