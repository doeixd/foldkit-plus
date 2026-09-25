# `foldkit-primitives`

Ready-made [`foldkit-bundle`](../bundle) primitives: media queries, breakpoints,
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
import { MediaQuery } from 'foldkit-primitives/media'
```

## Which state belongs here?

A primitive belongs here when it is **reused across applications** and
**stateful**: something observes it, something reacts to it, and replay sees
the same transitions. That is exactly the bundle shape, which is why this
package depends on `foldkit-bundle` and nothing else (besides peers). The one
exception is `interaction`, whose Bundles ship with a `foldkit-mixins` Behavior
that wires them to a view's slots; `foldkit-mixins` is an optional peer that
only that subpath needs.

| Kind | Form | Example |
| --- | --- | --- |
| Stateful + effectful | bundle | MediaQuery, Timer, WebSocket, Pagination |
| Interaction state a view's slots must reflect | bundle + Behavior | RovingTabindex, Typeahead, ListNavigation, GridNavigation, Press |
| Keyed collections of stateful items | bundle per key | uploads, sockets, timers (later) |
| Stream source with a stored fact | bundle with one boolean/scalar slice | Online, Visibility, WindowSize |
| Stream source only | Subscription entry, not a bundle | keyboard, pointer, scroll, broadcast |
| Element-scoped observation | Mount, not a bundle | Resize, Intersection, Mutation, Autofocus |
| One-shot actions | Command, not a bundle | clipboard copy, share, script load |
| Derived data | pure function, not a bundle | range, relative time, platform |

Choose by what you need to own. State that outlives the moment — a match,
a count, a page, a position — wants a bundle: the Model keeps it, replay
sees it. A stream you only react to wants an entry: map it into the
parent's Message and keep nothing. Work bound to one element wants a
Mount. Work that runs once and reports back wants a Command. A value
computed from data you already have wants a pure function. When in doubt,
start with the lighter form; promote to a bundle the day the state needs
a name in the Model.

A bundle holds no state and performs no I/O by itself. The parent Model owns
the placed slice; the browser (or server, or clock) only reports facts as
Messages. The same rule as everywhere else: observation is not ownership.

Solid developers will notice missing plumbing: there is no event bus
because Messages are the bus, no memo because derivations are pure reads
over the Model, and no reactive map or store because the Model holds plain
data (Effect collections where mutation matters). None of it is missing by
accident — one state machine leaves nowhere for a second one to live.

## The mental model

```text
browser / clock / server ──facts as Messages──▶ update ──▶ Model slice
                                                    ▲
The parent Model owns the recorded fact; subscriptions report environment changes.
```

Initialization creates the Model slice; subscriptions observe ongoing facts and
report Messages; `update` stores them. Defaults differ by primitive:
MediaQuery starts at `false`, while Online, Visibility, and Locale read an
available platform value during initialization. Missing browser APIs have
primitive-specific fallbacks; do not infer readiness from an SSR default.

## Install

```bash
pnpm add foldkit-primitives foldkit-bundle effect foldkit
```

`effect` and `foldkit` are peer dependencies. Import per subpath —
`foldkit-primitives/media`, `foldkit-primitives/net`, `foldkit-primitives/time`,
`foldkit-primitives/state`, `foldkit-primitives/motion`, `foldkit-primitives/device`,
`foldkit-primitives/events`, `foldkit-primitives/observers`, `foldkit-primitives/dom` —
so bundlers drop the primitives you never import.

## Map of the package

Each subpath is one concern, one import:

- `media` — environment facts: MediaQuery (+presets), Breakpoints, platform
- `net` — remote facts: Online, WebSocket, SSE, BroadcastChannel
- `time` — clock facts: Timer, Interval, Debounce, Throttle, relative time
- `state` — owned UI state: Pagination, History, Locale, SelectionSet, Virtual, range
- `motion` — animation state: Tween, Spring, Presence
- `interaction` — a Bundle (or Mount) and its `foldkit-mixins` Behavior: RovingTabindex, Typeahead, ListNavigation, GridNavigation, FocusScope, Press, LongPress, Move, FocusVisible, DismissLayer, ScrollLock, HideOutside, Selection, LiveAnnounce
- `device` — hardware: Geolocation, MediaDevices, MediaStream, Permissions, Fullscreen
- `events` — raw browser events: Visibility, WindowSize, Idle, InputModality, keyboard, pointer, scroll, focus
- `observers` — element Mounts: Resize, Intersection, Mutation, Bounds
- `dom` — element Mounts and one-shot Commands: Autofocus, FocusScope, Move, ScrollLock, HideOutside, InputMask, clipboard, share, script loading

## Sixty seconds: follow the color scheme

**Place it in a parent.** `Bundle.compose` states the parent's own field and
Message, and places the primitive under `dark`, with the wrapper Message
`GotDarkMessage` by Foldkit's `Got<Field>Message` convention:

```ts
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { Bundle } from 'foldkit-bundle'
import { MediaQuery } from 'foldkit-primitives/media'

