# `foldkit-primitives/events`

Raw browser events: visibility, size, idleness, keys, pointer, scroll, focus. See the
[package README](../README.md) for the full guide; this page walks through one placement
before the API reference.
([source](https://github.com/doeixd/foldkit-plus/blob/main/packages/primitives/src/events))

## Owns

Nothing by itself. Bundles keep a stored fact (`Visibility`, `WindowSize`, `Idle`);
entries report and the parent keeps what matters. Element-scoped needs belong to Mounts,
not these window-level streams.

```text
browser / clock → subscription → Message → update → parent Model
```

## Start with one slice

```ts
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { Visibility } from 'foldkit-primitives/events'

const Tab = Bundle.declare(Visibility, 'tab')
const Model = Schema.Struct({ ...Tab.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Tab.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const placements = Page.assemble(Page.at(Tab))

const config = placements.complete({
  init: () => placements.initial({}),
  update: placements.update(model => ({ model })),
  view: (model: Model, h: HtmlBuilder<Message>) => h.div([], [String(model.tab.visible)]),
  subscriptions: placements.subscriptions(),
})
```

The initial value reads the document when available and assumes visible on the server.
The subscription reports the current visibility and subsequent changes. Your application
decides which work to pause when the tab becomes hidden.

`config` is a Foldkit application configuration. Creating it does not start the
subscription; pass it to your Foldkit runtime. The parent Model owns the slice, and
`placements.update` routes its wrapper Messages. See the [Bundle
guide](../../bundle/README.md) for mounting and composing placements.

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

Lift entries with `Subscription.persistent`, mapping into the parent's Message. Hotkey
matching is exact with Mac aliases; auto-repeat never matches. Placing both `WindowSize`
and `Breakpoints` doubles resize listeners.

## Failure

No window (SSR): every stream here is empty, every init a safe default.
