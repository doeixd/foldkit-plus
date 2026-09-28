# WebSocket Chat

Click Connect, type, and see each message come back from an echo server
(`wss://ws.postman-echo.com/raw`), timestamped, beside the one you sent. The
header shows the connection's state; a failed or timed-out attempt shows the
error and a Try Again button; a server that drops the socket returns the page
to Disconnected and clears the conversation. It ports Foldkit's
[`websocket-chat`](https://github.com/foldkit/foldkit/tree/main/examples/websocket-chat)
example to Foldkit Plus. Upstream wrote the socket by hand as a Managed
Resource and a Subscription; here `foldkit-primitives`' WebSocket bundle owns
it, and the styling moves from Tailwind classes to `foldkit-mixins`.

## Who owns what

Two owners, each with its own facts. The socket bundle owns the socket and
reports what it does; the page owns what the reader asked for and sees, and
its `connection` decides whether a socket exists at all.

```text
Connect -> connection = Connecting -> gate opens -> bundle acquires new WebSocket(url)
socket open/frame/close/error -> bundle queue -> GotChatSocketMessage
  -> bundle update (status, lastError) -> page update (connection, messages)
connection = Error | Disconnected -> gate closes -> bundle releases (closes) the socket
```

| Concern | Owner | Where |
| --- | --- | --- |
| The socket: opening it, its frames decoded to text, closing it on release, the incoming stream | `foldkit-primitives/net` `websocket`, placed at `chatSocket` with `foldkit-bundle` | `src/main.ts`, `// SOCKET` |
| Writing to the socket, refused (`SendFailed`) when it is not open | the bundle's `send` helper | `src/main.ts`, `SubmittedMessage` |
| Whether the page wants a socket, the state it shows, the error sentence, the conversation, the draft | plain Foldkit: the Model and `update` | `src/main.ts` |
| Giving up on an attempt after five seconds | plain Foldkit: a Subscription on Effect's clock | `src/main.ts`, `// SUBSCRIPTION` |
| Timestamps | plain Foldkit: Commands | `src/main.ts`, `// COMMAND` |
| The accessible input and buttons | `@foldkit/ui` Input and Button | `src/main.ts` |
| Their look: `Recipes.Input` and `Recipes.Button`, extended | `foldkit-mixins-ui` | `src/style.ts` |
| The page's Slots, theme, layer order; per-bubble and per-status state as `data-state` + `Style.states` | `foldkit-mixins` | `src/style.ts`, installed by `src/entry.ts` |

The bundle's `status` (`closed`/`connecting`/`open`) and the page's
`connection` look alike but are different facts: `status` is what the socket
did; `connection` is what the reader asked for, and holds the error sentence
and the timeout the socket knows nothing of. The view reads only `connection`.
The page learns of each socket report in `update`: `GotChatSocketMessage`
folds into the bundle first, then `reactToSocket` decides what it means here
(an error before opening reads "Failed to connect to WebSocket", after it
"Connection error").

## Run it

```bash
pnpm --filter foldkit-example-foldkit-websocket-chat dev
```

It talks to Postman's public echo server, as upstream does.

## What is not used, and why

- **`foldkit-remote`.** Remote caches facts a server owns. An echo is not a
  fact to cache: the conversation is the page's, and is cleared on disconnect.
- **`foldkit-mirror`.** Upstream forgets everything on reload; so does this.
- **`foldkit-form`.** One text field with no check of its own beyond "not
  blank", which disables Send, as upstream's does.
- **Surface, Sync, Agent, Entity.** Nothing is read by another feature,
  replicated, exposed to an agent, or modelled as a domain entity.

## Differences from upstream

- **The Messages follow the bundle.** Upstream's `Connected`, `Disconnected`,
  `ReceivedMessage` and `SucceededSendMessage` are the bundle's `Opened`,
  `Closed`, `Received` and `Sent`, arriving as `GotChatSocketMessage`.
  `SendMessage` is the bundle's `send` helper (Command `WebSocket.send`).
- **A sent message is timestamped when it is sent, not after.** The bundle's
  `Sent` does not say what was sent, so `SubmittedMessage` issues the send and
  `TimestampSentMessage` together. Upstream appended only after `send`
  returned. They differ in one race, the socket going away between Submit and
  the send: both then show "Socket unavailable", but here the text stays in the
  conversation, where upstream dropped it.
- **An acquired socket is not yet a connection.** Upstream's acquire waited for
  `open`; the bundle acquires at once and reports `Opened` later, so the page
  moves to `Connected` on `Opened`. The five-second timeout that upstream put on
  the acquire is the page's own Subscription.
- **Binary frames are read as text.** Upstream put `event.data` straight into
  the Model, so a `Blob` frame would have been stored as a `Blob` under a
  `string` type; the bundle decodes `Blob` and `ArrayBuffer` frames to text.
- **The colours are derived, not Tailwind's.** One `Theme.oklch` accent at
  blue-500; the status dot uses the theme's success, warning and error colours.

## Tests

From the repository root: `npx vitest run examples/foldkit-websocket-chat`.
None of them open a socket; the runtime test replaces the global `WebSocket`
with a fake that throws on a send before it opens, as a browser's does.

- `test/story.test.ts` and `test/scene.test.ts` are upstream's tests, with the
  socket's Messages and Command in place of upstream's (see above). The scene
  tests acquire the socket and then emit its `Opened` or `Failed`, since
  acquiring no longer means connected. Added: a send the socket refused shows
  "Socket unavailable", and a frame after the socket closed is dropped.
- `test/timeout.test.ts`: under the TestClock, an attempt fails with
  "Connection timeout" at five seconds and not before, and never while
  disconnected, connected, or failed.
- `test/view.test.ts` draws the view inert in each state: every element is
  drawn by a Slot, the stylesheet defines every token the styles read, and the
  status dot and bubbles carry their `data-state`.
- `test/runtime.test.ts` runs the real runtime in jsdom: no socket until
  Connect; the echo server's URL; sending the trimmed text, the input cleared,
  sent and received bubbles; a server drop clears the conversation; a failure
  before or after opening shows its sentence, closes the socket, and Try Again
  makes a new one.

`ManagedResource.acquire` in the scene test is given a stand-in socket
(`acquiredSocket` in `test/fixtures.ts`) because the placed entry's type asks
for the acquired value, though the bundle's `onAcquired` reads none: the
bundle's `PlacedResources` type keeps an entry's requirements, value and
service but not its `onAcquired` signature.
