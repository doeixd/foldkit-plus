# `foldkit-primitives/time`

Clock facts: counts, stamps, settled values, and relative phrasing. See the
[package README](../README.md) for the full guide; this page is the reference
card. ([source](https://github.com/doeixd/foldkit-plus/blob/main/packages/primitives/src/time))

## Owns

What time said last, as parent-Model facts. Everything ticking runs on
Effect's clock, so tests advance it with `TestClock` instead of waiting.

## Exports

| Name | Form | Needs |
| --- | --- | --- |
| `Timer` | bundle `{ count, running }` | `{ intervalMs }` |
| `Interval` | bundle `{ running, lastAt }` | `{ intervalMs }` |
| `debounce` | factory: latest value settles as OutMessage | `{ delayMs }` + `onOut` |
| `Throttle` | bundle: first attempt per window fires as OutMessage | `{ intervalMs }` + `onOut` |
| `formatRelativeTime` | pure: two dates → "3 days ago" | — |

`Timer` counts ticks, `Interval` records when. `Throttle` is the leading
edge to `debounce`'s trailing one — pair them, don't add a second timer.
OutMessages are required at placement (`Bundle.ignore` drops on purpose).
There is deliberately no `now` helper: `Clock.currentTimeMillis` is it.

## Example

```ts
import { Bundle } from 'foldkit-bundle'
import { Timer } from 'foldkit-primitives/time'

const Ticks = Bundle.declare(Timer, 'ticks')
// ...Model/Message/parent, then:
Page.assemble(Page.at(Ticks, { args: { intervalMs: 1000 } }))
```

Drive it in tests with `TestClock.adjust` instead of waiting.

## Failure

Non-positive or non-finite intervals are rejected at placement. While
stopped, tick streams are empty. A superseded debounce timer emits nothing.
