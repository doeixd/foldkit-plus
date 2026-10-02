# `foldkit-primitives/observers`

Element-scoped observation as Mounts: attach one in a view with `h.OnMount`
on the element it watches. The element owns what is observed; the Mount
reports it as Messages while the element is live and disconnects on unmount.
There is no ref to thread, because a Mount receives its element.
([source](https://github.com/doeixd/foldkit-plus/blob/main/packages/primitives/src/observers))

| Name | Reports |
| --- | --- |
| `Resize()` | `Resized { width, height }`, the content box |
| `Intersection()` | `IntersectionChanged { isIntersecting, ratio }`, on viewport crossings |
| `Mutation()` | `Mutated { type, added, removed, attribute }`, across the subtree |
| `Bounds()` | `Measured { x, y, width, height }`, the current rect first |

## Start with one: an element's size

```ts
import { Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Resize } from 'foldkit-primitives/observers'

const Message = defineMessageUnion({ Resized: { width: Schema.Number, height: Schema.Number } })
type Message = typeof Message.Type
type Model = { readonly width: number; readonly height: number }

const update = (_model: Model, message: Message) => ({
  model: { width: message.width, height: message.height },
})

const view = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div([h.OnMount(Resize())], [`${model.width} × ${model.height}`])
```

`Resize()` declares the Mount; `h.OnMount` attaches it to this element. The
runtime starts observing on mount and disconnects on unmount, and the Message
the Mount sends is part of the view's union, so it is typed where it attaches.
A real application routes `Resized` beside its other Messages.

## The four

`Resize()` reports the element's content box. `Intersection()` reports
viewport crossings. `Mutation()` reports child, attribute, and text changes
across the whole subtree, with nodes crossing as names, never as live objects;
an unknown record type is skipped. `Bounds()` re-measures on observer, scroll
(capture, so containers count), and resize, starting with the current rect;
without a `ResizeObserver` the window events still measure.

Treat a repeated measurement as an observation, not proof that a user did
something: layout observations can repeat, including during replay-related
view changes, so never trigger an irreversible effect from one.

## Failure

Without the observer API (a server, an old browser) a Mount emits nothing
instead of throwing. A Mount reads its args once, on insert: a render that
passes new args to the same element changes nothing, so key the element by
what the args depend on.
