# `foldkit-primitives`

Ready-made pieces of browser, clock, device, and interaction state for a
Foldkit application: a media query, a timer, a socket, an undo stack, a roving
tab stop, a resize observer, a clipboard write. Each comes in the shape Foldkit
already has, so adding one adds no store, no hook, and no second reducer. The
fact lives in your Model, arrives as a Message, and replays like everything
else.

```ts
import { MediaQuery } from 'foldkit-primitives/media'
```

> **The browser reports; the Model owns.** A primitive observes something and
> hands your `update` a Message. What your application keeps, and what it does
> about it, stays yours.

## Which form a primitive takes

Every primitive is one of five things, chosen by what it has to own:

| It needs to own | Form | Joins the application by | Examples |
| --- | --- | --- | --- |
| A fact that outlives the moment: a match, a count, a page, a position | **bundle** | placing it in the parent, as a field and a wrapper Message | `MediaQuery`, `Timer`, `Pagination`, `websocket` |
| Interaction state a view's slots must reflect | **bundle + Behavior** | placing it, then attaching its Behavior to the view's slots | `RovingTabindex`, `Press`, `DismissLayer` |
| Nothing: a stream you react to | **entry** | lifting it into your Subscriptions, mapped to your Message | `keyboardEvents`, `ticks`, `broadcastMessages` |
| Nothing: observation bound to one element | **Mount** | attaching it in the view with `h.OnMount` | `Resize`, `Autofocus`, `KeepInView` |
| Nothing: work done once that reports back | **Command** | returning it from `update` | `copyText`, `share`, `enterFullscreen` |
| Nothing: a value computed from what you have | **function** | calling it | `range`, `matchHotkey`, `formatRelativeTime` |

The lighter form wins when in doubt. Promote to a bundle the day the state
needs a name in the Model.

The one dependency is [`foldkit-bundle`](../bundle), whose placement
mechanism every bundle here uses. `interaction` additionally needs
[`foldkit-mixins`](../mixins), an optional peer, because its Behaviors write to
a view's slots.

## Install

```bash
pnpm add foldkit-primitives foldkit-bundle effect foldkit
```

`effect` and `foldkit` are peer dependencies. Import by subpath (`/media`,
`/net`, `/time`, `/state`, `/motion`, `/interaction`, `/device`, `/events`,
`/observers`, `/dom`) so a bundler drops what you never import.

## Sixty seconds: follow the color scheme

A bundle is placed in a parent, which gains a field for its state and a
wrapper Message for its transitions:

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

What each line does, and does not do:

- **`Bundle.compose(...).pipe(withChild('dark', MediaQuery, …))`** states the
  parent: its own field `theme`, its own Message `ThemeSet`, and `MediaQuery`
  under `dark`. The Model is `{ theme, dark: { matches } }`; the Message union
  gains `GotDarkMessage`. Nothing runs.
- **`placements.initial({ theme: 'light' })`** gives the fields no placement
  owns; `dark` starts at `{ matches: false }`.
- **`placements.update(own)`** routes `GotDarkMessage` to the bundle and
  everything else to your own update.
- **`placements.subscriptions()`** is the `matchMedia` stream, lifted. The
  browser is touched only when the runtime subscribes, which then corrects
  `matches` at once.
- **`config`** is an ordinary Foldkit application config. Hand it to the
  runtime.

The Solid line this replaces is `createMediaQuery('(prefers-color-scheme: dark)')`.
The difference is where the answer lives: in the Model, where replay,
DevTools, an agent, and a server render all see it.

## The other three ways in

**An entry**, lifted into your Subscriptions and mapped to your Message. The
parent keeps whatever it wants of the stream:

```ts
import { Stream } from 'effect'
import * as Subscription from 'foldkit/subscription'
import { keyboardEvents } from 'foldkit-primitives/events'

const subscriptions = Subscription.make<GameModel, GameMessage>()(() => ({
  keys: Subscription.persistent(
    keyboardEvents({ preventDefault: press => press.key.startsWith('Arrow') }).pipe(
      Stream.filter(event => event._tag === 'Pressed'),
      Stream.map(({ key }) => GameMessage.PressedKey({ key })),
    ),
  ),
}))
```

**A Mount**, attached to the element it observes. No ref to thread: the Mount
receives its element.

```ts
import { Resize } from 'foldkit-primitives/observers'

const panel = (model: PanelModel, h: HtmlBuilder<PanelMessage>) =>
  h.div([h.OnMount(Resize())], [`${model.width} × ${model.height}`])
```

**A Command**, returned from `update`, whose result comes back as a Message
your union wraps:

```ts
import { mapMessage } from 'foldkit/command'
import { copyText } from 'foldkit-primitives/dom'

const copy = (model: NoteModel): Update.Return<NoteModel, NoteMessage> => ({
  model,
  commands: [mapMessage(copyText(model.text), message => NoteMessage.Clipboard({ message }))],
})
```

## The map