const Page = Bundle.compose({ theme: Schema.String }).pipe(
  Bundle.withMessages({ ThemeSet: { theme: Schema.String } }),
  Bundle.withChild('dark', MediaQuery, { args: { query: '(prefers-color-scheme: dark)' } }),
)
type Model = typeof Page.Model.Type
type Message = typeof Page.Message.Type
```

**Run it.** The parent's assembly derives the update and the Subscriptions:

```ts
const { placements } = Page

const config = placements.complete({
  init: () => placements.initial({ theme: 'light' }),
  update: placements.update(model => ({ model })),
  view: (model: Model, h: HtmlBuilder<Message>) =>
    h.div([], [model.dark.matches ? 'Dark mode' : 'Light mode']),
  subscriptions: placements.subscriptions(),
})
```

`update` routes `GotDarkMessage` to the bundle; `subscriptions` runs the
`matchMedia` stream; `initial` starts `matches` at `false` and the stream
corrects it on subscribe. None of these calls perform I/O: `compose` states
the parent, `withChild` places the primitive with its config, and the
assembly derives the folding and the streams. The browser is touched only
when the runtime subscribes. The Solid equivalent this replaces:

```ts
// solid-primitives: const dark = createMediaQuery('(prefers-color-scheme: dark)')
// Here the fact lives in the Model: replay, DevTools, and time travel see it.
```

## Composing placements

One assembly holds every placement: spread its update, init,
subscriptions, and resources once per application, as above. Two
placements of one bundle observe twice — share the field instead, so one
stream feeds every reader. One assembly holds one socket, stream, or
watch: resource tags are per module, and `assemble` refuses the second.
Bundles whose settled value is the whole point (`Debounce`, `Throttle`)
surface it as an OutMessage the placement handles with `onOut`, so the
signal can never be dropped by omission. Entries lift with
`Subscription.persistent`, mapping into the parent's Message; Mounts
attach in views with `h.OnMount`.

## Media: `foldkit-primitives/media`

> Reference: [`./media/README.md`](./media/README.md)

`MediaQuery` follows one CSS media query. Model `{ matches: boolean }`,
one Message `Changed { matches }`, args `{ query: string }`. The stream emits
the current value on subscribe, then every change; without `matchMedia` it is
empty and the slice keeps its initial `false`.

Bound presets place with no args:

```ts
import { PrefersDark, PrefersReducedMotion } from 'foldkit-primitives/media'

