# `foldkit-bundle-surface`

Reusable [`foldkit-bundle`](../bundle) widgets read and update a slice of your parent `Model` through `update`. Without registering those placements in [`foldkit-surface`](../surface), `Module.validate` cannot catch two widgets colliding on the same Model path or overwriting a field already owned by `foldkit-sync` or `foldkit-remote`.

`foldkit-bundle-surface` generates a Surface ownership contract for each Bundle placement (`bundle:Search@search`) so `Module.validate` checks every placement, Sync projection, and Remote store together.

## Install

```bash
pnpm add foldkit-bundle-surface foldkit-bundle foldkit-surface effect foldkit
```

## A first validated module

Wrap your `Surface.application` with `BundleSurface.parent`, place a Bundle, and pass the placements to `Page.module` before calling `Module.validate`:

```ts
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { BundleSurface } from 'foldkit-bundle-surface'
import { Module, Surface } from 'foldkit-surface'

const Search = Bundle.make('Search', {
  Model: Schema.Struct({ query: Schema.String }),
  Message: defineMessageUnion({ Typed: { query: Schema.String } }),
  init: () => ({ model: { query: '' } }),
  update: (_model, message) => ({ model: { query: message.query } }),
})
const Searchbox = Bundle.declare(Search, 'search')
const Model = Schema.Struct({ ...Searchbox.fields })
const Message = defineMessageUnion({ ...Searchbox.cases })
const App = Surface.application({ Model, Message })
const Page = BundleSurface.parent(App)
const placements = Page.assemble(Page.at(Searchbox))

const AppModule = Page.module(placements, [])
Module.validate(AppModule) // []
```

`AppModule` now records `bundle:Search@search` as the sole owner of `search`, and `Module.validate(AppModule)` returns `[]` (no conflicts) purely from inspecting declarations. Rendering a Surface over `search` observes that single owner, and `Module.manifest` and `Module.toMarkdown` include every placed Bundle.

Available helpers:

- **`BundleSurface.parent(app)`**: Creates a `Bundle.parent` bound to `app` with `.module(assembly, items)`.
- **`Page.module(assembly, items)`** / **`BundleSurface.module(app, assembly, items)`**: Converts each placement into a contract, keeps any wiring contracts, and appends your other Module items.
- **`BundleSurface.contract(app, placement)`**: Builds a single contract for `Module.make` or `Module.add`, recording the owned path, parent Message tags, and `args` metadata when the Bundle declares args.
- **`BundleSurface.link(fieldRef, wrapper)`**: Builds a `Link` over a `foldkit-surface` field ref for custom placements.

## What `Module.validate` catches

| Mistake | Finding |
| --- | --- |
| Two placements or a placement + Sync/Remote on one path | `ownership-overlap` |
| Placement using another application's field ref | `foreign-contract` |
| Wrapper Message missing from the parent `Message` union | `unknown-message` |
| Link path absent from the parent `Model` | `unknown-path` |

## Read a placement with Projections and Mirrors

Because a placement's state lives in the parent `Model`, its slice is already a ref on `App.model` (`App.model.search`, or `ModelRef.focus(App.model.search).select(projection)`). Sub-fields like `App.model.search.query` are addressable when the Model declares the slice as a Struct (such as with `Link.wrapper`), whereas `Bundle.declare` keeps the slice opaque at `App.model.search`.

With Struct-backed slices (`search` and `filter`), you can attach separate `Mirror.url` configs directly to their nested fields:

<!-- docs-check standalone
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Link } from 'foldkit-bundle'
import { Surface } from 'foldkit-surface'
const SearchModel = Schema.Struct({ query: Schema.String })
const SearchMessage = defineMessageUnion({ Typed: { query: Schema.String } })
const GotSearchMessage = Link.wrapper('GotSearchMessage', SearchMessage)
const GotFilterMessage = Link.wrapper('GotFilterMessage', SearchMessage)
const Model = Schema.Struct({ search: SearchModel, filter: SearchModel })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...GotSearchMessage.cases, ...GotFilterMessage.cases })
const initial: Model = { search: { query: '' }, filter: { query: '' } }
const App = Surface.application({ Model, Message, initial, update: model => ({ model }) })
-->
```ts
import { Mirror } from 'foldkit-mirror'

const SearchUrl = Mirror.url(App, {
  name: 'search',
  fields: [App.model.search.query],
  keys: { query: { key: 'search.q' } },
})
const FilterUrl = Mirror.url(App, {
  name: 'filter',
  fields: [App.model.filter.query],
  keys: { query: { key: 'filter.q' } },
})
```

## Why placements are not re-rooted Surfaces

A `Surface` lists parent Message constructors, and an agent adapter exposes one capability per constructor. Because every Message from a placement travels wrapped inside one parent variant (such as `GotSearchMessage({ message })`), a re-rooted Surface could only expose that single wrapper rather than individual child Messages. Declare a parent Surface over the placement's fields and list its wrapper variant in `messages` until Surface and Agent support wrapped child variants.

## Limits

- A `Link` built via `Link.andThen` or `Link.compose` from a ref-built Link attributes ownership to the application passed to `contract` rather than the ref's application.
- Surfaces cannot expose a placement's individual child Messages separately from its parent wrapper variant.

## Next

- Build and place reusable widgets: [`foldkit-bundle`](../bundle)
- Define feature Surfaces and Modules: [`foldkit-surface`](../surface)
- Compare Bundles and Surfaces: [Surface and Bundle](../../docs/surface-vs-bundles.md)
