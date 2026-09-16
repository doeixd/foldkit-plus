# `foldkit-bundle-surface`

Puts [`foldkit-bundle`](../bundle) placements into a
[`foldkit-surface`](../surface) Module, so **each placement is an owner of its
Model path**, checked against every other owner.

A placement changes one slice of the parent Model through the parent's
`update`. That makes it an owner in the same sense as a Sync projection or a
Remote store. `Module.validate` already reports two owners of one path; this
package gives placements a contract so the check includes them.

```text
Search.at(link to model.search)  ->  contract bundle:Search@search  owns search
TodoSync                         ->  contract sync:Todos            owns todos
Module.validate                  ->  no overlap, every path and Message declared
```

## Install

```bash
pnpm add foldkit-bundle-surface foldkit-bundle foldkit-surface effect foldkit
```

## Sixty seconds

```ts
// Search and Row are bundles, Todo a Schema, and TodoSync the application's Sync contract.
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { BundleSurface } from 'foldkit-bundle-surface'
import { Module, Surface } from 'foldkit-surface'

const Searchbox = Bundle.declare(Search, 'search')
const Rows = Bundle.declareEach(Row, 'rows')

const Model = Schema.Struct({ ...Searchbox.fields, ...Rows.fields, todos: Schema.Array(Todo) })
const Message = defineMessageUnion({ ...Searchbox.cases, ...Rows.cases })
const App = Surface.application({ Model, Message })

const Page = BundleSurface.parent(App)
const placements = Page.assemble(Page.at(Searchbox), Page.each(Rows))

const AppModule = Page.module(placements, [TodoSync])
Module.validate(AppModule) // []
```

- **`BundleSurface.parent(app)`** is `Bundle.parent` built from the application's
  own Model and Message, with `module` bound to that application.
- **`Page.module(assembly, items)`** makes one `bundle` contract per placement and
  adds your other contracts. It performs no I/O.
- **`BundleSurface.contract(app, placement)`** is one contract, for
  `Module.make` or `Module.add`. It owns the placement's path, names the parent
  Message tags its Messages travel under, and lists its args as `args`
  metadata when the bundle has an args Schema or is a `bundle.with` preset.
- **`BundleSurface.link(fieldRef, wrapper)`** is `Link.make` over a Surface field
  ref, for a custom placement. Its contract names the ref's application.
- **`BundleSurface.module(app, assembly, items)`** is `Page.module` without a
  scope.

## What the existing rules catch

| Mistake | Finding |
| --- | --- |
| Two placements on one path, or a placement on a path Sync or Remote owns | `ownership-overlap` |
| A placement through another application's field ref | `foreign-contract` |
| A wrapper variant missing from the application's Message | `unknown-message` |
| A placement's Link path that is not a Model field | `unknown-path` |

`Module.manifest` and `Module.toMarkdown` list each placement as the owner of
its path.

## Reading a placement: projections and Mirrors

A placement's state is part of the parent Model, so its fields are already in
the application's ref tree. Observing one needs no bundle API:
`App.fields.search.query`, `App.fields.search.select(projection)`.

To mirror two placements of one bundle, give each mirror its own keys:

```ts
const SearchUrl = Mirror.url(App, {
  name: 'search',
  fields: [App.fields.search.query],
  keys: { query: { key: 'search.q' } },
})
const FilterUrl = Mirror.url(App, {
  name: 'filter',
  fields: [App.fields.filter.query],
  keys: { query: { key: 'filter.q' } },
})
```

[`test/mirror.test.ts`](test/mirror.test.ts) writes and reads both.

## Why placements are not re-rooted Surfaces

A Surface names the Messages a feature may cause by their parent constructors,
and an agent adapter exposes one capability per constructor. Every Message of a
placement travels under one wrapper variant, `GotSearchMessage({ message })`,
so a re-rooted Surface could only offer that single variant, not the child's
individual Messages. Exposing a placement's Messages one by one needs Surface
and Agent to understand wrapped variants, which is a change to those packages
rather than a helper here. Until then, declare a parent Surface over the
placement's fields and name the wrapper variant in its `messages`.

## Limits

- A Link composed with `Link.andThen` (or `Link.compose`) from a ref-built Link names the
  application passed to `contract`, not the ref's.
- Surfaces cannot expose a placement's individual child Messages, for the
  reason above.
