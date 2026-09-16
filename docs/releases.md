# Releases

What each workspace package is, what version it declares, and whether it ships
to npm. Versions are read from each `packages/*/package.json`.

## Package matrix

The tree declares the versions the `v0.5.0` tag publishes; `foldkit-durable`
stays at the version `v0.4.1` published. The version column is the tree's
declaration; `npm view <name> version` says what the registry serves.

| Package | Version | Status | Role |
| --- | --- | --- | --- |
| [`foldkit-agent`](../packages/agent) | 0.3.0 | Published | Protocol-neutral agent contract: projects a Model and Message union into an agent interface. |
| [`foldkit-agent-webmcp`](../packages/agent-webmcp) | 0.3.0 | Published | Browser WebMCP adapter; projects exposed Messages into `document.modelContext`. |
| [`foldkit-agent-mcp`](../packages/agent-mcp) | 0.3.0 | Published | External MCP adapter: a transport-free handler plus stdio and Streamable HTTP. |
| [`foldkit-agent-a2a`](../packages/agent-a2a) | 0.3.0 | Published | A2A adapter: an Agent Card and `message/send` as tasks. |
| [`foldkit-agent-native`](../packages/agent-native) | 0.3.0 | Published | Agent Native adapter: compiles exposed capabilities into framework actions whose `run` only dispatches. |
| [`foldkit-durable`](../packages/durable) | 0.3.0 | Published | Durable, ordered operation log on `effect/unstable/sql`, with snapshots, cursors, compaction, and an effect ledger. |
| [`foldkit-sync`](../packages/sync) | 0.5.0 | Published | Local-first replica: offline outbox, optimistic projection, reconciliation, presence, and a reconnecting WebSocket transport. |
| [`foldkit-surface`](../packages/surface) | 0.2.0 | Published | Observation boundary: pure Model projections, field references, and typed Message subsets. |
| [`foldkit-remote`](../packages/remote) | 0.3.0 | Published | Normalized server state as a Foldkit Submodel: entities, selections, queries, connections, mutations, and live changes. |
| [`foldkit-remote-server`](../packages/remote-server) | 0.3.0 | Published | Server sources and handler compilation for Remote: entities, queries, mutations, live, and selection authorization. |
| [`foldkit-remote-drizzle`](../packages/remote-drizzle) | 0.3.0 | Published | Compiles Remote selections and queries to Drizzle's typed query graph. |
| [`foldkit-mirror`](../packages/mirror) | 0.2.0 | Published | A Model slice mirrored into the URL or a key-value store, restored on load. |
| [`foldkit-bundle`](../packages/bundle) | 0.1.0 | Not yet published | A Submodel packaged once and placed through a Link: routing, init, Subscriptions, resources, and view lifted into the parent. |
| [`foldkit-bundle-surface`](../packages/bundle-surface) | 0.1.0 | Not yet published | Placements as Module contracts that own their Model path. |
| [`foldkit-mixins`](../packages/mixins) | 0.3.0 | Published | Typed slot contracts and inside-out Style/Behavior attachments for Foldkit views. |
| [`foldkit-mixins-surface`](../packages/mixins-surface) | 0.3.0 | Published | Bridges a Surface projection and Message subset to a `SlotView`. |
| [`foldkit-mixins-ui`](../packages/mixins-ui) | 0.3.0 | Published | `@foldkit/ui` adapters that publish a component's attribute bundles as Slots. |

No package is `private`. A package that still needs to stay off npm sets
`"private": true` in its manifest, and `pnpm publish` skips it.

## Publish process

- `pnpm release` runs `pnpm build`, then
  `pnpm -r --filter "./packages/*" publish --access public --no-git-checks`.
  pnpm skips a package whose declared version is already in the registry, so a
  release that bumps only some packages republishes only those.
- Publishing must use **pnpm**, not npm. The packages declare each other as
  `workspace:` dependencies, and pnpm rewrites those to real ranges (`^0.2.0`
  for `workspace:^`, `0.1.0` for `workspace:*`) as it packs; `npm publish` would
  ship the `workspace:` protocol verbatim.
- The [release workflow](../.github/workflows/release.yml) runs on a `v*` tag or
  a manual dispatch, re-runs `format:check`, `typecheck`, and `test`, and
  publishes with provenance only when the `NPM_TOKEN` secret is set. Without the
  secret it runs the checks and skips the publish step.
- Check the registry (`npm view <name> version`) before relying on what is live;
  the version column is the tree's declaration, not a release guarantee.

## Dependency expectations

Every package peer-depends on `effect@^4.0.0-rc.112`. Every package except the
server and storage four — `foldkit-remote-server`, `foldkit-remote-drizzle`,
`foldkit-durable`, and `foldkit-sync` — also peer-depends on `foldkit@^0.158.2`.

Peer edges between workspace packages, declared as `workspace:^` and rewritten on
publish:

- the four agent adapters (`foldkit-agent-webmcp`, `-mcp`, `-a2a`, `-native`) →
  `foldkit-agent`;
- `foldkit-mixins-surface` → `foldkit-mixins`, `foldkit-surface`;
- `foldkit-mixins-ui` → `foldkit-mixins`;
- `foldkit-agent-native` additionally → `@agent-native/core@0.177.1`;
- `foldkit-mixins-ui` additionally → `@foldkit/ui@^0.158.2`.

Regular `dependencies` between workspace packages, declared as `workspace:*`
and rewritten to the exact version on publish: `foldkit-agent`, `foldkit-mirror`,
`foldkit-remote`, `foldkit-remote-server`, and `foldkit-sync` depend on
`foldkit-surface`; `foldkit-remote-server` and `foldkit-remote-drizzle` depend on
`foldkit-remote`; `foldkit-bundle-surface` depends on `foldkit-bundle` and
`foldkit-surface`; `foldkit-remote-drizzle` additionally depends on
`foldkit-remote-server` and `drizzle-orm@1.0.0-rc.4`.
`foldkit-durable` depends on `@effect/sql-sqlite-node@4.0.0-rc.112` and requires
Node 22 (`engines.node`).
