# `foldkit-primitives/net`

What the network reported last: whether the browser is online, the state of a
socket or an event stream, a post from another tab. Connection state lives in
the Model; a payload only notifies, and the parent keeps what it wants of it.
([source](https://github.com/doeixd/foldkit-plus/blob/main/packages/primitives/src/net))

| Name | Form | Model | Messages | Args |
| --- | --- | --- | --- | --- |
| `Online` | bundle | `{ online }` | `Changed { online }` | none |
| `websocket({ name, createSocket? })` | bundle factory | `{ url, status, lastError, opened }` | `Connecting`, `Opened`, `Received { data }`, `Sent { data }`, `SendFailed`, `Closed`, `Failed`, `TimedOut` | `{ url, connectTimeoutMs? }` |
| `sse({ name, createSource? })` | bundle factory | `{ url, status, lastError }` | `Connecting`, `Opened`, `Received { data }`, `Closed`, `Failed` | `{ url }` |
| `broadcastMessages(name)` | entry | | `Received { data }` | |
| `postBroadcast(name, data)` | Command | | `Posted`, `BroadcastFailed` | |

## Start with one: online or not

```ts
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { Bundle } from 'foldkit-bundle'
import { Online } from 'foldkit-primitives/net'

const Page = Bundle.compose({}).pipe(Bundle.withChild('net', Online))
type Model = typeof Page.Model.Type
type Message = typeof Page.Message.Type
const { placements } = Page

const config = placements.complete({
  init: () => placements.initial({}),
  update: placements.update(model => ({ model })),
  view: (model: Model, h: HtmlBuilder<Message>) =>
    h.div([], [model.net.online ? 'Online' : 'Offline']),
  subscriptions: placements.subscriptions(),
})
```

`init` reads `navigator.onLine` when there is one and assumes online
otherwise; the window's `online` and `offline` events keep it current. This is
the browser's connectivity hint, not proof that your server answers. Keep
request failures in your data-loading state.

## `websocket`

A duplex socket as a bundle. The factory takes a `name` (the resource tag is
per module, so one assembly holds one socket) and an optional `createSocket`
for tests; the placement takes `{ url, connectTimeoutMs? }`.

```ts
import { websocket, type SocketService } from 'foldkit-primitives/net'

const ChatSocket = websocket({ name: 'ChatSocket' })

const Chat = Bundle.compose({ wantConnection: Schema.Boolean }).pipe(
  Bundle.withServices<SocketService>(),
  Bundle.withChild('socket', ChatSocket, {
    args: { url: 'wss://example.com/chat', connectTimeoutMs: 5000 },
    when: model => model.wantConnection,
  }),
)
```

`status` moves `closed → connecting → open`. The resource owns the socket and
acquires it while the placement is active (`when` above). Sending is a placed
helper, `Chat.children.socket.helpers.send(data)`, a step to return from
`update`: it writes through the resource and yields `Sent { data }` on
dispatch (not delivery), or `SendFailed` when no socket is open, since a closed
socket's `send` is a silent no-op per spec. The socket service rides the
assembly into the application's resources, which is what `withServices` names.

`Received { data }` notifies without storing; project the payload into your own
field to keep it. With `connectTimeoutMs`, a socket still connecting when the
time runs out is closed and reported `TimedOut`; without one it waits as long
as the browser does.

The Model words its own errors for a reader (`Failed to connect to WebSocket`,
`Connection error`, `Connection timeout`, `Socket unavailable`), chosen by
whether the socket had `opened`. A view reads `SocketView` through
`viewOf(model, wanted)`, one of `Disconnected`, `Connecting`, `Connected`, or
`Error { error }`, instead of keeping a connection state machine of its own;
`isOpen(model)` gates sends. [`examples/foldkit/websocket-chat`](../../../examples/foldkit/websocket-chat)
is a whole page over this bundle.

## `sse`

The one-directional sibling: the server speaks, the Model listens. Same
shape minus `send`. A `Failed` records the error but stays `connecting`,
because the browser reconnects a dropped stream itself. Payloads are always
text, per the SSE spec. `isLive(model)` and `viewOfSse(model, wanted)` mirror
the socket's readers.

## Broadcast

`broadcastMessages(name)` is an entry: posts from other tabs on the named
channel arrive as `Received { data }`, and the parent maps them into its own
Message. There is no bundle because a channel owns no state. `postBroadcast(name, data)`
is the one-shot Command, yielding `Posted` or `BroadcastFailed`. A post never
echoes to its own channel, per spec.

## Failure

Without the API (a server, an old browser) the entries are empty and the
Commands yield their failure Message. A socket parks at `closed` with its
error; an event stream stays `connecting`.
