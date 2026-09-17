# `foldkit-bundles`

Ready-made [`foldkit-bundle`](./bundle) primitives: media queries, breakpoints,
presence, timers, intervals, debounce, tweens, springs, pagination, history,
locales, selections, ranges, geolocation, cameras, permissions, sockets,
broadcasts, observers, and clipboard. Most are ordinary bundles — Model,
Message, init, update, and Subscriptions collected in one value — published
under a tree-shakeable subpath, so an application pays only for the primitives
it places. The exceptions keep their own form: entries are Subscription
streams mapped to the parent's Message (keyboard, pointer, scroll); Mounts
are element-scoped observation attached with `h.OnMount` (`Resize`,
`Autofocus`); Commands are one-shot (`copyText`, `share`); pure helpers are
functions (`range`, `formatRelativeTime`).

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
| Stream source with a stored fact | bundle with one boolean/scalar slice | Online, Visibility, WindowSize |
| Stream source only | Subscription entry, not a bundle | keyboard, pointer, scroll, broadcast |
| Element-scoped observation | Mount, not a bundle | Resize, Intersection, Mutation, Autofocus |
| One-shot actions | Command, not a bundle | clipboard copy, share, script load |
| Derived data | pure function, not a bundle | range, relative time, platform |

A bundle holds no state and performs no I/O by itself. The parent Model owns
the placed slice; the browser (or server, or clock) only reports facts as
Messages. The same rule as everywhere else: observation is not ownership.

## The mental model

```text
browser / clock / server ──facts as Messages──▶ update ──▶ Model slice
                                                    ▲
Note the direction: init is pure, so SSR renders the default; the stream corrects it live.
```

Every primitive follows one lifecycle: `init` returns a safe default without
touching the environment (SSR-safe by construction). Streams report live
facts — MediaQuery reads the current match first, then changes; Timer ticks
while running. A primitive that cannot observe (no `window`, no API) yields
an empty stream instead of throwing, so the slice keeps its default.

## Install

```bash
pnpm add foldkit-bundles foldkit-bundle effect foldkit
```

`effect` and `foldkit` are peer dependencies. Import per subpath —
`foldkit-bundles/media`, `foldkit-bundles/net`, `foldkit-bundles/time`,
`foldkit-bundles/state`, `foldkit-bundles/motion`, `foldkit-bundles/device`,
`foldkit-bundles/events`, `foldkit-bundles/observers`, `foldkit-bundles/dom` —
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

`Breakpoints` derives names from one `resize` listener: args
`{ breakpoints }` map names to mobile-first min-widths (finite — anything
else is rejected at placement), Model
`{ width, breakpoint }`, one Message `Changed { width }`. The breakpoint is
the largest name at or below the width (ties break alphabetically); SSR
starts at width 0 with `null`. Placing both `Breakpoints` and `WindowSize`
doubles resize listeners — pick the one the view reads.

`platformFromUA(ua)` reads `mac | windows | linux | android | ios | unknown`
from a passed user-agent string (mobile checks first: Android contains
"Linux", iPhones mention "Mac"); `isBrowser()`/`isServer()` split SSR from
client for init defaults.

## Net: `foldkit-bundles/net`

`Online` keeps `online: boolean` in the Model, read from `navigator.onLine`
at startup and kept current by the window's `online`/`offline` events. One
Message `Changed { online }`, no args, no OutMessage. Without a window the
stream is empty and the slice stays at its default, so SSR renders online.

`sse({ name, createSource? })` is the one-directional sibling: the Model
holds `{ url, status, lastError }`, the resource owns the EventSource, and a
subscription streams its messages. No `send` — the server speaks, the Model
listens. A `Failed` records the error but stays `connecting`: the browser
reconnects dropped streams itself. Event payloads are always text per the
SSE spec.

