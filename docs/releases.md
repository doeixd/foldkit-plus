# Releases

What each workspace package is, what version it declares, and whether it ships
to npm. Versions are read from each `packages/*/package.json`.

## Package matrix

The tree declares the versions the `v0.11.0` tag publishes. The version column is the tree's
declaration; `npm view <name> version` says what the registry serves.

| Package | Version | Status | Role |
| --- | --- | --- | --- |
| [`foldkit-cms-drizzle`](../packages/cms-drizzle) | 0.2.0 | Published | The server half of `foldkit-cms`: the entries, drafts and revisions tables, saving and discarding a draft with a conflict rule, publishing through the application's own mutation in a transaction, unpublishing, the worklist, and the audience boundary. |
| [`foldkit-crud`](../packages/crud) | 0.4.0 | Published | Create, read, update and delete screens assembled from a form, a Remote operation, and their Entity: an editor, a list, a detail, and a remover. Published as `foldkit-admin` in 0.7.0, which is deprecated. |
| [`foldkit-agent`](../packages/agent) | 0.4.0 | Published | Protocol-neutral agent contract: projects a Model and Message union into an agent interface. |
| [`foldkit-agent-webmcp`](../packages/agent-webmcp) | 0.4.0 | Published | Browser WebMCP adapter; projects exposed Messages into `document.modelContext`. |
| [`foldkit-agent-mcp`](../packages/agent-mcp) | 0.4.0 | Published | External MCP adapter: a transport-free handler plus stdio and Streamable HTTP. |
| [`foldkit-agent-a2a`](../packages/agent-a2a) | 0.3.0 | Published | A2A adapter: an Agent Card and `message/send` as tasks. |
| [`foldkit-agent-native`](../packages/agent-native) | 0.4.0 | Published | Agent Native adapter: compiles exposed capabilities into framework actions whose `run` only dispatches. |
| [`foldkit-durable`](../packages/durable) | 0.4.0 | Published | Durable, ordered operation log on `effect/unstable/sql`, with snapshots, cursors, compaction, and an effect ledger. |
| [`foldkit-sync`](../packages/sync) | 0.6.0 | Published | Local-first replica: offline outbox, optimistic projection, reconciliation, presence, and a reconnecting WebSocket transport. |
| [`foldkit-metadata`](../packages/metadata) | 0.1.0 | Published | Opaque typed metadata: an interpreter's key owns its entries, their merge, and their summary. |
| [`foldkit-entity`](../packages/entity) | 0.4.0 | Published | Domain structure: an Entity's fields, relations, and derived members as typed values, and Selections of them with an assembled schema. |
| [`foldkit-form`](../packages/form) | 0.2.0 | Published | A form as a Bundle over core field validation, built from an operation's input and the Entity it writes. Headless. |
| [`foldkit-mixins-crud`](../packages/mixins-crud) | 0.4.0 | Published | Draws a `foldkit-crud` list as an accessible table and a detail as a description list, with every element a Mixins Slot. |
| [`foldkit-cms`](../packages/cms) | 0.2.0 | Published | What a CMS adds to a declared domain: roles, content types, drafts beside the row, a lifecycle derived from facts, and the authoring editor's state. |
| [`foldkit-mixins-form`](../packages/mixins-form) | 0.2.0 | Published | Draws a `foldkit-form` form as accessible HTML with every element a Mixins Slot. |
| [`foldkit-surface`](../packages/surface) | 0.5.0 | Published | Observation boundary: pure Model projections, field references, and typed Message subsets. |
| [`foldkit-remote`](../packages/remote) | 0.8.0 | Published | Normalized server state as a Foldkit Submodel: entities, selections, queries, connections, mutations, and live changes. |
| [`foldkit-remote-server`](../packages/remote-server) | 0.8.0 | Published | Server sources and handler compilation for Remote: entities, queries, mutations, live, and selection authorization. |
| [`foldkit-remote-drizzle`](../packages/remote-drizzle) | 0.8.0 | Published | Compiles Remote selections and queries to Drizzle's typed query graph. |
| [`foldkit-mirror`](../packages/mirror) | 0.3.0 | Published | A Model slice mirrored into the URL or a key-value store, restored on load. |
| [`foldkit-bundle`](../packages/bundle) | 0.3.0 | Published | A Submodel packaged once and placed through a Link: routing, init, Subscriptions, resources, and view lifted into the parent. |
| [`foldkit-bundle-surface`](../packages/bundle-surface) | 0.2.0 | Published | Placements as Module contracts that own their Model path. |
| [`foldkit-primitives`](../packages/primitives) | 0.3.0 | Published | Ready-made primitives (media, net, time, state, motion, device, events, observers, dom, interaction) under tree-shakeable subpaths. |
| [`foldkit-react`](../packages/react) | 0.2.0 | Published | React components as islands in a Foldkit view, Foldkit programs inside React through Ports, and Suspense over Model-owned `AsyncData`. |
| [`foldkit-react-codegen`](../packages/react-codegen) | 0.2.0 | Published | Compiles Foldkit view functions to React TSX, refusing with a located diagnostic what it cannot translate faithfully. |
| [`foldkit-mixins`](../packages/mixins) | 0.4.0 | Published | Typed slot contracts and inside-out Style/Behavior attachments for Foldkit views. |
| [`foldkit-mixins-surface`](../packages/mixins-surface) | 0.4.0 | Published | Bridges a Surface projection and Message subset to a `SlotView`. |
| [`foldkit-ssr`](../packages/ssr) | 0.1.0 | Published | Server rendering that hands the Model over instead of rerunning `init`, with resumable pages, forms that work without scripts, and lazy bundles. Early: [its plan](./design/ssr-PLAN.md). |
| [`foldkit-richtext`](../packages/richtext) | 0.1.0 | Published | Pure semantic documents and editing transactions for Foldkit. Early. |
| [`foldkit-richtext-dom`](../packages/richtext-dom) | 0.1.0 | Published | The DOM interpreter for a `foldkit-richtext` editable subtree. Early. |
| [`foldkit-mixins-richtext`](../packages/mixins-richtext) | 0.1.0 | Published | The rich-text editor's chrome, drawn through Mixins slots. Early. |
| [`foldkit-composition`](../packages/composition) | 0.0.0 | Private | What a page is, as data: Blocks in Regions, a stored Document checked against a Catalog. In development: [the page builder design](./design/pagebuilder-DESIGN.md). |
| [`foldkit-mixins-ui`](../packages/mixins-ui) | 0.4.0 | Published | `@foldkit/ui` adapters that publish a component's attribute bundles as Slots. |

