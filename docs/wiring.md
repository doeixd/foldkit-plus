# Wiring: one list for joining an application

A **Wiring** is a value describing how one integration joins a Foldkit
application: which Messages it folds, what it runs at startup, what it
subscribes to, and what it owns. The assembly collects one wiring per
integration (plus any bundle placements) and derives the runtime config —
`update`, initial state, Subscriptions, resources, URL handling, Module
contracts — from that single list, checking it as it goes.

This guide explains the idea and how it compares to the neighboring
abstractions. For the rationale and history, see
[wiring-DESIGN.md](./design/wiring-DESIGN.md). For the per-package calls, see
the `foldkit-remote`, `foldkit-mirror`, `foldkit-sync`, and `foldkit-agent`
READMEs and skill references.

## What it is

The interface, declared in `foldkit-surface` and repeated structurally in
`foldkit-bundle` (so the bundle core does not depend on Surface):

```ts
interface Wiring<Model, Message, R = never> {
  readonly key: string                                            // remote:Board
  readonly handles: readonly string[]                             // Message tags route folds
  readonly shared?: readonly string[] | undefined                 // tags several wirings may handle
  route?(model: Model, message: Message): Option<Update.Return<Model, Message, R>>
  readonly init?: Update.Step<Model, Message, R> | undefined      // runs once at startup
  readonly onUrl?: ((model: Model, url: Url) => Model) | undefined
  readonly subscriptions?: Subscription.Subscriptions<Model, Message, R> | undefined
  readonly resources?: Record<string, ManagedResource.Entry<...>> | undefined
  readonly contract?: Contract | undefined                        // for Module.validate
}
```

Every field is optional except `key` and `handles`. A wiring is data plus
pure functions: it performs no I/O itself. `R` is the Effect services its
Commands and Subscription streams need (`RemoteClient`, a `KeyValueStore`);
the assembly threads it into the derived config's requirements.

The producers, one per integration:

| Integration | Call | Brings |
| --- | --- | --- |
| Remote | `Data.wiring(active, options?)` | `route` into `Data.reduce`, entries per active Surface, contract, `RemoteClient` |
| URL mirror | `Filters.wiring(tag)` | routes the app's URL Message, `onUrl`, subscriptions, contract |
| Key-value mirror | `Prefs.wiring()` | routes its own `MirrorRestored`, `restore` as `init`, subscriptions, contract |
| Sync | `TodoSync.wiring()` | contract only |
| Agent | `AppAgent.wiring()` | contract only |

## Who owns what

The wiring changes nothing about ownership. It describes *joining*; the
contracts each package already declares still own the transitions:

- Remote's reducer still owns the cache slice; Mirror still owns nothing (it
  observes); Sync still owns replication through `mount`, not through the
  assembly; the agent still only sends Messages `update` already handles.
- The assembly never becomes a second reducer. `update` routes each Message to
  exactly one item's fold and falls through to the application's own update.

## The mental model

```text
integration + its config ──▶ Wiring
Wiring + Wiring + placement + … ──Page.assemble──▶ Assembly
Assembly ──update / initial / subscriptions / resources / url / module──▶ runtime config + Module
runtime config ──complete──▶ checked (type-level), unchanged (runtime)
```

## Why it exists, and whether you need it

Each integration used to ask the application to wire it by hand, in several
places, each phrased differently — spread `...Remote.messages`, add the
`Data.reduce` branch, derive `Data.subscriptions(active)`, provide the client
layer, reduce the URL at startup, dispatch `Prefs.restore` after mounting.
Every one of those steps compiles when missed and then silently does nothing:
server results dropped, nothing fetched, shared links opening on defaults,
drafts never restored.

The assembly turns the missed *derivation* into an error: `complete()` only
accepts a config whose `update` takes the whole parent Message, whose
`subscriptions` came from the assembly, and whose `managedResources`, `init`,
and `url` came from the assembly wherever an item needs them (a placement
with resources, a wiring with startup Commands, a wiring that reads the URL).
Two items claiming one Message tag fail `assemble` at startup naming both
(unless the tag is declared `shared` and each wiring routes only its own
values, like per-name `MirrorRestored`).

Whether you need it depends on the size of the list:

- One integration, hand-wired once, with a test that dispatches its Messages:
  the assembly buys little. Hand-wiring stays supported; every lower-level API
  remains.
- Two or more integrations, or an application where the wiring author and the
  runtime author are different people: the list earns its keep, because a
  silently dropped step costs a debugging session and the assembly turns it
  into a named error.

One honest limit: `complete()` checks that derivations come from the assembly,
not that any particular wiring is present. Deleting a wiring line still
compiles; the loss shows up in behavior (nothing routed, restored, or
subscribed), which is what pinned transcripts and Message-level tests catch.
The design note records this as a deviation, not a feature.

## Sixty seconds: two mirrors, one list

This is `examples/todo-app` trimmed to the wiring shape. The union carries
both mirror Messages; everything else is the application's own. (`App`,
`Model`, `Message`, `initialModel`, `own`, and `view` are the todo-app
declarations.)

```ts
import { Bundle } from 'foldkit-bundle'
import { Mirror } from 'foldkit-mirror'

const Filters = Mirror.url(App, { name: 'filters', fields: [App.model.filter] })
const Prefs = Mirror.kv(App, { key: 'todo/prefs', fields: [App.model.draft] })

const Page = Bundle.parent({ Model, Message })
const wiring = Page.assemble(Filters.wiring('UrlChanged'), Prefs.wiring())

const update = wiring.update(own)              // mirrors route first, the rest falls to own
const start = wiring.initial(initialModel)     // model + the restore Command
const subscriptions = wiring.subscriptions()   // both mirrors' entries, merged
const url = wiring.url(next => Message.UrlChanged({ url: next }))
```

