# Design: `foldkit-surface/declared` — Derived `update` from a `metakit` Machine

## Problem

An application that declares its transitions as a `metakit` `Machine` (like `examples/todo-app/src/machine.ts`) still has to write three pieces of glue by hand:

1. A `Message.match` table forwarding every declared tag `{ _tag, input }` into `machine.update(model, declared)`.
2. A `Match.valueTags` switch mapping emitted records (`EmitOf<Transitions>`) to Foldkit Commands.
3. Wiring `Writes.of(App, machine)` + `writes.track(update)` + `writes.install()` / `writes.rootView(...)`.

Worse, while an application migrates one Message at a time, hand-written `update` arms must coexist cleanly with declared transitions, and any undeclared Message must stay conservative in `Writes`. And a transition that takes supplied values (a new id, the time) needs someone to make them once per step.

## API (`foldkit-surface/declared`)

`foldkit-surface/declared` is a subpath of `foldkit-surface` (so applications without a machine pay zero bytes).

```ts sketch
import { Declared } from 'foldkit-surface/declared'

const declared = Declared.of(App, machine, {
  // Exhaustive by type over `EmitOf<typeof machine.transitions>` when the
  // machine emits records; optional when it emits none.
  commands: {
    Submit: ({ id, title, createdAt }) => [fact(Message.SubmittedTodo({ id, title, createdAt }))],
    Delete: ({ id }) => [fact(Message.DeletedTodo({ id }))],
    // ...
  },
  // Required by type for every transition that declares `supplied` values:
  // each entry makes them from the Message, once per step.
  supply: {
    DraftSubmitted: () => ({ id: crypto.randomUUID(), now: Date.now() }),
  },
  // Optional: receives each step's Message and the values `supply` made, so a
  // replay can pass them back through `declared.replay`.
  record: step => journal.push(step),
  // Optional: which Message tags each emitted Command may send back.
  sends: {
    Submit: ['SubmittedTodo'],
    Delete: ['DeletedTodo'],
  },
  // The hand-written arm for Messages `machine` has no transition for.
  // Required by type exactly when some Message of `App` has none.
  fallback: (model, message) => handWritten(model, message),
  // Optional store-owning contracts / extra writers forwarded to `Writes.of`.
  contracts: [syncContract],
})
```

### Returned handle (`Declared<Root, Message, Tag, Resources, Step>`)

| Member | Meaning |
| --- | --- |
| `update(model, message)` | Derived Foldkit `update`, already tracked by `writes.track`. Runs `machine.update` for declared tags with the values `supply` makes, translates emitted records through `commands` in emission order, and delegates undeclared tags to `fallback`. Returns `{ model }` with identical reference on no-ops. |
| `step(model, message)` | The same step untracked, for an outer wrapper (`Bundle.assemble`, `WritesCheck.verify`) under one outermost `writes.track`. |
| `replay(model, step)` | Runs a recorded step with the values it was supplied, without calling `supply`. |
| `writes` | The underlying `Writes<Root, Message, Tag>` from `Writes.of(app, machine, { contracts, writers })`. |
| `rootView` | Shortcut to `writes.rootView`. |
| `install()` | Shortcut to `writes.install()` (`#587`). |
| `undeclared` | Message tags of `App` not covered by `machine.transitions` (for coexistence tracking). |
| `sends` | Map from emitted record tag to the Message tags its Command may send back (validated against `App.Message` at definition time). |
| `messageEdges` | Each transition's declared `emits` joined with `sends`: the Message-to-Message edges. `sends` alone gives the graph nothing; pass these as `Graph.of(module, { sends: declared.messageEdges })`, which records each as a `GraphEdge.Sends`. |

## Supplied inputs

A transition declares `supplied: { now: Schema.Int }` for values no caller passes and no state holds. `Declared.of` asks `supply[tag](message)` once per step and passes the result to the machine, which checks it against the transition's Schemas. Without an entry the step would be refused and its Message would do nothing, so the entry is required by type and `Declared.of` throws at definition time when one is missing. The values are recorded in two ways: `record` receives each step's Message with its values, which `replay` takes back; and an application that replicates the result sends them on in an emitted record, as `examples/todo-app` does with the new todo's id and time in its `SubmittedTodo` fact.

## Coexistence & Invariants

1. **No-op reference identity:** When `machine.update` leaves `model` unchanged (`next === model`) and emits no commands, `declared.update` returns `{ model }` with `result.model === model`, so Foldkit skips rendering and `Writes.track` does not bump epochs.
2. **Exact emission order:** `emitted` records are mapped through `commands[record._tag](record)` in the exact order `Transition.emits` produced them.
3. **Exhaustive Command table:** TypeScript enforces a handler for every tag in `EmitOf<Transitions>`, and a record with no handler throws, naming the transition and the record.
4. **Undeclared Messages stay conservative unless declared elsewhere:** A Message delegated to `fallback` has no transition, so `writes.track` bumps every view's epoch whenever `fallback` returns a new Model, unless its tag is named in `writers` or `contracts`, whose declared paths then decide what it draws again (an opaque child Bundle confined to its path is one; `WritesCheck.verify` holds it there).
5. **Definition-time validation:** Every transition tag in `machine` and every tag named in `sends` is checked against `app.Message` at definition time (throwing on typos or prototype keys); a missing `fallback` or `supply` entry throws there too.
