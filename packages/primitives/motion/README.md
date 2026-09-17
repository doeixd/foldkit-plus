# `foldkit-primitives/motion`

Animation state: values moving over time, in the Model. See the
[package README](../README.md) for the full guide; this page is the reference
card. ([source](https://github.com/doeixd/foldkit-plus/blob/main/packages/primitives/src/motion))

## Owns

Where an animation is, as parent-Model facts. Easing curves stay the
application's job; these bundles move numbers.

## Exports

| Name | Form | Needs |
| --- | --- | --- |
| `Tween` | bundle `{ value, running }`, linear over `ms` | `{ from, to, ms }` |
| `Spring` | bundle `{ value, velocity, running }`, physics | `{ from, to, stiffness, damping }` |
| `Presence` | bundle `{ phase, generation }` for exit animations | `{ durationMs }` |

`Tween` (fixed duration) versus `Spring` (settles): pick the motion, not
both. Both end with `Finished` carrying the exact end value. `Presence`
times its exit with a Command; a late `Hidden` loses to an intervening
`Show` by generation. `isVisible` reads whether content renders.

## Example

```ts
import { Bundle } from 'foldkit-bundle'
import { Tween } from 'foldkit-primitives/motion'

const Slide = Bundle.declare(Tween, 'slide')
// ...Model/Message/parent, then:
Page.assemble(Page.at(Slide, { args: { from: 0, to: 1, ms: 200 } }))
```

## Failure

Non-positive or non-finite durations are rejected at placement. Stopped
streams are empty; `Finished` still rests the value exactly.
