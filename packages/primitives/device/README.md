# `foldkit-primitives/device`

What the hardware reported last: a position, the cameras and microphones, a
live stream, the state of a permission, whether the page is fullscreen.
Denial is a status the Model holds, so a view can say so, and a transient
failure keeps the last good data beside its error.
([source](https://github.com/doeixd/foldkit-plus/blob/main/packages/primitives/src/device))

| Name | Form | Model | Messages | Args |
| --- | --- | --- | --- | --- |
| `Geolocation` | bundle | `{ status, coords, lastError }` | `Located`, `Denied`, `Failed` | none |
| `mediaDevices({ name, create? })` | bundle factory | `{ status, devices, lastError }` | `Scan`, `DevicesChanged`, `Refreshed { devices }`, `Denied`, `Failed` | none |
| `mediaStream({ name, request? })` | bundle factory | `{ status, lastError }` | `Started`, `Stopped`, `Live`, `Ended`, `Denied`, `Failed` | `{ audio, video }` |
| `permissions({ name, create? })` | bundle factory | `{ states, lastError }` | `Snapshot`, `Changed`, `Cleared`, `Failed` | `{ names }` |
| `enterFullscreen(element)`, `exitFullscreen()` | Commands | | `Entered`, `Exited`, `Failed` | |
| `fullscreenChanges()` | entry | | `Changed { active }` | |

## Start with one: where the device is

```ts
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { Bundle } from 'foldkit-bundle'
import { Geolocation } from 'foldkit-primitives/device'

const Page = Bundle.compose({}).pipe(Bundle.withChild('here', Geolocation))
type Model = typeof Page.Model.Type
type Message = typeof Page.Message.Type
const { placements } = Page

const config = placements.complete({
  init: () => placements.initial({}),
  update: placements.update(model => ({ model })),
  view: (model: Model, h: HtmlBuilder<Message>) => h.div([], [model.here.status]),
  subscriptions: placements.subscriptions(),
})
```

The status starts `unknown` with no coordinates. Subscribing starts
`watchPosition`; `Located` stores a fix and marks it `ready`. `Denied` is its
own status (permission code 1), which a view can act on; any other error is
`Failed`, which keeps the last fix and notes `lastError`. Unsubscribing clears
the watch. Without a geolocation API the stream is empty.

## Cameras and microphones

**`mediaDevices({ name, create? })`** scans the device list on placement and
re-scans on `Scan`, on `DevicesChanged` (wired to `devicechange`), and on every
placement, answering `Refreshed { devices }` with `{ deviceId, groupId, kind,
label }`. Denial lands as `denied` while keeping the last list; another failure
keeps the last list and notes the error; an unknown `kind` fails the scan at
the boundary instead of entering the Model.

**`mediaStream({ name, request? })`** holds one live stream in a Managed
Resource while the Model asks for it (`requesting` or `live`). `Started`
requests with the placed `{ audio, video }` constraints; `Stopped` and `Ended`
release it, which stops every track. Denial parks at `denied`, any other
failure at `idle` with the error; both clear the requirement, so a failing
device never spins an acquire loop, and `Started` retries. The `LiveStream` tag
and service are exported for a Command that attaches the stream to a video
element. One assembly holds one stream.

**`permissions({ name, create? })`** queries `args.names` on acquire and
watches each status object's `onchange` through an ordered queue. `Snapshot`
replaces the states map, `Changed` merges one, `Cleared` empties on release,
which also detaches every handler. An unknown name or state string fails the
acquire; it never becomes a Model fact. Unlike `mediaStream`, it keeps its
requirement after a failure, so the two retry differently.

The factories take `create` or `request` doubles so a test substitutes the
platform instead of stubbing globals.

## Fullscreen

`enterFullscreen(element)` and `exitFullscreen()` are Commands yielding
`Entered` or `Exited`, or `Failed` for a rejected request or a missing
capability, with a legacy `webkit` fallback. `fullscreenChanges()` is an entry
that starts with the current answer, then follows flips as `Changed { active }`.
There is no Model: the document owns fullscreen state.

## Failure

Without the API (a server, an old browser) an entry is empty, a scan fails as
a Message, and an acquisition error becomes its failure Message. Nothing
throws.
