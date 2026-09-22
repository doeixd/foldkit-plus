import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Behavior, Capability, Event, Slot, Slots, Style } from 'foldkit-mixins'
import { SurfaceView } from '../src/index.js'
import { Surface } from 'foldkit-surface'

const Model = Schema.Struct({
  todos: Schema.Array(Schema.Struct({ id: Schema.String, title: Schema.String })),
  selectedId: Schema.NullOr(Schema.String),
  secret: Schema.String,
})

const Message = defineMessageUnion({
  SelectedTodo: { id: Schema.String },
  ArchivedTodo: { id: Schema.String },
  ClearedSecret: {},
})

const App = Surface.application({ Model, Message })

// Projects two of the three fields, exposes two of the three Messages.
const TodoList = App.surface('TodoList', {
  model: ({ model }) => ({ todos: model.todos, selectedId: model.selectedId }),
  messages: [Message.SelectedTodo, Message.ArchivedTodo],
})

const TodoSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  archive: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
})

const TodoStyle = Style.forSlots(TodoSlots)({ root: Style.class('todo-list') })

/** What the Surface projects — the input every attachment sees. */
type ProjectedTodos = {
  readonly todos: ReadonlyArray<{ readonly id: string; readonly title: string }>
  readonly selectedId: string | null
}

// `input` is the projection, so `input.secret` does not type-check; `h` builds
// only `SelectedTodo` and `ArchivedTodo`.
const TodoBehavior = Behavior.forSlots(TodoSlots)<
  ProjectedTodos,
  typeof Message.SelectedTodo.Type | typeof Message.ArchivedTodo.Type
>({
  archive: Behavior.slot({
    requires: { events: [Event.Click] },
    attributes: ({ input, h }) =>
      input.selectedId === null ? [] : [h.OnClick(Message.ArchivedTodo({ id: input.selectedId }))],
  }),
})

const TodoListView = SurfaceView.define(TodoList, TodoSlots, (model, slots, h) =>
  h.section(slots.root.attrs(), [
    h.ul(
      [],
      model.todos.map(todo => h.li([], [todo.title])),
    ),
    h.button(slots.archive.attrs([h.Disabled(model.selectedId === null)]), ['Archive selected']),
  ]),
).pipe(Style.attach(TodoStyle), Behavior.attach(TodoBehavior))

// `toRenderer` adapts a SlotView to what `Surface.view`/`Surface.rootView` take.
const renderer = Surface.view(TodoList, SurfaceView.toRenderer(TodoListView))

void renderer
