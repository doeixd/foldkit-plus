# `foldkit-primitives/net`

Remote facts: connectivity, sockets, streams, and cross-tab posts. See the [package
README](../README.md) for the full guide; this page walks through one placement before
the API reference.
([source](https://github.com/doeixd/foldkit-plus/blob/main/packages/primitives/src/net))

## Owns

What the network reported last, as parent-Model facts. Payloads notify without storing:
project `Received` into your own field to keep it.

```text
browser / clock → subscription → Message → update → parent Model
```

## Start with one slice

```ts
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { Online } from 'foldkit-primitives/net'

const Net = Bundle.declare(Online, 'net')
const Model = Schema.Struct({ ...Net.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Net.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const placements = Page.assemble(Page.at(Net))

const config = placements.complete({
  init: () => placements.initial({}),
  update: placements.update(model => ({ model })),
  view: (model: Model, h: HtmlBuilder<Message>) => h.div([], [String(model.net.online)]),
  subscriptions: placements.subscriptions(),
})
```

`init` reads `navigator.onLine` when available and otherwise assumes online. The
subscription follows online/offline events. This is a browser connectivity hint, not
proof that your API server is reachable. Keep request failures in your data-loading
state.

`config` is a Foldkit application configuration. Creating it does not start the
subscription; pass it to your Foldkit runtime. The parent Model owns the slice, and
`placements.update` routes its wrapper Messages. See the [Bundle
guide](../../bundle/README.md) for mounting and composing placements.

## Exports

| Name | Form | Needs |
| --- | --- | --- |
| `Online` | bundle `{ online }` + `Changed` | none |
| `websocket` | factory bundle `{ url, status, lastError }` + `send` helper | `{ url }` |
| `sse` | factory bundle `{ url, status, lastError }`, no send | `{ url }` |
| `broadcastMessages` | entry: `Received { data }` | channel name |
| `postBroadcast` | Command: `Posted` / `BroadcastFailed` | channel name + data |

`Socket`, `Source`, and their services ride the assembly for `send` and the incoming
streams. The socket and SSE resource tags are shared within their respective modules; an
assembly rejects conflicting resource placements. Broadcast entries are separate streams
and do not use those resource tags. A post never echoes to its own channel.

## Failure

No API (SSR, old browser): entries are empty, Commands yield their failure Message.
`Failed` records; SSE stays `connecting` (the browser reconnects), WebSocket parks at
`closed`.
