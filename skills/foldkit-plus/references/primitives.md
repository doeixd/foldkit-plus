# foldkit-primitives

Ready-made [`foldkit-bundle`](https://github.com/doeixd/foldkit-plus/blob/main/packages/bundle)
primitives: media queries, breakpoints, visibility, presence, timers,
intervals, debounce, tweens, springs, pagination, undo history, locales,
selections, ranges, geolocation, cameras, permissions, fullscreen, sockets,
broadcasts, observers, autofocus, masks, shares, and clipboard. Each is an
ordinary bundle (or entry, Mount, Command, or pure function) under a
tree-shakeable subpath, so an application pays only for the primitives it
imports.

## Ownership

| State | Owner | Form |
| --- | --- | --- |
| A placed slice: match, count, page, value, selection, locale, scroll position, heights | the parent Model | bundle, placed like any other |
| Key presses, pointer moves, scroll positions, focus identity | the parent Model, if kept | entry mapped to the parent's Message |
| Element size, visibility, mutations, bounds, focus, scroll position, row height, masked input | the element, observed | Mount attached in the view |
| A clipboard write, share, script load, fullscreen switch, broadcast post | nothing (one-shot) | Command in `update` |
| A page list, window math, masonry layout, sticky answer, hotkey match, relative time, platform | nothing (derived) | pure function |
| The current item of a roving tab stop, a typeahead query, or both for a list | the parent Model | `interaction`: a bundle plus a `foldkit-mixins` Behavior wiring it to slots (`foldkit-mixins` is an optional peer for that subpath only) |

A bundle holds no state. Placing it twice observes twice; share the field
instead. The browser, clock, or server only reports facts as Messages.

## Minimal example

```ts
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { MediaQuery } from 'foldkit-primitives/media'

const Dark = Bundle.declare(MediaQuery, 'dark')
const Model = Schema.Struct({ ...Dark.fields, theme: Schema.String })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Dark.cases, ThemeSet: { theme: Schema.String } })

const Page = Bundle.parent({ Model, Message })
const placements = Page.assemble(Page.at(Dark, { args: { query: '(prefers-color-scheme: dark)' } }))
const update = placements.update(model => ({ model }))
```

`PrefersDark` and `PrefersReducedMotion` are presets that place with no args.
`Online`, `Visibility`, and `WindowSize` (no args), `Timer` and `Interval`
(`{ intervalMs }`), `Tween` (`{ from, to, ms }`), `Spring` (`{ from, to,
stiffness, damping }`), `Pagination` (`{ perPage }`), `Locale` (`{ default
}`), `SelectionSet` (no args), `Geolocation` (no args), `Idle` (`{
timeoutMs }`), `Presence` (`{ durationMs }`), `Virtual` (`{
estimatedHeight, overscan, gap, paddingStart, paddingEnd }`, plus optional
restore and settle options), and `history({ name, value })`
place the same way. `sse({
name })`, `websocket({ name })`, `mediaDevices({ name })`, `mediaStream({
name })`, and `permissions({ name })` are factories over a resource tag;
`debounce({ name, value })` is a factory whose settled value surfaces as an
OutMessage the placement handles with `onOut` — required, so it cannot be
dropped. `Throttle` pairs leading-edge against that trailing edge.
`chat.helpers.send('hi')` sends on a placed socket; `copyText`, `share`,
`loadScript`, `enterFullscreen`/`exitFullscreen`, and `postBroadcast` are
Commands; `Resize()`, `Intersection()`, `Mutation()`, `Bounds()`, and
`Autofocus()` attach with `h.OnMount` in the view; `keyboardEvents()` and
friends lift with `Subscription.persistent`, and `matchHotkey` turns a press
into a chord answer. Slices that must survive reload persist through
`Mirror.kv`, not here — this package owns live facts only.

## Common tasks

- **Place a preset:** `Page.place(PrefersDark, 'dark')` — no config needed.
- **Drive a timer in tests:** the tick stream runs on Effect's clock, so
  `TestClock.adjust` advances it instead of waiting.
- **Send on a socket:** `chat.helpers.send('hi')(model)` in `update`; the
  `Socket` service rides the assembly into the application's resources.
  `Received` notifies without storing — project it to keep it.
- **Observe an element:** `h.div([h.OnMount(Resize())], [...])`; without the
  observer API the Mount emits nothing.
- **Roving tab stop:** place `RovingTabindex.bundle` (`{ orientation, loop, virtual }`)
  from `foldkit-primitives/interaction`; attach
  `RovingTabindex.behavior(Declared, args)(Slots)<Model, Message>({ container, item, items: model => Behaviors.Collection.of(...), direction? })`
  beside `Behaviors.Collection.behavior` (which writes the ids it focuses by).
  The Model slice is the current item's id; the container's `OnKeyDownFocus`
  focuses the next enabled item and dispatches `Focused { id }`.
- **Type to find:** `Typeahead.bundle` (`{ timeoutMs }`) with
  `Typeahead.behavior(Declared)(Slots)<Model, Message>({ host, items, text, current })`
  for a host with no roving tab stop; `Typeahead.match(texts, enabled, query, current)` is the pure pick.
- **A list host that wants both** arrows and typeahead takes `ListNavigation.bundle`
  (`{ orientation, loop, virtual, timeoutMs, page }`) with
  `ListNavigation.behavior(Declared, args)(Slots)<Model, Message>({ container, item, items, text, direction? })`.
  One placement, one key handler: `RovingTabindex` and `Typeahead` on one host are
  refused by the resolver (one owner per event), and under `virtual` a typed key
  must move the pointer and extend the query in one transition.
- **Keep focus inside an overlay:** `FocusScope.behavior(Slots)<Input, Message>({ container, contain?, restore?, initialFocus? })`
  attaches the `foldkit-primitives/dom` `FocusScope` Mount (no Bundle: focus is a DOM fact).
  Initial focus on insert, Tab and Shift+Tab wrap and a stray focus comes back under
  `contain`, focus restored on unmount under `restore`. A native `<dialog>` needs none of it.

## Gotchas

- **One placement observes one query.** Two `MediaQuery` placements with the
  same query open two listeners; share the field instead.
- **A non-positive or non-finite timer interval is rejected** at placement, naming it.
- **`Received` and `Sent` leave the Model unchanged.** They exist so agents,
  journals, and DevTools see the traffic.
- **One assembly holds one socket, stream, or watch.** The resource tag is per
  module; a second placement of the same socket, SSE, camera, or permissions
  bundle collides at `assemble`.
- **OutMessages are never dropped by omission.** `Debounce` and `Throttle`
  require `onOut` at placement; `Bundle.ignore` drops one on purpose.
- **Timers, tweens, debounces, and presence run on Effect's clock.** `TestClock.adjust` advances
  them in tests; a placed Presence hides through a real `sleep` otherwise.
- **Init is a safe default, not a read.** `matches: false`, `online: true`,
  count zero: SSR renders these, and subscriptions then report live facts.

## See also

- Primitives package: https://github.com/doeixd/foldkit-plus/blob/main/packages/primitives
- Bundle mechanism: https://github.com/doeixd/foldkit-plus/blob/main/packages/bundle
- Joining integrations: https://github.com/doeixd/foldkit-plus/blob/main/docs/wiring.md