`websocket({ name, createSocket? })` makes a duplex socket bundle: the Model
holds `{ url, status, lastError }` with `status` moving
closed → connecting → open. The resource owns the socket (one assembly holds
one); `send` is a placed helper whose command writes through the resource tag
and yields `Sent` on dispatch, `SendFailed` when no connection is open — a
closed socket's `send` is a silent no-op per spec, so the bundle checks first.
Incoming `Received` notifies without storing: project the payload into your
own field to keep it. `createSocket` defaults to the platform WebSocket, read
lazily so tests substitute a double; the socket service rides the assembly
into the application's resources, as `RemoteClient` does for Remote.

`broadcastMessages(name)` is the entry form for cross-tab traffic: posts from
other instances arrive as `Received { data }` (notify without storing, like
SSE). No bundle — the channel owns no state, so the parent maps `Received`
into its own Message and keeps what it stores. `postBroadcast(name, data)` is
the one-shot Command, yielding `Posted` or `BroadcastFailed`. A post never
echoes to its own channel, per spec; without the API the entry is empty and
the Command fails, instead of throwing.

## Time: `foldkit-bundles/time`

`Timer` counts ticks while running. Model `{ count, running }`, Messages
`Started`/`Stopped`/`Ticked`, args `{ intervalMs }` (positive and finite —
anything else is rejected at placement). The tick stream runs on
Effect's clock, so tests advance it with TestClock instead of waiting; while
stopped the stream is empty. Restarting keeps the count; only `Ticked`
advances it.

`Interval` is the wall-clock sibling: Model `{ running, lastAt }`,
`Ticked { at }` stamped from Effect's clock. `Timer` counts ticks,
`Interval` records when — views render clocks and elapsed times from
`lastAt`. Same args, same TestClock story, same silence while stopped.

`debounce({ name, value })` is a factory over any value Schema (like
`history`): `Changed` restarts a `{ delayMs }` timer, and only the latest
value settles — as an OutMessage the placement must handle with `onOut`, so
a settled query can never be dropped by omission. Each `Changed` bumps a
generation the scheduled `Settled` carries; a superseded timer emits nothing.

`Throttle` is the leading edge to Debounce's trailing one: the first
`Attempted` in an `{ intervalMs }` window surfaces a `Throttled` OutMessage
(`onOut`, likewise required), the rest are dropped. `Attempted` reads the
clock through a Command, so the check runs on Effect time and tests drive
it; the boundary counts as past (`>=`). Pair the two rather than adding a
second timer.

`formatRelativeTime(from, to, locale?)` picks the unit (seconds through
years) and lets `Intl.RelativeTimeFormat` word it — locales come from the
platform, not a phrase table. There is deliberately no `now` helper:
`Clock.currentTimeMillis` already is it.

## Events: `foldkit-bundles/events`

`Visibility` keeps `visible: boolean` in the Model, read from the document
at startup (SSR assumes visible) and kept current by `visibilitychange`:
one Message `Changed { visible }`, no args. A hidden page is the
application's cue to pause polling and streams; the decision stays in
application `update`, not here.

`WindowSize` keeps raw `{ width, height }` in the Model, read from the
window on subscribe and kept current by one `resize` listener. SSR starts
at zero; teardown removes the listener.

`Idle` keeps `idle: boolean` in the Model, args `{ timeoutMs }` (positive
and finite). While active, activity (mouse, keys, pointer, scroll) debounced past the
timeout settles to `BecameIdle`; while idle, the first activity wakes to
`BecameActive` and the dependency flip restarts the watch. Starts active —
a lurker idles when the silence elapses, because subscribe time seeds the
debounce as last-known-alive.

`keyboardEvents()`, `pointerEvents()`, `scrollEvents()`, and
`activeElementEvents()` are entries, not bundles: the parent owns whatever
key, cursor, scroll, or focus state it keeps. They report presses (with
repeat) and releases, moves `{ x, y }`, scroll positions, and focus
`{ tag, id }` — elements cross as tag and id, never as live nodes. Lift
with `Subscription.persistent`, mapping into the parent's Message; without
a window each stream is empty instead of throwing.

## Observers: `foldkit-bundles/observers`

`Resize` and `Intersection` are Mounts, not bundles: element-scoped
observation attaches in views, not Model slots. Attach `Resize()` (or
`Intersection()`) with `h.OnMount` on the element.

