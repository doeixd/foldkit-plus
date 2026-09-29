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
| A one-off child used in a single place, such as a `@foldkit/ui` component | a hand-wired Submodel, with a [Link as its fold's lens](#a-link-without-a-bundle-updatefoldchild) |
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

## Sixty seconds: one counter

```ts
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'

const CountModel = Schema.Struct({ count: Schema.Number })
const CountMessage = defineMessageUnion({ Incremented: {} })
const Count = Bundle.make('Count', {
  Model: CountModel,
  Message: CountMessage,
  init: () => ({ model: { count: 0 } }),
  update: model => ({ model: { count: model.count + 1 } }),
})

const Page = Bundle.compose({ greeting: Schema.String }).pipe(Bundle.withChild('clicks', Count))
type Model = typeof Page.Model.Type
type Message = typeof Page.Message.Type
const { placements } = Page

const config = placements.complete({
  init: () => placements.initial({ greeting: 'Hello' }),
  update: placements.update(model => ({ model })),
  subscriptions: placements.subscriptions(),
  view: (model: Model, h: HtmlBuilder<Message>) =>
    h.button(
      [h.OnClick(Page.Message.GotClicksMessage({ message: CountMessage.Incremented() }))],
      [`${model.greeting}: ${model.clicks.count}`],
    ),
})
```

`Count` describes a child machine. `Page` is the parent: its own field,
`greeting`, and `Count` placed under `clicks`. From that one declaration it
derives the parent's Model, `{ greeting, clicks }`, its Message union, with the
wrapper `GotClicksMessage`, and the assembly that routes that wrapper to the
child and writes its next value back into `model.clicks`. A click changes 0 to
1 through the parent's update; no additional store is created.

`config` supplies `init`, `update`, and `view` to your Foldkit runtime. These
declarations do not mount anything. For a runnable assembly, see
[the settings example](../../examples/bundle/README.md).

## Composing a parent

`Bundle.compose` states a parent once: its own fields, as `Schema.Struct`
takes them, and then, through `pipe`, its own Messages and the bundles it
places.

```ts
const App = Bundle.compose({ greeting: Schema.String }).pipe(
  Bundle.withMessages({ ClickedReset: {} }),
  Bundle.withChild('hello', HelloForm, {
    onOut: out => model => ({ model: { ...model, greeting: `Hello, ${out.name}!` } }),
  }),
)
```

| Step | What it adds |
| --- | --- |
| `Bundle.compose(fields)` | the parent's own Model fields |
| `Bundle.withMessages(cases)` | the parent's own Message cases, as `defineMessageUnion` takes them |
| `Bundle.withChild(field, bundle, config?)` | the bundle under `field`, and its wrapper `Got<Field>Message` |
| `Bundle.withEach(field, bundle, config?)` | the bundle once per key of a record under `field` |
| `Bundle.withWiring(...wirings)` | an integration's wiring (Remote, Mirror, Sync, Agent) |
| `Bundle.withServices<S>()` | the services the parent's own `update` may require |
| `Bundle.configure(field, config)` | the config of a child added without one |

The result has `App.Model` and `App.Message`, the Schemas to give
`Surface.application` or the runtime; `App.children.hello`, the placement, with
its `view` and `helpers`; and `App.placements`, the assembly, with `initial`,
`update`, `subscriptions` and `complete`. The config of `withChild` and
`withEach` is what `Page.at` and `Page.each` take below: `args` when the bundle
has them, `onOut` when it has an OutMessage, and `key` or `when`.

Each step is typed by the parent as it is at that step. An `onOut` sees the
parent's own fields and every child placed so far, so a mistake is reported
where it is written, and a child can read an earlier one. Write its result from
the Model it is given, spreading it or through `modifyFields`, so the fields of
children placed later are kept. A field or a Message case given twice is
refused: in the types for a field, and when the composition is built for both.

A wiring is usually made from the parent's own Model, through a Surface
application and a Remote domain built from `App.Model`, so it joins in a
second `pipe` once those exist:

```ts
const Wired = App.pipe(Bundle.withWiring(Data.wiring({ board: BoardSurface })))
```

A child's config can be made from the parent too: a Crud editor's `onOut` comes
from `Editor.at({ data, model: App.model.editor })`, which needs the Surface
application built from this very Model. Add such a child without its config,
build what needs the Model, and give the config with `Bundle.configure`:

```ts
const Base = Bundle.compose({ greeting: Schema.String }).pipe(Bundle.withChild('hello', HelloForm))
const greet =
  (out: typeof Greeted.Type) =>
  (model: typeof Base.Model.Type) => ({ model: { ...model, greeting: `Hello, ${out.name}!` } })
const Page = Base.pipe(Bundle.configure('hello', { onOut: greet }))
```

`Base.Model` and `Base.Message` exist at once, for `Surface.application`.
`children` and `placements` do not until every child that needs `args` or an
`onOut` has them: reading either earlier is a type error naming the children
still waiting. `configure` is typed by the child it configures, and refuses a
field that is not a child or one given its config already.

### What it builds, and when to build it by hand

`compose` is sugar over the primitives below, and produces the same values.
The counter above, by hand:

```ts
const Clicks = Bundle.declare(Count, 'clicks')
const Model = Schema.Struct({ greeting: Schema.String, ...Clicks.fields })
const Message = defineMessageUnion({ ...Clicks.cases })
const Page = Bundle.parent({ Model, Message })
const placements = Page.assemble(Page.at(Clicks))
```

Use the primitives when the parent's Model and Message already exist
elsewhere, when a placement needs a custom Link (a nested path, an `Option`
field, a gate on the Link), or when a declaration is shared between modules.
The rest of this README uses them, because each step there is one idea.

## Adding subscriptions: one media query, placed twice

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

**Wire it once.** The assembly builds the parent's runtime config from the
parent's own pieces. `initial` gives exactly the fields no placement owns,
`update` is the parent's own update for `ClickedHelp`, and everything else
(`Model`, `view`, ...) passes through:

```ts
const config = placements.config({
  Model,
  initial: { helpOpen: false },
  update: ownUpdate,
  view,
})
```

Spread `config` into `Runtime.makeApplication` or `Runtime.makeElement` with the
rest of your options. The parent's own Subscriptions go in `subscriptions` and
its own Managed Resources in `managedResources`; the assembly merges them with
the items'. For a custom `init` or a URL-mirror assembly, use the lower-level
derivations with `placements.complete` instead (below).

### What each call does

- **`Bundle.make(name, spec)`** only collects the parts. It runs nothing and
  holds no state. `Bundle.make({ name, ...spec })` is the same.
- **`Bundle.compose(fields).pipe(...)`** does the next four steps from one
  declaration; see [Composing a parent](#composing-a-parent).
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
  in list order. A placement whose `args` is a factory derives it from the
  base seed first (below). A placement's field may be given only when it holds an
  `Option` (below), to start the child as `None`. The check reads each
  placement's field from its Link; one whose path the types cannot read, a
  `Link.make` given a `string[]`, relaxes `rest` to `Partial<Model>`.
- **`placements.config(input)`** is the assembled runtime config for
  `Runtime.makeApplication` or `makeElement`: `initial` rest becomes `init`,
  the own `update`, `subscriptions`, and `managedResources` merge with the
  items', and everything else passes through. Calling it on an assembly that
  reads the URL is a type error and throws at runtime; that stays on the
  derivations with `complete`.
- **`placements.runtime(input)`** is the same assembled runtime config for an
  application whose `update` already routes every placement: `initial` rest
  becomes `init`, or an init function returning `assembly.initial(...)` is
  used as `init` when the seed needs runtime input, like the URL. The `update`
  passes through checked; the own `subscriptions` and `managedResources`
  merge with the items', defaulting to the items', so an application that adds
  none passes neither. Assemblies that read the URL pass their `url` from
  `assembly.url`, as with `complete`.
- **`placements.update(own)`** is the parent's update: a placement's or
  wiring's Message goes to its item and every other Message to `own`, whose
  Message is typed without the placements' wrappers (see
  [Reacting to a child's Messages](#reacting-to-a-childs-messages)). A tag
  wirings declare `shared` goes to each of them in list order and then to
  `own`, so URL mirrors and the application's routing all see `UrlChanged`.
  Without `own` they leave the Model unchanged.
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
| `placed.init` | `Update.Step`: writes the child's initial Model and lifts its Commands | `Update.foldChildInit` |
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

### Derived args: `args` from the parent seed

`args` is a static value or a factory from the parent seed: the fields
`assembly.initial(rest)` was given, before any placement initialised. A child
whose initial state depends on what only the parent knows at startup — the
route, the authenticated user, the workspace — derives it instead of taking a
fixed value:

```ts
const people = Page.at(PeopleDeclared, {
  args: parent => ({
    searchText: searchFromRoute(parent.route),
  }),
})

assembly.initial({ route: urlToAppRoute(url) })
```

The factory's parameter omits the placement's own field, so reading it is a
type error. Read only seed fields, never sibling placement fields: every
factory sees the same base seed, so placement order never matters. The result
is checked against the bundle's args Schema, naming the placement, then
retained for `update`, helpers, Subscriptions, and resources. It never re-runs
against live state, so keep it pure of its seed; `assembly.config({
initial })` derives the same way. A factory on an optional child is skipped
when `rest` starts the child as `None`.

## Reacting to a child's Messages

An OutMessage is what a child chooses to tell its parent. Sometimes the parent
must react to what the child received instead: a socket's `Opened` or
`Failed`, a media query's change. `onMessage` in the placement config sees each
of the child's Messages as a Step of the parent, after the child has handled it
and after its `onOut`:

```ts
const Observed = Page.assemble(
  Page.at(Dark, { args: { query: '(prefers-color-scheme: dark)' } }),
  Page.at(Narrow, {
    args: { query: '(max-width: 40rem)' },
    // Help closes when the window becomes narrow.
    onMessage:
      ({ matches }) =>
      model => ({ model: matches ? { ...model, helpOpen: false } : model }),
  }),
)
```

It observes; the child still owns its own transition, and a helper, which is
not a Message, does not reach it. A collection's `onMessage` also receives the
item's key.

The parent's own update, given to `placements.update(own)`, never receives a
placement's wrapper: the placement takes it. Its Message is typed that way, as
`Bundle.OwnMessage<Message, typeof placements.placements>`, so an exhaustive
match over it needs no arm for `GotDarkMessage`. Match it with Effect's
`Match.valueTags`, which is exhaustive over the union it is given; a union's
own `Message.match` asks for every variant of the whole union.

```ts
type OwnMessage = Bundle.OwnMessage<Message, typeof Observed.placements>

const updateOwn = (model: Model, message: OwnMessage) =>
  Match.valueTags(message, {
    ClickedHelp: () => ({ model: { ...model, helpOpen: true } }),
  })

Observed.update(updateOwn)
```

A wiring's tags are strings at runtime, so a Message a wiring claims still
appears in `OwnMessage`.

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
must be unique, and an item is stored under its own id: give `add` a `prepare`
that sets the id to the key, as below, and keep it through `update`. Writing an
item whose id is not its key throws, since it could never be read back.

```ts
const RowId = Schema.String.pipe(Schema.brand('RowId'))
const GotOrderedRowMessage = Link.keyedWrapper('GotOrderedRowMessage', RowMessage, RowId)

// OrderedRow is a bundle whose Model has `id: RowId`; OrderedPage's Model has `rows: Array<…>`.
const OrderedRows = OrderedRow.each(
  OrderedPage.link.collectionById('rows', GotOrderedRowMessage, { id: row => row.id }),
)
OrderedRows.add(RowId.make('first'), row => ({ ...row, id: RowId.make('first') }))
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
`Bundle.fromParts` takes them as they are. A bundle's `init` returns a Model and
Commands and never an OutMessage; a component whose open state needs Commands,
such as `Dialog.boot` since `@foldkit/ui` 0.161, runs `boot` inside `init` and
returns its Model and Commands from there.

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

## A Link without a Bundle: `Update.foldChild`

A page with a dozen `@foldkit/ui` components rarely wants a Bundle for each:
each is one field, one `Got*Message` variant, and one line in `update`. Foldkit's
`Update.foldChild` already folds such a child, given where it lives: `read`,
`write` and `toParentMessage`. A Link is exactly those three, so spread one in
and give the component's `update`:

```ts
import * as Tabs from '@foldkit/ui/tabs'

const Section = Schema.Literals(['general', 'billing'])
type Section = typeof Section.Type
const SectionTabs = Tabs.create<Section>()

const Model = Schema.Struct({ tabs: Tabs.Model, section: Section })
type Model = typeof Model.Type
const Message = defineMessageUnion({ GotTabsMessage: { message: Tabs.Message }, Saved: {} })
type Message = typeof Message.Type

const tabs = Link.field<Model>()('tabs', Link.wrapper(Message.GotTabsMessage))

const foldTabs = Update.foldChild({
  ...tabs,
  update: SectionTabs.update,
  foldOutMessage: Tabs.OutMessage.match<Update.Step<Model, Message>, Tabs.OutMessage<Section>>({
    Selected:
      ({ value }) =>
      model => ({ model: { ...model, section: value } }),
  }),
})

const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    GotTabsMessage: ({ message }) => foldTabs(model, message),
    Saved: () => ({ model }),
  })
```

- **`Link.wrapper(Message.GotTabsMessage)`** builds the wrapper from a variant
  the parent's union already declares, so the tag is written once. A variant
  with fields beside `message` is refused, since a wrapped Message would lack
  them.
- **The same Link serves every entry point:** `Update.foldChildStep({ ...link,
  update: Dialog.open, foldOutMessage })` for one that takes no Message, and
  `link.toParentMessage` for the view's `h.submodel` and `Subscription.lift`.
  Its init folds through `Link.foldInit`, since init has no parent yet to read:

```ts
const init = (): Update.Return<Model, Message> =>
  Update.foldChildInit(
    { model: Tabs.init({ id: 'sections' }) },
    Link.foldInit(tabs, { section: 'general' }),
  )
```
- **An ignored Message leaves the parent as it was.** `foldChild` writes the
  child back even when its update returned the child it was given; the writes
  of `Link.field` and `Link.optional` then return the parent itself, so the
  page does not redraw. A `write` given to `Link.make` copies as written;
  placements guard it, `foldChild` does not.

Nothing here is placed: there is no `placements.update` routing, and the
component's Subscriptions are lifted by hand. When a component is placed in
several parents, or its Subscriptions are the part that gets forgotten, make it
a Bundle with `Bundle.fromParts` above.
[`test/foldChild.test.ts`](test/foldChild.test.ts) runs this example, and
[`examples/foldkit-ui-showcase`](../../examples/foldkit-ui-showcase) folds its
thirty-eight components this way.

## Bodies that load on demand: `Bundle.lazy`

A bundle's declaration is what the parent Schema and the boot need: `Model`,
`Message`, `args`, `init`, and the `subscriptions`, `resources` and `helpers`
Foldkit wires at boot. Its `update` and `view` can live in a chunk that loads
on the first Message inside the bundle:

```ts
const Upload = Bundle.lazy(
  {
    name: 'Upload',
    Model: UploadModel,
    Message: UploadMessage,
    init: () => ({ model: { name: '', percent: 0 } }),
    // Shown until the bodies load. Its handlers are what ask for them.
    while: Submodel.defineView<UploadModel, UploadMessage>((model, h) =>
      h.li([h.OnClick(UploadMessage.Progressed({ percent: 0 }))], [model.name]),
    ),
  },
  () => import('./upload.js').then(chunk => chunk.body),
)
```

The chunk exports a `Bundle.Body`, the `update` and the `view`:

```ts
export const body: Bundle.Body<UploadModel, UploadMessage, void, never, never, void> = {
  update: (model, message) => ({ model: { ...model, percent: message.percent } }),
  view: Submodel.defineView<UploadModel, UploadMessage>((model, h) =>
    h.li([], [`${model.name} ${model.percent}%`]),
  ),
}
```

Until the bodies load, a Message reaching `update` leaves the Model as it is
and returns one Command, which loads them and yields the same Message again,
so nothing is lost and the Model ends where an eager bundle's would; the view
renders `while`, or nothing. `Upload.load()` loads them ahead of time, once,
and `Upload.isLoaded()` says whether they have. A load that fails is
forgotten, so the next Message or `load()` tries again. Placed, extended or
preset with `with`, the bundle stays lazy.

A Message that arrives before the bodies load passes through `update` twice:
once as the no-op that starts the load, and again when the load re-yields it.
The bundle's own Model ends where an eager bundle's would. Two things see both
passes: a `Bundle.mapUpdate` wrapper around the bundle, and anything that
replays recorded Messages through `update` after the load, such as Foldkit
DevTools time travel, which then applies that Message twice. Load the bodies
before the first interaction, as `foldkit-ssr` does before boot, or with
`load()` when the page is idle, and no Message arrives early. `subscriptions`, `resources` and
`helpers` stay in the declaration because Foldkit starts the first two at
boot and a helper runs synchronously; none can wait for a chunk.
[`test/lazy.test.ts`](test/lazy.test.ts) runs this on the Foldkit runtime.
`foldkit-ssr` loads every lazy bundle in a page's `lazy` list before it
renders or boots, so a server-rendered page never shows `while`.

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
build the parent variants a Link carries; `Link.wrapper(Message.GotXMessage)`
takes one the parent's union already declares. When `rest` gives a placement's
top-level field, `placements.initial` keeps that value and skips its `init`, so
an optional child can start as `None`. A nested placement is always initialised,
inside whatever `rest` gave, and outer placements initialise before nested ones.
A `Link.make` whose `path` is one literal segment, `path: ['sidebar']`, names
that top-level field to `initial`, as `field` and `optional` do.

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

`placements.runtime(input)` checks the same mistakes it can still make —
`update`, an unbranded init function, and `url` — and derives the rest:
`subscriptions` and `managedResources` default to the items', so an
application that adds none passes neither. Prefer it wherever the `update`
already routes every placement; keep `complete` for configs assembled by
hand, and `config` where the parent's own update still needs routing.

**Annotate the parameters of callbacks written inline in the config.**
`makeApplication`'s `init: (url: Url) => …` and `routing.onUrlChange: (url: Url)
=> …` need their types written. TypeScript does not infer from an object literal
holding an unannotated callback until it has typed that callback, and the
runtime's config is overloaded, so nothing types it through `complete`: the
config falls back to what `complete` requires of any config, and every check
fails, beginning with `update`'s. The `update` error says so.

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
