# `foldkit-primitives/motion`

Animation state: values moving over time, in the Model. See the [package
README](../README.md) for the full guide; this page walks through one placement before
the API reference.
([source](https://github.com/doeixd/foldkit-plus/blob/main/packages/primitives/src/motion))

## Owns

Where an animation is, as parent-Model facts. Easing curves stay the application's job;
these bundles move numbers.

```text
browser / clock → subscription → Message → update → parent Model
```

## Start with one slice

```ts
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { Tween } from 'foldkit-primitives/motion'

const Slide = Bundle.declare(Tween, 'slide')
const Model = Schema.Struct({ ...Slide.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Slide.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const placements = Page.assemble(Page.at(Slide, { args: { from: 0, to: 1, ms: 200 } }))

const config = placements.complete({
  init: () => placements.initial({}),
  update: placements.update(model => ({ model })),
  view: (model: Model, h: HtmlBuilder<Message>) => h.div([], [String(model.slide.value)]),
  subscriptions: placements.subscriptions(),
})
```

The tween starts at `0`, stopped. Dispatch `Message.GotSlideMessage({ message:
TweenMessage.Started() })` to animate (import `TweenMessage` from this subpath).
`Stopped()` holds the current value; a new start runs the configured `from` → `to`
trajectory again. The view decides how the number affects CSS.

`config` is a Foldkit application configuration. Creating it does not start the
subscription; pass it to your Foldkit runtime. The parent Model owns the slice, and
`placements.update` routes its wrapper Messages. See the [Bundle
guide](../../bundle/README.md) for mounting and composing placements.

## Exports

| Name | Form | Needs |
| --- | --- | --- |
| `Tween` | bundle `{ value, running }`, linear over `ms` | `{ from, to, ms }` |
| `Spring` | bundle `{ value, velocity, running }`, physics | `{ from, to, stiffness, damping }` |
| `Presence` | bundle `{ phase, generation }` for exit animations | `{ durationMs }` |

`Tween` (fixed duration) versus `Spring` (settles): pick the motion, not both. Both end
with `Finished` carrying the exact end value. `Presence` times its exit with a Command;
a late `Hidden` loses to an intervening `Show` by generation. `isVisible` reads whether
content renders.

## Failure

Non-positive or non-finite durations are rejected at placement. Stopped streams are
empty; `Finished` still rests the value exactly.
