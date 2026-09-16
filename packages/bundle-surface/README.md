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
import { Bundle, Link } from 'foldkit-bundle'
import { BundleSurface } from 'foldkit-bundle-surface'
import { Module, Surface } from 'foldkit-surface'

const App = Surface.application({ Model, Message, initial, update })

// A Link from the application's own field ref.
const SearchPlaced = Search.at(BundleSurface.link(App.model.search, GotSearchMessage))
const Rows = Row.each(Link.collection<Model>()('rows', GotRowMessage))
const placements = Bundle.assemble<Model, Message>()([SearchPlaced, Rows])

const AppModule = BundleSurface.module(App, placements, [TodoSync])
Module.validate(AppModule) // []
```

- **`BundleSurface.module(app, assembly, items)`** makes one `bundle` contract
  per placement and adds your other contracts. It performs no I/O.
- **`BundleSurface.contract(app, placement)`** is one contract, for
  `Module.make` or `Module.add`. It owns the placement's path and names the
  parent Message tags its Messages travel under.
- **`BundleSurface.link(fieldRef, wrapper)`** is `Link.make` over a Surface
  field ref. Its contract names the ref's application.

## What the existing rules catch

| Mistake | Finding |
| --- | --- |
| Two placements on one path, or a placement on a path Sync or Remote owns | `ownership-overlap` |
| A placement through another application's field ref | `foreign-contract` |
| A wrapper variant missing from the application's Message | `unknown-message` |
| A placement's Link path that is not a Model field | `unknown-path` |

`Module.manifest` and `Module.toMarkdown` list each placement as the owner of
its path.

## Limits

- A Link composed with `Link.compose` from a ref-built Link names the
  application passed to `contract`, not the ref's.
- Relative Surfaces and Mirror declarations per placement are not built yet.