`assemble` runs the startup checks now (duplicate keys, double-claimed tags,
shared resource tags) and throws naming the offenders. Nothing subscribes,
fetches, or dispatches yet: those come from the derived values. `complete`
then proves the runtime config was built from them:

```ts
const config = wiring.complete({ update, init: () => start, subscriptions, url, view })
```

`complete` returns its argument unchanged. Its work is all in the types: pass a
hand-written `subscriptions` and the property errors, pointing at the assembly
call that should have built it.

## How the assembly uses a wiring

- **Routing takes the first claimant in list order.** `route` returns an
  `Option`: `Some` when the Message is this wiring's, `None` otherwise. A
  key-value mirror returns `None` for another mirror's `MirrorRestored`; that
  is what lets the tag be `shared`. A placement folds a Message when its
  wrapper unwraps it, and ignores the rest the same way.
- **`init` steps run placements first (shallowest first), then wirings in list
  order.** A mirror's `restore` is an ordinary Command in the returned config;
  whoever mounts the app dispatches it like any other startup Command.
- **Subscriptions merge by key.** A duplicate key throws, as
  `Subscription.aggregate` does. The merged record carries the union of the
  items' service requirements, so a Remote wiring pulls `RemoteClient` into
  the runtime's `resources` layer type.
- **`url` folds every `onUrl`.** Its `init` applies each wiring's URL read to
  the Model; its `onUrlChange` builds the Message a wiring routes.
- **`module` collects contracts.** Placements contribute a contract owning
  their Model path; each wiring contributes its own contract as-is, so
  `Module.validate` sees every owner in the one list. A wiring with no
  contract (nothing owned, nothing observed) contributes nothing.

## Wiring versus Surface

Different questions, different values:

| | Surface | Wiring |
| --- | --- | --- |
| Answers | "What may this feature observe, and which Messages may it cause?" | "How does this integration join: route, start, subscribe, own?" |
| Owns transitions | Never. No private Model, no child update. | Describes who folds what; the integration still owns its transitions. |
| Messages | An allowlist of constructible variants (capability boundary). | A routing table over tags already in the union (`handles`). |
| Has runtime behavior | None. Pure contract. | None itself — data plus pure functions. The *derived* config runs. |
| Wraps Messages | Never. | Never; integrations speak flat union cases (see below). |

A Surface never routes, starts, or subscribes, so it cannot replace a wiring.
A wiring never declares what a feature may observe, so it cannot replace a
Surface. They meet in the Module, which collects both, and in Remote, which
reads a Surface's projections to plan its fetches.

## Wiring versus Projection and metadata

A Projection is a pure, typed read of the Model: codec, `read`, dependency
paths, and opaque metadata. Metadata is the per-package extension point —
Remote attaches its fetch requirements under its own `Metadata.key`, and other
packages do the same under theirs. Surface merges metadata when projections
combine and summarizes it for inspection; it never interprets another
package's entries.

Wiring is not metadata and does not ride on it:

- Metadata flows Model → package ("this projection needs these fields").
  Wiring flows Message → Model (`route`) plus startup and subscriptions.
- A wiring's subscriptions are *built from* projections' metadata at runtime
  (Remote diffs the requirements its entries read against the store), but the
  wiring itself is a separate value with its own lifecycle: route per Message,
  init once, entries for the runtime.
- If you need a new fact to travel with a Projection, add a metadata key.
  If you need a new integration to join an application, add a wiring.

## Wiring versus bundles and placements

A bundle packages a child state machine once — Model, Message, init, update,
Subscriptions, resources, view — and a Link places it at a Model path, possibly
many times. A placement owns its slice: its Messages are *wrapped* variants of
the parent union (`GotDarkMessage`), routed by wrapper to that slice.

A wiring handles the Messages that must stay *flat*: facts about the whole
application that agents, journals, and DevTools name directly
(`MirrorRestored`, Remote's cases, the URL Message). Wrapping them per owner
would just add unwrapping; the `handles`/`shared` table is the routing for
flat Messages the way the wrapper is the routing for placed ones.

In the assembly they are separate item kinds in one list — placements route by
wrapper, wirings route by tag — sharing the key/tag/resource checks, the init
ordering, the subscription merge, and the Module. Contract-only wirings (Sync,
Agent) contribute nothing but their contract: Sync owns the runtime through
`mount` rather than joining it, and an agent adds no state.

## When not to use it

- A single integration whose hand-wiring is covered by a dispatch-level test.
  The assembly is process, not safety, at that scale.
- Anything outside an application with a parent scope. A wiring describes
  joining; without `Page.assemble` there is nothing to join.
- As a Route replacement. `wiring.url` assumes one URL Message; applications
  with real routing keep their router and let a mirror read the URL like any
  other consumer.
- To skip understanding the integration. The wiring calls the same `reduce`,
  `restore`, and `subscriptions` the hand-wiring called; it checks the
  plumbing, not the semantics.

## Failure and recovery

| Failure | Where it surfaces |
| --- | --- |
| Two items share a key | `assemble` throws, naming the key |
| Two items handle one tag (not `shared`) | `assemble` throws, naming both |
| Two items use one Managed Resource tag | `assemble`/`resources` throws |
| Config built by hand instead of derived | `complete` type error at the property |
| A wiring deleted from the list | Silent; caught by behavior (transcript, dispatch tests) |
| A `route` that returns `None` for its own values | Silent drop; the parity tests each package carries exist for this |

Recovery is re-derivation: the assembly output is disposable — rebuild it from
the list and the error names the line that is wrong.
