# `foldkit-primitives/events`

Raw window events. Four bundles keep a stored fact (`Visibility`,
`WindowSize`, `Idle`, `InputModality`); four entries report keys, pointer
moves, scrolls, and focus, and the parent keeps whatever it wants of them.
Anything scoped to one element belongs to a Mount in [`observers`](../observers/README.md)
or [`dom`](../dom/README.md), not to these window-level streams.
([source](https://github.com/doeixd/foldkit-plus/blob/main/packages/primitives/src/events))

| Name | Form | Model | Messages | Args |
| --- | --- | --- | --- | --- |
| `Visibility` | bundle | `{ visible }` | `Changed { visible }` | none |
| `WindowSize` | bundle | `{ width, height }` | `Changed { width, height }` | none |
| `Idle` | bundle | `{ idle }` | `BecameIdle`, `BecameActive` | `{ timeoutMs }` |
| `InputModality` | bundle | `{ modality }` | `Changed { modality }` | none |
| `keyboardEvents({ preventDefault? })` | entry | | `Pressed { key, repeat, ctrl, shift, alt, meta }`, `Released { key }` | |
| `pointerEvents()` | entry | | `Moved { x, y }` | |
| `scrollEvents()` | entry | | `Scrolled { x, y }` | |
| `activeElementEvents()` | entry | | `Changed { tag, id }` | |
| `matchHotkey(pattern, press)` | function | | | |

## Start with one: is the tab visible

```ts
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { Bundle } from 'foldkit-bundle'
import { Visibility } from 'foldkit-primitives/events'

const Page = Bundle.compose({}).pipe(Bundle.withChild('tab', Visibility))
type Model = typeof Page.Model.Type
type Message = typeof Page.Message.Type
const { placements } = Page

const config = placements.complete({
  init: () => placements.initial({}),
  update: placements.update(model => ({ model })),
  view: (model: Model, h: HtmlBuilder<Message>) =>
    h.div([], [model.tab.visible ? 'Watching' : 'Paused']),
  subscriptions: placements.subscriptions(),
})
```

`init` reads the document when there is one and assumes visible on a server;
`visibilitychange` keeps it current. A hidden page is the application's cue to
pause polling and streams; that decision stays in your `update`, not here.

## `WindowSize`, `Idle`, `InputModality`

`WindowSize` keeps raw `{ width, height }`, read from the window on subscribe
and kept current by one `resize` listener; a server starts at zero. Placing it
beside `Breakpoints` doubles the listeners.

`Idle` keeps `idle: boolean` with `args.timeoutMs` (positive and finite).
While active, activity (mouse, keys, pointer, scroll) debounced past the
timeout settles to `BecameIdle`; while idle, the first activity wakes to
`BecameActive` and restarts the watch. It starts active, so a lurker idles once
the silence elapses, because subscribe time seeds the debounce.

`InputModality` keeps `{ modality }`, `'keyboard'`, `'pointer'`, or
`'unknown'` before any input, fed by the window's `keydown` (a modifier alone
says nothing) and `pointerdown`. `FocusVisible` in [`interaction`](../interaction/README.md)
turns it into a focus ring for keyboard users.

## The entries

`keyboardEvents()`, `pointerEvents()`, `scrollEvents()`, and
`activeElementEvents()` are entries, not bundles: the parent owns whatever
key, cursor, scroll, or focus state it keeps. Lift one with
`Subscription.persistent`, mapping into the parent's Message:

```ts
import { Stream } from 'effect'
import * as Subscription from 'foldkit/subscription'
import { keyboardEvents, matchHotkey } from 'foldkit-primitives/events'

const subscriptions = Subscription.make<EditorModel, EditorMessage>()(() => ({
  keys: Subscription.persistent(
    keyboardEvents({ preventDefault: press => matchHotkey('ctrl+s', press) }).pipe(
      Stream.filter(event => event._tag === 'Pressed' && matchHotkey('ctrl+s', event)),
      Stream.map(() => EditorMessage.SaveRequested()),
    ),
  ),
}))
```

They report presses (with repeat and modifiers) and releases, moves `{ x, y }`,
scroll positions (in the capture phase, so a container's scroll reports too),
and focus as `{ tag, id }`: an element crosses as its tag and id, never as a
live node. Without a window each stream is empty rather than throwing.

`matchHotkey('ctrl+shift+k', press)` answers whether a press is that chord, so
`update` stays a table of chords. Matching is exact, with Mac aliases, and an
auto-repeat never matches.

`keyboardEvents({ preventDefault })` cancels the default of the presses the
predicate picks (the arrows scrolling a game's page, a browser's own `ctrl+s`),
decided inside the listener, because a default can only be cancelled while the
event dispatches. The predicate reads the press, not the DOM event.

When the observed target depends on state, scope the entry through
subscription dependencies and it restreams on change.

## Failure

Without a window every stream is empty and every init a safe default.
