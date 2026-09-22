# `foldkit-primitives/observers`

Element-scoped observation as Mounts: attach in views with `h.OnMount`, never in Model
slots. See the [package README](../README.md) for the full guide; this page is the
reference card.
([source](https://github.com/doeixd/foldkit-plus/blob/main/packages/primitives/src/observers))

## Owns

Nothing. The element owns what is observed; Mounts report it as Messages while the
element is live and disconnect on unmount.

## First example

```text
element → Mount → measurement Message → update → Model → view
```

```ts
import { Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Resize } from 'foldkit-primitives/observers'

const Message = defineMessageUnion({
  Resized: { width: Schema.Number, height: Schema.Number },
})
type Message = typeof Message.Type
type Model = { readonly width: number; readonly height: number }

const update = (_model: Model, message: Message) => ({
  model: { width: message.width, height: message.height },
})
const view = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div([h.OnMount(Resize())], [`${model.width} × ${model.height}`])
```

`Resize()` declares a Mount. `h.OnMount` attaches it to this element; the runtime starts
observation on mount and disconnects on unmount. The reducer stores measurements in the
parent Model. Add other application Message variants as needed and route `Resized` to
this branch.

## Exports

| Name | Form | Reports |
| --- | --- | --- |
| `Resize` | Mount | `Resized { width, height }` from the content box |
| `Intersection` | Mount | `IntersectionChanged { isIntersecting, ratio }` on crossings |
| `Mutation` | Mount | `Mutated { type, added, removed, attribute }`, nodes as names |
| `Bounds` | Mount | `Measured { x, y, width, height }`, current first |

`Bounds` re-measures on observer, scroll (capture, so containers count), and resize;
without a `ResizeObserver` the window events still measure. Unknown mutation record
types are skipped. Do not use observation Messages to trigger irreversible effects:
layout observations can repeat, including during replay-related view changes.

## Failure

No observer API (SSR, old browser): emit nothing instead of throwing.
