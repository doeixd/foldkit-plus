# `foldkit-primitives/device`

Hardware facts: position, cameras, permissions, fullscreen. See the
[package README](../README.md) for the full guide; this page is the reference
card. ([source](https://github.com/doeixd/foldkit-plus/blob/main/packages/primitives/src/device))

## Owns

What the hardware reported last, as parent-Model facts. Denial is always
its own status (actionable UI), never a throw.

## Exports

| Name | Form | Needs |
| --- | --- | --- |
| `Geolocation` | bundle `{ status, coords, lastError }` | none |
| `mediaDevices` | factory bundle `{ status, devices, lastError }` | `{ name }` + optional `create` |
| `mediaStream` | factory bundle `{ status, lastError }` + `LiveStream` tag | `{ audio, video }` |
| `permissions` | factory bundle `{ states, lastError }` + `Watch` tag | `{ names }` |
| `enterFullscreen`, `exitFullscreen` | Commands: `Entered`/`Exited`/`Failed` | element / none |
| `fullscreenChanges` | entry: `Changed { active }` | none |

One assembly holds one camera or watch. Release stops every track and
detaches every handler. Denial parks with the last data kept, so the UI
can show stale-with-status instead of blank.

## Example

```ts
import { Bundle } from 'foldkit-bundle'
import { Geolocation } from 'foldkit-primitives/device'

const Here = Bundle.declare(Geolocation, 'here')
// ...Model/Message/parent, then:
Page.assemble(Page.at(Here))
```

## Failure

No API (SSR, old browser): entries are empty, scans fail as Messages,
acquires fail instead of throwing. A failing device parks with
requirements cleared — never an acquire loop.
