# foldkit-bundle

Packages a Foldkit **Submodel once** (Model, Message, init, update,
Subscriptions, Managed Resources, view, helpers) and places it in a parent with
one Link. Placing compiles each part to Foldkit's own lift (`foldChildStep`,
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
import { Option, Schema, Stream } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import { Bundle, Link } from 'foldkit-bundle'

declare const matchMediaChanges: (query: string) => Stream.Stream<boolean>

const MediaQueryModel = Schema.Struct({ matches: Schema.Boolean })
type MediaQueryModel = typeof MediaQueryModel.Type
const MediaQueryMessage = defineMessageUnion({ Changed: { matches: Schema.Boolean } })
type MediaQueryMessage = typeof MediaQueryMessage.Type

const MediaQuery = Bundle.make('MediaQuery', {
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

// One wrapper variant per placement; its `cases` go into the parent Message.
const GotDarkMessage = Link.wrapper('GotDarkMessage', MediaQueryMessage)
const GotNarrowMessage = Link.wrapper('GotNarrowMessage', MediaQueryMessage)

const Model = Schema.Struct({ dark: MediaQueryModel, narrow: MediaQueryModel })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...GotDarkMessage.cases, ...GotNarrowMessage.cases })
type Message = typeof Message.Type

const Dark = MediaQuery.at(Link.field<Model>()('dark', GotDarkMessage), {
  args: { query: '(prefers-color-scheme: dark)' },
})
const Narrow = MediaQuery.at(Link.field<Model>()('narrow', GotNarrowMessage), {
  args: { query: '(max-width: 40rem)' },
})
const placements = Bundle.assemble<Model, Message>()([Dark, Narrow])

// `complete` returns the config unchanged; it exists to report wiring mistakes.
export const config = placements.complete({
  init: () => placements.init({ dark: { matches: false }, narrow: { matches: false } }),
  update: placements.update(),
  view: (model: Model, h: HtmlBuilder<Message>) => h.p([], [model.dark.matches ? 'dark' : 'light']),
  subscriptions: placements.subscriptions(),
})
```

Spread `config` into `Runtime.makeApplication` or `Runtime.makeElement`.

## Common tasks

- **Less wiring:** `const Dark = Bundle.declare(MediaQuery, 'dark')` gives
  `Dark.fields` and `Dark.cases` to spread into the parent Model and Message
  (wrapper `GotDarkMessage`), then `Dark.at<Model>()(config)`.
  `Bundle.declareEach(Row, 'rows')` does the same with `each<Model>()`. Use
  `Link.field` directly for a `when` gate or a nested path.
- **OutMessage:** a bundle whose `update` returns `outMessage` must be placed
  with `onOut: outMessage => model => ({ model: … })`, or `onOut: Bundle.ignore`
  to drop it deliberately. It is a type error to omit it.
- **Parent update:** `update: placements.update(ownUpdate)` routes placement
  Messages and passes the rest to `ownUpdate`. Name the parent's services once:
  `Bundle.assemble<Model, Message, AppServices>()`.
- **Args:** `init` may take args; `update` receives them as a third parameter.
  `args` is required in the placement config exactly when `init` takes them.
- **Helpers:** `helpers: { open: (model, …input) => ({ model }) }` become
  `placed.helpers.open(…input)`, an `Update.Step` of the parent.
- **Views:** `placed.view(model, h, viewInputs?)` renders through `h.submodel`
  (nothing while the child is absent). Use `placed.viewIn('mobile')` to render
  the same placement in a second position.
- **Optional or nested child:** `Link.optional<Model>()('field', wrapper)` for
  an `Option` field; `Link.compose(outer, inner)` for a child inside a child.
- **Many of one:** `Link.keyedWrapper(tag, ChildMessage)` and
  `bundle.each(Link.collection<Model>()('rows', wrapper), config)`. Use
  `Rows.add(key, model => ({ ...model, id: key }))` (an item cannot see its key)
  and `Rows.remove(key)`. Collections join the same `assemble` list.
- **@foldkit/ui components:** `Bundle.fromParts({ name, Model: Tabs.Model,
  Message: Tabs.Message, init: config => Tabs.init(config), parts:
  Tabs.create<Value>() })`.
- **Module ownership:** `BundleSurface.module(App, placements, [otherContracts])`
  from `foldkit-bundle-surface`, then `Module.validate`. Build a Link from a field
  ref with `BundleSurface.link(App.model.search, wrapper)`.

## Gotchas

- `placements.complete` reports, at the wrong property: a parent Message missing
  a wrapper variant (`update`), `subscriptions` not from
  `placements.subscriptions(own)`, and `managedResources` not from
  `placements.resources(own)` when a placement has resources.
- **Managed Resources are provided by tag.** Two placements of one bundle with
  the same `ManagedResource.tag` would replace each other; `assemble` throws.
  Make the bundle from a function that takes the tag. `each` rejects bundles
  with resources.
- `placements.init` writes each child's own initial Model, replacing what the
  parent passed for that slice.
- Collection Subscriptions restart for every item when any item is added,
  removed, or changes dependencies (unless the child entry keeps alive).
- A Foldkit Subscription fiber does not replay a Model change made before it
  attached; in runtime tests, wait for a stream to run before changing the Model.
- Exporting a `fromParts` bundle of a `@foldkit/ui` component can fail
  declaration emit with TS2742; keep it unexported. The same happens when
  exporting `Tabs.create()` itself.

More: https://github.com/doeixd/foldkit-plus/tree/main/packages/bundle and the
example https://github.com/doeixd/foldkit-plus/tree/main/examples/bundle
