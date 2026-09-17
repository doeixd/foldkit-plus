# `foldkit-primitives/observers`

Element-scoped observation as Mounts: attach in views with `h.OnMount`,
never in Model slots. See the [package README](../README.md) for the full
guide; this page is the reference card. ([source](https://github.com/doeixd/foldkit-plus/blob/main/packages/primitives/src/observers))

## Owns

Nothing. The element owns what is observed; Mounts report it as Messages
while the element is live and disconnect on unmount.

## Exports

| Name | Form | Reports |
| --- | --- | --- |
| `Resize` | Mount | `Resized { width, height }` from the content box |
| `Intersection` | Mount | `IntersectionChanged { isIntersecting, ratio }` on crossings |
| `Mutation` | Mount | `Mutated { type, added, removed, attribute }`, nodes as names |
| `Bounds` | Mount | `Measured { x, y, width, height }`, current first |

`Bounds` re-measures on observer, scroll (capture, so containers count),
and resize; without a `ResizeObserver` the window events still measure.
Unknown mutation record types are skipped. They keep observing across
time-travel pause — replay traffic is same-valued and harmless.

## Example

```ts
import type { Html, HtmlBuilder } from 'foldkit/html'
import { Resize } from 'foldkit-primitives/observers'

const panel = (model: KeyModel, h: HtmlBuilder<KeyMessage>): Html =>
  h.div([h.OnMount(Resize())], [model.lastKey])
```

where the view's `KeyMessage` union includes the Mount's message shape
(`Resized { width, height }`), so the action types where it attaches.

## Failure

No observer API (SSR, old browser): emit nothing instead of throwing.