`Resize()` reports `Resized { width, height }` from the element's content
box; `Intersection()` reports `IntersectionChanged { isIntersecting, ratio }`
on viewport crossings; `Mutation()` reports `Mutated { type, added, removed,
attribute }` for child, attribute, and text changes across the whole subtree
— nodes cross as names, never as live objects, and unknown record types are
skipped. `Bounds()` re-measures `Measured { x, y, width, height }` on
observer, scroll, and resize, starting with the current rect; without a
ResizeObserver the window events still measure. Without the observer API
(SSR, old browser) they emit nothing instead of throwing; teardown
disconnects. They keep observing across time-travel pause — replay traffic
is same-valued and harmless.

## Device: `foldkit-bundles/device`

`Geolocation` watches the device position while placed. Model `{ status,
coords, lastError }` with `status` unknown → ready; denial is its own status
(actionable UI), transient failures keep the last fix and note the error.
Permission code 1 maps to `Denied`, anything else to `Failed`. Without a
geolocation API the stream is empty instead of throwing.

`mediaDevices({ name, create? })` scans the device list on placement and
re-scans on `Scan`, `DevicesChanged` (wired to `devicechange`), and every
placement: `Refreshed { devices }` with `{ deviceId, groupId, kind, label }`.
Denial empties with status `denied`; other failures keep the last list and
note the error; an unknown `kind` fails the scan at the boundary instead of
entering the Model.

`mediaStream({ name, request? })` holds one live camera/mic stream in a
Managed Resource while the Model asks for it (`requesting` or `live`).
`Started` requests with the placed `{ audio, video }` constraints, `Stopped`
and `Ended` release; denial parks at `denied`, any other failure parks at
`idle` with the error — both clear requirements, so a failing device never
spins an acquire loop. Release stops every track. The `LiveStream` tag and
service are exported for commands that attach the stream to an element; one
assembly holds one stream.

`permissions({ name, create? })` queries `{ names }` on acquire and watches
each status object's `onchange` through an ordered queue into a persistent
subscription. `Snapshot` replaces the states map, `Changed` merges one,
`Cleared` empties on release (which also detaches every handler). Unknown
names and unknown state strings fail the acquire — never Model facts.

`enterFullscreen(element)` / `exitFullscreen()` are Commands yielding
`Entered`/`Exited` or `Failed` (rejected request, missing capability, with a
legacy `webkit` fallback); `fullscreenChanges()` starts with the current
answer then follows flips as `Changed { active }`. No Model: the document
owns fullscreen state.

## DOM: `foldkit-bundles/dom`

`copyText` copies text as a Command: use it in `update` beside any bundle.
It yields `Copied` on success and `CopyFailed` otherwise — denial, insecure
context, or no clipboard API (SSR) all become the failure Message instead of
throwing. No Model involved: the clipboard is not application state.

`share(data)` posts `{ title?, text?, url? }` to the platform sheet: `Shared`
on success, `Dismissed` on sheet cancel (its own outcome, not a failure),
`ShareFailed` otherwise. `loadScript(src)` appends a head script unless one
carries the URL already — idempotent by URL, so concurrent placements
collapse onto the first tag and share its fate — yielding `Loaded` or
`LoadFailed`. A dead tag is removed, so a retry fetches afresh.

`Autofocus()` focuses the element on insert, then emits `Focused` (requested,
not landed: a non-focusable element may decline). `InputMask({ pattern })`
masks a field against `#`/`A`/`*` placeholders with literal separators,
rewrites the field with approximate caret restore, and emits
`Input { value, raw }` with masked and unmasked text. The parent owns the
state, like any controlled input.

## State: `foldkit-bundles/state`

`Pagination` keeps `{ page, perPage, total }` in the Model, with `total: null`
while unknown. Every transition clamps into range: past the last page lands on
it, below one lands on one, and a smaller total pulls the page back. New sizes
and totals arrive as Messages (`SetPerPage` ignores a non-positive size, and
`SetTotal` ignores a negative total).
`pageCount` returns null while the total is unknown; `offset` gives the first
item's index for a slice or a query. Loading data stays the application's job:
this bundle owns the page, not the items.