const Page = Bundle.compose({ theme: Schema.String }).pipe(Bundle.withChild('dark', PrefersDark))
```

`Breakpoints` derives names from one `resize` listener: args
`{ breakpoints }` map names to mobile-first min-widths (finite — anything
else is rejected at placement), Model
`{ width, breakpoint }`, one Message `Changed { width }`. The breakpoint is
the largest name at or below the width (ties break alphabetically); SSR
starts at width 0 with `null`. Placing both `Breakpoints` and `WindowSize`
doubles resize listeners — pick the one the view reads.

`platformFromUA(ua, hints?)` reads `mac | windows | linux | android | ios | unknown`
from a passed user-agent string (mobile checks first: Android contains
"Linux", iPhones mention "Mac"); Client Hints `platform` wins when
recognized, and a multi-touch Mac UA reads as iOS. `isBrowser()`/`isServer()` split SSR from
client for init defaults.

## Net: `foldkit-primitives/net`

> Reference: [`./net/README.md`](./net/README.md)

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

## Time: `foldkit-primitives/time`

> Reference: [`./time/README.md`](./time/README.md)

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

## Events: `foldkit-primitives/events`

> Reference: [`./events/README.md`](./events/README.md)

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
repeat and modifiers) and releases, moves `{ x, y }`, scroll positions, and
focus `{ tag, id }` — elements cross as tag and id, never as live nodes.
`matchHotkey("ctrl+shift+k", press)` answers whether a press is a shortcut,
so `update` stays a table of chords; matching is exact and auto-repeat never
matches. When the observed target itself depends on state, scope the entry
through subscription dependencies and it restreams on change. When the
handler must cancel the browser default, core
`Subscription.fromEventFilterMap` maps synchronously inside dispatch. Lift
with `Subscription.persistent`, mapping into the parent's Message; without
a window each stream is empty instead of throwing.

## Observers: `foldkit-primitives/observers`

> Reference: [`./observers/README.md`](./observers/README.md)

`Resize` and `Intersection` are Mounts, not bundles: element-scoped
observation attaches in views, not Model slots. Attach `Resize()` (or
`Intersection()`) with `h.OnMount` on the element. There are no ref objects
to thread: a Mount receives its element directly, and views take the rest
as plain arguments.

`Resize()` reports `Resized { width, height }` from the element's content
box; `Intersection()` reports `IntersectionChanged { isIntersecting, ratio }`
on viewport crossings; `Mutation()` reports `Mutated { type, added, removed,
attribute }` for child, attribute, and text changes across the whole subtree
— nodes cross as names, never as live objects, and unknown record types are
skipped. `Bounds()` re-measures `Measured { x, y, width, height }` on
observer, scroll, and resize, starting with the current rect; without a
ResizeObserver the window events still measure. Without the observer API
(SSR, old browser) they emit nothing instead of throwing; teardown
disconnects. Treat repeated measurements as observations, not proof that a user action occurred.

## Device: `foldkit-primitives/device`

> Reference: [`./device/README.md`](./device/README.md)

`Geolocation` watches the device position while placed. Model `{ status,
coords, lastError }` with `status` unknown → ready; denial is its own status
(actionable UI), transient failures keep the last fix and note the error.
Permission code 1 maps to `Denied`, anything else to `Failed`. Without a
geolocation API the stream is empty instead of throwing.

`mediaDevices({ name, create? })` scans the device list on placement and
re-scans on `Scan`, `DevicesChanged` (wired to `devicechange`), and every
placement: `Refreshed { devices }` with `{ deviceId, groupId, kind, label }`.
Denial lands as `denied` while keeping the last list; other failures keep the last list and
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

## DOM: `foldkit-primitives/dom`

> Reference: [`./dom/README.md`](./dom/README.md)

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

## State: `foldkit-primitives/state`

> Reference: [`./state/README.md`](./state/README.md)

`Pagination` keeps `{ page, perPage, total }` in the Model, with `total: null`
while unknown. Every transition clamps into range: past the last page lands on
it, below one lands on one, and a smaller total pulls the page back. New sizes
and totals arrive as Messages (`SetPerPage` ignores a non-positive size, and
`SetTotal` ignores a negative total).
`pageCount` returns null while the total is unknown; `offset` gives the first
item's index for a slice or a query. Loading data stays the application's job:
this bundle owns the page, not the items.

`history({ name, value, capacity })` makes an undo/redo bundle over any value
Schema. The Model holds `{ past, present, future, group }`; `Push` records and
drops the redo future, `Undo`/`Redo` move one step, `Clear` empties both sides
while keeping the present. A `Push` may name a `group`: consecutive pushes of
the same group are one step, so typing a word undoes as a whole, with no clock.
The steps are also pure functions, `History.start`, `push`, `undo`, `redo` and
`clear`, for a parent that records an edit in the same transition that makes it
(the page Builder keeps its page this way). The past holds at most `capacity` entries (default 100);
a negative or fractional capacity throws at the factory, naming it. The
factory attaches the Message union, so placements dispatch
`EditHistory.Message.Push(...)`. `canUndo`/`canRedo` read the edges:

```ts
import { history } from 'foldkit-primitives/state'

