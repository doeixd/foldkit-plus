# `foldkit-primitives/events`

Raw browser events: visibility, size, idleness, keys, pointer, scroll,
focus. See the [package README](../README.md) for the full guide; this
page is the reference card. ([source](https://github.com/doeixd/foldkit-plus/blob/main/packages/primitives/src/events))

## Owns

Nothing by itself. Bundles keep a stored fact (`Visibility`, `WindowSize`,
`Idle`); entries report and the parent keeps what matters. Element-scoped
needs belong to Mounts, not these window-level streams.

## Exports

| Name | Form | Needs |
| --- | --- | --- |
| `Visibility` | bundle `{ visible }` | none |
| `WindowSize` | bundle `{ width, height }` | none |
| `Idle` | bundle `{ idle }` | `{ timeoutMs }` |
| `keyboardEvents` | entry: presses (keys + modifiers) and releases | none |
| `matchHotkey` | pure: pattern + press → chord answer | — |
| `pointerEvents` | entry: moves `{ x, y }` | none |
| `scrollEvents` | entry: positions (capture: containers included) | none |
| `activeElementEvents` | entry: focus `{ tag, id }` | none |

Lift entries with `Subscription.persistent`, mapping into the parent's
Message. Hotkey matching is exact with Mac aliases; auto-repeat never
matches. Placing both `WindowSize` and `Breakpoints` doubles resize
listeners.

## Example

```ts
import { Bundle } from 'foldkit-bundle'
import { Visibility } from 'foldkit-primitives/events'

const Tab = Bundle.declare(Visibility, 'tab')
// ...Model/Message/parent, then:
Page.assemble(Page.at(Tab))
```

Entries lift beside it, mapping into the same Message union:

```ts
import { Stream } from 'effect'
import * as Subscription from 'foldkit/subscription'
import { keyboardEvents, type KeyboardMessage } from 'foldkit-primitives/events'

type Pressed = Extract<KeyboardMessage, { readonly _tag: 'Pressed' }>

changes: Subscription.persistent(
  Stream.map(
    Stream.filter(
      keyboardEvents(),
      (message): message is Pressed => message._tag === 'Pressed',
    ),
    pressed => KeyMessage.Key({ key: pressed.key }),
  ),
),
```

where `KeyMessage` is the parent union with a `Key { key }` variant. The
filter's type predicate is what keeps `.key` typed — a boolean filter
alone does not narrow the union.

## Failure

No window (SSR): every stream here is empty, every init a safe default.
