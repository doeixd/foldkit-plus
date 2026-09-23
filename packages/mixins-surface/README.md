# `foldkit-mixins-surface`

Connects a [`foldkit-surface`](https://github.com/doeixd/foldkit-plus/tree/main/packages/surface)
feature boundary to a [`foldkit-mixins`](https://github.com/doeixd/foldkit-plus/tree/main/packages/mixins)
`SlotView` without repeating that boundary in the view layer.

The two packages answer different questions:

```text
Surface   -> what may this feature observe and which Messages may it emit?
SlotView  -> where may this view be customized with Style and Behavior?
```

`SurfaceView.define` joins them. The SlotView's input becomes exactly the
Surface's projected value, and its Message universe becomes exactly the
Surface's exposed subset. A Behavior cannot quietly read a root-Model field the
Surface omitted or emit a Message the feature did not expose; both mistakes are
type errors where the view is defined.

The bridge creates no state, no renderer, and no second runtime. The result is
an ordinary `SlotView` with the Surface's boundary reflected in its types.

## Use it when

You already render a Surface and want to style or decorate that feature through
typed Mixins extension points. If you are not using `foldkit-surface`, use
`SlotView.define` / `SlotView.forMessages` from `foldkit-mixins` directly — this
package adds nothing else.

For the Mixins mental model itself (Slot, Style, Behavior, SlotView), read
[Inside-out view composition](https://github.com/doeixd/foldkit-plus/blob/main/docs/mixins.md)
first.

## Install

```bash
pnpm add foldkit-mixins foldkit-surface foldkit-mixins-surface
```

`foldkit`, `effect`, `foldkit-mixins`, and `foldkit-surface` are peer
dependencies.

## Usage

```ts
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Behavior, Capability, Event, Slot, Slots, Style } from 'foldkit-mixins'
import { SurfaceView } from 'foldkit-mixins-surface'
import { Surface } from 'foldkit-surface'

const Model = Schema.Struct({
  todos: Schema.Array(Schema.Struct({ id: Schema.String, title: Schema.String })),
  selectedId: Schema.Option(Schema.String),
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
  readonly selectedId: Option.Option<string>
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
      Option.match(input.selectedId, {
        onNone: () => [],
        onSome: id => [h.OnClick(Message.ArchivedTodo({ id }))],
      }),
  }),
})

const TodoListView = SurfaceView.define(TodoList, TodoSlots, (model, slots, h) =>
  h.section(slots.root.attrs(), [
    h.ul([], model.todos.map(todo => h.li([], [todo.title]))),
    h.button(
      slots.archive.attrs([h.Disabled(Option.isNone(model.selectedId))]),
      ['Archive selected'],
    ),
  ]),
).pipe(Style.attach(TodoStyle), Behavior.attach(TodoBehavior))

// `toRenderer` adapts a SlotView to what `Surface.view`/`Surface.rootView` take.
const renderer = Surface.view(TodoList, SurfaceView.toRenderer(TodoListView))
```

`slots.archive.attrs(...)` is where the attached click behavior reaches a
real element. Declaring a slot or attaching a Behavior alone renders nothing.
With no selection the button is disabled; with a selection its click emits
`ArchivedTodo`, and the application's reducer performs the transition.

The useful part is what the render callback does **not** repeat: no type
annotation on `model` or `h`, no second Message union, and no root-Model input
type. `SurfaceView.define` gets those from the Surface.

A Behavior's `Input` parameter still has to be exactly the projected type — a
`SlotView` is invariant in it, so a narrower "just the fields I happen to read"
type is rejected by `Behavior.attach`.

`toRenderer` is the single boundary adaptation. `Surface.view` hands a renderer
a `ViewBuilder` with its `MessageUniverse` phantom removed; the SlotView is sound
there because `SurfaceView.define` already restricted what it can construct to
the Surface's Message subset.

## What the bridge buys you

Without this package, Surface and SlotView are both type-safe independently, but
you can accidentally describe the same feature boundary twice:

```text
Surface projection / Message subset
             X
SlotView input / Message universe
```

With `SurfaceView.define`, there is one declaration:

```text
Surface
  │
  ├─ projected value ──────────────┐
  └─ Message subset ────────────┐  │
                                ▼  ▼
                             SlotView
                                │
                         Style + Behavior
```

That is the whole package.

## Rendering without a runtime

`SurfaceView.render(view, surface, params, root)` projects `root` through the
Surface and renders the view with `SlotView.inertBuilder`. It returns the
`Html`, but nothing mounts and handlers are built without ever being
dispatched. It is for tests, demos, and static output, not a replacement for
`Surface.view` in a running app.

```ts
const html = SurfaceView.render(TodoListView, TodoList, undefined, {
  todos: [{ id: 't1', title: 'Write docs' }],
  selectedId: Option.some('t1'),
  secret: 'not projected',
})
```

## Introspection

`SurfaceView.inspect(view)` returns serializable `{ name, slots, mixins }` with
no functions. `SurfaceView.describe(surface, params, view)` merges that with
`Surface.inspect` — what the Surface observes, its projection `metadata`, and
what it may emit, with emitted Messages as tags — into one value.
`SurfaceView.toMarkdown` renders it deterministically for docs or a CI drift
check.

Each of `define`, `toRenderer`, `render`, `inspect`, `describe`, and `toMarkdown` is also a
direct named export if you prefer that to the `SurfaceView` namespace.

## Status

The API is still settling in the `0.x` series. This is deliberately a small
bridge rather than a second view system; changes should keep it that way. See
[the design note](https://github.com/doeixd/foldkit-plus/blob/main/docs/design/mixins-DESIGN.md)
for the underlying Mixins decisions.

## See also

- [Inside-out view composition](https://github.com/doeixd/foldkit-plus/blob/main/docs/mixins.md) — the Mixins mental model and before/after examples.
- [`foldkit-mixins`](https://github.com/doeixd/foldkit-plus/tree/main/packages/mixins) — SlotView, Style, Behavior, and the resolver.
- [`foldkit-surface`](https://github.com/doeixd/foldkit-plus/tree/main/packages/surface) — the projection/capability boundary this package preserves.
- [`examples/mixins`](https://github.com/doeixd/foldkit-plus/tree/main/examples/mixins) — Surface → SlotView end to end.