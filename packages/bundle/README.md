# `foldkit-bundle`

Packages a Foldkit child machine, a Submodel, **once**, and places it anywhere
in a parent, **without adding a store, a reducer, or a runtime**.

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
| A child with Subscriptions or resources you keep forgetting to lift | a Bundle, then `placements.complete` |
| A one-off child used in a single place | a hand-wired Submodel is fine |
| Something without its own Model: a one-shot effect, a DOM attachment | a Command or a Mount, not a Bundle |

A Bundle owns nothing at runtime. **The parent Model owns the child's state**;
the bundle describes the transitions of that slice, and the Link says which
slice. Two placements are two independent slices with two independent sets of
Subscriptions. To check that ownership beside Sync and Remote, see
[`foldkit-bundle-surface`](../bundle-surface).

## Install

```bash
pnpm add foldkit-bundle effect foldkit
```

`effect` and `foldkit` are peer dependencies.

## Sixty seconds: one media query, placed twice

**Define it once.** It is the Model, Message, init, update, and Subscriptions a
Submodel would have, collected into one value. `args` is a Schema, so `init`,
`update`, and `subscriptions` are typed without annotations. `matchMediaChanges`
stands for your own `Stream<boolean>` over `matchMedia`:

```ts
import { Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import { Bundle } from 'foldkit-bundle'

const MediaQueryModel = Schema.Struct({ matches: Schema.Boolean })
type MediaQueryModel = typeof MediaQueryModel.Type
const MediaQueryMessage = defineMessageUnion({ Changed: { matches: Schema.Boolean } })
type MediaQueryMessage = typeof MediaQueryMessage.Type

export const MediaQuery = Bundle.make('MediaQuery', {
  Model: MediaQueryModel,
  Message: MediaQueryMessage,
  args: Schema.Struct({ query: Schema.String }),
  init: () => ({ model: { matches: false } }),
  update: (_model, message) => ({ model: { matches: message.matches } }),
  subscriptions: ({ query }) =>
    Subscription.make<MediaQueryModel, MediaQueryMessage>()(() => ({
      changes: Subscription.persistent(
        Stream.map(matchMediaChanges(query), matches => MediaQueryMessage.Changed({ matches })),
      ),
    })),
})
```

**Place it, twice.** A declaration gives each placement its Model field and its
Message variant, named by Foldkit's `Got<Field>Message` convention:

```ts
const Dark = Bundle.declare(MediaQuery, 'dark') // wrapper GotDarkMessage
const Narrow = Bundle.declare(MediaQuery, 'narrow') // wrapper GotNarrowMessage

const Model = Schema.Struct({ ...Dark.fields, ...Narrow.fields, helpOpen: Schema.Boolean })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Dark.cases, ...Narrow.cases, ClickedHelp: {} })
type Message = typeof Message.Type

const Page = Bundle.parent({ Model, Message })

const placements = Page.assemble(
  Page.at(Dark, { args: { query: '(prefers-color-scheme: dark)' } }),
  Page.at(Narrow, { args: { query: '(max-width: 40rem)' } }),
)
```

**Wire it once.** The assembly builds the parent's initial Model and update.
`ownUpdate` is the parent's own update for `ClickedHelp`, and `view` its view:

```ts
const config = placements.complete({
  init: () => placements.initial({ helpOpen: false }),
  update: placements.update(ownUpdate),
  view,
  subscriptions: placements.subscriptions(),
})
```

Spread `config` into `Runtime.makeApplication` or `Runtime.makeElement` with the
rest of your options.

### What each call does

- **`Bundle.make(name, spec)`** only collects the parts. It runs nothing and
  holds no state. `Bundle.make({ name, ...spec })` is the same.
- **`Bundle.declare(bundle, field)`** names where a placement will live: `fields`
  for the parent `Schema.Struct`, `cases` for its `defineMessageUnion`.
- **`Bundle.parent({ Model, Message })`** states the parent once, as the Schemas
  it already has, so nothing after it takes a type argument.
- **`Page.at(declared, config)`** places the bundle. It checks that the field
  holds the bundle's Model and that the parent Message has the wrapper variant,
  and lifts every part: `update` through `Update.foldChildStep`, Subscriptions
  through `Subscription.lift`, resources through `ManagedResource.lift`, and the
  view through `h.submodel`. It performs no I/O.
- **`Page.assemble(...items)`** is the one list of what joins the parent:
  placements, collections, and integration wiring. An integration's wiring
  brings its routing, startup step, Subscriptions, and contract the same way a
  placement brings its parts; see [Wiring](../../docs/wiring.md).
