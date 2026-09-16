# `foldkit-bundle`

Packages a Foldkit child machine, a Submodel, **once**, and places it anywhere
in a parent with one value, **without adding a store, a reducer, or a runtime**.

A Submodel in Foldkit is wired by hand in five places: the update fold, the
init, the Subscription lift, the Managed Resource lift, and the view. Placing
the same child twice repeats all five. A Bundle holds the child's parts in one
value, and a Link says where it lives. Placing it compiles each part to the
Foldkit lift that already exists for it.

```text
Bundle  (what: Model, Message, init, update, subscriptions, resources, view, helpers)
  +
Link    (where: a lens onto the child Model, and the parent Message variant)
  =
Placed  (the same parts, lifted into the parent)
```

A placement is still an ordinary Submodel. The child's state is a field of the
parent Model, its Messages are a variant of the parent Message, and every
transition goes through the parent's `update`. Replay, DevTools, and Scene tests
see exactly what they saw before.

## When to use it

| Situation | Use |
| --- | --- |
| A child machine placed two or more times, or published for others | a Bundle |
| A child with Subscriptions or resources you keep forgetting to lift | a Bundle, then `assembly.complete` |
| A one-off child used in a single place | a hand-wired Submodel is fine |
| Something without its own Model: a one-shot effect, a DOM attachment | a Command or a Mount, not a Bundle |

A Bundle owns nothing at runtime. **The parent Model owns the child's state**;
the bundle describes the transitions of that slice, and the Link says which
slice. Two placements are two independent slices with two independent sets of
Subscriptions.

## Install

```bash
pnpm add foldkit-bundle effect foldkit
```

`effect` and `foldkit` are peer dependencies.

## Sixty seconds: one media query, placed twice

Define the child once. It is the same Model, Message, init, update, and
Subscriptions a Submodel would have, collected into one value.
`matchMediaChanges` stands for your own `Stream<boolean>` over `matchMedia`:

```ts
import { Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import { Bundle, Link } from 'foldkit-bundle'

const MediaQueryModel = Schema.Struct({ matches: Schema.Boolean })
type MediaQueryModel = typeof MediaQueryModel.Type
const MediaQueryMessage = defineMessageUnion({ Changed: { matches: Schema.Boolean } })
type MediaQueryMessage = typeof MediaQueryMessage.Type

export const MediaQuery = Bundle.make({
  name: 'MediaQuery',
  Model: MediaQueryModel,
  Message: MediaQueryMessage,
  init: (_: { readonly query: string }) => ({ model: { matches: false } }),
  update: (_model, message) => ({ model: { matches: message.matches } }),
  subscriptions: ({ query }) =>
    Subscription.make<MediaQueryModel, MediaQueryMessage>()(() => ({
      changes: Subscription.persistent(
        Stream.map(matchMediaChanges(query), matches => MediaQueryMessage.Changed({ matches })),
      ),
    })),
})
```

Place it. Each placement gets a wrapper variant, whose `cases` go into the
parent Message, and a Link to a Model field:

```ts
const GotDarkMessage = Link.wrapper('GotDarkMessage', MediaQueryMessage)
const GotNarrowMessage = Link.wrapper('GotNarrowMessage', MediaQueryMessage)

const Model = Schema.Struct({ dark: MediaQueryModel, narrow: MediaQueryModel })
type Model = typeof Model.Type

const Message = defineMessageUnion({
  ClickedHelp: {},
  ...GotDarkMessage.cases,
  ...GotNarrowMessage.cases,
})
type Message = typeof Message.Type

const Dark = MediaQuery.at(Link.field<Model>()('dark', GotDarkMessage), {
  args: { query: '(prefers-color-scheme: dark)' },
})
const Narrow = MediaQuery.at(Link.field<Model>()('narrow', GotNarrowMessage), {
  args: { query: '(max-width: 40rem)' },
})

const placements = Bundle.assemble<Model, Message>()([Dark, Narrow])
```

Wire the assembly into the runtime config once. `empty` is
`{ matches: false }` and `view` is your parent view:

```ts
const config = placements.complete({
  init: () => placements.init({ dark: empty, narrow: empty }),
  update: placements.update(),
  view,
  subscriptions: placements.subscriptions(),
})
```

Spread `config` into `Runtime.makeApplication` or `Runtime.makeElement` with
the rest of your options.

### What each call does

- **`Bundle.make`** only collects the parts. It runs nothing and holds no state.
- **`Link.wrapper(tag, ChildMessage)`** builds the parent variant
  `tag({ message })`. Its `cases` belong in the parent's `defineMessageUnion`, so
  the variant is part of the parent Message Schema.
