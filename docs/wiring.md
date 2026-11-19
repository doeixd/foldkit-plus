# Wiring: join integrations in one list

Adding remote data, URL filters, saved preferences, and sync to a Foldkit application usually means wiring each integration by hand in five places: spreading message variants, branching in `update`, deriving `subscriptions`, handling `url` changes, and dispatching startup commands. Miss one step and the code still compiles while silently dropping server answers, ignoring shared links, or forgetting drafts.

A **Wiring** packages how one integration joins your application—the Messages it folds, the startup commands it runs, the subscriptions it opens, and the resources it owns—into a single value. Passing a list of wirings to `Page.assemble` derives `update`, `initial`, `subscriptions`, `url`, and your module contract in one pass, turning missed plumbing into a type error or a clear startup error.

For package-specific calls, see [Remote](./remote.md), [Mirror](./mirror.md), [Replicated state](./replication.md), and [Agents](./agents.md).

## A first assembly: two mirrors, one list

This example wires a URL filter mirror and a key-value draft mirror into one application using `Bundle.parent` and `Page.assemble` (assuming your app already defines `Model`, `Message`, `initialModel`, `own`, and `view`):

<!-- docs-check
import { Schema } from 'effect'
import type { Document } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { Url } from 'foldkit/url'
import { Surface } from 'foldkit-surface'
const Model = Schema.Struct({
  filter: Schema.Literals(['all', 'active', 'completed']),
  draft: Schema.String,
})
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Mirror.messages, UrlChanged: { url: Url } })
type Message = typeof Message.Type
const initialModel: Model = { filter: 'all', draft: '' }
declare const own: (model: Model, message: Message) => Update.Return<Model, Message>
declare const view: (model: Model) => Document
const App = Surface.application({ Model, Message, initial: initialModel, update: own })
-->

```ts
import { Bundle } from 'foldkit-bundle'
import { Mirror } from 'foldkit-mirror'

const Filters = Mirror.url(App, { name: 'filters', fields: [App.model.filter] })
const Prefs = Mirror.kv(App, { key: 'todo/prefs', fields: [App.model.draft] })

const Page = Bundle.parent({ Model, Message })
const wiring = Page.assemble(Filters.wiring('UrlChanged'), Prefs.wiring())

const update = wiring.update(own)
const start = wiring.initial(initialModel)
const subscriptions = wiring.subscriptions()
const url = wiring.url(next => Message.UrlChanged({ url: next }))
```

`Page.assemble` checks the list right away for duplicate keys, double-claimed Message tags, and colliding resource names, throwing if two entries conflict. Both mirrors then route their messages before `own` runs, `start` includes the draft restore command, and `subscriptions` merges both mirrors' entries.

Pass the derived values to `wiring.complete` to verify at compile time that nothing in your runtime config was written by hand:

```ts
const config = wiring.complete({ update, init: () => start, subscriptions, url, view })
```

`complete` returns its argument unchanged at runtime. If you swap `subscriptions` for a hand-written object, TypeScript reports an error on that property pointing to the missing assembly call. For a shorter setup when your `own` update already routes placements, `wiring.runtime({ initial, update, view })` fills in `init`, `subscriptions`, and `resources` automatically.

## What a Wiring brings and who provides one

Each integration builds its own wiring from your declaration. Every wiring carries a unique `key`, the Message tags it `handles`, optional `shared` tags that multiple wirings may observe, and optional hooks (`route`, `init`, `onUrl`, `subscriptions`, `resources`, and `contract`).

| Integration | Call | What it brings |
| --- | --- | --- |
| Remote data | `Data.wiring(active, options?)` | `route` for `Data.reduce`, fetch subscriptions, `RemoteClient` |
| Remote cache persistence | `persistence(Data, { key, ... })` | Cache restore/save hooks, `restore` init, `KeyValueStore` |
| Remote durable outbox | `outbox(Data, { key, ... })` | Outbox restore/send hooks, `restore` init, `KeyValueStore` |
| URL mirror | `Filters.wiring(tag)` | Routes the URL Message, `onUrl`, subscriptions, contract |
| Key-value mirror | `Prefs.wiring()` | Routes `MirrorRestored`, `restore` init, subscriptions |
| Sync | `TodoSync.wiring()` | Module ownership contract for validation |
| Agent | `AppAgent.wiring()` | Module ownership contract for validation |

A wiring holds data and pure functions; the Effect services needed by commands and streams (such as `RemoteClient` or `KeyValueStore`) flow through the `R` type parameter into the final runtime config.

## How the assembly routes Messages and builds the runtime config

