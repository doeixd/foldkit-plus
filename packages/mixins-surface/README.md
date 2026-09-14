# foldkit-mixins-surface

Bridges [`foldkit-surface`](https://github.com/doeixd/foldkit-plus/tree/main/packages/surface)'s projected Model and Message subset to
[`foldkit-mixins`](https://github.com/doeixd/foldkit-plus/tree/main/packages/mixins) SlotViews.

A Surface is a narrowed window onto an application: it projects a few fields of
the root Model and names the few Messages it may emit. A SlotView is a view that
publishes attachment points for Style and Behavior. On their own, nothing
connects the two: `SlotView.define` takes whatever input type and Message
universe you annotate, so nothing stops an attachment from reading a field the
Surface does not project, or emitting a Message it does not expose.

`SurfaceView.define` closes that gap. It is one function that pins a SlotView's
input type to the Surface's projection and its Message universe to the Surface's
subset. A Style or Behavior attached to the result can only read projected
fields, and can only emit exposed Messages — both are compile errors otherwise,
in the attachment rather than at the application boundary. It creates no state
and no rendering machinery; the result is an ordinary `SlotView`.

## Install

```bash
pnpm add foldkit-mixins foldkit-surface foldkit-mixins-surface
```

`foldkit`, `effect`, `foldkit-mixins`, and `foldkit-surface` are peer
dependencies.

## Use it when

You already render a Surface and want to style or decorate it from outside.
If you are not using `foldkit-surface`, use `SlotView.define` from
`foldkit-mixins` directly — this package adds nothing else.

## Usage

```ts
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Behavior, Capability, Event, Slot, Slots, Style } from 'foldkit-mixins'
import { SurfaceView } from 'foldkit-mixins-surface'
import { Projection, Surface } from 'foldkit-surface'

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
const TodoList = Surface.make(App, 'TodoList', {
  model: ({ model }) => Projection.struct({ todos: model.todos, selectedId: model.selectedId }),
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
  h.ul(
    slots.root.attrs(),
    model.todos.map(todo => h.li([], [todo.title])),
  ),
).pipe(Style.attach(TodoStyle), Behavior.attach(TodoBehavior))

// `toRenderer` adapts a SlotView to what `Surface.view`/`Surface.rootView` take.
const renderer = Surface.view(TodoList, SurfaceView.toRenderer(TodoListView))
```

Note what the render callback does not need: no type annotation on `model` or
`h`. `SlotView.define` infers its Message universe from the builder you annotate;
`SurfaceView.define` takes it from the Surface. A Behavior's `Input` parameter,
though, has to be exactly the projected type — a `SlotView` is invariant in it,
so a narrower "just the fields I read" type is rejected by `Behavior.attach`.

`toRenderer` is the single boundary cast, the same one `Surface.rootView` makes:
`Surface.view` hands a renderer a `ViewBuilder` — the real builder with its
`MessageUniverse` phantom removed — and this is the matching adaptation, sound
because the renderer can only construct the Surface's Messages.

## Introspection

`SurfaceView.inspect(view)` returns serializable `{ name, slots, mixins }` with no
functions. `SurfaceView.describe(surface, params, view)` merges that with
`Surface.inspect` — what the Surface observes, requires, and may emit, with
emitted Messages as tags — into one value, and `SurfaceView.toMarkdown` renders it
deterministically for docs or a CI drift check.

Each of `define`, `toRenderer`, `inspect`, `describe` and `toMarkdown` is also a
direct named export, if you prefer that to the `SurfaceView` namespace.

The API is still settling (`0.1.0`). See [DESIGN.md](https://github.com/doeixd/foldkit-plus/blob/main/docs/design/mixins-DESIGN.md).

## See also

- [Inside-out view composition](https://github.com/doeixd/foldkit-plus/blob/main/docs/mixins.md) — the mental model.
- [`foldkit-mixins`](https://github.com/doeixd/foldkit-plus/tree/main/packages/mixins) — the resolver, Style, and Behavior; [`foldkit-surface`](https://github.com/doeixd/foldkit-plus/tree/main/packages/surface) — the
  projection this bridges.
- [`examples/mixins`](https://github.com/doeixd/foldkit-plus/tree/main/examples/mixins) — Surface to SlotView, end to end.