- **`bundle.at(link, config)`** lifts every part: `update` through
  `Update.foldChildStep`, Subscriptions through `Subscription.lift`, resources
  through `ManagedResource.lift`, and the view through `h.submodel`. It performs
  no I/O.
- **`Bundle.assemble`** is the one list of placements. `update` returns `None`
  for the parent's own Messages, so the parent handles those.
- **`placements.complete`** returns the config unchanged. It exists to report
  wiring mistakes, below.

### Shorter: one declaration per placement

`Bundle.declare` derives the wrapper, the Model field, and the Message cases from
the field name, using Foldkit's `Got<Field>Message` convention:

```ts
const Dark = Bundle.declare(MediaQuery, 'dark') // wrapper GotDarkMessage

const Model = Schema.Struct({ ...Dark.fields, title: Schema.String })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Dark.cases, ClickedHelp: {} })

const DarkPlaced = Dark.at<Model>()({ args: { query: '(prefers-color-scheme: dark)' } })
```

`at<Model>()` requires `Model.dark` to hold the bundle's Model. For a keyed
collection, `Bundle.declareEach(Row, 'rows')` gives a record field and
`each<Model>()`. Use `Link.field` directly when the placement needs a `when`
gate or a Model path other than a top-level field.

## The placed parts

Each placement exposes the lifted parts, in parent terms:

| Part | Type | Built from |
| --- | --- | --- |
| `placed.update(parent, message)` | `Option<Update.Return>`: `None` when the Message is not this placement's | `Update.foldChildStep` |
| `placed.init` | `Update.Step`: writes the child's initial Model and lifts its Commands | `Command.mapMessages` |
| `placed.subscriptions` | a Subscriptions record keyed `Name@path/key` | `Subscription.lift` with a gate |
| `placed.resources` | a Managed Resources record keyed `Name@path/key` | `ManagedResource.lift` |
| `placed.view(parent, h, viewInputs?)` | `Html`; nothing while the child is absent | `h.submodel` |
| `placed.viewIn(slot)` | the same view under another slot id, to render one placement in two positions | `h.submodel` |
| `placed.helpers.name(...input)` | `Update.Step` for a programmatic entry point | `Update.foldChildStep` |

Keys are prefixed with the placement, so two placements of one bundle never
collide in `Subscription.aggregate`.

## Args, OutMessages, and helpers

`init` may take args. `update` receives the same args as its third parameter,
so behaviour can depend on configuration without storing it in the Model. In
this sketch, reduced from [`test/fixture.ts`](test/fixture.ts), `update`
emits an OutMessage when the count reaches the limit:

```ts
const Counter = Bundle.make({
  name: 'Counter',
  Model: CounterModel,
  Message: CounterMessage,
  init: ({ start }: { readonly limit: number; readonly start: number }) => ({
    model: { count: start, running: false },
  }),
  update: (model, message, { limit }) => {
    // ...
    return count === limit ? { model: next, outMessage: LimitReached.make({ count }) } : { model: next }
  },
  helpers: {
    reset: (model: CounterModel, to: number) => ({ model: { ...model, count: to } }),
  },
})
```

A bundle that returns an OutMessage must be placed with `onOut`, which folds it
into the parent as a Step. The Step sees the parent with the child already
written back:

```ts
const Left = Counter.at(Link.field<Model>()('left', GotLeftMessage), {
  args: { limit: 2, start: 0 },
  onOut: outMessage => model => ({ model: { ...model, reached: outMessage.count } }),
})

Left.helpers.reset(7) // Update.Step<Model, Message>
```

`args` is required when `init` takes them, and `onOut` is required when the
bundle has an OutMessage. An OutMessage cannot be dropped by leaving it out.

## Components with separate parts: `Bundle.fromParts`

`@foldkit/ui` components export `Model`, `Message`, and an `init` that returns
only the Model, and `create()` returns their `{ update, view }` pair.
`Bundle.fromParts` takes them as they are:

```ts
import * as Tabs from '@foldkit/ui/tabs'

const SectionTabs = Bundle.fromParts({
  name: 'SectionTabs',
  Model: Tabs.Model,
  Message: Tabs.Message,
  init: (config: Tabs.InitConfig) => Tabs.init(config),
  parts: Tabs.create<Section>(),
})

const Placed = SectionTabs.at(Link.field<Model>()('tabs', GotTabsMessage), {
  args: { id: 'sections' },
  onOut: selected => model => ({ model: { ...model, section: selected.value } }),
})
```

The component's view inputs pass through: `Placed.view(model, h, { tabs, selectedValue, ariaLabel, toView })`.
`fromParts` accepts `subscriptions` and `helpers` too, but no Managed Resources.
[`test/fromParts.test.ts`](test/fromParts.test.ts) runs this example.