const EditHistory = history({ name: 'EditHistory', value: Schema.String, capacity: 50 })
const Doc = Bundle.declare(EditHistory, 'doc')
```

`Locale` keeps one string in the Model, read from `navigator.language` at
startup with the configured `default` as fallback; `SetLocale` switches it.
`SelectionSet` keeps string ids in first-selection order: `Select` (keeps
position), `Deselect`, `Toggle` (re-appends), `ReplaceAll` (deduped), and
`Clear`. `isSelected` reads membership. Neither subscribes to changes; Locale reads the initial browser language when available.
Keyed children — lists with stable identity — place through the bundle
mechanism's `each`.
`range(start, end, step?)` counts half-open numbers — the pagination page
list is `range(1, (pageCount(model) ?? 0) + 1)`; a zero or non-finite step
throws, naming it.

`Virtual` owns a virtualized list's scroll position, measured heights, and
layout: Model `{ scrollTop, heights, scrolling, generation, estimatedHeight,
overscan, gap, paddingStart, paddingEnd }`, Messages
`Scrolled`/`Measured`/`Prune`/`Settled`, args for the layout plus optional
`initialScrollTop`/`initialHeights` restores (measurements sanitized like
live ones) and a `settleMs` silence (default 150). Every scroll marks
`scrolling` until the silence settles — suspend loaders and parallax on it.
`Viewport` reports the container's own scrolls and `MeasureRow({ key })` reports row heights, both as Mounts;
`windowFor(model, keys, viewportHeight)` answers which rows to render plus
the spacer height, `isAtEnd(model, keys, viewportHeight, threshold)` is the
infinite-scroll check (an empty list counts as ended), `distanceToEnd`
answers the pixels remaining for prefetch thresholds, and `offsetFor`
computes programmatic scroll targets the application actuates itself.
`Prune` drops heights for departed keys — the bundle never sees key order.
Poisoned positions and heights are ignored, never stored. For window-
scrolled lists, map the scroll entry into `Scrolled`; for follow-bottom,
hold the end while `isAtEnd` and scroll on extend; to anchor a prepend,
re-`Scrolled` by the totals' delta. Render each row keyed (with
`aria-rowcount`/`posinset` from the window) so per-row placements keep
identity. `stickyHeader(sections, start)` answers which section header
sticks — CSS `position: sticky` does the sticking. `masonry(keys, heights,
options)` packs fixed-width columns shortest-first into `{ placements,
totalHeight }`: layout only, every placed item renders, so it fits hundreds
of images rather than hundred-thousands. The sums never name an
axis: pass column widths as heights and a horizontal offset as scroll
position to window a carousel the same way — no parallel horizontal
bundle. Windowed grids and per-index estimates stay out by design.

Persisted state lives one package over: `Mirror.kv(App, { key, fields })`
keeps a Model slice in Effect's `KeyValueStore` (localStorage in the
browser), restored through a `MirrorRestored` Message the application
reduces. Nothing here duplicates it — reach for the mirror when a slice
should survive reload, and keep this package's bundles for live facts.

## Motion: `foldkit-primitives/motion`

> Reference: [`./motion/README.md`](./motion/README.md)

Whether motion should be reduced is a service, `Motion`, read when a
transition starts rather than sniffed once. `Presence` then exits at once,
and `Tween` and `Spring` jump to `to`, in the same Messages, so the Model sees
the same transitions. Provide `Motion.live` (the user's
`prefers-reduced-motion`) through the assembly's resources, or `Motion.reduced`
and `Motion.full` in a test or for a setting the application owns. With no
service provided, motion is full, so a placement that provides nothing behaves
as before. `Motion.reducedMotion` is the Effect the bundles read, for a
transition of your own.

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

## Interaction: `foldkit-primitives/interaction`

Interaction state that a view's slots must reflect: the Bundle holds it in the
Model, and a matching [`foldkit-mixins`](../mixins) Behavior writes the
attributes and handlers on the slots. Importing this subpath needs
`foldkit-mixins`; the other subpaths do not.

`RovingTabindex` is one tab stop for a set of items: arrows move focus between
them, the rest stay out of the tab order. The Model slice is `{ current }`, the
current item's **id**, so a reorder keeps the same item current and a resumed
page knows where focus was. Args: `orientation` (`'vertical' | 'horizontal' |
'both'`), `loop`, and `virtual` (focus stays on the container and
`aria-activedescendant` points at the current item).

```ts
import { Bundle } from 'foldkit-bundle'
import { Behavior, Behaviors, Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import { RovingTabindex } from 'foldkit-primitives/interaction'

const Roving = Bundle.declare(RovingTabindex.bundle, 'toolbarFocus')
const Model = Schema.Struct({ ...Roving.fields, tools: Schema.Array(Tool) })
const Message = defineMessageUnion({ ...Roving.cases })
const Page = Bundle.parent({ Model, Message })
const args = { orientation: 'horizontal', loop: true, virtual: false } as const
const placements = Page.assemble(Page.at(Roving, { args }))

const ToolbarSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  tool: Slot.make({ capability: Capability.Focusable }),
})
const describeTools = (tools: ReadonlyArray<Tool>) =>
  Behaviors.Collection.of(tools, { id: tool => tool.id, disabled: tool => tool.disabled })