- **`placements.initial(rest)`** is the parent's initial Model and Commands:
  `rest` gives exactly the fields no placement owns, each placement's `init`
  writes its own slice, and each wiring's `init` runs after the placements',
  in list order. That check needs every placement's field, so a placement
  through a custom Link (below) relaxes `rest` to `Partial<Model>`.
- **`placements.update(own)`** is the parent's update: a placement's or
  wiring's Message goes to its item and every other Message to `own`. Without
  `own` they leave the Model unchanged.
- **`placements.url(onUrlChange)`** is the runtime URL config: `init` applies
  every wiring's `onUrl` to the Model, and a URL change becomes
  `onUrlChange`'s Message, which a wiring routes.
- **`placements.complete(config)`** returns the config unchanged. It exists to
  report wiring mistakes, below.

## The placed parts

Each placement exposes its parts in parent terms:

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

`update` receives the args as its third parameter, so behaviour can depend on
configuration without storing it in the Model. This counter emits an OutMessage
when it reaches its limit. `CounterModel`, `CounterMessage`, and the
`LimitReached` Schema are ordinary Schemas:

```ts
const Counter = Bundle.make('Counter', {
  Model: CounterModel,
  Message: CounterMessage,
  args: Schema.Struct({ limit: Schema.Number }),
  init: () => ({ model: { count: 0 } }),
  update: (model, _message, { limit }) => {
    const count = model.count + 1
    return count === limit
      ? { model: { count }, outMessage: LimitReached.make({ count }) }
      : { model: { count } }
  },
  helpers: {
    reset: (model: CounterModel, to: number) => ({ model: { ...model, count: to } }),
  },
})
```

A bundle with an OutMessage must be placed with `onOut`, which folds it into the
parent as a Step. The Step sees the parent with the child already written back,
and its `model` is typed from the scope:

```ts
const Clicks = Bundle.declare(Counter, 'clicks')
const CounterPage = Bundle.parent({
  Model: Schema.Struct({ ...Clicks.fields, reached: Schema.Number }),
  Message: defineMessageUnion({ ...Clicks.cases }),
})

const ClicksPlaced = CounterPage.at(Clicks, {
  args: { limit: 10 },
  onOut: outMessage => model => ({ model: { ...model, reached: outMessage.count } }),
})

ClicksPlaced.helpers.reset(0) // an Update.Step of the parent
```

- **`args`** is required when the bundle takes them, and checked against the
  args Schema when placed (or when a preset is made with `with`); a value that
  bypassed the types throws naming the placement.
- **`onOut`** is required when the bundle has an OutMessage, so one cannot be
  dropped by omission. Write `onOut: Bundle.ignore` to drop it on purpose.
- **Without an args Schema**, `Args` is inferred from `init`'s parameter
  annotation instead.

## Presets

`bundle.with(args)` binds the args, so a placement gives none:

```ts
const PrefersDark = MediaQuery.with({ query: '(prefers-color-scheme: dark)' })
Page.place(PrefersDark, 'dark')
```

`Page.place(bundle, field, config)` is `Page.at` without a separate declaration,
for a Message union built another way.

## Many of one: collections

A collection places a bundle once per key. The parent Model still owns every
item; the collection routes by key:

```text
Parent Model.rows = { a: Row.Model, b: Row.Model }
GotRowsMessage({ key: 'b', message }) -> Row.update on rows.b -> rows.b written back
```

```ts
// Row is a bundle whose Model is { id: string, count: number }.
const RowsDeclared = Bundle.declareEach(Row, 'rows') // a record field and GotRowsMessage
const RowsPage = Bundle.parent({
  Model: Schema.Struct({ ...RowsDeclared.fields }),
  Message: defineMessageUnion({ ...RowsDeclared.cases }),
})
const Rows = RowsPage.each(RowsDeclared)

Rows.add('b', row => ({ ...row, id: 'b' })) // init, then prepare
Rows.remove('b')
```

- **`add(key, prepare?)`** writes the item from `init` and lifts its Commands. An
  item cannot see its key, so `prepare` lets the parent store what only it
  knows, such as the id. Adding an existing key replaces the item.
- **`remove(key)`** deletes the item. A Message that arrives later for that key
  leaves the parent unchanged.
- **`update`**, **`helpers.name(key, ...input)`**, and `onOut(outMessage, key)`
  work per item. `args` are given once, for every item.
