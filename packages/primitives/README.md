# `foldkit-primitives`

In browser apps built with [Foldkit](https://foldkit.dev/)—a TypeScript framework where application state lives in one `Model` and changes through `update`—wiring a media query, a keyboard shortcut, a timer, a resize observer, or roving keyboard focus often pulls you into ad-hoc event listeners that live outside your `Model`.

`foldkit-primitives` gives you ready-made pieces for browser, clock, device, and interaction state in the shape Foldkit already uses. Each primitive observes the platform and sends a `Message` into your `update`, so the fact lives in your `Model`, appears in DevTools, and replays cleanly.

See the pieces running live in the [Primitives gallery](https://foldkit-plus.pages.dev/primitives).

## How primitives fit into your Model and update

A primitive observes an event or DOM signal and reports it as a `Message`; your `Model` keeps the fact, and your `update` decides what it means.

Styled widgets live in [`foldkit-mixins-ui`](../mixins-ui/README.md), and the slots and styles behind them live in [`foldkit-mixins`](../mixins/README.md). Offline replication and URL/storage persistence belong in [`foldkit-sync`](../sync/README.md) and [`foldkit-mirror`](../mirror/README.md).

For keyboard, pointer, and focus patterns (`foldkit-primitives/interaction`), primitives split into four parts:

- A **Bundle** holds the interaction state and `Message`s (which item is focused, what is pressed).
- A **Mount** reports a DOM event as a `Message` (a press, a drag, where focus moved).
- A **Behavior** attaches `tabindex`, `aria-*`, and handlers to a view's slots, routing keys through `Behaviors.Keys` as the slot's single `keydown` owner.
- A **Command** performs a DOM effect after render, such as focusing a newly shown row.

See [Authoring components](../../docs/authoring-components.md) for a step-by-step walkthrough of assembling a component from those four parts.

## Which form a primitive takes

Every primitive takes one of six forms depending on what state it needs to own:

| It needs to own | Form | Joins the application by | Examples |
| --- | --- | --- | --- |
| A fact that outlives the moment: a match, a count, a page, a position | **bundle** | placing it in the parent, as a field and a wrapper Message | `MediaQuery`, `Timer`, `Pagination`, `websocket` |
| Interaction state a view's slots must reflect | **bundle + Behavior** | placing it, then attaching its Behavior to the view's slots | `RovingTabindex`, `Press`, `DismissLayer` |
| Nothing: a stream you react to | **entry** | lifting it into your Subscriptions, mapped to your Message | `keyboardEvents`, `ticks`, `broadcastMessages` |
| Nothing: observation bound to one element | **Mount** | attaching it in the view with `h.OnMount` | `Resize`, `Autofocus`, `KeepInView` |
| Nothing: work done once that reports back | **Command** | returning it from `update` | `copyText`, `share`, `enterFullscreen` |
| Nothing: a value computed from what you have | **function** | calling it | `range`, `matchHotkey`, `formatRelativeTime` |

Choose the lighter form when you do not need persistent state; promote to a bundle when the state needs a named field in your `Model`.

Stateful bundles use [`foldkit-bundle`](../bundle/README.md) for placement. The `interaction` subpath also uses [`foldkit-mixins`](../mixins/README.md) as an optional peer because its Behaviors write attributes onto view slots.

## Install

```bash
pnpm add foldkit-primitives foldkit-bundle effect foldkit
```

`effect` and `foldkit` are peer dependencies. Import by subpath (`/media`, `/net`, `/time`, `/state`, `/motion`, `/interaction`, `/device`, `/events`, `/observers`, `/dom`) so your bundler keeps only what you use.

## A first primitive: follow the color scheme

This places `MediaQuery` inside a parent page so `model.dark.matches` tracks the visitor's dark-mode preference:

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

const { placements } = Page

const config = placements.complete({
  init: () => placements.initial({ theme: 'light' }),
  update: placements.update(model => ({ model })),
  view: (model: Model, h: HtmlBuilder<Message>) =>
    h.div([], [model.dark.matches ? 'Dark mode' : 'Light mode']),
  subscriptions: placements.subscriptions(),
})
```

What happened:

- `Page.Model` gains `dark: { matches: boolean }`, and `Page.Message` gains `GotDarkMessage`.
- `placements.initial({ theme: 'light' })` starts `dark` at `{ matches: false }`, so initial render outputs `<div>Light mode</div>`.
- Once the Foldkit runtime starts `placements.subscriptions()`, `MediaQuery` reads `matchMedia('(prefers-color-scheme: dark)')` and dispatches `GotDarkMessage` through `placements.update(...)`, updating the view to `<div>Dark mode</div>` whenever dark mode is active.

Unlike a standalone hook outside your `Model`, `model.dark.matches` stays inspectable in DevTools, deterministic under replay, and safe during server rendering.

## Joining without a bundle: entries, Mounts, and Commands

**An entry** lifts a raw event stream into your Subscriptions and maps each event to your own `Message`:

<!-- docs-check
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
interface GameModel {
  readonly playing: boolean
}
const GameMessage = defineMessageUnion({ PressedKey: { key: Schema.String } })
type GameMessage = typeof GameMessage.Type
-->

```ts
import { Stream } from 'effect'
import * as Subscription from 'foldkit/subscription'
import { keyboardEvents } from 'foldkit-primitives/events'

const subscriptions = Subscription.make<GameModel, GameMessage>()(() => ({
  keys: Subscription.persistentEntry(
    keyboardEvents({ preventDefault: press => press.key.startsWith('Arrow') }).pipe(
      Stream.filter(event => event._tag === 'Pressed'),
      Stream.map(({ key }) => GameMessage.PressedKey({ key })),
    ),
  ),
}))
```

**A Mount** attaches directly to an element with `h.OnMount` and receives that element when mounted:

<!-- docs-check
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
interface PanelModel {
  readonly width: number
  readonly height: number
}
const PanelMessage = defineMessageUnion({ Resized: {} })
type PanelMessage = typeof PanelMessage.Type
-->

```ts
import { Resize } from 'foldkit-primitives/observers'

const panel = (model: PanelModel, h: HtmlBuilder<PanelMessage>) =>
  h.div([h.OnMount(Resize())], [`${model.width} × ${model.height}`])
```

**A Command** runs once from `update` and delivers its outcome back as a `Message` your union wraps:

<!-- docs-check
import type * as Update from 'foldkit/update'
import { ClipboardMessage } from 'foldkit-primitives/dom'
import { defineMessageUnion } from 'foldkit/message'
interface NoteModel {
  readonly text: string
}
const NoteMessage = defineMessageUnion({ Clipboard: { message: ClipboardMessage } })
type NoteMessage = typeof NoteMessage.Type
-->

```ts
import { mapMessage } from 'foldkit/command'
import { copyText } from 'foldkit-primitives/dom'

const copy = (model: NoteModel): Update.Return<NoteModel, NoteMessage> => ({
  model,
  commands: [mapMessage(copyText(model.text), message => NoteMessage.Clipboard({ message }))],
})
```

## Find a primitive by task

| You want to | Reach for | In |
| --- | --- | --- |
| Follow the color scheme, reduced motion or any media query | `MediaQuery`, `PrefersDark`, `PrefersReducedMotion` | [media](./media/README.md) |
| Change the layout at named widths | `Breakpoints` | [media](./media/README.md) |
| Know whether the tab is visible, the window's size, or the user idle | `Visibility`, `WindowSize`, `Idle` | [events](./events/README.md) |
| Answer keyboard shortcuts, and draw their labels | `keyboardEvents`, `matchHotkey`, `formatHotkey` | [events](./events/README.md) |
| Count ticks, or run something on an interval | `Timer`, `Interval`, `ticks` | [time](./time/README.md) |
| Wait until typing stops, or limit how often something runs | `debounce`, `Throttle` | [time](./time/README.md) |
| Say "3 minutes ago" | `formatRelativeTime` | [time](./time/README.md) |
| Page through a list | `Pagination`, `range` | [state](./state/README.md) |
| Undo and redo | `history`, `History` | [state](./state/README.md) |
| Draw only the visible rows of a long list | `Virtual` (`WindowList` in `foldkit-mixins-ui`) | [state](./state/README.md) |
| Animate a value, or let an element leave before it is removed | `Tween`, `Spring`, `Presence` | [motion](./motion/README.md) |
| Move with arrow keys through a list, grid, tree, or board | `RovingTabindex`, `ListNavigation`, `GridNavigation` | [interaction](./interaction/README.md#choosing-between-near-neighbours) |
| Close a popup on Escape or an outside press | `DismissLayer`, `Overlay` | [interaction](./interaction/README.md) |
| Press, long-press, or repeat while held (a stepper) | `Press`, `LongPress`, `Repeat` | [interaction](./interaction/README.md) |
| Drag a window or handle, and nudge or resize it by keys | `Move`, `Move.nudge`, `Move.resizeKeys`, `Box` | [interaction](./interaction/README.md) |
| Reorder a list or tree by keys and by pointer | `Reorder`, `PointerDrag` | [interaction](./interaction/README.md) |
| Select items, with Shift ranges or a lasso | `Selection`, `Marquee` | [interaction](./interaction/README.md) |
| Swipe a row open, or settle a scroller on an item | `SwipeActions`, `Swipe`, `ScrollSettle` | [interaction](./interaction/README.md) |
| Keep focus when a row goes, or return it when an overlay closes | `FocusRecovery`, `FocusReturn`, `FocusScope` | [interaction](./interaction/README.md#choosing-between-near-neighbours) |
| Read where the pointer is inside an element | `PointerPosition` | [dom](./dom/README.md) |
| Edit text in place | `InlineEdit`, `EditableText` | [interaction](./interaction/README.md#choosing-between-near-neighbours) |
| Tell a screen reader what changed | `LiveAnnounce` | [interaction](./interaction/README.md) |
| Know whether the browser is online, or talk over a socket | `Online`, `websocket`, `sse` | [net](./net/README.md) |
| Talk between tabs | `broadcastMessages`, `SharedHost` | [net](./net/README.md) |
| Use the camera, the location or a permission | `mediaStream`, `Geolocation`, `permissions` | [device](./device/README.md) |
| Track one element's size or visibility | `Resize`, `Intersection`, `Bounds` | [observers](./observers/README.md) |
| Focus, mask or keep an element in view | `Autofocus`, `InputMask`, `KeepInView` | [dom](./dom/README.md) |
| Copy, share, load a script or restore scroll | `copyText`, `share`, `loadScript`, `keepScroll` | [dom](./dom/README.md) |

Working widgets built from the interaction primitives are listed under [In the examples](./interaction/README.md#in-the-examples).

## Subpaths by concern

Each subpath is one concern and one import. Its README has the full reference for every Model shape, Message, argument, and failure rule.

| Subpath | What it covers | Key exports |
| --- | --- | --- |
| [`media`](./media/README.md) | environment queries | `MediaQuery`, `PrefersDark`, `PrefersReducedMotion`, `Breakpoints` |
| [`net`](./net/README.md) | network & tabs | `Online`, `websocket`, `sse`, `broadcastMessages`, `SharedHost` |
| [`time`](./time/README.md) | timers & formatting | `Timer`, `Interval`, `ticks`, `debounce`, `Throttle`, `formatRelativeTime` |
| [`state`](./state/README.md) | UI state helpers | `Pagination`, `history`, `Box`, `Locale`, `SelectionSet`, `Virtual`, `range` |
| [`motion`](./motion/README.md) | animation | `Tween`, `Spring`, `Presence`, the `Motion` service |
| [`interaction`](./interaction/README.md) | keyboard & pointer | `RovingTabindex`, `ListNavigation`, `Press`, `Move`, `DismissLayer`, and more |
| [`device`](./device/README.md) | hardware APIs | `Geolocation`, `mediaDevices`, `mediaStream`, `permissions`, fullscreen |
| [`events`](./events/README.md) | window events | `Visibility`, `WindowSize`, `Idle`, `keyboardEvents`, `matchHotkey`, and more |
| [`observers`](./observers/README.md) | element observers | `Resize`, `Intersection`, `Mutation`, `Bounds` |
| [`dom`](./dom/README.md) | element mounts & cmds | `Autofocus`, `InputMask`, `FocusScope`, `copyText`, `share`, `keepScroll`, and more |

## Rules every primitive keeps

These guarantees hold across every subpath:

- **Unchanged facts preserve Model identity.** When a resize, start, or update produces the same value, the placement returns the parent Model unchanged so Foldkit skips re-rendering and `createLazy` views stay cached.
- **Initial values are safe defaults, not live reads.** Slices start at safe values (`matches: false`, `online: true`, `0`) for server rendering; the subscription updates them once mounted in a browser.
- **Missing platform APIs degrade gracefully.** Streams stay empty, Commands yield failure Messages (`CopyFailed`, `ShareFailed`), and Mounts stay idle rather than throwing.
- **One placement observes once.** Share a single placed field across components that read the same query; `assemble` refuses duplicate module-scoped resource tags such as sockets or camera streams.
- **Settled values require `onOut`.** Primitives that emit outcomes (`debounce`, `Throttle`, `Press`, `DismissLayer`) require `onOut` when placed, or `Bundle.ignore` to opt out explicitly.
- **Timed work runs on Effect's clock.** Timers, tweens, debounces, and idle detectors advance deterministically under `TestClock.adjust`.
- **Reduced motion uses the `Motion` service.** Provide `Motion.live` in your runtime resources, or `Motion.reduced` / `Motion.full` in tests; full motion is the default when omitted.
- **DOM elements stay out of the Model.** Focus and mutation reports carry serializable ids and metadata (`{ tag, id }`) rather than element references.

## Testing a placement

Three patterns cover primitive tests without global mocks:

1. **Substitute the environment.** Factories accept `create` (streams, devices, permissions, sockets) or `request` (camera) doubles so tests pass deterministic fakes.
2. **Advance time with `TestClock.adjust`.** Yield once after forking a subscription so listeners register before advancing the clock.
3. **Bound stream reads.** Collect test outputs with a bounded `Stream.take` so a stalled stream fails quickly with a clear message.

## Composing with Surface and Mirror

Placed primitive state lives in your ordinary Model, so you can read it in a `foldkit-surface` projection, expose it to an agent, or persist it in the URL with `Mirror.url`. For state that must survive page reloads via `KeyValueStore`, pair it with `Mirror.kv`; primitives track live session facts only.

## Limits

- Built-in presets cover common media queries; custom queries pass `args`.
- `Virtual` windows a single scroll axis; 2D virtualized grids are outside its scope.
- Collaborative merging and offline outboxes belong in [`foldkit-sync`](../sync/README.md).

## Next

- Place and wire multiple primitives cleanly: [`foldkit-bundle`](../bundle/README.md).
- Build styled components from interaction primitives: [Authoring components](../../docs/authoring-components.md).
- Use ready-made styled widgets built on these primitives: [`foldkit-mixins-ui`](../mixins-ui/README.md).
