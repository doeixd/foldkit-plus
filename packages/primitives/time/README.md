# `foldkit-primitives/time`

What the clock said last: a count of ticks, when the last one was, a value that
settled after the typing stopped. Everything here runs on Effect's clock, so a
test advances it with `TestClock.adjust` instead of waiting.
([source](https://github.com/doeixd/foldkit-plus/blob/main/packages/primitives/src/time))

| Name | Form | Model | Messages | Args |
| --- | --- | --- | --- | --- |
| `Timer` | bundle | `{ count, running }` | `Started`, `Stopped`, `Ticked` | `{ intervalMs }` |
| `Interval` | bundle | `{ running, lastAt }` | `Started`, `Stopped`, `Ticked { at }` | `{ intervalMs }` |
| `ticks({ intervalMs, onTick })` | entry | | your Message | |
| `debounce({ name, value })` | bundle factory | `{ latest, generation }` | `Changed { value }`; out: `Debounced { value }` | `{ delayMs }` + `onOut` |
| `Throttle` | bundle | | `Attempted`; out: `Throttled { at }` | `{ intervalMs }` + `onOut` |
| `formatRelativeTime(from, to, locale?)` | function | | | |

## Start with one: a timer

```ts
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { Bundle } from 'foldkit-bundle'
import { Timer, TimerMessage } from 'foldkit-primitives/time'

const Page = Bundle.compose({}).pipe(
  Bundle.withChild('ticks', Timer, { args: { intervalMs: 1000 } }),
)
type Model = typeof Page.Model.Type
type Message = typeof Page.Message.Type
const { placements } = Page

const config = placements.complete({
  init: () => placements.initial({}),
  update: placements.update(model => ({ model })),
  view: (model: Model, h: HtmlBuilder<Message>) =>
    h.button(
      [h.OnClick(Page.Message.GotTicksMessage({ message: TimerMessage.Started() }))],
      [String(model.ticks.count)],
    ),
  subscriptions: placements.subscriptions(),
})
```

A timer starts stopped, and its stream is empty while stopped. `Started` runs
it; the first tick comes one interval later, and only `Ticked` advances the
count. `Stopped` pauses without resetting. An interval that is not positive
and finite is rejected at placement.

`Interval` is the wall-clock sibling: `Ticked { at }` is stamped from Effect's
clock and `lastAt` keeps it, for a view that renders a clock or an elapsed
time. `Timer` counts, `Interval` records when.

## `ticks`: a clock the Model drives

Both bundles own a `running` flag at an interval fixed where they are placed.
When the parent's Model already decides whether the clock runs and how fast (a
game's phase and score), a second flag would be a second owner of that fact.
`ticks` is the entry for that case: `intervalMs` reads the interval from the
Model, `None` while stopped, and `onTick` makes the parent's Message:

```ts
import { Option } from 'effect'
import * as Subscription from 'foldkit/subscription'
import { ticks } from 'foldkit-primitives/time'

const subscriptions = Subscription.make<Game, GameMessage>()(() => ({
  clock: ticks({
    intervalMs: (game: Game) =>
      game.playing ? Option.some(Math.max(80, 150 - game.points)) : Option.none(),
    onTick: () => GameMessage.TickedClock(),
  }),
}))
```

A Model change that leaves the interval alone does nothing. A new interval
applies from the next tick without restarting the clock, so a game that speeds
up keeps its rhythm instead of ticking at once; `None` stops it, and `Some`
again starts afresh, one interval before the first tick. `Timer` and `Interval`
are built on it. An interval that answers zero, negative, or non-finite throws,
which crashes the runtime naming the mistake.

## `debounce` and `Throttle`

`debounce({ name, value })` is a factory over any value Schema. `Changed`
restarts a `delayMs` timer, and only the latest value settles, as an
OutMessage the placement must handle with `onOut`, so a settled search query
can never be dropped by omission:

```ts
import type * as Update from 'foldkit/update'
import { debounce } from 'foldkit-primitives/time'

const Query = debounce({ name: 'Query', value: Schema.String })

const Base = Bundle.compose({ results: Schema.Array(Schema.String) }).pipe(
  Bundle.withMessages({ Found: { results: Schema.Array(Schema.String) } }),
  Bundle.withChild('query', Query),
)
type SearchModel = typeof Base.Model.Type
type SearchMessage = typeof Base.Message.Type

const fire =
  ({ value }: { readonly value: string }): Update.Step<SearchModel, SearchMessage> =>
  model => ({ model, commands: [search(value)] })

const Search = Base.pipe(Bundle.configure('query', { args: { delayMs: 300 }, onOut: fire }))
```

The `onOut` returns a Command whose Message is the parent's own `Found`, so
it is written against `Base.Model` and `Base.Message` and given through
`Bundle.configure`, as the [Bundle README](../../bundle/README.md#composing-a-parent)
describes for a config made from the parent. An `onOut` that only writes the
Model goes straight in `withChild`'s config.

Each `Changed` bumps a generation the scheduled `Settled` carries; a superseded
timer's fact arrives with an old generation and emits nothing.

`Throttle` is the leading edge to debounce's trailing one: the first
`Attempted` in an `intervalMs` window surfaces `Throttled { at }` (through
`onOut`, likewise required) and the rest are dropped. `Attempted` reads the
clock through a Command, so the check runs on Effect time and tests drive it;
the window boundary counts as past. Pair the two rather than adding a second
timer.

## Relative time

`formatRelativeTime(from, to, locale?)` picks the unit, seconds through years,
and lets `Intl.RelativeTimeFormat` word it, so locales come from the platform
rather than a phrase table. There is deliberately no `now` helper:
`Clock.currentTimeMillis` already is it.

## Failure

A non-positive or non-finite interval is rejected at placement. While stopped,
a tick stream is empty. A superseded debounce timer emits nothing.