- **`view(parent, h, key)`** renders one item and **`viewAll(parent, h)`** renders
  all of them, each in its own slot.
- **`Page.placeEach(bundle, field, config)`** places without a declaration.
- **`placements.initial`** starts a collection empty unless `rest` gives it.

### Typed keys and order

Pass a key Schema, such as a branded id, and the key type follows through `add`,
`remove`, helpers, views, and `onOut`. Store items in an array when order
matters: a record puts integer-like keys such as `"2"` first. Ids in an array
must be unique.

```ts
const RowId = Schema.String.pipe(Schema.brand('RowId'))
const GotOrderedRowMessage = Link.keyedWrapper('GotOrderedRowMessage', RowMessage, RowId)

// OrderedRow is a bundle whose Model has `id: RowId`; OrderedPage's Model has `rows: Array<…>`.
const OrderedRows = OrderedRow.each(
  OrderedPage.link.collectionById('rows', GotOrderedRowMessage, { id: row => row.id }),
)
OrderedRows.remove(RowId.make('first')) // a RowId, not a string
```

**Subscriptions restart together.** Each child Subscription becomes one parent
entry over every item. Adding or removing an item, or changing any item's
dependencies, restarts that entry's stream for every item. A child entry with
`keepAliveEquivalence` stays alive while the keys are unchanged, and each item
reads its own latest dependencies. A bundle with Managed Resources cannot be
placed per key; the type says why.

## Components with separate parts: `Bundle.fromParts`

`@foldkit/ui` components export `Model`, `Message`, and an `init` that returns
only the Model, and `create()` returns their `{ update, view }` pair.
`Bundle.fromParts` takes them as they are:

```ts
import * as Tabs from '@foldkit/ui/tabs'

type Section = 'general' | 'billing'

const SectionTabs = Bundle.fromParts('SectionTabs', {
  Model: Tabs.Model,
  Message: Tabs.Message,
  init: (config: Tabs.InitConfig) => Tabs.init(config),
  parts: Tabs.create<Section>(),
})

// TabsPage is a parent scope whose Model has the declaration's `tabs` field and a `section`.
const TabsPlaced = TabsPage.at(Bundle.declare(SectionTabs, 'tabs'), {
  args: { id: 'sections' },
  onOut: selected => model => ({ model: { ...model, section: selected.value } }),
})
```

The component's view inputs pass through:
`TabsPlaced.view(model, h, { tabs, selectedValue, ariaLabel, toView })`.
`fromParts` accepts `subscriptions` and `helpers` too, but no Managed Resources.
[`test/fromParts.test.ts`](test/fromParts.test.ts) runs this example.

## Extending a bundle

Bundles are pipeable. Each combinator returns a new bundle and leaves the
original unchanged, and its callbacks are typed from the bundle:

```ts
const LoggedCounter = Counter.pipe(
  Bundle.rename('LoggedCounter'),
  Bundle.mapUpdate(update => (model, message, args) => {
    console.log(message._tag)
    return update(model, message, args)
  }),
  Bundle.withHelpers({ clear: (model: CounterModel) => ({ model: { ...model, count: 0 } }) }),
)
```

`mapInit`, `mapView`, `withView`, and `withSubscriptions` complete the set.
`mapUpdate` layers run outer then inner. `mapView` wraps the view a bundle has,
keeping its inputs; `withView` gives a bundle a view with inputs of that view's
own, which is how a package that only draws (such as `foldkit-mixins-form`)
adds a view to a bundle it did not write.

## Gates and custom Links

`when` in a placement config is the parent's own gate: while it returns
`false`, the placement's Subscriptions and resources stop. An absent child also
stops them, renders nothing, and ignores its Messages.

```ts
Page.place(MediaQuery, 'narrow', {
  args: { query: '(max-width: 40rem)' },
  when: model => !model.helpOpen,
})
```

A child that is not a top-level field is placed through a Link, with
`bundle.at(link, config)` and `bundle.each(link, config)`. The scope builds Links
without restating the parent, and Links are pipeable:

```ts
// SidebarPage's Model is { sidebar, open }; GotSidebarMessage is Link.wrapper('GotSidebarMessage', MediaQueryMessage).
const Sidebar = MediaQuery.at(
  SidebarPage.link
    .field('sidebar', GotSidebarMessage)
    .pipe(Link.when((model: typeof SidebarPage.Model.Type) => model.open)),
  { args: { query: '(min-width: 60rem)' } },
)
```