From a list of wirings and bundle placements, `Page.assemble` produces an assembly value that derives each runtime piece in order:

- **Claimed vs. shared tags:** Each claimed tag routes to its single wiring via `route` (which returns `Option.some` when handled and `Option.none` otherwise), and falls through to `own` for everything else. A `shared` tag—such as `UrlChanged` or `MirrorRestored`—is folded by every wiring sharing it in list order, then passed to `own`.
- **Startup commands:** `wiring.initial` runs placement `init` steps (shallowest first), then each wiring's `init` step in list order. A key-value mirror's `restore` command is returned as a normal Foldkit command.
- **Subscriptions and resources:** Subscription entries and managed resources merge by key, throwing on duplicate keys and combining all Effect service requirements into the runtime type.
- **URL handling:** `wiring.url` runs every wiring's `onUrl` on the initial URL and builds the `onUrlChange` dispatcher for navigation messages.
- **Module contracts:** `wiring.module` collects every placement contract (owning its Model path) and every wiring contract into one list for `Module.validate`.

## Who owns state when using an assembly

Joining integrations in one list leaves state ownership unchanged: each package keeps the exact responsibilities it had when wired by hand.

- **Remote** owns the normalized server cache slice through `Data.reduce`.
- **Mirror** observes local fields in your `Model`; your `update` remains the owner of those fields.
- **Sync** owns replication through `Sync.mount`, contributing only its contract to the assembly.
- **Agent** dispatches Messages from your union, which `update` handles as usual.
- **Placements** own their slice of the parent `Model` via wrapped child Messages.

## Why use an assembly instead of hand-wiring?

With hand-wiring, forgetting a branch or omitting `Data.subscriptions(active)` compiles cleanly and fails silently at runtime. An assembly catches those omissions before shipping:

- **`complete` checks derivations:** Passing a non-derived `update`, `subscriptions`, `url`, `init`, or `managedResources` fails to compile whenever an item in the list requires it.
- **Startup checks catch collisions:** Two wirings claiming the same non-shared Message tag, sharing a `key`, or registering the same resource tag fail `Page.assemble` with both names in the error.
- **Exhaustive `own` catches a deleted wiring:** When a wiring claims literal tags (such as Remote's Message tags), removing it from `assemble(...)` puts those tags back into `own`'s input type, causing an exhaustive `Match.valueTags` or union `match` to fail compilation.

Note that deleting a wiring whose tags are all `shared` (such as a mirror), or using a non-exhaustive `switch` in `own`, leaves `own`'s types satisfied. Test those behaviors with dispatch-level tests.

## When to wire by hand instead

- **A single integration:** If your app has one integration already covered by a dispatch test, hand-wiring is straightforward and remains fully supported.
- **Custom routers:** `wiring.url` assumes a single URL Message; apps with a multi-route router keep their router and feed URL changes to mirrors directly.
- **Standalone scopes:** Without a parent `Model` and `Message` union, there is nothing for `Page.assemble` to join.

## Wiring vs. Surface, Projection, and Bundles

Each abstraction answers a distinct question in your architecture:

| Concept | Question it answers | Runtime role |
| --- | --- | --- |
| **Surface** | What may this feature read, and what may it send? | Pure capability contract; no routing or subscriptions |
| **Projection & Metadata** | How do I read a slice, and what facts travel with it? | Typed lens plus package-specific metadata (like fetches) |
| **Bundle placement** | Where does this child state machine sit? | Routes *wrapped* child Messages to a `Model` path |
| **Wiring** | How does a top-level integration join the runtime? | Routes *flat* parent Messages, startup, and streams |

Surfaces and Wirings meet in two places: `Module` collects both contracts to validate ownership, and Remote reads a Surface's projections (via metadata) to build its subscription fetches.

## Failure and recovery

| Failure | Where it surfaces |
| --- | --- |
| Two items share a `key` | `Page.assemble` throws naming the duplicate key |
| Two items claim one non-shared tag | `Page.assemble` throws naming both claimants |
| Two items share a Managed Resource tag | `Page.assemble` or `resources` throws |
| Hand-written config passed to `complete` | Type error on the hand-written property |
| Claimed wiring removed from `assemble` | Type error in exhaustive `own` update |
| `route` returns `None` for its own tag | Silent drop; catch with message parity tests |

Because the assembly output is derived purely from the list, fix the offending wiring line and re-derive the config.

## Next

- See a working assembly with URL and KV mirrors in [Mirrored state](./mirror.md).
- Learn how capability boundaries work in [Surface and Bundle](./surface-vs-bundles.md).
- Connect a Remote server cache in [Server-derived state](./remote.md).