`history({ name, value, capacity })` makes an undo/redo bundle over any value
Schema. The Model holds `{ past, present, future }`; `Push` records and drops
the redo future, `Undo`/`Redo` move one step, `Clear` empties both sides while
keeping the present. The past holds at most `capacity` entries (default 100);
a negative or fractional capacity throws at the factory, naming it. The
factory attaches the Message union, so placements dispatch
`EditHistory.Message.Push(...)`. `canUndo`/`canRedo` read the edges:

```ts
import { history } from 'foldkit-bundles/state'

const EditHistory = history({ name: 'EditHistory', value: Schema.String, capacity: 50 })
const Doc = Bundle.declare(EditHistory, 'doc')
```

`Locale` keeps one string in the Model, read from `navigator.language` at
startup with the configured `default` as fallback; `SetLocale` switches it.
`SelectionSet` keeps string ids in first-selection order: `Select` (keeps
position), `Deselect`, `Toggle` (re-appends), `ReplaceAll` (deduped), and
`Clear`. `isSelected` reads membership. Both are pure logic, no streams.
`range(start, end, step?)` counts half-open numbers — the pagination page
list is `range(1, (pageCount(model) ?? 0) + 1)`; a zero or non-finite step
throws, naming it.

## With Surface and Mirror

Placed state is ordinary Model, so the surrounding tools apply unchanged —
no bundle-specific Surface or Mirror API exists, by design. Declare a Surface
over the placed fields to render them or expose them to an agent; point
`Mirror.url` at them to link them; spread the bundle's cases into the same
unions. The field refs and wrapper Messages are the same ones the rest of the
application uses.

## Motion: `foldkit-bundles/motion`

`Tween` animates one number from `from` to `to` over `ms` milliseconds.
Model `{ value, running }`, Messages `Started`/`Ticked`/`Finished`, args
`{ from, to, ms }` (a non-positive or non-finite duration is rejected at
placement). Progress comes from Effect's clock, so tests advance it with TestClock; the
stream ends with `Finished` carrying the exact end value, and the value rests
at `to` either way. Linear interpolation only: easing curves stay the
application's job.

`Presence` holds mount-transition state for exit animations. Model
`{ phase, generation }` with `phase` moving shown → hiding → hidden:
`Hide` starts the timed `hiding` phase, and the `Hidden` fact it yields
carries its generation, so a `Show` in between wins and the late fact is
ignored. Args `{ durationMs }` (positive and finite). `isVisible` reads
whether content renders (shown or mid-exit). The timeout Command is the default owner; a
`transitionend` Mount stays a future opt-in, not a second timer.

`Spring` pulls one number toward `to` with `{ stiffness, damping }` physics
(positive and finite): Model `{ value, velocity, running }`, Messages
`Started`/`Stopped`/`Ticked`/`Finished`, args `{ from, to, stiffness,
damping }`. Fixed 16ms semi-implicit Euler makes the trajectory identical on
the live clock and TestClock; the stream ends with `Finished` carrying the
exact end value even when an underdamped spring overshoots on the way.
`Tween` (fixed duration, linear) versus `Spring` (physics, settles) — pick
the motion, not both.

## Failure and recovery

| Failure | Behaviour |
| --- | --- |
| No `window` (SSR) or no API (old browser, minimal DOM) | stream is empty; the slice keeps its default |
| A Command without its platform API | failure Message (`CopyFailed`, `ShareFailed`, `BroadcastFailed`), never a throw |
| Listener removed (unmount, gate closed) | finalizer disconnects; resubscribing re-reads the current value |
| A Message for an unplaced child | never routes: wrappers only match placed variants |
| A failing device (denied camera, unknown permission) | parks at `denied`/`idle` with requirements cleared: no acquire loop |

## Limits

- One placement observes one query. Two placements of `MediaQuery` with the
  same query open two listeners; share the field instead.
- Presets cover the common queries. Anything else passes `args` explicitly.
- `/plus` Surfaces and Mirrors per primitive are future work; declare them in
  the application for now.
