# `foldkit-bundles`

Ready-made [`foldkit-bundle`](./bundle) primitives: media queries, presence,
timers, pagination, history, sockets, observers, and clipboard. Each is an
ordinary bundle — Model, Message, init, update, and Subscriptions collected in
one value — published under a tree-shakeable subpath, so an application pays
only for the primitives it places.

```ts
import { MediaQuery } from 'foldkit-bundles/media'
```

## Which state belongs here?

A primitive belongs here when it is **reused across applications** and
**stateful**: something observes it, something reacts to it, and replay sees
the same transitions. That is exactly the bundle shape, which is why this
package depends on `foldkit-bundle` and nothing else (besides peers).

| Kind | Form | Example |
| --- | --- | --- |
| Stateful + effectful | bundle | MediaQuery, Timer, WebSocket, Pagination |
| Keyed collections of stateful items | bundle per key | uploads, sockets, timers (later) |
| Stream source with a stored fact | bundle with one boolean/scalar slice | Online |
| Stream source only | Subscription entry, not a bundle | page visibility (later) |
| Element-scoped observation | Mount, not a bundle | Resize, Intersection |
| One-shot actions | Command, not a bundle | clipboard copy |

A bundle holds no state and performs no I/O by itself. The parent Model owns
the placed slice; the browser (or server, or clock) only reports facts as
Messages. The same rule as everywhere else: observation is not ownership.

## The mental model

```text
browser / clock / server ──facts as Messages──▶ update ──▶ Model slice
                                                    ▲
 Nationals: init is pure, so SSR renders the default; the stream corrects it live.
```

Every primitive follows one lifecycle: `init` returns a safe default without
touching the environment (SSR-safe by construction), and the Subscription
stream emits the live value first, then changes. A primitive that cannot
observe (no `window`, no API) yields an empty stream instead of throwing, so
the slice keeps its default.

## Install

```bash
pnpm add foldkit-bundles foldkit-bundle effect foldkit
```

`effect` and `foldkit` are peer dependencies. Import per subpath —
`foldkit-bundles/media`, `foldkit-bundles/net`, `foldkit-bundles/time`,
`foldkit-bundles/state`, `foldkit-bundles/observers`, `foldkit-bundles/dom` —
so bundlers drop the primitives you never import.

## Sixty seconds: follow the color scheme

**Declare where it lives.** A declaration names the Model field and the
Message variant, by Foldkit's `Got<Field>Message` convention:

```ts
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { MediaQuery } from 'foldkit-bundles/media'

const Dark = Bundle.declare(MediaQuery, 'dark')

const Model = Schema.Struct({ ...Dark.fields, theme: Schema.String })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Dark.cases, ThemeSet: { theme: Schema.String } })
type Message = typeof Message.Type
```

**Place it.** The scope types everything from the parent's Schemas; the
assembly derives the update and the Subscriptions:

```ts
const Page = Bundle.parent({ Model, Message })
const placements = Page.assemble(Page.at(Dark, { args: { query: '(prefers-color-scheme: dark)' } }))

const config = placements.complete({
  init: () => placements.initial({ theme: 'light' }),
  update: placements.update(model => ({ model })),
  view,
  subscriptions: placements.subscriptions(),
})
```

`update` routes `GotDarkMessage` to the bundle; `subscriptions` runs the
`matchMedia` stream; `initial` starts `matches` at `false` and the stream
corrects it on subscribe. The Solid equivalent this replaces:

```ts
// solid-primitives: const dark = createMediaQuery('(prefers-color-scheme: dark)')
// Here the fact lives in the Model: replay, DevTools, and time travel see it.
```

## Media: `foldkit-bundles/media`

`MediaQuery` follows one CSS media query. Model `{ matches: boolean }`,
one Message `Changed { matches }`, args `{ query: string }`. The stream emits
the current value on subscribe, then every change; without `matchMedia` it is
empty and the slice keeps its initial `false`.

Bound presets place with no args:

```ts
import { PrefersDark, PrefersReducedMotion } from 'foldkit-bundles/media'

const placements = Page.assemble(Page.place(PrefersDark, 'dark'))
```

## Net: `foldkit-bundles/net`

`Online` keeps `online: boolean` in the Model, read from `navigator.onLine`
at startup and kept current by the window's `online`/`offline` events. One
Message `Changed { online }`, no args, no OutMessage. Without a window the
stream is empty and the slice stays at its default, so SSR renders online.

## Failure and recovery

| Failure | Behaviour |
| --- | --- |
| No `window` (SSR) or no API (old browser, minimal DOM) | stream is empty; the slice keeps its default |
| Listener removed (unmount, gate closed) | finalizer disconnects; resubscribing re-reads the current value |
| A `Changed` for an unplaced query | impossible: each placement subscribes only its own query |

## Limits

- One placement observes one query. Two placements of `MediaQuery` with the
  same query open two listeners; share the field instead.
- Presets cover the common queries. Anything else passes `args` explicitly.
- `/plus` Surfaces and Mirrors per primitive are future work; declare them in
  the application for now.
