# Declare your `update`

A hand-written `update` function hides which fields a Message can change, so the renderer, the dependency graph, and your tests cannot inspect it without running it. You can declare each Message's state change as data with a `Machine`, then derive your Foldkit `update` from it with `Declared.of`.

## Example

This counter declares `Inc` as a `Transition` (a data description of a state change) and derives `update` through `Declared.of`:

```ts
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Num, Transition } from 'metakit'
import * as Machine from 'metakit/machine'
import { Surface } from 'foldkit-surface'
import { Declared } from 'foldkit-surface/declared'

const Model = Schema.Struct({ count: Schema.Int })
const Message = defineMessageUnion({ Inc: { by: Schema.Int } })
const App = Surface.application({ Model, Message })

const machine = Machine.make({
  state: Model,
  transitions: {
    Inc: Transition.make({
      state: Model,
      input: Schema.Struct({ by: Schema.Int }),
      apply: ({ state, input }) => [Transition.set(state.count, Num.add(state.count, input.by))],
    }),
  },
})

export const { update, writes } = Declared.of(App, machine)
```

Calling `update({ count: 1 }, Message.Inc({ by: 2 }))` returns `{ model: { count: 3 } }`. When a transition leaves every field unchanged, `update` returns the exact `model` object it received, so memoized views skip redrawing.

## Move one Message at a time

You do not need to declare every Message at once. Pass a `fallback` function for the remaining variants; TypeScript narrows `fallback`'s `message` parameter to only the tags `machine` does not declare:

```ts
const { update } = Declared.of(App, machine, {
  fallback: (model, message) => ({ model }),
})
```

## Verify declared writes in tests

If a `fallback` arm or a `Transition.opaque` writes a field it did not declare, wrap `update` with `WritesCheck.verify` in your test suite. It compares the paths changed before and after each step against the machine's declared write footprint and throws on any undeclared write.

## Next

- See what a Message can affect across Surfaces and queries: [See what a Message can affect](./message-impact.md).
- Reference: [`foldkit-surface` README](../../packages/surface/README.md) and [`metakit` README](../../packages/metakit/README.md).
