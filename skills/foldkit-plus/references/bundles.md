# foldkit-bundles

Ready-made [`foldkit-bundle`](https://github.com/doeixd/foldkit-plus/blob/main/packages/bundle)
primitives: media queries, presence, timers, pagination, undo history,
sockets, observers, and clipboard. Each is an ordinary bundle (or Mount, or
Command) under a tree-shakeable subpath, so an application pays only for the
primitives it imports.

## Ownership

| State | Owner | Form |
| --- | --- | --- |
| A media query match, presence, tick count, page, undo stack | the parent Model | bundle, placed like any other |
| Element size or visibility | the element, observed | Mount attached in the view |
| A clipboard write | nothing (one-shot) | Command in `update` |

A bundle holds no state. Placing it twice observes twice; share the field
instead. The browser, clock, or server only reports facts as Messages.

## Minimal example

```ts
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { MediaQuery } from 'foldkit-bundles/media'

const Dark = Bundle.declare(MediaQuery, 'dark')
const Model = Schema.Struct({ ...Dark.fields, theme: Schema.String })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Dark.cases, ThemeSet: { theme: Schema.String } })

const Page = Bundle.parent({ Model, Message })
const placements = Page.assemble(Page.at(Dark, { args: { query: '(prefers-color-scheme: dark)' } }))
const update = placements.update(model => ({ model }))
```

`PrefersDark` and `PrefersReducedMotion` are presets that place with no args.
`Online` (no args), `Timer` (`{ intervalMs }`), `Pagination` (`{ perPage }`),
and `history({ name, value })` place the same way. `send` for a placed
WebSocket is a helper; `copyText` is a Command; `Resize()` and
`Intersection()` attach with `h.OnMount` in the view.

## Common tasks

- **Place a preset:** `Page.place(PrefersDark, 'dark')` — no config needed.
- **Drive a timer in tests:** the tick stream runs on Effect's clock, so
  `TestClock.adjust` advances it instead of waiting.
- **Send on a socket:** `chat.helpers.send('hi')(model)` in `update`; the
  `Socket` service rides the assembly into the application's resources.
  `Received` notifies without storing — project it to keep it.
- **Observe an element:** `h.div([h.OnMount(Resize())], [...])`; without the
  observer API the Mount emits nothing.

## Gotchas

- **One placement observes one query.** Two `MediaQuery` placements with the
  same query open two listeners; share the field instead.
- **A non-positive timer interval is rejected** at placement, naming it.
- **`Received` and `Sent` leave the Model unchanged.** They exist so agents,
  journals, and DevTools see the traffic.
- **One assembly holds one socket.** The resource tag is per module; a second
  placement of the same socket bundle collides at `assemble`.
- **Init is a safe default, not a read.** `matches: false`, `online: true`,
  count zero: SSR renders these, and the stream corrects them live.

## See also

- Primitives package: https://github.com/doeixd/foldkit-plus/blob/main/packages/bundles
- Bundle mechanism: https://github.com/doeixd/foldkit-plus/blob/main/packages/bundle
- Joining integrations: https://github.com/doeixd/foldkit-plus/blob/main/docs/wiring.md
