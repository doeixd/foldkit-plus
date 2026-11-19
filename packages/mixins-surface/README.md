# `foldkit-mixins-surface`

When using [`foldkit-surface`](../surface) alongside [`foldkit-mixins`](../mixins), you can end up declaring the same feature boundary twice: once on the Surface (which Model fields a feature reads and which Messages it emits) and again on the `SlotView` (its input type and Message union). If those declarations drift, a Behavior attachment might read an omitted Model field or emit an unexposed Message.

`foldkit-mixins-surface` connects them with `SurfaceView.define` and `SurfaceView.over`. A Surface's projected value becomes the `SlotView`'s input type, and its exposed Message subset becomes the `SlotView`'s Message universe—enforced at compile time with no extra runtime state.

If you do not use `foldkit-surface`, use `SlotView.define` or `SlotView.forMessages` from `foldkit-mixins` directly. For background on Slots, Styles, and Behaviors, read [Inside-out view composition](../../docs/mixins.md).

## Install

```bash
pnpm add foldkit-mixins foldkit-surface foldkit-mixins-surface
```

`foldkit`, `effect`, `foldkit-mixins`, and `foldkit-surface` are peer dependencies.

## A first surface-bound `SlotView`

Define a `Surface` and `Slots`, bind them with `SurfaceView.define`, and pass the result to `Surface.view`:

```ts
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Capability, Event, Slot, Slots, Style } from 'foldkit-mixins'
import { SurfaceView } from 'foldkit-mixins-surface'
import { Surface } from 'foldkit-surface'

const Model = Schema.Struct({
  todos: Schema.Array(Schema.String),
  selected: Schema.Option(Schema.String),
  secret: Schema.String,
})
const Message = defineMessageUnion({
  Selected: { id: Schema.String },
  Archived: { id: Schema.String },
  ClearedSecret: {},
})
const App = Surface.application({ Model, Message })
const TodoList = App.surface('TodoList', {
  model: ({ model }) => ({ todos: model.todos, selected: model.selected }),
  messages: [Message.Selected, Message.Archived],
})
const TodoSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  archive: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
})

const TodoListView = SurfaceView.define(TodoList, TodoSlots, (model, slots, h) =>
  h.section(slots.root.attrs(), [
    h.button(slots.archive.attrs([h.Disabled(Option.isNone(model.selected))]), ['Archive']),
  ]),
).pipe(Style.attach(Style.forSlots(TodoSlots)({ root: Style.class('todo-list') })))

const renderer = Surface.view(TodoList, SurfaceView.toRenderer(TodoListView))
```

Inside `SurfaceView.define`, `model` is inferred as `{ readonly todos: readonly string[]; readonly selected: Option.Option<string> }` (excluding `secret`), and `h` accepts only `Selected` and `Archived` Messages (rejecting `ClearedSecret`). `SurfaceView.toRenderer` adapts the `SlotView` for `Surface.view` or `Surface.rootView`.

## Attach typed Behaviors without repeating types

`Behavior.forSlots` requires the exact projected input type because `SlotView` is invariant in its input. Use `SurfaceView.over(surface, slots)` to bind both the projection type and Message subset once so Styles and Behaviors need no manual type parameters:

```ts
import { Behavior } from 'foldkit-mixins'

const Todos = SurfaceView.over(TodoList, TodoSlots)

const Archives = Todos.behavior({
  archive: {
    requires: { events: [Event.Click] },
    attributes: ({ input, h }) =>
      Option.match(input.selected, {
        onNone: () => [],
        onSome: id => [h.OnClick(Message.Archived({ id }))],
      }),
  },
})

const BoundTodoListView = Todos.define((_model, slots, h) =>
  h.section(slots.root.attrs(), [h.button(slots.archive.attrs(), ['Archive selected'])]),
).pipe(Behavior.attach(Archives))
```

Inside `Todos.behavior`, `input.secret` is a type error and `h` restricts Messages to `Selected` and `Archived`. Apply `slots.archive.attrs(...)` to the element where Behavior attributes should attach.

## Render statically for tests and demos

`SurfaceView.render(view, surface, params, root)` projects `root` through the Surface and renders static `Html` using `SlotView.inertBuilder` without mounting a runtime or dispatching events:

```ts
const html = SurfaceView.render(TodoListView, TodoList, undefined, {
  todos: ['Write docs'],
  selected: Option.some('t1'),
  secret: 'not projected',
})
```

## Inspect a `SurfaceView`

`SurfaceView.describe(surface, params, view)` merges `SlotView.describe(view)` (slots, attachments, requirements, contributions, and `findings`) with `Surface.inspect` (observed fields, projection metadata, and emitted Message tags). `SurfaceView.toMarkdown` formats that inspection output as Markdown for snapshots or documentation checks. Each helper (`define`, `over`, `toRenderer`, `render`, `describe`, `toMarkdown`) is also available as a direct named export.

## Next

- Learn Slots, Styles, and Behaviors: [`foldkit-mixins`](../mixins)
- Define Surfaces and Modules: [`foldkit-surface`](../surface)
- See a full Surface-to-SlotView example: [`examples/mixins`](../../examples/mixins)