// Ids on each item come from Collection; RovingTabindex reads them.
const Ids = Behaviors.Collection.behavior(ToolbarSlots)<Model, Message>({
  item: 'tool',
  items: model => describeTools(model.tools),
})
const Focus = RovingTabindex.behavior(Roving, args)(ToolbarSlots)<Model, Message>({
  container: 'root',
  item: 'tool',
  items: model => describeTools(model.tools),
})

const Toolbar = SlotView.forMessages<Message>()
  .define(ToolbarSlots, (model, slots, h) => {
    const items = describeTools(model.tools)
    return h.div(
      slots.root.attrs([h.Role('toolbar')]),
      model.tools.map((tool, index) =>
        h.button(slots.tool.attrs([h.Key(tool.id)], items.slotItem(index)), [tool.label]),
      ),
    )
  })
  .pipe(Behavior.attach(Ids), Behavior.attach(Focus))
```

What each half does: the container gets `OnKeyDownFocus`, which on an arrow,
Home or End focuses the next **enabled** item synchronously by its id, prevents
the default, and dispatches `Focused { id }`. Each item gets `tabindex` `0` when
it is the tab stop and `-1` otherwise, and `OnFocus` reporting `Focused`, so a
click makes an item current too. Before anything is current, or when the
current item is gone or disabled, the first enabled item is the tab stop. Keys
with ctrl, alt or meta held are left alone; `direction: model => 'rtl'` swaps
left and right. The pure `move(enabled, current, key, modifiers, options)` and
`tabStop(items, current)` are exported for a view that wires its own.

Under `virtual` the items get no `tabindex`, the container gets
`aria-activedescendant`, and a key keeps DOM focus where it is and only moves
the pointer. Nothing is written on dispose: the attributes are data, so a view
that no longer attaches the Behavior leaves no `tabindex` behind. PageUp and
PageDown are handled when `move` is given a `page`; `ListNavigation` below
does that.

`Typeahead` is type-to-find for a host that has no roving tab stop, or whose
focus is managed elsewhere. The Model slice is `{ query, generation }`:
printable keys extend the query, a timer of `timeoutMs` on Effect's clock
clears it (`generation` lets a superseded timer change nothing), and `Cleared`
drops it on purpose. Which item a query picks is the pure
`Typeahead.match(texts, enabled, query, current)`: one character, or one
character repeated, starts *after* the current item so repeated presses cycle;
a longer query starts *at* it, since the user is refining. Case and leading
whitespace are ignored and disabled items are skipped. The Behavior
(`Typeahead.behavior(Declared)(Slots)<Model, Message>({ host, items, text,
current })`) gives the host `OnKeyDownFocus`: a printable key with no ctrl, alt
or meta extends the query, focuses the match by id, and dispatches `Typed`;
with no match the key is still recorded and focus stays put; a space with an
empty query is left to the host.

`ListNavigation` is what a list host takes when it wants both: arrows, Home,
End, PageUp and PageDown by `page`, and typeahead, in **one placement**. It
exists for two reasons. The resolver allows one owner per event on a slot, so
`RovingTabindex` and `Typeahead` cannot both own the host's `OnKeyDownFocus`;
and under `virtual` a typed key must move the pointer and extend the query in
one transition, which two placements cannot do. Its Model slice is `{ current,
query, generation }`, its args are `RovingTabindex`'s plus `timeoutMs` and
`page`, and its Behavior takes `{ container, item, items, text, direction? }`.
`Typed { char, match }` carries the item the query now picks, so `update` sets
`current` and `query` together.

```ts
const Nav = Bundle.declare(ListNavigation.bundle, 'nav')
// place with { args: { orientation: 'vertical', loop: false, virtual: false, timeoutMs: 500, page: 10 } }
const Keys = ListNavigation.behavior(Nav, args)(ListSlots)<Model, Message>({
  container: 'list',
  item: 'option',
  items: model => describeFruits(model.fruits),
  text: (model, index) => model.fruits[index]?.label ?? '',
})
```

`GridNavigation` is the two-dimensional counterpart for cells laid out in rows
of `columns` (a calendar grid, a swatch picker, an emoji palette). Its Model
slice and item attributes are `RovingTabindex`'s, so the two are
interchangeable on a view; only the pure `move` differs. Left and right step
within the row and up and down within the column, skipping disabled cells;
under `wrap` a horizontal key continues into the next row and a vertical key
into the next column, otherwise the key is consumed at the edge. Home and End
are the row's first and last enabled cell, Ctrl+Home and Ctrl+End the grid's.
RTL swaps left and right, and `virtual` works as it does for `RovingTabindex`.

```ts
const Cells = Bundle.declare(GridNavigation.bundle, 'cells')
// place with { args: { columns: 7, wrap: false, virtual: false } }
const Keys = GridNavigation.behavior(Cells, args)(CalendarSlots)<Model, Message>({
  container: 'grid',
  item: 'day',
  items: model => describeDays(model.days),
})
```

`FocusScope` is the one entry here that is a Mount, not a Bundle: which
element has focus is a DOM fact, so nothing crosses to the Model. The Mount
lives in `foldkit-primitives/dom`; `FocusScope.behavior(Slots)<Input,
Message>({ container, contain?, restore?, initialFocus? })` attaches it to a
container slot. On insert the container focuses `initialFocus`, else its first
tabbable descendant, else itself. With `contain` (default), Tab from the last
tabbable wraps to the first, Shift+Tab from the first wraps to the last, and
focus that lands outside comes straight back; Tab in the middle is the
browser's. On unmount, with `restore` (default), focus returns to the element
that had it, if it is still in the document. A native `<dialog>` does all of
this itself; this is for a custom overlay, a menu, or a command palette.
`tabbableWithin(element)` is exported: focusable, visible descendants with a
non-negative `tabindex`, in order.

`Press` turns pointer and keyboard activation of one element into one fact.
Foldkit's declarative pointer attributes carry no button, pointer id, or click
detail, so `Press.events` is a Mount that reports what the element saw
(`PointerDown`, `PointerUp`, `PointerCancelled`, `KeyDown`, `KeyUp`,
`Clicked`), and the Bundle's `update` decides: primary button only, one
pointer at a time, `pointerleave` and `pointercancel` cancel, Enter and Space
with a repeat ignored, a click with `detail` 0 (keyboard on a native control,
or assistive technology) counts, and the ghost click that follows a touch is
ignored inside a window of `clickSuppressionMs` that a Command on Effect's
clock closes. Enter and Space are default-prevented on the element, so a
native control does not also click and Space does not scroll. Activation is
the OutMessage `Pressed { pointerType, shiftKey }`, and the placement must handle it:

```ts
const Button = Bundle.declare(Press.bundle, 'saveButton')
const placements = Page.assemble(
  Page.at(Button, {
    args: { clickSuppressionMs: 50 },
    onOut: () => model => ({ model, commands: [save(model)] }),
  }),
)
const Activate = Press.behavior(Button)(CardSlots)<Model, Message>({
  target: 'save',
  disabled: model => model.saving,
})
```

The Behavior attaches the Mount to the target slot, writes `data-pressed`
while the element is down for styling, and marks a disabled target
`aria-disabled`, which the Mount reads at event time so nothing is reported
and no remount is needed. The Model slice is `{ pressed, pointerId, key,
suppressing, generation }`; only `pressed` is meant for a view.

`LongPress` is holding for `thresholdMs`. It reads the same facts
`Press.events` reports, so it needs no Mount of its own; the threshold is a
Command on Effect's clock carrying a generation, and a release before it fires
makes its `Elapsed` a no-op. `LongPressed { pointerType }` is the OutMessage,
required at placement. The Behavior writes `data-holding` while down. `Press`
and `LongPress` on one slot are refused by the resolver, since both would mount
`PressEvents`; a slot takes one of them.

`Move` is pointer movement as facts, a Mount in `foldkit-primitives/dom`: a
primary-button pointer down captures the pointer and reports `MoveStarted`,
each move reports `Moved { deltaX, deltaY }` from where it went down, and up,
cancel, or lost capture reports `MoveEnded { completed }`. A second pointer
and a secondary button are ignored; capture is released with the Mount.
`Move.behavior(Slots)<Input, Message>({ handle, toMessage })` attaches it to a
`Draggable` slot and maps each fact into the view's Messages; a drag's meaning
(a threshold, a snap, a reorder) is the parent's `update`.

`FocusVisible` is the one entry whose Bundle lives elsewhere: `InputModality`
in `foldkit-primitives/events` keeps `{ modality }` (`'keyboard'`, `'pointer'`,
or `'unknown'` before any input), fed by the window's `keydown` (a modifier
alone says nothing) and `pointerdown`. `FocusVisible.behavior(Declared)(Slots)
<Model, Message>({ target })` writes `data-focus-visible` on the target while
the page is driven by keyboard, so a stylesheet shows a ring with
`[data-focus-visible]:focus`. CSS `:focus-visible` does this with no Model at
all; this is for a design system that must decide in the Model, or show the
same answer somewhere other than the focused element.

`DismissLayer` closes overlays that are not native `<dialog>` or `popover`
elements: Escape closes the topmost open layer, and a pointer press closes
the layers it is outside of. One Bundle, **placed once**, owns the document
listeners; each layer's Behavior marks its container with
`data-foldkit-plus-layer="<id>"` and its trigger with the matching trigger
attribute. The stack is the DOM order of the marked elements at the moment of
the event, so a layer takes part exactly while it is rendered and an `open`
flag in the parent Model is its whole lifecycle; nothing registers. The rules,
each a test: a press inside a parent layer is outside its children, so the
parent stays and the children go; a press on a layer's trigger counts as
inside it, so a click on the trigger never dismisses and reopens; a layer
placed with `outsidePress: false` or `escape: false` opts out of that path.
`Dismiss { ids }` is the OutMessage, and the placement's `onOut` closes them:

```ts
const Layers = Bundle.declare(DismissLayer.bundle, 'layers')
const placements = Page.assemble(
  Page.at(Layers, {
    onOut: ({ ids }) => model => ({ model: { ...model, menuOpen: ids.includes('menu') ? false : model.menuOpen } }),
  }),
)
const Dismissable = DismissLayer.behavior(Layers)(MenuSlots)<Model, Message>({
  layer: 'panel',
  trigger: 'button',
  id: () => 'menu',
})
```

The Model slice is `{ layers }`, the open layers as the last event saw them,
for DevTools and agents. `toDismiss(layers, inside)` is the pure rule.

`Layers.scrollLock(Slots)({ container })` and `Layers.hideOutside(Slots)({
container })` are Mounts over Foldkit's own `Dom.lockScroll` and
`Dom.inertOthers`: the first locks the document's scroll while the container is
mounted, refcounted so nested overlays release together, with Foldkit's iOS
handling; the second marks everything outside the container inert while it is
mounted, keyed by an id the Mount mints so two overlays restore independently.
Both live in `foldkit-primitives/dom` as `ScrollLock` and `HideOutside`. A
native `<dialog>` shown modally needs neither.

`Selection` is which items are selected, with `mode` `'single'` (a click
replaces; `allowEmpty` says whether clicking the selected item deselects it),
`'multiple'` (a click toggles), or `'none'`, and the `anchor` a range extends
from. The Model slice is `{ selected, anchor }`. A range needs the items'
order, which the view knows and the Bundle does not, so `Ranged { id, order }`
carries it; `Selection.between(order, from, to)` is the pure span. The Behavior
(`Selection.behavior(Declared, args)(Slots)<Model, Message>({ container?,
item, items, click? })`) writes `aria-selected` on each item and
`aria-multiselectable` on the container, and wires a plain click on each
enabled item to `Activated`; pass `click: false` when `Press` or the view owns
the click. For a Shift range, `Press`'s `Pressed { pointerType, shiftKey }`
says whether Shift was held, and the placement's `onOut` dispatches `Ranged`.

`LiveAnnounce` speaks to assistive technology: one Bundle, placed once, holds
the text of a polite and an assertive live region. `say(Declared)(text,
politeness?)` builds the Message to return from `update` or an `onOut`; an
announcement waits `debounceMs` so a burst reads once, then clears after
`clearAfterMs`, both on Effect's clock with a generation so a superseded timer
changes nothing; the same text twice gets a trailing no-break space toggled,
which is what makes a screen reader read it again. `LiveAnnounce.view(slice,
h)` renders the two regions: put it once in the page and hide them visually
with a rule on `[data-foldkit-plus-live]`, never `display: none`.

## Testing placements

Every primitive is testable without the platform, following one pattern
with three ingredients. First, substitute the environment: factories take
`create` (streams, devices, permissions) or `request` (camera) doubles, so
tests pass fakes instead of stubbing globals. Second, advance time instead
of waiting it: anything on Effect's clock (debounce, throttle, presence,
idle, timers, tweens) runs under `TestClock.adjust`. Third, never hang on a
quiet stream: collect with a bounded `takeMessages`, which fails fast naming
the stall. The settle-before-adjust rule applies throughout — yield after
forking before the first `TestClock.adjust`, or dispatched events hit
unregistered listeners. Each ingredient is demonstrated in this package's
`test/` directory, named after its primitive.

## With Surface and Mirror

Placed state is ordinary Model, so the surrounding tools apply unchanged —
no bundle-specific Surface or Mirror API exists, by design. Declare a Surface
over the placed fields to render them or expose them to an agent; point
`Mirror.url` at them to link them; spread the bundle's cases into the same
unions. The field refs and wrapper Messages are the same ones the rest of the
application uses.

## Failure and recovery

| Failure | Behaviour |
| --- | --- |
| No `window` (SSR) or no API (old browser, minimal DOM) | stream is empty; the slice keeps its default |
| A Command without its platform API | failure Message (`CopyFailed`, `ShareFailed`, `BroadcastFailed`), never a throw |
| Listener removed (unmount, gate closed) | finalizer disconnects; resubscribing re-reads the current value |
| A Message for an unplaced child | never routes: wrappers only match placed variants |
| MediaStream acquisition fails | parks at `denied`/`idle` with requirements cleared; `Started` retries |

## Limits

- One placement observes one query. Two placements of `MediaQuery` with the
  same query open two listeners; share the field instead.
- Presets cover the common queries. Anything else passes `args` explicitly.
- `/plus` Surfaces and Mirrors per primitive are future work; declare them in
  the application for now.
