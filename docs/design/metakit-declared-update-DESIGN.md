# Design: `foldkit-surface/declared` — Derived `update` from a `metakit` Machine

## Problem

An application that declares its transitions as a `metakit` `Machine` (like `examples/todo-app/src/machine.ts`) still has to write three pieces of glue by hand:

1. A `Message.match` table forwarding every declared tag `{ _tag, input }` into `machine.update(model, declared)`.
2. A `Match.valueTags` switch mapping emitted records (`EmitOf<Transitions>`) to Foldkit Commands.
3. Wiring `Writes.of(App, machine)` + `writes.track(update)` + `writes.install()` / `writes.rootView(...)`.

Worse, while an application migrates one Message at a time, hand-written `update` arms must coexist cleanly with declared transitions, and any undeclared Message must stay conservative in `Writes`.

## API (`foldkit-surface/declared`)

`foldkit-surface/declared` is a subpath of `foldkit-surface` (so applications without a machine pay zero bytes).

```ts
import { Declared } from 'foldkit-surface/declared'

const declared = Declared.of(App, machine, {
  // Exhaustive by type over `EmitOf<typeof machine.transitions>` when the
  // machine emits records; optional when it emits none.
  commands: {
    Mint: ({ title, requestId }) => [mintTodo(title, requestId)],
    Delete: ({ id }) => [fact(Message.DeletedTodo({ id }))],
    // ...
  },
  // Optional: which Message tags each emitted Command may send back,
  // giving the dependency graph Message-to-Message edges.
  sends: {
    Mint: ['CreatedTodo'],
    Delete: ['DeletedTodo'],
  },
  // Optional coexistence handler for Messages not yet declared in `machine`.
  // Required by type only when some Message of `App` is absent from `machine`.
  fallback: (model, message) => handWrittenUpdate(model, message),
  // Optional store-owning contracts / extra writers forwarded to `Writes.of`.
  contracts: [syncContract],
})
```

### Returned handle (`Declared<Root, Message, Tag, Resources>`)

| Member | Meaning |
| --- | --- |
| `update(model, message)` | Derived Foldkit `update`, already tracked by `writes.track`. Runs `machine.update` for declared tags, translates emitted records through `commands` in emission order, and delegates undeclared tags to `fallback`. Returns `{ model }` with identical reference on no-ops. |
| `writes` | The underlying `Writes<Root, Message, Tag>` from `Writes.of(app, machine, { contracts, writers })`. |
| `rootView` | Shortcut to `writes.rootView`. |
| `install()` | Shortcut to `writes.install()` (`#587`). |
| `undeclared` | Message tags of `App` not covered by `machine.transitions` (for coexistence tracking). |
| `sends` | Map from emitted record tag to the Message tags its Command may send back (validated against `App.Message` at definition time). |

## Coexistence & Invariants

1. **No-op reference identity:** When `machine.update` leaves `model` unchanged (`next === model`) and emits no commands, `declared.update` returns `{ model }` with `result.model === model`, so Foldkit skips rendering and `Writes.track` does not bump epochs.
2. **Exact emission order:** `emitted` records are mapped through `commands[record._tag](record)` in the exact order `Transition.emits` produced them.
3. **Exhaustive Command table:** TypeScript enforces a handler for every tag in `EmitOf<Transitions>`, and runtime guards with `Object.hasOwn` against missing/prototype keys.
4. **Undeclared Messages stay conservative:** Any Message delegated to `fallback` is absent from `machine.transitions`, so `writes.track` bumps `all++` whenever `fallback` returns a new Model.
5. **Definition-time validation:** Every transition tag in `machine` and every tag named in `sends` is checked against `app.Message` at definition time (throwing on typos or prototype keys).
