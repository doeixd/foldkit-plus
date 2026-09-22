# `foldkit-primitives/device`

Hardware facts: position, cameras, permissions, fullscreen. See the [package
README](../README.md) for the full guide; this page walks through one placement before
the API reference.
([source](https://github.com/doeixd/foldkit-plus/blob/main/packages/primitives/src/device))

## Owns

What the hardware reported last, as parent-Model facts. Geolocation and media
acquisition represent denial in their status; permission queries report named permission
states and acquisition errors.

```text
browser / clock → subscription → Message → update → parent Model
```

## Start with one slice

```ts
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { Geolocation } from 'foldkit-primitives/device'

const Here = Bundle.declare(Geolocation, 'here')
const Model = Schema.Struct({ ...Here.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Here.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const placements = Page.assemble(Page.at(Here))

const config = placements.complete({
  init: () => placements.initial({}),
  update: placements.update(model => ({ model })),
  view: (model: Model, h: HtmlBuilder<Message>) => h.div([], [String(model.here.status)]),
  subscriptions: placements.subscriptions(),
})
```

The initial status is `unknown` with no coordinates. Subscribing starts `watchPosition`;
`Located` stores a fix and marks it `ready`. `Denied` marks denial; other errors record
`lastError`. Both keep the previous coordinates. Unsubscribing clears the watch.

`config` is a Foldkit application configuration. Creating it does not start the
subscription; pass it to your Foldkit runtime. The parent Model owns the slice, and
`placements.update` routes its wrapper Messages. See the [Bundle
guide](../../bundle/README.md) for mounting and composing placements.

## Exports

| Name | Form | Needs |
| --- | --- | --- |
| `Geolocation` | bundle `{ status, coords, lastError }` | none |
| `mediaDevices` | factory bundle `{ status, devices, lastError }` | `{ name }` + optional `create` |
| `mediaStream` | factory bundle `{ status, lastError }` + `LiveStream` tag | `{ audio, video }` |
| `permissions` | factory bundle `{ states, lastError }` + `Watch` tag | `{ names }` |
| `enterFullscreen`, `exitFullscreen` | Commands: `Entered`/`Exited`/`Failed` | element / none |
| `fullscreenChanges` | entry: `Changed { active }` | none |

One assembly holds one camera or watch. Release stops every track and detaches every
handler. Denial parks with the last data kept, so the UI can show stale-with-status
instead of blank.

## Failure

No API (SSR, old browser): entries are empty, scans fail as Messages, resource
acquisition errors become failure Messages. MediaStream clears its requirements after
failure; retry by sending `Started` again. Permissions keeps its configured watch
requirements, so do not assume all device bundles share the same retry policy.
