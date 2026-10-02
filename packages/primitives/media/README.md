# `foldkit-primitives/media`

What the browser says about its surroundings: a media query's answer, the
viewport's breakpoint, the platform. Each is a fact the parent Model keeps and
the browser corrects. ([source](https://github.com/doeixd/foldkit-plus/blob/main/packages/primitives/src/media))

| Name | Form | Model | Messages | Args |
| --- | --- | --- | --- | --- |
| `MediaQuery` | bundle | `{ matches }` | `Changed { matches }` | `{ query }` |
| `PrefersDark`, `PrefersReducedMotion` | bundle, preset | `{ matches }` | `Changed` | none |
| `Breakpoints` | bundle | `{ width, breakpoint }` | `Changed { width }` | `{ breakpoints }` |
| `breakpointFor(width, table)` | function | | | |
| `platformFromUA(ua, hints?)` | function | | | |
| `isBrowser()`, `isServer()` | function | | | |

## Start with one: a media query

```ts
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { Bundle } from 'foldkit-bundle'
import { MediaQuery } from 'foldkit-primitives/media'

const Page = Bundle.compose({ theme: Schema.String }).pipe(
  Bundle.withChild('dark', MediaQuery, { args: { query: '(prefers-color-scheme: dark)' } }),
)
type Model = typeof Page.Model.Type
type Message = typeof Page.Message.Type
const { placements } = Page

const config = placements.complete({
  init: () => placements.initial({ theme: 'light' }),
  update: placements.update(model => ({ model })),
  view: (model: Model, h: HtmlBuilder<Message>) =>
    h.div([], [model.dark.matches ? 'Dark mode' : 'Light mode']),
  subscriptions: placements.subscriptions(),
})
```

`dark` starts at `{ matches: false }`. When the runtime subscribes, the
stream emits the current answer at once and then every change; nothing else
performs I/O. A preset places with no args:

```ts
import { PrefersDark } from 'foldkit-primitives/media'

const Themed = Bundle.compose({ theme: Schema.String }).pipe(Bundle.withChild('dark', PrefersDark))
```

Two placements of one query open two `matchMedia` listeners. Share the field
instead.

## `Breakpoints`

Derives a named breakpoint from one `resize` listener. `args.breakpoints` maps
names to mobile-first minimum widths; a non-finite width is rejected at
placement. The Model is `{ width, breakpoint }`, with `breakpoint` the largest
name at or below the width (ties break alphabetically) and `null` below the
smallest. The server starts at width 0.

```ts
const Layout = Bundle.compose({}).pipe(
  Bundle.withChild('bp', Breakpoints, { args: { breakpoints: { sm: 640, md: 768, lg: 1024 } } }),
)
```

`breakpointFor(width, table)` is the same rule as a function. Placing both
`Breakpoints` and `WindowSize` (in `events`) doubles the resize listeners; pick
the one the view reads.

## Platform

`platformFromUA(ua, hints?)` reads `mac | windows | linux | android | ios | unknown`
from a user-agent string you pass. Mobile checks run first, since Android
contains "Linux" and an iPhone mentions "Mac"; Client Hints `platform` wins
when recognized, and a multi-touch Mac user agent reads as iOS. It never
throws: unknown input answers `unknown`.

`isBrowser()` and `isServer()` split a server render from the client, for an
`init` default that differs.

## Failure

Without `matchMedia` (a server, an old browser) the stream is empty and the
slice keeps its initial `false`; without a window, `Breakpoints` keeps width 0.
