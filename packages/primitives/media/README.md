# `foldkit-primitives/media`

Environment facts: what the browser reports about its surroundings. See the [package
README](../README.md) for the full guide; this page walks through one placement before
the API reference.
([source](https://github.com/doeixd/foldkit-plus/blob/main/packages/primitives/src/media))

## Owns

The viewport's shape and the platform's identity, as parent-Model facts. Nothing here
performs I/O beyond listening; the browser only reports.

```text
browser / clock → subscription → Message → update → parent Model
```

## Start with one slice

```ts
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { MediaQuery } from 'foldkit-primitives/media'

const Dark = Bundle.declare(MediaQuery, 'dark')
const Model = Schema.Struct({ ...Dark.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Dark.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const placements = Page.assemble(Page.at(Dark, { args: { query: '(prefers-color-scheme: dark)' } }))

const config = placements.complete({
  init: () => placements.initial({}),
  update: placements.update(model => ({ model })),
  view: (model: Model, h: HtmlBuilder<Message>) => h.div([], [String(model.dark.matches)]),
  subscriptions: placements.subscriptions(),
})
```

`declare` names the slice and wrapper Message; `at` supplies the query. The initial
match is `false`. Once the runtime subscribes, the browser reports the current match and
later changes. For a bound preset, replace the placement with `Page.place(PrefersDark,
'dark')` after importing `PrefersDark`; pass the preset itself, not the declaration.

`config` is a Foldkit application configuration. Creating it does not start the
subscription; pass it to your Foldkit runtime. The parent Model owns the slice, and
`placements.update` routes its wrapper Messages. See the [Bundle
guide](../../bundle/README.md) for mounting and composing placements.

## Exports

| Name | Form | Needs |
| --- | --- | --- |
| `MediaQuery` | bundle `{ matches }` + `Changed` | `{ query }` |
| `PrefersDark`, `PrefersReducedMotion` | preset placements | none |
| `Breakpoints` | bundle `{ width, breakpoint }` + `Changed` | `{ breakpoints }` (finite thresholds) |
| `breakpointFor` | pure: width + table → name | — |
| `platformFromUA` | pure: UA string + optional hints → platform | — |
| `isBrowser`, `isServer` | pure: SSR split | — |

Placing both `Breakpoints` and `WindowSize` (in `events`) doubles resize listeners —
pick the one the view reads.

## Failure

No `matchMedia` (SSR, old browser): empty stream, initial `false` kept. `platformFromUA`
never throws: unknown input answers `unknown`.
