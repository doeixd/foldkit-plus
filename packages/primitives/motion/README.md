# `foldkit-primitives/motion`

Where an animation is, as a number in the Model: a tween over a fixed time, a
spring that settles, a mount transition that lets content leave before it is
removed. The view decides what the number does to CSS; easing curves stay the
application's job.
([source](https://github.com/doeixd/foldkit-plus/blob/main/packages/primitives/src/motion))

| Name | Form | Model | Messages | Args |
| --- | --- | --- | --- | --- |
| `Tween` | bundle | `{ value, running }` | `Started`, `Stopped`, `Ticked`, `Finished` | `{ from, to, ms }` |
| `Spring` | bundle | `{ value, velocity, running }` | `Started`, `Stopped`, `Ticked`, `Finished` | `{ from, to, stiffness, damping }` |
| `Presence` | bundle | `{ phase, generation }` | `Show`, `Hide`, `Hidden` | `{ durationMs }` |
| `Motion` | service | | | `Motion.live`, `.reduced`, `.full` |

## Start with one: a tween

```ts
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { Bundle } from 'foldkit-bundle'
import { Tween, TweenMessage } from 'foldkit-primitives/motion'

const Page = Bundle.compose({}).pipe(
  Bundle.withChild('slide', Tween, { args: { from: 0, to: 1, ms: 200 } }),
)
type Model = typeof Page.Model.Type
type Message = typeof Page.Message.Type
const { placements } = Page

const config = placements.complete({
  init: () => placements.initial({}),
  update: placements.update(model => ({ model })),
  view: (model: Model, h: HtmlBuilder<Message>) =>
    h.div(
      [
        h.Style({ opacity: String(model.slide.value) }),
        h.OnClick(Page.Message.GotSlideMessage({ message: TweenMessage.Started() })),
      ],
      ['Fade in'],
    ),
  subscriptions: placements.subscriptions(),
})
```

The tween starts at `from`, stopped. `Started` runs it; progress comes from
Effect's clock, so a test advances it with `TestClock`. The stream ends with
`Finished` carrying the exact end value, and the value rests at `to` either
way. `Stopped` holds the current value; a new `Started` runs `from` to `to`
again. Linear interpolation only. A duration that is not positive and finite is
rejected at placement.

## `Spring`

Pulls one number toward `to` with `{ stiffness, damping }` physics (positive
and finite). A fixed 16 ms semi-implicit Euler step makes the trajectory
identical on the live clock and `TestClock`; the stream ends with `Finished`
carrying the exact end value even when an underdamped spring overshoots on the
way. `Tween` is a fixed duration; `Spring` settles. Pick the motion, not both.

## `Presence`: let content leave

Holds mount-transition state for an exit animation. `phase` moves
`shown → hiding → hidden`: `Hide` starts the timed `hiding` phase, and the
`Hidden` fact it schedules carries its generation, so a `Show` in between wins
and the late fact is ignored. `isVisible(model)` reads whether content renders
(shown or mid-exit); the view keeps drawing while it does, with a class for
the exit. The timeout Command is the owner; a `transitionend` Mount is a future
opt-in, not a second timer.

## Reduced motion is a service

Whether motion should be reduced is read when a transition starts, not sniffed
once. Provide `Motion.live` (the user's `prefers-reduced-motion`) through the
assembly's resources, or `Motion.reduced` and `Motion.full` in a test or for a
setting the application owns. Under reduced motion `Presence` exits at once
and `Tween` and `Spring` jump to `to`, through the same Messages, so the Model
sees the same transitions. With no service provided, motion is full.
`Motion.reducedMotion` is the Effect the bundles read, for a transition of your
own.

## Failure

A non-positive or non-finite duration, stiffness, or damping is rejected at
placement. A stopped stream is empty; `Finished` still rests the value exactly.