## Where a child lives: Links

| Link | The child is |
| --- | --- |
| `Link.field<Parent>()(key, wrapper)` | a struct field, always present |
| `Link.optional<Parent>()(key, wrapper)` | an `Option` field; absent while `None` |
| `Link.compose(outer, inner)` | inside another placed child |
| `Link.make({ read, write, wrapper, path })` | anywhere a lens can reach |

`field` and `optional` also take `{ when }`, the parent's own gate. While it
returns `false`, the placement's Subscriptions and resources stop. An absent
child also stops them, renders nothing, and ignores its Messages.

## Many of one: collections

`bundle.each` places a bundle once per key of a `Record<string, Child>` field.
The parent Model still owns every item; the collection routes by key:

```text
Parent Model.rows = { a: Row.Model, b: Row.Model }
GotRowMessage({ key: 'b', message }) -> Row.update on rows.b -> rows.b written back
```

```ts
const RowModel = Schema.Struct({ id: Schema.String, count: Schema.Number })
const RowMessage = defineMessageUnion({ Clicked: {} })

const Row = Bundle.make({
  name: 'Row',
  Model: RowModel,
  Message: RowMessage,
  init: () => ({ model: { id: '', count: 0 } }),
  update: model => ({ model: { ...model, count: model.count + 1 } }),
})

const GotRowMessage = Link.keyedWrapper('GotRowMessage', RowMessage)
const Model = Schema.Struct({ rows: Schema.Record(Schema.String, RowModel) })
type Model = typeof Model.Type

const Rows = Row.each(Link.collection<Model>()('rows', GotRowMessage))

// In the parent update:
Rows.add('b', row => ({ ...row, id: 'b' })) // Update.Step: init, then prepare
Rows.remove('b') // Update.Step: the item and its Subscriptions go away
```

- **`add(key, prepare?)`** writes the item from `init` and lifts its Commands.
  An item cannot see its key, so `prepare` lets the parent store what only the
  parent knows, such as the id. Adding an existing key replaces the item.
- **`remove(key)`** deletes the item. A Message that arrives later for that key
  leaves the parent unchanged.
- **`update`**, **`helpers.name(key, ...input)`**, and `onOut(outMessage, key)`
  work per item. `args` are given once, for every item.
- **`view(parent, h, key)`** renders one item and **`viewAll(parent, h)`**
  renders all of them, in the record's key order, each in its own slot.
- A collection joins the same `Bundle.assemble` list. `placements.init` skips
  it: a collection starts as the parent left it.

**Subscriptions restart together.** Each child Subscription becomes one parent
entry over every item. Adding or removing an item, or changing any item's
dependencies, restarts that entry's stream for every item. A child entry with
`keepAliveEquivalence` stays alive while the keys are unchanged, and each item
reads its own latest dependencies. A bundle with Managed Resources cannot be
placed with `each`; the type says why.

## Completeness: the three wiring mistakes

`placements.complete(config)` turns each of these into a type error at the
property that is wrong:

| Mistake | Reported at |
| --- | --- |
| The parent Message union lacks a placement's wrapper variant | `update` |
| `subscriptions` not built with `placements.subscriptions(own)` | `subscriptions` |
| `managedResources` not built with `placements.resources(own)`, when a placement has resources | `managedResources` |

Pass the parent's own records through the same call:
`placements.subscriptions(ownSubscriptions)`. A duplicate key throws at startup,
as `Subscription.aggregate` does.

`Bundle.assemble` also fails at startup, naming both placements, when two
placements share a key or a Managed Resource tag.

## Limits

- **Managed Resources are provided by tag.** The Foldkit runtime provides a
  resource through its `ManagedResource.tag`, so two placements of one bundle
  that use the same tag would replace each other. `Bundle.assemble` refuses
  that. When a bundle with resources is placed more than once, make the bundle
  from a function that takes the tag, one tag per placement, as
  [`test/runtime.test.ts`](test/runtime.test.ts) does.
- **Collections restart item streams together.** Per-key keep-alive, where
  adding one item leaves the other items' streams running, is not built yet.
- **Collections cannot hold resources**, for the tag reason above.
- **Record key order.** `viewAll` and the Subscription order follow JavaScript
  record order, which puts integer-like keys such as `"2"` before other keys.
- **No Surface integration yet.** Module contracts, relative Surfaces, and
  Mirror declarations for placements are planned for a companion
  `foldkit-bundle-surface` package.

## See also

- [Phase 0 verification notes](../../docs/design/bundle-spike.md): which Foldkit
  APIs a placement compiles to, and the runtime facts that shaped the design.
- [`foldkit-surface`](../surface): the access boundary a placement will publish.
