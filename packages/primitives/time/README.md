# `foldkit-primitives/time`

Clock facts: counts, stamps, settled values, and relative phrasing. See the [package
README](../README.md) for the full guide; this page walks through one placement before
the API reference.
([source](https://github.com/doeixd/foldkit-plus/blob/main/packages/primitives/src/time))

## Owns

What time said last, as parent-Model facts. Everything ticking runs on Effect's clock,
so tests advance it with `TestClock` instead of waiting.

```text
browser / clock → subscription → Message → update → parent Model
```

## Start with one slice

```ts
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { Timer } from 'foldkit-primitives/time'

const Ticks = Bundle.declare(Timer, 'ticks')
const Model = Schema.Struct({ ...Ticks.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Ticks.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const placements = Page.assemble(Page.at(Ticks, { args: { intervalMs: 1000 } }))

const config = placements.complete({
  init: () => placements.initial({}),
  update: placements.update(model => ({ model })),
  view: (model: Model, h: HtmlBuilder<Message>) => h.div([], [String(model.ticks.count)]),
  subscriptions: placements.subscriptions(),
})
```

Timer starts stopped. Dispatch `Message.GotTicksMessage({ message:
TimerMessage.Started() })` to start it (import `TimerMessage` from this subpath);
`Stopped()` pauses without resetting the count. Only `Ticked` increments it.

`config` is a Foldkit application configuration. Creating it does not start the
subscription; pass it to your Foldkit runtime. The parent Model owns the slice, and
`placements.update` routes its wrapper Messages. See the [Bundle
guide](../../bundle/README.md) for mounting and composing placements.

## Exports

| Name | Form | Needs |
| --- | --- | --- |
| `Timer` | bundle `{ count, running }` | `{ intervalMs }` |
| `Interval` | bundle `{ running, lastAt }` | `{ intervalMs }` |
| `debounce` | factory: latest value settles as OutMessage | `{ delayMs }` + `onOut` |
| `Throttle` | bundle: first attempt per window fires as OutMessage | `{ intervalMs }` + `onOut` |
| `formatRelativeTime` | pure: two dates → "3 days ago" | — |

`Timer` counts ticks, `Interval` records when. `Throttle` is the leading edge to
`debounce`'s trailing one — pair them, don't add a second timer. OutMessages are
required at placement (`Bundle.ignore` drops on purpose). There is deliberately no `now`
helper: `Clock.currentTimeMillis` is it.

## Failure

Non-positive or non-finite intervals are rejected at placement. While stopped, tick
streams are empty. A superseded debounce timer emits nothing.
