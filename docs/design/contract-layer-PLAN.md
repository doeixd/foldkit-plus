# The contract layer: Foldkit Plus after Blocks

> **Status:** Proposed (2026-10-26). Nothing here is built. Written after reading
> foldkit/foldkit#1655 (Blocks and handler Layers) at `1f6776fa`,
> foldkit/foldkit#1800 (`AgentContext`) at `3bb72531`, and alchemy-run/alchemy's
> `@alchemy.run/domain` with its issues #2589 and #2590, against this repository on
> the same date (§11). Blocks marked *Sketch* are shapes to review, not APIs; the
> phase that builds each one fixes its real signature. Where this plan and a
> package README disagree, the README and the source win.

| Phase | Ships | Evidence |
| --- | --- | --- |
| 0 to 7 | — | not started |

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
   availability, decode, authorize, dispatch, await completion, against one
   Model snapshot per call. Adapters translate and add no authority.
6. **Intent from outside a runtime carries domain keys, never occurrence
   identity.** A Message that is stored, replayed, sent between tabs or
   devices, or produced by an agent names its target by placement and domain
   key. Foldkit's per-runtime `generation` never leaves the runtime that made it.
7. **Durable Messages stay readable.** Every stored durable Message decodes
   under the current build, through declared upcasters, or the journal and the
   replica refuse to open with a typed error. Nothing is dropped silently.
8. **Server-only Messages cannot originate from a client.** Constructing one
   for submission is a type error on the client, and the journal refuses one by
   tag before `validate` and `authorize` run.
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
5. Typed rejections in Sync (§6.5 item 4), since the replica's rejection is a
   `reason: string` today (`packages/sync/src/sync.ts`). This builds the
   decision already taken in
   [remote-improvement-plan.md](./remote-improvement-plan.md) (§15 decision
   12, "a Sync rejection reads as a `Refusal`") with Remote's `Refusal`
   vocabulary (§5.2 there), not a new one.
6. A design note for upcasting durable Messages (invariant 7).
7. A section in `docs/replication.md` on choosing document boundaries: a Sync
   key is the unit inside which `validate` may enforce a rule; a rule across
   keys gets its own key (a username claim) or a reserve-then-confirm flow.

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
   (Guard), and `expose` per surface.
2. Generators producing Effect values: MCP server and AI Toolkit, `HttpApi`
   with OpenAPI (opt-in per entry, off by default), `effect/cli`.
3. Per-caller visibility from principal guards alone, so a tool list needs no
   call.
4. A conformance test that runs one scenario through every surface and fails
   when one answers differently (alchemy-run/alchemy#2593 does this for
   Domain).

Done when: one example serves the same capability through the in-app agent,
MCP and HTTP from one declaration, and the conformance test can fail.

### 6.5 Phase 5: the server side of Sync (L)

Gate: Phase 0 item 5. Independent of Phases 1 to 4.

1. **Server-only Messages.** A `serverOnly` MessageSet on the Sync contract.
   Clients replay them and cannot submit them (invariant 8);
   `journal.appendAsServer` appends them with the server's actor.
2. **Reactions.** `journal.react(set, handler)` (*Sketch*) runs after commit in
   journal order, resumes from a stored cursor, keys each run by
   `opId:reaction` (invariant 9), and appends server-only Messages or calls an
   external system.
3. **Server-only state.** A part of the snapshot the journal keeps and never
   sends. Only server-only Messages may change it, so the client's `update`
   never needs it.
4. **Typed rejections.** A durable Message declares its `Refusal` union, as a
   Remote `Mutation` does; `validate` returns one; the replica's rejected
   operation carries it decoded, so a cell shows the reason the same way
   whether Remote or Sync refused the change.
5. **Upcasters.** `Sync.migrations([...])` from Phase 0 item 6, applied
   wherever an operation is decoded (journal load, replica outbox, exchange).
6. **Journal Stories.** Given committed operations, when a principal submits
   one, then it commits or is rejected with this rejection. Runs without a
   server.

Done when: an example records a payment confirmation from a webhook as a
server-only Message, a reaction sends a notice once per commit across a
restart, a rejection reaches the UI typed, and a renamed durable Message
replays from an old journal.

### 6.6 Phase 6: authorities we do not own (M)

Gate: Phase 3 for the graph part; the Remote part can start after Phase 1.

1. **`RemoteServer.describe`**: every query and mutation with JSON Schemas and
   guards, feeding the catalog.
2. **A Domain adapter** (`foldkit-remote-domain`, *name to decide*): a Domain
   View is a Remote source (live, resumes from its cursor); a Domain command is
   a mutation with typed rejections; Domain metadata (`description`, `access`,
   `expose`) feeds the catalog.
3. Decide what happens when an app has both Domain's `Aggregate.predict` and a
   Sync document for one fact: they are two optimistic mechanisms, and only one
   may own the pending state (§7 Q6).

Done when: an example reads and writes a Domain model through Remote with no
hand-written bridge, and its commands appear in the capability catalog.

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

## 8. Phase 0 findings

Empty until Phase 0 runs. Each probe in §6.0 gets a line: the question, the
answer, the file or command that showed it.

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
  becomes.
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
  `Kernel.ts`; issues #2589 and #2590.
- This repository: `packages/bundle/src/lazy.ts`; `packages/durable/src/journal.ts`
  (`reduce`, `validate`, `authorize`, `stamp` run inside the append
  transaction); `packages/sync/src/sync.ts` (a rejection's reason is a string of
  at most 500 characters); `packages/agent-mcp/src` (its own JSON-RPC, not
  Effect's MCP server); `packages/remote-server/src` (uses `effect/rpc`);
  `skills/foldkit-plus` (SKILL.md, bundle.md, surface.md, agent.md, sync.md,
  guard.md, composition.md).
- Not checked: any of this against a running canary. That is Phase 0.