| Link | The child is |
| --- | --- |
| `Page.link.field(key, wrapper)` or `Link.field<Parent>()(…)` | a struct field, always present |
| `Page.link.optional(key, wrapper)` or `Link.optional<Parent>()(…)` | an `Option` field; absent while `None` |
| `Page.link.collection(key, keyedWrapper)` or `Link.collection<Parent>()(…)` | a record of items by key |
| `Page.link.collectionById(key, keyedWrapper, { id })` or `Link.collectionById<Parent>()(…)` | an array of items, in order |
| `outer.pipe(Link.andThen(inner))` | inside another placed child |
| `link.pipe(Link.when(predicate))` | gated by the parent |
| `Link.make({ read, write, wrapper, path })` | anywhere a lens can reach |

`Link.wrapper(tag, ChildMessage)` and `Link.keyedWrapper(tag, ChildMessage, key?)`
build the parent variants a Link carries. When `rest` gives a placement's
top-level field, `placements.initial` keeps that value and skips its `init`, so
an optional child can start as `None`. A nested placement is always initialised,
inside whatever `rest` gave, and outer placements initialise before nested ones.

## Services

When the parent's own update needs services, name them on the scope:

```ts
// clockUpdate: (model: Model, message: Message) => Update.Return<Model, Message, Clock>
Page.withServices<Clock>()
  .assemble(Page.at(Dark, { args: { query: '(prefers-color-scheme: dark)' } }))
  .update(clockUpdate)
```

## Completeness: the wiring mistakes

`placements.complete(config)` turns each of these into a type error at the
property that is wrong:

| Mistake | Reported at |
| --- | --- |
| An `update` that does not accept the whole parent Message, such as one written by hand with a narrower union | `update` |
| `subscriptions` not built with `placements.subscriptions(own)` | `subscriptions` |
| `managedResources` not built with `placements.resources(own)`, when a placement has resources | `managedResources` |
| `init` not returning `placements.initial(rest)`, when a wiring runs startup Commands | `init` |
| `url` not built with `placements.url(onUrlChange)`, when a wiring reads the URL | `url` |

Pass the parent's own records through the same call:
`placements.subscriptions(ownSubscriptions)`. A duplicate key throws at startup,
as `Subscription.aggregate` does. A placement whose wrapper variant is missing from
the parent Message is reported earlier: at `Page.at`, `Page.place`, or `Page.each`,
or by `assemble`'s own type check.

`Page.assemble` also fails at startup when two items share a key, and, naming
both, when two claim one Message tag (two placements sharing a wrapper, or
two wirings handling one tag that neither declares `shared`) or a Managed
Resource tag. `placements.resources(own)` fails the same way when the
parent's own resource shares an item's tag.

## Lower-level API

The scope is sugar over these, which remain for code that composes by hand:

| Call | What it is |
| --- | --- |
| `Bundle.assemble<Model, Message, Services>()([...])` | `Page.assemble` without a scope |
| `placements.route(model, message)` | `update`'s routing, as an `Option` |
| `placements.init` | every single placement's init, then each wiring's, as one `Update.Step` |
| `declared.at<Model>()(config)`, `declaredEach.each<Model>()(config)` | a declaration placed without a scope |

## Limits

- **Managed Resources are provided by tag.** The Foldkit runtime provides a
  resource through its `ManagedResource.tag`, so two placements of one bundle
  that use the same tag would replace each other. `Page.assemble` refuses that.
  When a bundle with resources is placed more than once, make the bundle from a
  function that takes the tag, one tag per placement, as
  [`test/runtime.test.ts`](test/runtime.test.ts) does.
- **Collections restart item streams together.** Keeping other items' streams
  running while one is added needs a dependency-change signal from Foldkit's
  runtime; see the [design note](../../docs/design/bundle-DESIGN.md).
- **Collections cannot hold resources**, for the tag reason above.

## See also

- [`foldkit-bundle-surface`](../bundle-surface): placements as Module contracts,
  and the scope from a Surface application.
- [`examples/bundle`](../../examples/bundle): a settings page built from
  placements, with its transcript pinned.
- [Wiring](../../docs/wiring.md): Remote, Mirror, Sync, and Agent join the
  same assembly through wiring, so routing, startup, Subscriptions, and the
  Module derive from one list.
- [Design note](../../docs/design/bundle-DESIGN.md) and
  [DX plan](../../docs/design/bundle-DX-PLAN.md).
