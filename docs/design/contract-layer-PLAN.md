# The contract layer: Foldkit Plus after Blocks

> **Status:** Proposed (2026-10-26), tracked in
> [#190](https://github.com/doeixd/foldkit-plus/issues/190). Nothing here is built. Written after reading
> foldkit/foldkit#1655 (Blocks and handler Layers) at `1f6776fa`,
> foldkit/foldkit#1800 (`AgentContext`) at `3bb72531`, and alchemy-run/alchemy's
> `@alchemy.run/domain` with its issues #2589 and #2590, against this repository on
> the same date (§11). Blocks marked *Sketch* are shapes to review, not APIs; the
> phase that builds each one fixes its real signature. Where this plan and a
> package README disagree, the README and the source win.

| Phase | Ships | Evidence |
| --- | --- | --- |
| 0 | Items 1 to 3 (the canary spike) done 2026-11-11; items 4 to 7 not started | §8 |
| 1 to 7 | — | not started |

## 1. Why now

Foldkit Plus does two jobs today:

1. **Runtime plumbing.** Placing children and routing their Messages
   (`foldkit-bundle`), live server feeds and pending state (`foldkit-remote`,
   `foldkit-sync`), agent context (`foldkit-surface` projections for
   `foldkit-agent`), forms from a Schema (`foldkit-form`).
2. **Contracts.** Who owns each fact, what a feature may read, which Messages
   may cause a transition, who may do it, and where data comes from
   (`foldkit-surface`, `foldkit-guard`, `foldkit-entity`, Remote's
   declarations, Sync's contract, `Module`).

Upstream is taking over job 1:

| Upstream | What it takes over | Ours today |
| --- | --- | --- |
| foldkit/foldkit#1655: Blocks, Bindings, handler Layers | Child placement, routing, init, OutMessage policy, occurrence identity, effect construction | `foldkit-bundle` placement, the Mount resolver in part |
| foldkit/foldkit#1785: `LiveQuery` | A keyed live feed that resumes from a cursor | `Remote.live` |
| foldkit/foldkit#1780: `Command.keepPending` | Pending state across a Command | Remote optimistic layers, Sync pending |
| foldkit/foldkit#1800: `AgentContext` | A declared, Schema-checked slice of the Model for an agent | `Projection` as `Agent` context |
| Form work (foldkit/foldkit#1658, rodygosset/foldkit#5): `Form.fromSchema` | A form from a payload Schema | `foldkit-form`, `schema-to-ui-PLAN.md` |

And `@alchemy.run/domain` claims the authoritative server model: pure
`decide`/`evolve` Aggregates, typed Rejections, Views, Policies, Sagas, one Api
that every client is derived from (alchemy-run/alchemy#2589), and a bridge to
Foldkit (alchemy-run/alchemy#2590) built on the #1655 canary.

If Foldkit Plus keeps both jobs, it duplicates Foldkit on the client and Domain
on the server, and tracks two moving targets. This plan moves it to job 2.

## 2. Thesis

**Foldkit Plus is the contract layer every runtime reads.** Foldkit runs the
client. An authority (our Sync journal, a Remote source over Drizzle or D1, or
a Domain Api) holds the decisions. Effect supplies transports. Foldkit Plus
declares how they meet, derives one graph from those declarations, and checks
it.

```text
            declarations (static, inspectable)
  Surface · MessageSet · Guard · Entity · Mutation/Query · Sync contract · Agent
                              │
     Block Composition ──────▶│◀────── authority metadata (Domain Api, RemoteServer)
                              ▼
                     the contract graph
          owners · reads · transitions · access · data needs
                              │
      ┌──────────────┬────────┴───────┬───────────────┬──────────────┐
      ▼              ▼                ▼               ▼              ▼
  capability     prefetch / SSR   security queries   docs and     coverage
  catalogs per   plans per route  ("who can reach    diagrams     checks
  caller (MCP,                     invoice.total?")
  WebMCP, HTTP,
  CLI)
```

Upstream sees only the client graph and Domain sees only its Api, so no other
layer can build this graph.

## 3. Ownership after the move

| Concern | Owner | Foldkit Plus's part |
| --- | --- | --- |
| Child placement, routing, init, occurrence identity, effect construction | Foldkit (Blocks) | None. Bundle's placement layer is deleted |
| A live feed, pending state, a form from a Schema, agent context | Foldkit, once each ships | A thin layer that adds the contract (requirements, guards, metadata), or nothing |
| What a feature reads, across owners | Foldkit Plus (`foldkit-surface`) | The Projection; `AgentContext` becomes one thing a Projection produces |
| What may cause a transition, addressable from outside the runtime | Foldkit Plus, over upstream operations | Exposed operations and MessageSets (§6.2) |
| Who may do what | Foldkit Plus (`foldkit-guard`) | Unchanged; becomes the `access` of every capability |
| Server data a feature needs | Foldkit Plus (`foldkit-remote`) | Requirements and planning, over any source, including a Domain Api |
| Client-proposed, server-decided durable edits | Foldkit Plus (`foldkit-sync`, `foldkit-durable`) | The local-authority case Domain does not cover; gains Domain's server features (§6.5) |
| The authoritative server model, when the app uses Domain | `@alchemy.run/domain` | An adapter to Remote and the graph (§6.6) |
| Transports: RPC, HTTP, MCP, CLI | Effect | Generators that produce Effect's own values |

## 4. Invariants

Each is a rule a test, a type or `Module.validate` can check. A change that
breaks one is wrong even when every test passes.

1. **One owner per datum.** Unchanged from today: no fact is kept in the Model
   and in a package-side cache, URL store or second reducer.
2. **Every transition goes through its owner's update.** That includes child
   Blocks: a parent changes a child only through an operation, never by
   writing its Model. `ModelRef.set` and `WritableProjection.set` stay
   infrastructure for installing values already derived (restore, replay,
   reconcile). Bundle `helpers` that write a child's Model break this today
   (§6.0).
3. **Declarations are inspectable without running application code.** A tool
   can list a contract's Model paths, Message tags, capabilities and data
   requirements from the value alone. A callback may compute a value; it may
   not be the only record of what is read.
4. **The graph is derived, never restated.** Anything the Block Composition
   knows (placements, keys, operations, Mounts) is read from it. No
   declaration repeats a field name, a wrapper tag or a slot id that a
   Composition already holds.
5. **One capability, one dispatch path.** Every surface (in-app agent, MCP,
   WebMCP, A2A, HTTP, CLI) runs the same pipeline: resolve, check
   availability, decode, authorize, wait for a person's approval when the
   capability requires one, dispatch, await completion, against one Model
   snapshot per call. Adapters translate and add no authority, and none may
   skip the approval step.
6. **Intent from outside a runtime carries domain keys, never occurrence
   identity.** A Message that is stored, replayed, sent between tabs or
   devices, or produced by an agent names its target by placement and domain
   key. Foldkit's per-runtime `generation` never leaves the runtime that made it.
7. **Durable Messages stay readable.** Every stored durable Message decodes
   under the current build, through declared upcasters. Committed history no
   upcaster reads, and an operation from a newer build, make the journal and
   the replica refuse to open with a typed error; an unreadable pending
   operation is refused by its id into a persisted list, so it neither blocks
   the outbox nor is lost. Nothing is dropped silently.
8. **Server-only Messages cannot originate from a client.** Constructing one
   for submission is a type error on the client, and Sync refuses one by tag
   wherever it reads a sent entry, before `validate` and `authorize` run.
   Reworded 2026-11-12, and weaker than "the journal refuses one": a server
   that hands `foldkit-durable`'s `append` input no Sync reader saw gets no
   check, because Durable knows no tag
   ([190-sync-server-messages-DESIGN.md](./190-sync-server-messages-DESIGN.md)
   §3.1).
9. **Reactions run at least once and are keyed deterministically.** A
   post-commit reaction is identified by `opId` plus the reaction's name, so a
   retry is recognised. The docs say "at least once", never "exactly once".
10. **No second implementation of a shipped upstream primitive.** When Foldkit
    ships a mechanism, our package becomes a layer over it within one release,
    or is deleted.
11. **Edges are Effect-native.** Every surface we expose produces Effect's own
    values (an `HttpApi`, an `RpcGroup`, an MCP server, an AI Toolkit, an
    `effect/cli` command), so it composes with applications that already use
    them.
12. **The type budget holds.** The kitchen-sink typechecks within the budget
    Phase 0 sets (§6.0). A design that breaks it moves its check from the type
    system to `Module.validate` and a test.

## 5. Target architecture

### 5.1 The contract graph

*Sketch.* Nodes and edges, all derived:

| Node | From |
| --- | --- |
| Owner (a Block placement, keyed or not) | Block Composition |
| Field path | Model Schema |
| Transition (a local Message, an operation, a durable Message) | Composition, Sync contract, exposed operations |
| Capability (a transition offered outside the runtime) | Agent, exposed operations, Remote mutations, Domain commands |
| Access rule | Guard |
| Data requirement | Remote metadata on Projections; Domain Views |
| Surface | `App.surface` |

| Edge | Meaning |
| --- | --- |
| owns(Owner, Path) | The owner's update is the only writer |
| reads(Surface, Path) | Observation; may cross owners |
| causes(Capability, Transition) | Dispatching it runs that transition |
| guards(Access, Capability \| Path) | Who may invoke or read |
| needs(Surface, Requirement) | Server data the Surface's Projection pulls |
| activeOn(Surface, Route) | Activation recorded by `Surface.when` |

`Module.make` and `Module.validate` exist today with six rules
(`foreign-contract`, `duplicate-name`, `ownership-overlap`,
`message-claimed-twice`, `unknown-path`, `unknown-message`). The graph is
`Module` generalised: built from a Block Composition plus contracts, with the
rules kept and queries added.

### 5.2 Packages after the move

| Package | Disposition |
| --- | --- |
| `foldkit-surface` | Keep. Gains the graph and exposed-operation addressing |
| `foldkit-metadata` | Keep |
| `foldkit-bundle` | Delete the placement layer (`declare`, `parent`, `at`, `each`, `compose`, `Link`, `fromParts`). What remains (`lazy`, `follow`, integration lists) moves into a small Block-helpers module, likely inside `foldkit-surface` or a renamed package |
| `foldkit-bundle-surface` | Delete; its ownership derivation becomes part of the graph |
| `foldkit-remote` (+ `-server`, `-drizzle`) | Keep. The cache becomes a Block; its Subscriptions register at the root. Rebase `live` on `LiveQuery` if that lands general enough. Gains `RemoteServer.describe` |
| `foldkit-sync` + `foldkit-durable` | Keep. Gain server-only Messages, reactions, server-only state, typed rejections, upcasters |
| `foldkit-mirror` | Keep, as a root policy. Restore goes through owners' `inform*` operations |
| `foldkit-agent` + adapters | Keep the pipeline. Adapters move onto Effect's MCP and AI Toolkit values where they exist (`agent-mcp` has its own JSON-RPC today) |
| `foldkit-guard`, `foldkit-entity`, `foldkit-auth` | Keep |
| `foldkit-form`, `foldkit-crud`, `foldkit-cms` | Keep; re-check against upstream `Form.fromSchema` when it lands |
| `foldkit-primitives` | Audit against `@foldkit/ui` and Blocks; keep what upstream lacks |
| `foldkit-composition` | Keep; rename its `Block`/`Composition`/`Catalog` vocabulary to avoid the clash with Foldkit's |
| Mixins, richtext, data-grid, media, react, ssr, site | Unaffected by this plan beyond the Block migration of any Bundle they use |
| New: a Domain adapter | Phase 4 |

## 6. Phases

Each phase lists what it ships, what proves it, and what gates it. Sizes are
S, M, L.

### 6.0 Phase 0: measure, and fix what is wrong regardless (M)

Gate: none. Starts now.

**The canary spike** (in a worktree, on
`foldkit@0.169.0-canary.1f6776fa7ece` or a newer verified snapshot):

1. Port `examples/bundle` and one Remote example to Blocks.
2. Measure `tsc -b` time and editor latency on the ported examples and an
   estimate for the kitchen-sink. **Set the type budget** for invariant 12.
3. Probe each of these and record the answer in §8:
   - Does `makeCommand` accept a whole Message union in `messages`?
   - Does `prepareBlock` accept a stand-in `update`/`view` whose type is
     declared rather than inferred (for `Lazy.block`)?
   - Is a Command result discarded after its occurrence is removed?
   - Can a root Subscription computed from the whole Model sit beside a
     Block-owned Remote cache without restarting on every child change?
   - Does wrapping the authored root update callback give Sync everything its
     `afterUpdate` relies on today?
   - Can two Mounts share an element under Blocks?
   - Do generated envelopes survive a Sync replay on another replica?

**Fixes that do not wait for upstream:**

4. Route Bundle `helpers` through the child's update (invariant 2). Each
   helper becomes a Message handled by the child; `placed.helpers.x()` returns
   the Step that dispatches it.
5. Typed rejections in Sync (§6.5 item 5), since the replica's rejection is a
   `reason: string` today (`packages/sync/src/sync.ts`). This builds the
   decision already taken in
   [remote-improvement-plan.md](./remote-improvement-plan.md) (§15 decision
   12, "a Sync rejection reads as a `Refusal`") with Remote's `Refusal`
   vocabulary (§5.2 there), not a new one. It needs one case that vocabulary
   lacks: an operation no upcaster reads (`Unreadable { version }`, from
   [190-upcasting-DESIGN.md](./190-upcasting-DESIGN.md) §9).
   **Built** (2026-11-11), per
   [190-sync-refusals-DESIGN.md](./190-sync-refusals-DESIGN.md), reviewed in
   three rounds: `SyncRefusal` (`Forbidden`, `Invalid`, `Unreadable`) on
   `Rejection.refusal` and the reply's `refusals`; `reason` and `reasons`
   deprecated for one release. `Unreadable` is declared and decoded; its
   producer, `journalExchange`, landed with Phase 5 item 6.
6. A design note for upcasting durable Messages (invariant 7). **Written and
   reviewed** (2026-11-11): [190-upcasting-DESIGN.md](./190-upcasting-DESIGN.md).
7. A section in `docs/replication.md` on choosing document boundaries: a Sync
   key is the unit inside which `validate` may enforce a rule; a rule across
   keys gets its own key (a username claim) or a reserve-then-confirm flow.
   **Done**: its "Choosing document boundaries" section (71855f3f).

Done when: the measurements and probe answers are in §8, items 4 and 5 are
merged with tests and mutations, and items 6 and 7 are written.

### 6.1 Phase 1: onto Blocks (L)

Gate: foldkit/foldkit#1655 merged and released; Phase 0's budget met.

1. Upgrade Foldkit; migrate every hand-wired child in `examples/` to Blocks.
2. Remote's cache becomes a Block (`Data.reduce` as its update, `RemoteClient`
   through a handler Layer); its Subscriptions register at the root
   (*Sketch*: `Data.subscriptions(App)`).
3. Mirror becomes a root policy: a Subscription writes the URL or store;
   restore dispatches each owner's `inform*` operation. The `shared` tag rule
   goes.
4. Sync wraps the authored root update (or uses an upstream hook, §7 Q2).
5. `Integrations.root(...)` (*Sketch*) returns `{ bindings, subscriptions,
   initSteps, update, contracts }` for spreading into the root Composition, so
   an application still lists its integrations in one place.
6. `Lazy.block` (design in §9.1), passing `foldkit-ssr`'s `lazy: [...]`.
7. Delete Bundle's placement layer and `foldkit-bundle-surface`.
8. Convert Remote, Sync and Auth Commands to handler contracts with `.layer`.

Done when: no example imports `foldkit-bundle`'s placement API; `pnpm check`
and `pnpm e2e` pass; the skill and READMEs describe Blocks, not Bundles.

### 6.2 Phase 2: addressable transitions (M)

Gate: Phase 1. Shape depends on what upstream does with point 1 of our #1655
comment.

1. If Foldkit ships an addressing seam, adopt it. Otherwise
   `Expose.operations(Composition, { name: Binding.operation, ... })`
   (*Sketch*) generates a constructible root Message per operation, addressed
   by placement and domain key, with no generation (invariant 6), and the
   update branch that calls the Binding.
2. `MessageSet.make`, `Action.define` and `Agent.expose` accept exposed
   operations as well as local constructors.
3. Sync's durable sets may contain exposed operations; generated envelopes are
   refused (they have no constructors, so this is a type error already).

Done when: an agent tool, a durable Message and a Port each reach a child
Block's transition in a test, with no hand-written parent Message.

### 6.3 Phase 3: the contract graph (L)

Gate: Phase 2.

1. `Module.fromComposition(ApplicationComposition, contracts)` (*Sketch*)
   builds the graph of §5.1. Owners, keys and operations come from the
   Composition (invariant 4).
2. Keep the six existing rules; add `transition-outside-owner` (a contract that
   writes a path its owner does not route), `unguarded-capability`,
   `unreachable-requirement`.
3. Queries: `capabilitiesFor(principal)`, `readersOf(path)`,
   `requirementsOn(route)`, `ownerOf(path)`.
4. Renderers: the existing `Module.toMarkdown` and `Module.toMermaid` over the
   new graph.
5. Decide, from Phase 0's budget, which checks live in types and which in
   `Module.validate` (invariant 12).

Done when: the kitchen-sink's graph validates, each query is used by one
example or test, and a deliberate violation of each rule is caught.

### 6.4 Phase 4: one capability, every surface (M)

Gate: Phase 3.

1. A capability catalog: UI Messages from `Agent.expose`, exposed operations,
   Remote mutations and queries, and Domain commands when the adapter is
   present, each with `description`, input and output JSON Schemas, `access`
   (Guard), and `expose` per surface. The catalog's JSON form is the one
   Domain's `Api.describe` produces (alchemy-run/alchemy#2578), with the same
   field names, so a generator reads a Foldkit Plus catalog and a Domain one
   alike and neither project keeps a second format. If `describe` changes
   before it merges, follow it; if it does not merge, ours is the format and
   Domain's adapter maps into it.
2. Generators producing Effect values: MCP server and AI Toolkit, `HttpApi`
   with OpenAPI (opt-in per entry, off by default), `effect/cli`.
3. Per-caller visibility from principal guards alone, so a tool list needs no
   call.
4. **Approval for dangerous writes.** A catalog entry may declare
   `needsApproval` (Domain's name for it, alchemy-run/alchemy#2585). The
   pipeline then stops after `authorize` and before dispatch until a person
   approves (invariant 5). In an in-app agent the pending request is Model
   state the view draws, and approving or declining is a Message; over MCP or
   HTTP the call answers "pending approval" with an id to poll or resume. A
   Domain command's `needsApproval` carries over through the adapter (§6.6).
   How each surface asks is §7 Q11.
5. A conformance test that runs one scenario through every surface and fails
   when one answers differently (alchemy-run/alchemy#2593 does this for
   Domain).

Done when: one example serves the same capability through the in-app agent,
MCP and HTTP from one declaration, a capability marked `needsApproval` waits
for a person on every surface, and the conformance test can fail.

### 6.5 Phase 5: the server side of Sync (L)

Gate: Phase 0 item 5. Independent of Phases 1 to 4.

1. **Server-only Messages.** A `serverOnly` MessageSet on the Sync contract.
   Clients replay them and cannot submit them (invariant 8);
   `journal.appendAsServer` appends them with the server's actor.
2. **Reactions.** `journal.react(set, handler)` (*Sketch*) runs after commit in
   journal order, resumes from a stored cursor, keys each run by
   `opId:reaction` (invariant 9), and appends server-only Messages or calls an
   external system. Nothing more: a reaction holds no state of its own, waits
   for nothing, and starts no process. Anything longer belongs to item 7's
   answer.
3. **Server-only state.** A part of the snapshot the journal keeps and never
   sends. Only server-only Messages may change it, so the client's `update`
   never needs it.
4. **What each reader may see.** Today a replica holds the whole shared
   snapshot. Readers of one document may need different slices: an owner sees
   the budget, a guest does not. The journal filters what it sends each
   replica with Guard's row guards over that replica's principal, as
   `foldkit-remote-server` already filters reads, and refuses an operation
   that touches a part its sender cannot read. The hard part is replay: a
   replica runs `update` over a partial snapshot, so an `update` must not
   depend on a part the reader lacks. §7 Q13 asks whether that can be checked
   or only documented.
5. **Typed rejections.** A durable Message declares its `Refusal` union, as a
   Remote `Mutation` does; `validate` returns one; the replica's rejected
   operation carries it decoded, so a cell shows the reason the same way
   whether Remote or Sync refused the change.
6. **Upcasters.** The history from Phase 0 item 6
   ([190-upcasting-DESIGN.md](./190-upcasting-DESIGN.md)): a chain,
   `Sync.migrations(V1).next(V2, up)`, in place of a list, so each step's input
   is typed by the step before it. It is applied in Sync's operation codec, so
   every hook (`admit`, `validate`, `authorize`, `reduce`, `stamp`) sees the
   current Message while the outbox and the payload hash keep the version
   written. It covers `foldkit-durable`'s optional `compared` form and a
   stored row that will not decode reported as a `JournalError`. **Built
   2026-11-11** on the branch, with the five named tests
   (`packages/sync/test/upcasting.test.ts`); the decisions the note left open
   are its §11. Jev did not run (`TYPESAFE_API_KEY` unset).
7. **Deadlines and processes: deferred until a Sync application needs one.**
   Reactions alone cannot express "if nobody accepts the invite within seven
   days, expire it", or Phase 0 item 7's reserve-then-confirm flow with a
   timeout. Durable timers and multi-step processes are a server runtime,
   which [remote-improvement-plan.md](./remote-improvement-plan.md) §13
   declines, and which Domain's Sagas, Effect's workflow modules and Durable
   Object alarms already provide. So we build none of our own. When a Sync
   application needs a deadline, a reaction hands the process to whichever of
   those the application already runs, and the result returns as a
   server-only Message. Only if none fits do we add a timer:
   `journal.schedule(key, at, message)` (*Sketch*), storing a server-only
   Message to append at a time, fired at least once (invariant 9), cancelled
   by id. Where it would run is §7 Q12.
8. **Journal Stories.** Given committed operations, when a principal submits
   one, then it commits or is rejected with this rejection. Runs without a
   server.

Done when: an example records a payment confirmation from a webhook as a
server-only Message, a reaction sends a notice once per commit across a
restart, a guest replica never receives the owner-only part of a document, a
rejection reaches the UI typed, and a renamed durable Message replays from an
old journal. For item 6 also: an outbox written by the old build opens under
the new one; an acknowledgement lost across a deploy reads as already
committed; a client ahead of its server waits rather than losing the edit; an
unreadable pending operation lands in `refused` while the rest of the outbox
is sent; and a client claiming an old version is refused by `admit` and
`authorize` exactly as the current Message would be.

### 6.6 Phase 6: authorities we do not own (M)

Gate: Phase 3 for the graph part; `RemoteServer.describe` can start after
Phase 1. The Domain adapter waits for alchemy-run/alchemy#2567 (`View.snapshot`)
and #2569 (live reads that carry cursors) to merge; until then, at most a spike
against the current Domain beta, kept out of the published packages.

Domain is never a dependency of `foldkit-remote-server` or any existing
package. Remote's server stays independent of the backend (§9.2), and Domain,
in beta with its key APIs in open PRs, would bring that churn to every Remote
user. The adapter is a package of its own, with `@alchemy.run/domain` as a
peer.

1. **`RemoteServer.describe`**: every query and mutation with JSON Schemas and
   guards, feeding the catalog in Phase 4's format.
2. **A Domain adapter** (`foldkit-remote-domain`, *name to decide*): a Domain
   View is a Remote source (live, resumes from its cursor); a Domain command is
   a mutation; Domain metadata (`description`, `access`, `expose`,
   `needsApproval`) feeds the catalog.
3. **Domain Rejections are Remote `Refusal`s.** Each command's `rejects` list
   maps to the mutation's declared `Refusal` union, decoded on the client. A
   field then shows a refusal the same way whether Remote, Sync (Phase 5
   item 5) or Domain refused the change, and `Crud.editor` routes a field
   refusal to its form field with no app code.
4. **First paint without a spinner.** A Domain View read answers `{ state,
   cursor }` (alchemy-run/alchemy#2567). On a server-rendered page, the
   adapter puts both in `foldkit-ssr`'s resume plan, so the browser starts
   from the rendered state and its live read resumes from the cursor instead
   of loading again.
5. **Domain Stories as client fixtures.** A Domain Story fixes the events and
   replies the server gives. The adapter offers it as a fake Remote source,
   so a Foldkit Story or Scene test drives the client against the server's
   own scenario without a server (alchemy-run/alchemy#2570 proposes recording
   them from traces).
6. **One trace from browser to server.** Domain's Api calls carry the
   browser's trace to the server. Check whether Remote's calls do the same
   (`foldkit-remote-server` uses `effect/rpc`), and make the adapter keep
   Domain's propagation either way.
7. Decide what happens when an app has both Domain's `Aggregate.predict` and a
   Sync document for one fact: they are two optimistic mechanisms, and only one
   may own the pending state (§7 Q6).

Done when: an example reads and writes a Domain model through Remote with no
hand-written bridge; its commands appear in the capability catalog; a Domain
Rejection reaches a form field typed; a server-rendered page resumes its live
read without loading again; one client test runs against a Domain Story; and
one trace spans browser and server.

### 6.7 Phase 7: shrink (ongoing)

1. As `LiveQuery`, `keepPending`, `AgentContext` and `Form.fromSchema` land,
   rebase or delete ours within one release (invariant 10).
2. Merge packages that no longer stand alone.
3. Rewrite `SKILL.md` and the README map around the contract graph.

## 7. Open questions

| # | Question | How it gets answered |
| --- | --- | --- |
| Q1 | Does upstream adopt an addressing seam for operations (our #1655 comment, point 1), or do we own `Expose.operations`? | The #1655 thread; decide at Phase 2's start |
| Q2 | Will Foldkit add a hook around the root update (point 3)? If not, is wrapping the authored callback enough for Sync? | Phase 0 probe, then the thread |
| Q3 | Can a child Block's Subscriptions get parent context (point 4), letting Remote's Subscriptions live in its Block? | The thread; until then, root registration |
| Q4 | Are generated envelopes portable (point 2)? If not, Sync must refuse them and require exposed operations | Phase 0 probe |
| Q5 | Is `LiveQuery` general enough to carry Remote's requirement planning, or only a View-shaped feed? | Read foldkit/foldkit#1785 when it is reviewable |
| Q6 | With Domain's `Aggregate.predict` and Sync both available, which owns optimistic state for a fact? | Phase 6; likely "Sync for documents a client authors offline, predict for commands against a server Aggregate", stated in the ownership table |
| Q7 | Where do the remaining Bundle helpers (`lazy`, `follow`, `Integrations.root`) live: `foldkit-surface`, or a renamed `foldkit-bundle`? | Phase 1, by import weight: Surface must not pull in Block runtime code |
| Q8 | What is the type budget, in seconds and in editor latency? | Phase 0 measurement |
| Q9 | Does the Guard-filtered tool list need Effect's `McpServer.visibility` (Effect-TS/effect#9661), as Domain's does? | Phase 4 |
| Q10 | Should `foldkit-composition` rename, or should we ask upstream to? | Ours to rename; decide the names in Phase 1 |
| Q11 | How does each surface ask a person to approve? In-app it is Model state and a Message; MCP may offer elicitation; HTTP and CLI need a pending id. Who may approve: the caller, or a named role? | Phase 4, starting from Domain's `needsApproval` (alchemy-run/alchemy#2585) |
| Q12 | When a Sync application first needs a deadline, which process runtime does a reaction hand it to: Domain's Sagas, Effect's workflow modules, or a Durable Object alarm? Each must fire at least once across restarts. Only if none fits: where does our own timer run? | Phase 5, when that application exists, with a probe of the runtime it already uses |
| Q13 | Can we check that `update` reads nothing a reader's slice lacks, or only document it? A replay over a partial snapshot that reads a missing part diverges silently | Phase 5; try deriving each durable Message's reads from its Projection first |

## 8. Phase 0 findings

Run on 2026-11-11, items 1 to 3 of §6.0. Items 4 to 7 (the fixes that do not wait for upstream) are not started. The port's code is in the branch `worktree-agent-a0ac35c861ac32891` (commit `e0d850e7`, a worktree of this repository). It was never pushed or merged and is not shipped; it is evidence, not a migration.

### 8.1 The canary

- **Used:** `foldkit@0.170.0-canary.54f8bcd443b4` (npm dist-tag `foldkit-canary-upload-54f8bcd443b4`, the newest), with `@foldkit/ui@0.170.0-canary.54f8bcd443b4`. It is newer than the plan's `0.169.0-canary.1f6776fa7ece` and than the repository's `examples/foldkit/domains` pin (`0.169.0-canary.90746b32d2ca`). Stable `0.170.0` (`a471adb24d75`) has no Blocks.
- **It carries the Block API, but a later shape than §2 and §9.1 were written from.** `foldkit/block` (`Block.make`, `makeNamespace`, `makeDefinition`, `assemble`), `foldkit/binding`, `Program.make` and `makeElement`, `makeCommand` and `prepareBlock` (both still present). No `block.md` ships. What the examples need:
  - `Block.make(id, { key: Symbol, InitArgs, view, Model, Message, OutMessage?, operations?, effects? })`, then `makeComposition({ bindings })`, `makeInit`, `makeUpdate`, `makeView` and `makeLayer({ init, update, view, subscriptions?, EffectsLayer? })`. A host takes the pair `{ block, layer }`.
  - `init`, `update` and `view` are **passive plans, not functions** (`init()` throws "is not a function"). A test builds the graph with `withBlock` or `story` from `foldkit/story`.
  - `@foldkit/ui` ships Blocks: `Tabs.makeBlock()` and `Tabs.layer`.
- **Effect:** the canary peers on `effect ~4.1.0` and `@effect/platform-browser ~4.1.0`; the workspace's 4.1.1 satisfies both. `@foldkit/ui`'s canary peers on the exact canary `foldkit`.
- **What changed to install it (worktree only):** one line in `pnpm-workspace.yaml` (`overrides: foldkit: 0.170.0-canary.54f8bcd443b4`; Foldkit is pinned per package, there is no catalog) and `@foldkit/ui` in `examples/bundle/package.json`, since overriding `@foldkit/ui` would orphan the domains example's patch. `pnpm install` took 11 s. Packages that pin `foldkit: 0.170.0` or `^0.170.0` get a peer warning: a prerelease does not satisfy them.

### 8.2 What the canary removes or renames

The unported workspace does not compile against it. `tsc -b examples/remote` reports 586 errors: `mixins-ui` 347, `primitives` 214, `bundle` 17, `remote` 4, `mixins` 1, the example 3. Causes:

- `foldkit/submodel` is gone (`h.submodel`, `Submodel.defineView`). By grep, 19 packages and 19 examples use it.
- `Update.combine` is now `combineSteps` (6 packages, 13 examples; `primitives` alone has 17 files).
- `Subscription.persistentEntry` is gone, and `Subscription.make<Model, Message, R>()(() => entries)` is now `Subscription.make<Model, Message>()(entry => ({ key: entry(name, fields, { messages, modelToDependencies, handler }) }))`, with a handler Layer per entry and a `dependenciesSchema`.
- Mount registration types changed (TS2322 in `mixins-ui`).
- Remote's own four errors are type-only: `outbox.ts:650`, `persistence.ts:858` and `remote.ts:975` (the `Subscription.make` arity), and `remoteData.ts:218` (a `CallableTaggedStruct` is not callable). The port ran with them unfixed.

So Phase 1 is not "swap the version": every `@foldkit/ui`-based package (`primitives`, `mixins-ui`, and what builds on them) needs the ui canary and a Subscription and Update migration first. Count that in Phase 1's size.

### 8.3 The ports

- **`examples/bundle`: ported.** MediaQuery (a Subscription child, placed twice), Upload (a Record Binding with an OutMessage fold and an operation, `restart`) and Tabs (the ui Block) are Blocks under one `SettingsPage` root, plus a root Subscription (`autosave`). `tsc -p` is clean and 8 tests pass; a mutation of the Upload fold (`>= 100` to `> 100`) fails one. What did not carry over: `Surface.application`, `BundleSurface.parent` and the `Module.validate` ownership table, because `foldkit-bundle-surface` imports `foldkit-bundle`, which does not compile; the graph (§5.1) replaces it in Phase 3. Authoring notes:
  - A Record Binding needs the parent's `init` to supply `uploads: {}`.
  - A child's Subscription key is placement-prefixed (`dark/changes`), and the root's is `autosave`.
  - A child's Message reaches the parent as an envelope with no constructor (`PrivateDelivery`), so a test sends it with `messageIn(Binding, key, message)`.
  - A Story fails on a Command with no resolver (`Command.resolve(Tabs.test.FocusTab, ...)`).
  - Exporting an inferred `init`, a Command or a Layer from a `composite` project fails declaration emit (TS2883, TS2527: the types name `AnyBindingInitRecipe` and a `unique symbol`). The port keeps those unexported. Expect this in every package that publishes `.d.ts`.
- **`examples/remote`: not portable as is.** Its render path is `foldkit-mixins-surface` over `mixins-ui` and `primitives` (561 of the 586 errors). Instead `examples/remote/src/blocks.ts` hosts the demo's Remote cache in a Block: the demo's Model, one handler per `Remote.messages` tag calling `Data.reduce`, and the Surface-derived `page.read` entry registered as a Block Subscription. Two costs: the update table for the spread Remote messages is built with `Object.fromEntries` and an `as never` cast, and the handler needs `effects: { services: [RemoteClient] }` in `Block.make`, or `makeLayer` fails with an unreadable "not assignable to `never`". Two tests pass (`test/blocks.test.ts`). It runs Remote's old-style entries inside the new Subscription shape with a `Schema.Array(Schema.Unknown)` dependencies schema; a real port needs Remote's requirement schema.

### 8.4 Measurements

TypeScript 7.0.2, `tsc -p <project> --noEmit --incremental false --extendedDiagnostics`, three runs each (the tree maps workspace packages to source, so the numbers include them). Median shown; instantiation and type counts were identical across runs.

| Project | Instantiations | Types | Check | Total |
| --- | --- | --- | --- | --- |
| `examples/bundle`, before (stable 0.170.0, placements) | 466,598 | 96,393 | 0.278 s | 0.587 s |
| `examples/bundle`, after (canary, Blocks, Tabs Block, Story tests, probes) | 1,442,982 | 183,272 | 0.637 s | 0.991 s |
| `examples/kitchen-sink`, today (stable) | 723,532 | 131,204 | 0.745 s | 1.895 s |
| Marginal Block, from generated files of 10 and 40 identical small Blocks (Model, three Messages, composition, init, update, view, `makeLayer`) | about 18,200 | about 1,870 | about 16 ms | |

Instantiations for the generated files: 0 Blocks 196, 1 Block 42,700, 10 Blocks 206,248, 40 Blocks 751,408 (total time 0.27, 0.31, 0.44 and 0.94 s).

- **Cost per Block is linear and small.** About 18k instantiations each. `examples/bundle` grew by 976k, far more than its four Blocks explain (about 73k): the rest is the `@foldkit/ui` Tabs Block's types and `foldkit/story`'s test types, which are heavy. Measure them separately before Phase 1 rather than assuming a Block costs what the 40-Block file suggests.
- **Estimate for `examples/kitchen-sink`:** it uses one placement today (Remote cache, Sync mount, Agent, Mirror, Surface integrations); about 12 Blocks and Bindings after Phase 1. That adds 0.22M at the measured slope, so 0.95M instantiations; if its ui and test types cost what the bundle example's did, about 2.0M. So 1.0 to 2.0M instantiations, 1.0 to 1.6 s check, 2.2 to 3.5 s total. Not run: it cannot compile until `mixins-ui` and `primitives` are migrated (§8.2).
- **Editor latency was not measured** (no editor or `tsserver` session here). Measure it in Phase 1 on the real kitchen-sink: a `quickinfo` on a Binding and on `makeUpdate`'s argument.

### 8.5 The type budget (invariant 12, Q8)

Measured as above, `tsc -p examples/kitchen-sink --noEmit --incremental false` on the machine and TypeScript version of CI's `typecheck`:

- instantiations at most 2.0M (2.8 times today's);
- check time at most 1.6 s (twice today's) and total at most 4.0 s;
- memory at most 1 GB;
- any one Block's marginal cost at most 25k instantiations (measured 18k);
- an editor `quickinfo` on a Binding or `makeUpdate` argument at most 1 s (to be measured in Phase 1).

Enforce the first four in a `typecheck:budget` script that prints the diagnostics and fails above the numbers, run in CI beside `typecheck`. Over budget, the rule in invariant 12 applies: the check moves to `Module.validate` and a test.

### 8.6 The probes

| Question | Answer | Evidence |
| --- | --- | --- |
| Does `makeCommand` accept a whole Message union in `messages`? | **Yes.** | `examples/bundle/src/probes.ts:10-16` (`messages: [UploadMessage]`) compiles; the stand-in update returns `LoadBody({ message })` for any member. |
| Does `prepareBlock` accept a stand-in `update`/`view` whose type is declared rather than inferred? | **Partly.** `makeLayer` takes a stand-in made through the same Composition and it runs (the test gets `Upload/LoadBody`). But the stand-in's type is not the real one's: a plan's type carries its Commands' handler requirement, so `const lazy: typeof real = standIn` fails. `Lazy.block` must declare `LoadBody` in the Block's contract (`effects`), or accept two plan types. Not tried: the `effects` route. `prepareBlock` and `Block.assemble` still exist, but the ui and the new examples use `makeLayer`. | `probes.ts:33-34` (`@ts-expect-error`) and `:36-41`; `test/probes.test.ts` P2. |
| Is a Command result discarded after its occurrence is removed? | **Yes, by source; not run live.** Removal sets `isActive` false; the Command is forked in the occurrence's scope (interrupted when it closes), skipped if not current when started, and a queued Message from a non-current occurrence is dropped. Input from outside (a Port) is admitted only for an active child whose `generation` equals the Message's. Story and Scene do not simulate admission (`messageIn`'s doc says so). | canary `dist/runtime/compositionRuntime.js:133-135, 336-337`; `runtime.js:213-216, 307, 322`; `messageQueue.js:115-116`; `childOrigin.js:84-116`. |
| Can a root Subscription computed from the whole Model sit beside a Block-owned Remote cache without restarting on every child change? | **Yes, run.** A root entry with dependencies `{ section, finished count }` stays equivalent when a child changes and changes when `section` does. The runtime restarts an entry only when `Schema.toEquivalence(dependenciesSchema)` (or `keepAliveEquivalence`) says the dependencies differ. In `examples/remote/src/blocks.ts` the Remote read entry's dependencies are equivalent when derived twice and after an unrelated Message. Not run: a real Remote state change restarting the stream in a live runtime. | `test/probes.test.ts` P4; `examples/remote/test/blocks.test.ts`; `dist/runtime/subscriptionFibers.js:13-14` (`Stream.changesWith`, `switchMap`). |
| Does wrapping the authored root update callback give Sync everything its `afterUpdate` relies on? | **No: there is nothing to wrap.** `update` is a passive plan (`init()` is not callable), `Program.make` takes no update hook (grep of `dist` finds none outside devtools and test code), and the runtime calls the acquired function directly. Wrapping every authored handler would miss child Messages, which route through the Binding, not the parent's handlers. Q2 needs an upstream hook, or Sync reads the dev-tools store (not a contract). | `dist/runtime/runtime.js:334`; `dist/runtime/programPublic.d.ts`; `Program.make`'s config. |
| Can two Mounts share an element under Blocks? | **No, but loudly now.** A second `OnMount` on an element throws "An element can have only one OnMount attribute ... Combine both behaviors in one Mount", where the old runtime dropped the first silently. The resolver still has to compose Mounts (the Traps entry stands). Read from source; not run. | `dist/html/index.js:964-968`. |
| Do generated envelopes survive a Sync replay on another replica? | **No.** An envelope is `{ _tag: 'GotDarkMessage', placement, generation, key?, message }`; `generation` comes from a counter shared by all occurrences in one runtime, starting at 0, taken as each occurrence is created, and external input is admitted only on equality. Another replica, or the same one after a restart, numbers occurrences by its own creation order. Types make this explicit: the envelope is an opaque `PrivateDelivery`, so a test must cast. `update` itself applies an envelope of any generation (the P7 test passes with 99), so the guard is the runtime's, not the reducer's. Q4: Sync refuses generated envelopes and requires exposed operations. | `dist/runtime/childOrigin.js:19-31` (the shape); `dist/runtime/compositionRuntime.js:13, 69`; `childOrigin.js:107-113`; `test/probes.test.ts` P7. |

Also read, not probed (Q3): a child Subscription is gated by `subscriptionWhen(parentModel, key, name)` and sees no parent context (`compositionRuntime.js:152-158`), as §11 recorded for `1f6776fa`.

### 8.7 What this changes in the plan

- **Phase 1's gate and size.** The upgrade breaks `foldkit/submodel`, `Update.combine` and the Subscription constructors across 19 packages (§8.2): size L stays, but only after a dependency order is set (ui canary, then `primitives` and `mixins-ui`, then the rest). Keep "Port only after #1655 merges" (§10).
- **Phase 2.** Q4 is answered: envelopes are not portable, so durable Messages and agent tools reach a child only through exposed operations. The canary's `operations: { name: (...) => Tuple.make(Message) }` and the Binding's generated method (`UploadsBinding.restart(id)(model)`) are the seam to build on; whether it is addressable from outside the runtime is still Q1.
- **Phase 1 item 4 (Sync wraps the root update).** Q2 is answered "no": it waits on an upstream hook.
- **Phase 0 item 4 (Bundle `helpers` through the child's update)** matches what the canary does (an `operations` entry becomes a Message the child handles), which is evidence for invariant 2.
- **Declaration emit.** Every published package that exports a Block's `init`, a Command or a Layer will need an explicit type or a portability fix upstream (§8.3). Add this to Phase 1's definition of done, and to invariant 12's risk.

## 9. Notes

### 9.1 `Lazy.block`

Worked out on 2026-10-26 from `packages/bundle/src/lazy.ts` and the #1655
source:

- The boot chunk holds the Definition, Model, complete Message Schema (generated
  envelopes decode against it from the start), `init`, Subscriptions,
  resources, and every Command contract.
- `update` and `view` are stand-ins: before the body loads, update returns a
  declared `LoadBody` Command carrying the Message, which loads the body and
  yields the Message again; the view draws `while`. A failed load is a
  declared `FailedLoad` Message, not a defect.
- Handler implementations load with `import()` inside each handler call, since
  the Runtime builds the handler graph once at start.
- A lazy Block's children load eagerly; split a subtree by making each heavy
  child lazy.
- An operation on a child whose body has not loaded does nothing that round.
  Default: preload when the route resolves. Operations a parent relies on
  synchronously get their own branch in the boot chunk.
- `Lazy.block` satisfies `foldkit-ssr`'s `Loadable`, so server preload and
  hydration work unchanged.
- The upstream version (requested in our #1655 comment, point 5) would hold an
  occurrence's Messages until its body arrives and build its handlers late,
  removing the double pass.

### 9.2 What does not change

- One `update` per owner. Domain needs Commands, Events and Rejections as
  separate kinds because it has no client `update`; we add labels to Messages
  (durable, server-only, rejects), not new kinds.
- Remote stays independent of the backend. Domain is a source, not what Remote
  becomes, and no existing package depends on it.
- No server runtime. We build no Saga engine, scheduler or process manager
  ([remote-improvement-plan.md](./remote-improvement-plan.md) §13 declines
  one); reactions hand longer work to a runtime the application already has.
- Event sourcing is not a goal. The Sync journal is a log of Messages for one
  document, not an event store for the application.

### 9.3 Upstream conversations

- foldkit/foldkit#1655, our feedback:
  https://github.com/foldkit/foldkit/pull/1655#issuecomment-6415641973
  (addressable operations, portable envelopes, a root update hook, child
  Subscription context, lazy Blocks, a Binding observer, smaller notes).
- foldkit/foldkit#1800, our feedback:
  https://github.com/foldkit/foldkit/pull/1800#issuecomment-6415901169
  (derive from Model fields, static paths, contexts across Blocks, the send
  side, one declaration for several readers).

## 10. Risks

| Risk | Effect | Mitigation |
| --- | --- | --- |
| Type cost compounds: Blocks plus our contracts make editors unusable | Invariant 12 fails; adoption stops | Phase 0 sets the budget before any port; checks move to `Module.validate` when over it |
| Upstream changes the Block API again before release | Phase 1 is redone | Port only after #1655 merges; track the preview's changelog |
| Upstream ships a seam we built (addressing, lazy, hooks) | Two ways to do one thing | Invariant 10: rebase onto it within a release |
| The graph becomes a second declaration to keep in step | It drifts and lies | Invariant 4: derive everything the Composition knows |
| Server-only state splits `update` into two shapes | Sync's "no second reducer" weakens | Only server-only Messages touch server-only fields; the client's update never sees them |
| Scope: seven phases over many packages | Nothing finishes | Phases 0 and 5 do not wait on upstream; each phase ends with a working example |
| Domain changes under the adapter: it is in beta, and `describe`, `View.snapshot`, live cursors and `predict` are open PRs | The adapter and the shared catalog format are redone | The adapter waits for the PRs it reads to merge and stays a separate package with Domain as a peer; the catalog follows `describe` only once it merges |

## 11. How this was checked

On 2026-10-26:

- foldkit/foldkit#1655 at `1f6776fa`: `packages/website/src/page/core/block.md`;
  `packages/foldkit/src/block/binding.ts` (child Subscriptions are gated by
  `subscriptions.when`, a boolean over the parent Model; no context);
  `block/childEnvelope.ts` (the envelope Schema carries `generation: number`,
  and generated delivery adds no author-facing constructors);
  `runtime/compositionRuntime.ts` (the generation counter starts at 0 per
  runtime); `runtime/program.ts` (no update hook in `make`'s config); no lazy
  or dynamic-import support anywhere under `src/block`.
- foldkit/foldkit#1800 at `3bb72531`:
  `packages/foldkit/src/experimental/agentContext/agentContext.ts` and the
  guide's `agentContextDefine.ts`.
- alchemy-run/alchemy `main`: `packages/domain` README, `skills/alchemy-domain`
  (SKILL.md, frontend.md), the exports of `Api.ts`, `View.ts`, `Policy.ts`,
  `Kernel.ts`; issues #2589 and #2590. The alchemy PRs cited by number in
  §6.4 and §6.6 (#2567, #2569, #2570, #2578, #2585, #2593) are described from those issues'
  tables; the PRs themselves were not read.
- This repository: `packages/bundle/src/lazy.ts`; `packages/durable/src/journal.ts`
  (`reduce`, `validate`, `authorize`, `stamp` run inside the append
  transaction); `packages/sync/src/sync.ts` (a rejection's reason is a string of
  at most 500 characters); `packages/agent-mcp/src` (its own JSON-RPC, not
  Effect's MCP server); `packages/remote-server/src` (uses `effect/rpc`);
  `skills/foldkit-plus` (SKILL.md, bundle.md, surface.md, agent.md, sync.md,
  guard.md, composition.md).
- Not checked, as of 2026-10-26: any of this against a running canary. Phase 0's spike did that on 2026-11-11 (§8), against a later canary than `1f6776fa`.