One package is `private` while it is built: `foldkit-composition`. A package
that needs to stay off npm sets `"private": true` in its manifest, and
`pnpm publish` skips it.

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
- On a tag it then creates the **GitHub release**, with the notes taken from the
  `CHANGELOG.md` section whose heading matches: `v0.8.0` takes `## 0.8.0`. **A
  tag with no matching heading fails the job** — the version bump and the
  changelog heading drifting apart is the mistake this catches, and empty
  release notes are worse than a job that stopped. A manual dispatch publishes
  but makes no release, since there is no tag to make one for.
- Check the registry (`npm view <name> version`) before relying on what is live;
  the version column is the tree's declaration, not a release guarantee.

## Dependency expectations

Every package except `foldkit-react-codegen` and `foldkit-mixins-richtext`
peer-depends on `effect@^4.0.0-rc.116`. Every package except `foldkit-richtext`,
the server and storage four —
`foldkit-remote-server`, `foldkit-remote-drizzle`, `foldkit-durable`, and
`foldkit-sync` — and `foldkit-react-codegen` also peer-depends on
`foldkit@^0.163.0`. `foldkit-react` additionally peer-depends on
`react@^19.0.0` and `react-dom@^19.0.0`. `foldkit-react-codegen` is a build
tool that reads source text: its only peer is `typescript@^5.7.2`, and it ships
a `foldkit-react-codegen` bin.

Peer edges between workspace packages, declared as `workspace:^` and rewritten on
publish:

- the four agent adapters (`foldkit-agent-webmcp`, `-mcp`, `-a2a`, `-native`) →
  `foldkit-agent`;
- `foldkit-mixins-surface` → `foldkit-mixins`, `foldkit-surface`;
- `foldkit-mixins-ui` → `foldkit-mixins`;
- `foldkit-agent-native` additionally → `@agent-native/core@0.177.1`;
- `foldkit-mixins-ui` additionally → `@foldkit/ui@^0.163.0`;
- `foldkit-richtext-dom` → `foldkit-bundle`.

Regular `dependencies` between workspace packages, declared as `workspace:*`
and rewritten to the exact version on publish: `foldkit-surface` and `foldkit-entity` depend on
`foldkit-metadata`; `foldkit-agent`, `foldkit-mirror`,
`foldkit-remote`, `foldkit-remote-server`, and `foldkit-sync` depend on
`foldkit-surface`; `foldkit-remote` and `foldkit-remote-drizzle` also depend on `foldkit-entity`; `foldkit-form` depends on `foldkit-bundle`, `foldkit-entity`, and `foldkit-metadata`; `foldkit-mixins-form` depends on `foldkit-bundle`, `foldkit-form`, and `foldkit-mixins`; `foldkit-crud` depends on `foldkit-bundle`, `foldkit-entity`, `foldkit-form`, `foldkit-metadata`, `foldkit-remote`, and `foldkit-surface`; `foldkit-cms-drizzle` depends on `foldkit-cms`, `foldkit-entity`, `foldkit-remote`, `foldkit-remote-drizzle`, `foldkit-remote-server`, and `drizzle-orm`; `foldkit-cms` depends on `foldkit-bundle`, `foldkit-crud`, `foldkit-entity`, `foldkit-form`, `foldkit-metadata`, `foldkit-remote`, and `foldkit-surface`; `foldkit-mixins-crud` depends on `foldkit-crud`, `foldkit-form`, `foldkit-mixins`, and `foldkit-remote`; `foldkit-remote-server` and `foldkit-remote-drizzle` depend on
`foldkit-remote`; `foldkit-bundle-surface` depends on `foldkit-bundle` and
`foldkit-surface`; `foldkit-primitives` depends on `foldkit-bundle` (and has `foldkit-mixins` as an optional peer, needed only by its `interaction` subpath); `foldkit-remote-drizzle` additionally depends on
`foldkit-remote-server` and `drizzle-orm@1.0.0-rc.4`.
`foldkit-composition` depends on `foldkit-metadata`, with `foldkit` and `foldkit-richtext` as optional peers for its `/foldkit` and `/richtext` subpaths; `foldkit-ssr` depends on `foldkit-surface`; `foldkit-richtext-dom` depends on
`foldkit-richtext`; `foldkit-mixins-richtext` depends on `foldkit-mixins`,
`foldkit-richtext` and `foldkit-richtext-dom`.
`foldkit-durable` depends on `@effect/sql-sqlite-node@4.0.0-rc.116` and requires
Node 22 (`engines.node`).
