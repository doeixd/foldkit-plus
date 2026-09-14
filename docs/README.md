# Guides

One guide per extension of the Foldkit state machine, and the notes around them.

- [Agents](./agents.md) — `foldkit-agent` and its WebMCP, MCP, A2A, and Agent
  Native adapters: what an agent may see and do, and why a capability is a
  Message.
- [Server-derived state](./remote.md) — the `foldkit-surface` boundary and the
  `foldkit-remote` Submodel, with its server half.
- [Replicated state](./replication.md) — `foldkit-durable` and `foldkit-sync`, and
  when to reach for them.
- [Mirrored state](./mirror.md) — `foldkit-mirror`: a Model slice kept in the URL
  or a key-value store, and why a mirror is not an owner.
- [Inside-out view composition](./mixins.md) — `foldkit-mixins` slot contracts,
  Style and Behavior, and the `@foldkit/ui` adapters.
- [Runtime binding](./sync-runtime-binding.md) — how `Sync.mount` runs a
  Foldkit application over a replica with one reducer, routes the URL, and why
  no upstream hook is needed.

Around them:

- [Releases](./releases.md) — every workspace package's version, publish status,
  and dependency expectations.
- [Benchmarks](./benchmarks.md) — `foldkit-sync`'s local costs and one
  `foldkit-durable` append/storage reading.
- [Improvements](./improvements.md) — suggestions for the project and design,
  with the resolved ones marked.
- [Design docs](./design/) — the revision plan, the per-package design notes
  (agent, mixins, mirror, remote-drizzle, surface), and brainstorms.
- [Revision plan](./design/REVISION_PLAN.md) — the full design and phase status.

[`sync-dx.md`](./sync-dx.md) is superseded by the revision plan and kept only for
history.

Each package's API lives in its own README under [`packages/`](../packages);
[`examples/`](../examples) has runnable traces, and
[`examples/todo-app`](../examples/todo-app) wires every package into one
application.
