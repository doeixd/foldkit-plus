# `foldkit-primitives/net`

Remote facts: connectivity, sockets, streams, and cross-tab posts. See the
[package README](../README.md) for the full guide; this page is the reference
card. ([source](https://github.com/doeixd/foldkit-plus/blob/main/packages/primitives/src/net))

## Owns

What the network reported last, as parent-Model facts. Payloads notify
without storing: project `Received` into your own field to keep it.

## Exports

| Name | Form | Needs |
| --- | --- | --- |
| `Online` | bundle `{ online }` + `Changed` | none |
| `websocket` | factory bundle `{ url, status, lastError }` + `send` helper | `{ url }` |
| `sse` | factory bundle `{ url, status, lastError }`, no send | `{ url }` |
| `broadcastMessages` | entry: `Received { data }` | channel name |
| `postBroadcast` | Command: `Posted` / `BroadcastFailed` | channel name + data |

`Socket`, `Source`, and their services ride the assembly for `send` and the
incoming streams. One assembly holds one socket, stream, or channel set —
`assemble` refuses the second. A post never echoes to its own channel.

## Example

```ts
import { Bundle } from 'foldkit-bundle'
import { Online } from 'foldkit-primitives/net'

const Net = Bundle.declare(Online, 'net')
// ...Model/Message/parent, then:
Page.assemble(Page.at(Net))
```

## Failure

No API (SSR, old browser): entries are empty, Commands yield their failure
Message. `Failed` records; SSE stays `connecting` (the browser reconnects),
WebSocket parks at `closed`.
