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
| `SharedHost.define({ name, opening })` | plain functions | | | |

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

## `SharedHost`: one server for every tab

For a server that runs in the browser, such as a demo with no backend or a
local-first app's own journal, every tab and frame should meet the same one.
`SharedHost` hands it each conversation a page opens, as a `MessagePort`. It
owns no Model and speaks nothing over the port: Sync's `portSocket` and
Remote's `foldkit-remote/port` do that. It only routes, and says when a page
is gone.

```text
page: open(opening) -> MessageChannel -> SharedWorker (or the top document) -> host(opening, { port, signal })
page unloads -> its Web Lock is released -> signal aborts
```

```ts
import { Schema } from 'effect'
import { SharedHost } from 'foldkit-primitives/net'

// Shared by the pages and the worker: what opens a conversation.
export const Opening = Schema.TaggedStruct('Notes', { device: Schema.String })
export const Notes = SharedHost.define({ name: 'notes', opening: Opening })

// worker.ts, the SharedWorker's entry. `openHost` starts the server once and
// returns what it does with each conversation.
Notes.serve(openHost)

// In each page.
const host = Notes.connect({
  worker: () => new SharedWorker(new URL('./worker.ts', import.meta.url), { type: 'module' }),
  inPage: () => import('./host.js').then(({ openHost }) => openHost()),
})
const port = host.open(Opening.make({ device: 'a' }))
```

- `define` is a declaration: the name keeps two hosts on one origin apart, and
  the opening's schema is what the host decodes first. A message that does
  not decode, has no port, or names another host is ignored.
- `serve` and `inPage` start the host at most once, when the first
  conversation needs it. The application constructs the SharedWorker itself,
  because a bundler finds a worker only in that literal form.
- `open` returns at once. The opening goes when the page holds the
  conversation's Web Lock, and the host's `signal` aborts when that lock is
  released, which is when the page unloads or crashes. A host ends its work
  there: `portSocket(port, { signal })` stops serving Sync.
- Without SharedWorker, the top document runs the host, and a same-origin
  frame sends its openings there (checked by origin), so frames on one page
  still meet one server. Call `connect` in the top document too when it
  frames the pages. Separate tabs then get a server each.

What it does not do: survive the host. A SharedWorker lives while one of its
tabs is open; a host in memory starts empty after the last closes, and a
crashed worker answers nothing more. A port a page holds has no close signal
of its own, so a page learns of a lost host only through its own timeouts.
Browsers without Web Locks never abort a conversation. There is no
authentication: an opening's claims (a device, a name) are the page's word.

## Failure

Without the API (a server, an old browser) the entries are empty and the
Commands yield their failure Message. A socket parks at `closed` with its
error; an event stream stays `connecting`.
