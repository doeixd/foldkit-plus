# foldkit-plus

[![CI](https://github.com/doeixd/foldkit-plus/actions/workflows/ci.yml/badge.svg)](https://github.com/doeixd/foldkit-plus/actions/workflows/ci.yml)

> A home for Foldkit ecosystem packages, built on Foldkit's
> Model-·-Message-·-`update` architecture and Effect.

Foldkit keeps an application's behavior in one place: a Schema-typed **Model**, a
**Message** union, and an **`update`** function. Everything here extends that one
state machine rather than introducing a second place for application behavior to
live — an observation boundary projected from the same Model, an agent contract,
server-derived remote state as a Submodel, a durable log that replicates the
same Messages, and a Model slice mirrored into the URL or a key-value store.

## Packages

| Package | What it is |
| --- | --- |
| [`foldkit-surface`](./packages/surface) | The observation boundary: pure Model projections, reference-based field selection, and typed Message subsets. |
| [`foldkit-remote`](./packages/remote) | Normalized server state as a Foldkit Submodel: entities, selections, queries, connections, mutations, and live changes. |
| [`foldkit-remote-server`](./packages/remote-server) | Entity, query, mutation, and live sources, selection authorization, and `RemoteRpc` handler compilation. |
| [`foldkit-remote-drizzle`](./packages/remote-drizzle) | Compiles Remote selections and queries to Drizzle's typed query graph. |
| [`foldkit-agent`](./packages/agent) | The protocol-neutral agent contract: project a Model and Message union into a deliberate agent interface. [Design rationale](./docs/design/agent-DESIGN.md). |
| [`foldkit-agent-webmcp`](./packages/agent-webmcp) | The browser adapter, projecting exposed Messages into `document.modelContext`. |
| [`foldkit-agent-mcp`](./packages/agent-mcp) | The external MCP adapter: a transport-free protocol handler, plus stdio and Streamable HTTP. |
| [`foldkit-agent-a2a`](./packages/agent-a2a) | The A2A adapter: an Agent Card and `message/send` as tasks. |
| [`foldkit-agent-native`](./packages/agent-native) | The Agent Native adapter: compiles exposed capabilities into framework actions whose `run` only dispatches. |
| [`foldkit-durable`](./packages/durable) | A durable, ordered operation log on `effect/unstable/sql`, with migrations, compaction, change streams, a durable effect ledger, and metrics. |
| [`foldkit-sync`](./packages/sync) | A local-first replica: offline outbox, optimistic projection, reconciliation, presence, and a reconnecting WebSocket transport. |
| [`foldkit-mirror`](./packages/mirror) | A Model slice kept in the URL query string or Effect's `KeyValueStore`: filter, sort, and page in the URL; preferences and drafts in storage. [Design](./docs/design/MIRROR.md). |
| [`foldkit-mixins`](./packages/mixins) | Typed slot contracts and inside-out Style/Behavior attachments for Foldkit views. |
| [`foldkit-mixins-surface`](./packages/mixins-surface) | Bridges a Surface's projected Model and Message subset to a `SlotView`. |
| [`foldkit-mixins-ui`](./packages/mixins-ui) | `@foldkit/ui` adapters that publish a component's attribute bundles as Slots. |

Every package is on npm; the [release matrix](./docs/releases.md) lists each
one's version.

## Install

```bash
pnpm add foldkit-agent                       # the contract
pnpm add foldkit-agent foldkit-agent-webmcp  # browser (WebMCP)
pnpm add foldkit-agent foldkit-agent-mcp     # external MCP
pnpm add foldkit-agent foldkit-agent-a2a     # A2A
pnpm add foldkit-agent foldkit-agent-native  # Agent Native
pnpm add foldkit-durable foldkit-sync        # offline, multiplayer, remote-agent state
pnpm add foldkit-surface foldkit-remote      # projections; normalized server state
pnpm add foldkit-remote-server foldkit-remote-drizzle  # the server side of Remote
pnpm add foldkit-mirror                      # a Model slice in the URL or a key-value store
pnpm add foldkit-mixins foldkit-mixins-surface foldkit-mixins-ui  # slot contracts for views
```

`foldkit` and `effect` are peer dependencies. Foldkit `0.158.2` peer-depends on
`effect@4.0.0-rc.112`, so these packages target Effect 4. `foldkit-durable`
requires Node 22 for `node:sqlite`.

## How they fit together

The packages fall into one observation boundary and four extensions to the same
state machine:

- **Observation.** `foldkit-surface` projects the Model into a pure `Projection`
  and selects Message subsets. Remote, Sync, and Agent consume this instead of
  declaring their own Model and Message shapes.
- **Server-derived state.** `foldkit-remote` keeps a normalized cache of server
  data as a Foldkit Submodel; the application's `update` reconciles reads,
  mutations, and live changes. `foldkit-remote-server` and
  `foldkit-remote-drizzle` are its server half.
- **Replicated state.** `foldkit-durable` orders and persists *the same Messages*
  on a server, and `foldkit-sync` keeps an offline-first replica on each client,
  so devices converge.
- **Agents.** `foldkit-agent` projects *what an agent may see and do* from the
  Model and Message union; the adapters turn that contract into tools.
- **Mirrored state.** `foldkit-mirror` keeps a slice of the Model in step with
  the URL or a key-value store and reads it back on navigation or cold load. The
  Model stays the only truth; the store is last-write-wins with no log, which is
  what separates it from Sync.

```mermaid
flowchart TB
  app["Foldkit application<br/>Model · Message · update · Commands"]
  surface["foldkit-surface<br/>Projection · field refs · subsets"]
  agent["foldkit-agent<br/>webmcp · mcp · a2a · native"]
  remote["foldkit-remote<br/>normalized server cache"]
  server["foldkit-remote-server<br/>foldkit-remote-drizzle"]
  durable["foldkit-durable<br/>ordered log"]
  sync["foldkit-sync<br/>local replica"]
  mirror["foldkit-mirror<br/>URL · KeyValueStore"]
  app -- "observe / project" --> surface
  surface --> agent
  surface --> remote
  surface --> durable
  surface --> mirror
  remote --> server
  durable --> sync
```

None reimplements `update`: the agent layer projects it, Remote reduces its facts
through the application's `update`, the replication layer replays the same
Messages through a shared reducer, and a mirror's `reduce` is a pure Model
function the application calls from its own `update`. Separately, `foldkit-mixins` is a view-layer
axis — it composes styles and behaviors over plain Foldkit views, and
`foldkit-mixins-surface` over a Surface projection, without owning a second
runtime.

## Guides

- [Agents](./docs/agents.md) — `foldkit-agent` and its adapters: what an agent
  may see and do, and why a capability is a Message.
- [Server-derived state](./docs/remote.md) — the `foldkit-surface` boundary and
  the `foldkit-remote` Submodel.
- [Replicated state](./docs/replication.md) — what `foldkit-durable` and
  `foldkit-sync` do, and when to reach for them.
- [Mirrored state](./docs/mirror.md) — a Model slice in the URL or a key-value
  store, and why a mirror is not an owner.
- [Inside-out view composition](./docs/mixins.md) — slot contracts, Style and
  Behavior, and the `@foldkit/ui` adapters.
- [Runtime binding](./docs/sync-runtime-binding.md) — how `Sync.mount` runs an
  application over a replica, and routes the URL.
- [Releases](./docs/releases.md) — the version and publish matrix for every
  workspace package.
- [Revision plan](./docs/design/REVISION_PLAN.md) — the full design and phase status.
- [All guides](./docs/README.md), including the [improvement suggestions](./docs/improvements.md).
- Each package README documents its API; [`examples/`](./examples) has runnable
  traces, and `pnpm demo` runs them. Start with the
  [todo app](./examples/todo-app), which wires every package into one
  application and explains each choice.

## Repository layout

```text
packages/surface          foldkit-surface
packages/remote           foldkit-remote
packages/remote-server    foldkit-remote-server
packages/remote-drizzle   foldkit-remote-drizzle
packages/agent            foldkit-agent
packages/agent-webmcp     foldkit-agent-webmcp
packages/agent-mcp        foldkit-agent-mcp
packages/agent-a2a        foldkit-agent-a2a
packages/agent-native     foldkit-agent-native
packages/durable          foldkit-durable
packages/sync             foldkit-sync
packages/mirror           foldkit-mirror
packages/mixins           foldkit-mixins
packages/mixins-surface   foldkit-mixins-surface
packages/mixins-ui        foldkit-mixins-ui
examples/todo-app         the todo app: every package in one local-first, agent-ready application
examples/kitchen-sink     every package wired in-process, as a deterministic transcript
examples/todo             foldkit-agent, driven by a human and by an agent over WebMCP
examples/sync             durable messages and ordered replication
examples/remote           normalized server state, end to end
examples/mixins           view mixins, end to end
```

## Development

```bash
pnpm install
pnpm test        # vitest
pnpm typecheck   # tsc -b
pnpm build       # tsdown
pnpm demo        # run the worked examples
pnpm format      # prettier
pnpm pack:check  # verify every package packs
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the checks before a commit, and
[AGENTS.md](./AGENTS.md) for the working agreements.

## Releasing

Every package under `packages/*` publishes; the
[release matrix](./docs/releases.md) lists each one's version. `pnpm release`
builds, then publishes every non-`private` package, skipping versions the
registry already has. Publishing must use **pnpm**, not npm: the packages declare
each other as `workspace:` dependencies, which pnpm rewrites to real ranges when
it packs.

Bump the versions, add a [CHANGELOG.md](./CHANGELOG.md) entry, run the four
checks, then push a `vX.Y.Z` tag. The
[release workflow](./.github/workflows/release.yml) re-runs the checks. It
publishes with provenance when the `NPM_TOKEN` repository secret is set, and
otherwise runs the checks and skips publishing.

## License

MIT. These are community packages, published unscoped as Foldkit itself is. They
are not affiliated with or endorsed by the Foldkit maintainers, and the names are
theirs for the asking.

## References

- Foldkit — <https://foldkit.dev/> · <https://github.com/foldkit/foldkit>
- WebMCP — <https://github.com/webmachinelearning/webmcp>
- Agent Native — <https://github.com/BuilderIO/agent-native>
