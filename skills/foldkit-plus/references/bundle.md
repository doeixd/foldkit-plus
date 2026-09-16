# foldkit-bundle

Packages a Foldkit **Submodel once** (Model, Message, init, update,
Subscriptions, Managed Resources, view, helpers) and places it in a parent.
Placing compiles each part to Foldkit's own lift (`foldChildStep`,
`Subscription.lift`, `ManagedResource.lift`, `h.submodel`). It adds no store,
reducer, or runtime.

```text
Bundle (what) + Link (where) = Placed (the parts, lifted into the parent)
```

## Ownership

| State | Owner | Package |
| --- | --- | --- |
| A reusable child machine's slice, placed once or per key | the parent Model | `foldkit-bundle` places it |
| Who owns each placed path, checked against Sync and Remote | the application's Module | `foldkit-bundle-surface` |
| A one-off child used in one place | the parent Model | a hand-wired Submodel is fine |
| A one-shot effect or a DOM attachment | none | a Command or a Mount, not a Bundle |

The bundle holds no state. The child's Model is a field of the parent Model, its
Messages are a variant of the parent Message, and every transition goes through
the parent's `update`.

## Minimal example

```ts
import { Schema, Stream } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import { Bundle } from 'foldkit-bundle'

declare const matchMediaChanges: (query: string) => Stream.Stream<boolean>

const MediaQueryModel = Schema.Struct({ matches: Schema.Boolean })
type MediaQueryModel = typeof MediaQueryModel.Type
const MediaQueryMessage = defineMessageUnion({ Changed: { matches: Schema.Boolean } })
type MediaQueryMessage = typeof MediaQueryMessage.Type

// Define once. `args` is a Schema, so init, update, and subscriptions need no annotations.
const MediaQuery = Bundle.make('MediaQuery', {
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

// Declare where it lives: a Model field and a GotDarkMessage variant each.
const Dark = Bundle.declare(MediaQuery, 'dark')
const Narrow = Bundle.declare(MediaQuery, 'narrow')

const Model = Schema.Struct({ ...Dark.fields, ...Narrow.fields, helpOpen: Schema.Boolean })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Dark.cases, ...Narrow.cases, ClickedHelp: {} })
type Message = typeof Message.Type

// Place through the parent scope: no type arguments anywhere.
const Page = Bundle.parent({ Model, Message })
const placements = Page.assemble(
  Page.at(Dark, { args: { query: '(prefers-color-scheme: dark)' } }),
  Page.at(Narrow, { args: { query: '(max-width: 40rem)' } }),
)

declare const view: (model: Model, h: HtmlBuilder<Message>) => Html

// `complete` returns the config unchanged; it exists to report wiring mistakes.
export const config = placements.complete({
  init: () => placements.initial({ helpOpen: false }),
  update: placements.update((model, message) =>
    message._tag === 'ClickedHelp' ? { model: { ...model, helpOpen: true } } : { model },
  ),
  view,
  subscriptions: placements.subscriptions(),
})
```

Spread `config` into `Runtime.makeApplication` or `Runtime.makeElement`.

## Common tasks

- **Initial Model:** `placements.initial(rest)` takes exactly the fields no
  placement owns; each placement's `init` writes its own slice, and collections
  start empty.
- **Parent update:** `placements.update(own)` routes placement Messages and
  passes the rest to `own`. Name the parent's services once:
  `Page.withServices<AppServices>()`.
- **OutMessage:** a bundle whose `update` returns `outMessage` must be placed
  with `onOut: outMessage => model => ({ model: … })` (typed from the scope), or
  `onOut: Bundle.ignore` to drop it deliberately. Omitting it is a type error.
- **Presets:** `MediaQuery.with({ query })` binds args; place it with no `args`.
  `Page.place(bundle, 'field', config)` places without a separate `declare`.
- **Helpers:** `helpers: { reset: (model: CounterModel, to: number) => ({ model }) }` become
  `placed.helpers.reset(to)`, an `Update.Step` of the parent.
- **Views:** `placed.view(model, h, viewInputs?)` renders through `h.submodel`
  (nothing while the child is absent); `placed.viewIn('mobile')` renders the same
  placement in a second position.
- **Gates:** `Page.at(Dark, { …, when: model => model.open })`; for a collection,
  `when: (model, key) => …`.
- **Many of one:** `const Rows = Bundle.declareEach(Row, 'rows')`, spread
  `Rows.fields` and `Rows.cases`, then `Page.each(Rows, config)`. Use
  `placed.add(key, model => ({ ...model, id: key }))` (an item cannot see its key)
  and `placed.remove(key)`.
- **Typed keys and order:** `Link.keyedWrapper(tag, Message, UploadId)` with
  `Page.link.collectionById('uploads', wrapper, { id: item => item.id })`, then
  `Upload.each(link, config)`: keys are `UploadId`, and order follows the array.
- **Extending:** `Counter.pipe(Bundle.rename('Clicks'), Bundle.mapUpdate(update =>
  (model, message, args) => …), Bundle.withHelpers({ … }))`; also `mapInit`,
  `mapView`, `withSubscriptions`.
- **Nested or custom placement:** `bundle.at(Page.link.field('a', wrapper).pipe(
  Link.andThen(inner), Link.when(gate)), config)`; `Page.link.optional` for an
  `Option` field.
- **@foldkit/ui components:** `Bundle.fromParts('Tabs', { Model: Tabs.Model,
  Message: Tabs.Message, init: (config: Tabs.InitConfig) => Tabs.init(config),
  parts: Tabs.create<Value>() })`.
- **Module ownership:** `const Page = BundleSurface.parent(App)` from
  `foldkit-bundle-surface`, then
  `Module.validate(Page.module(placements, [otherContracts]))`.

## Gotchas

- `placements.complete` reports, at the wrong property: an `update` that does not
  accept the whole parent Message (`update`), `subscriptions` not from
  `placements.subscriptions(own)`, and `managedResources` not from
  `placements.resources(own)` when a placement has resources. `Page.at` reports a
  wrong field or a missing wrapper variant at the placement.
- `assemble` throws at startup when two placements share a key, a wrapper, or a
  Managed Resource tag, and `placements.resources(own)` when the parent's own
  resource shares a placement's tag.
- **Managed Resources are provided by tag.** Two placements of one bundle with
  the same `ManagedResource.tag` would replace each other; `assemble` throws.
  Make the bundle from a function that takes the tag. `each` rejects bundles
  with resources.
- Collection Subscriptions restart for every item when any item is added,
  removed, or changes dependencies (unless the child entry keeps alive).
- A `Record` collection orders integer-like keys first; use `collectionById`.
- A Foldkit Subscription fiber does not replay a Model change made before it
  attached; in runtime tests, wait for a stream to run before changing the Model.
- Exporting a `fromParts` bundle of a `@foldkit/ui` component can fail
  declaration emit with TS2742; keep it unexported. The same happens when
  exporting `Tabs.create()` itself.

More: https://github.com/doeixd/foldkit-plus/tree/main/packages/bundle and the
example https://github.com/doeixd/foldkit-plus/tree/main/examples/bundle