Each subpath is one concern and one import. Its README has the full
reference: every Model shape, Message, argument, and failure rule.

| Subpath | What it covers | Primitives |
| --- | --- | --- |
| [`media`](./media/README.md) | the environment | `MediaQuery` (+ `PrefersDark`, `PrefersReducedMotion`), `Breakpoints`, `platformFromUA`, `isBrowser` |
| [`net`](./net/README.md) | the network | `Online`, `websocket`, `sse`, `broadcastMessages`, `postBroadcast` |
| [`time`](./time/README.md) | the clock | `Timer`, `Interval`, `ticks`, `debounce`, `Throttle`, `formatRelativeTime` |
| [`state`](./state/README.md) | UI state with nowhere else to live | `Pagination`, `history`, `Locale`, `SelectionSet`, `Virtual`, `range`, layout math |
| [`motion`](./motion/README.md) | animation | `Tween`, `Spring`, `Presence`, the `Motion` service |
| [`interaction`](./interaction/README.md) | keyboard, pointer, and focus patterns, with their Behaviors | `RovingTabindex`, `Typeahead`, `ListNavigation`, `GridNavigation`, `TreeNavigation`, `FocusScope`, `Press`, `LongPress`, `Move`, `Targets`, `PointerDrag`, `EditableText`, `FocusVisible`, `DismissLayer`, `Layers`, `Selection`, `LiveAnnounce` |
| [`device`](./device/README.md) | hardware | `Geolocation`, `mediaDevices`, `mediaStream`, `permissions`, fullscreen |
| [`events`](./events/README.md) | raw window events | `Visibility`, `WindowSize`, `Idle`, `InputModality`, `keyboardEvents`, `pointerEvents`, `scrollEvents`, `activeElementEvents`, `matchHotkey` |
| [`observers`](./observers/README.md) | element observers | `Resize`, `Intersection`, `Mutation`, `Bounds` |
| [`dom`](./dom/README.md) | element Mounts and one-shot Commands | `Autofocus`, `InputMask`, `KeepInView`, `Measure`, `FocusScope`, `FollowTabStop`, `ScrollLock`, `HideOutside`, `copyText`, `readText`, `share`, `loadScript`, `keepScroll` |

## Rules every primitive keeps

These hold across the package, so the subpath pages do not repeat them.

- **A fact that changed nothing returns the Model it was given.** A repeated
  resize, `Started` while running, a total already held: the placement then
  returns the parent unchanged, Foldkit renders nothing, and a `createLazy` view
  over the slice is skipped.
- **Init is a safe default, not a read.** `matches: false`, `online: true`, a
  count of zero. A server render shows these; the subscription corrects them on
  the client. Do not infer readiness from the default.
- **Without the platform API, nothing throws.** A stream is empty and the
  slice keeps its default; a Command yields its failure Message (`CopyFailed`,
  `ShareFailed`); a Mount emits nothing.
- **One placement observes once.** Two placements of one query open two
  listeners; share the field. One assembly holds one socket, stream, camera,
  or permission watch: their resource tags are per module, and `assemble`
  refuses the second.
- **An OutMessage cannot be dropped by omission.** `debounce`, `Throttle`,
  `Press`, `DismissLayer`, and the rest that surface a settled value require
  `onOut` at placement. `Bundle.ignore` drops one on purpose.
- **Everything timed runs on Effect's clock.** Timers, tweens, debounces,
  presence, idle, typeahead. Tests advance them with `TestClock.adjust`
  instead of waiting.
- **Reduced motion is a service.** Provide `Motion.live` through the
  assembly's resources, or `Motion.reduced` and `Motion.full` in a test;
  absent, motion is full.
- **Elements never cross into the Model.** A focus report is `{ tag, id }`, a
  mutation names nodes, a target is its marked id.

## Testing a placement

Three ingredients, each shown in this package's `test/` directory under the
primitive's name:

1. **Substitute the environment.** Factories take a `create` (streams,
   devices, permissions, sockets) or `request` (camera) double, so a test
   passes a fake instead of stubbing a global.
2. **Advance time instead of waiting.** Anything on Effect's clock runs under
   `TestClock.adjust`. Yield after forking before the first adjust, or
   dispatched events reach listeners not yet registered.
3. **Never hang on a quiet stream.** Collect with a bounded take that fails
   fast naming the stall.

## With Surface and Mirror

Placed state is ordinary Model, so nothing here has a Surface or Mirror API of
its own. Declare a Surface over the placed fields to render them or expose them
to an agent; point `Mirror.url` at them to link them; spread the bundle's cases
into the same unions. A slice that must survive a reload persists through
`Mirror.kv`; this package owns live facts only.

## Limits

- Presets cover the common media queries; anything else passes `args`.
- `Virtual` windows one axis of a list; windowed grids stay out by design.
- `Sync.lww`-style merging, collaborative text, and other replicated state are
  [`foldkit-sync`](../sync)'s, not a primitive.
