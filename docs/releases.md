# Releases

What each workspace package is, what version it declares, and whether it ships
to npm. Versions are read from each `packages/*/package.json`.

## Package matrix

The tree declares the versions the next tag publishes (`v0.35.0` is the last). The version column is the tree's
declaration; `npm view <name> version` says what the registry serves.

| Package | Version | Status | Role |
| --- | --- | --- | --- |
| [`foldkit-plus`](../packages/plus) | 0.18.0 | Published | Every package below in one install, re-exported by subpath (`foldkit-plus/remote`), and `npx foldkit-plus setup`, which tells a coding agent how to start. Adapters with a library of their own are optional peers. |
| [`foldkit-cms-drizzle`](../packages/cms-drizzle) | 0.7.0 | Published | The server half of `foldkit-cms`: the entries, drafts and revisions tables, saving and discarding a draft with a conflict rule, publishing through the application's own mutation in a transaction, unpublishing, the worklist, and the audience boundary. |
| [`foldkit-crud`](../packages/crud) | 0.12.0 | Published | Create, read, update and delete screens assembled from a form, a Remote operation, and their Entity: an editor, a list, a detail, and a remover. Published as `foldkit-admin` in 0.7.0, which is deprecated. |
| [`foldkit-agent`](../packages/agent) | 0.9.0 | Published | Protocol-neutral agent contract: projects a Model and Message union into an agent interface. |
| [`foldkit-agent-webmcp`](../packages/agent-webmcp) | 0.8.0 | Published | Browser WebMCP adapter; projects exposed Messages into `document.modelContext`. |
| [`foldkit-agent-mcp`](../packages/agent-mcp) | 0.8.0 | Published | External MCP adapter: a transport-free handler plus stdio and Streamable HTTP. |
| [`foldkit-agent-a2a`](../packages/agent-a2a) | 0.7.0 | Published | A2A adapter: an Agent Card and `message/send` as tasks. |
| [`foldkit-agent-native`](../packages/agent-native) | 0.7.0 | Published | Agent Native adapter: compiles exposed capabilities into framework actions whose `run` only dispatches. |
| [`foldkit-durable`](../packages/durable) | 0.10.0 | Published | Durable, ordered operation log on `effect/sql`, with snapshots, cursors, compaction, and an effect ledger. |
| [`foldkit-sync`](../packages/sync) | 0.13.0 | Published | Local-first replica: offline outbox, optimistic projection, reconciliation, presence, and a reconnecting WebSocket or `MessagePort` transport; with `/entity` and `/journal`, offline edits to rows a server owns. |
| [`foldkit-metadata`](../packages/metadata) | 0.1.0 | Published | Opaque typed metadata: an interpreter's key owns its entries, their merge, and their summary. |
| [`foldkit-entity`](../packages/entity) | 0.14.0 | Published | Domain structure: an Entity's fields, relations, and derived members as typed values, Selections of them with an assembled schema, writes declared as data (`Write`), and invariants over a row and over a change (`Entity.invariant`). |
| [`foldkit-form`](../packages/form) | 0.9.0 | Published | A form as a Bundle over core field validation, built from an operation's input and the Entity it writes. Headless. |
| [`foldkit-mixins-crud`](../packages/mixins-crud) | 0.10.0 | Published | Draws a `foldkit-crud` list as an accessible table and a detail as a description list, with every element a Mixins Slot. |
| [`foldkit-data-grid`](../packages/data-grid) | 0.4.0 | Published | An interactive grid's state and geometry: columns, focus, selection, column state, editing, the clipboard, fill and two-axis virtualization over rows the application owns. Experimental. |
| [`foldkit-mixins-data-grid`](../packages/mixins-data-grid) | 0.3.0 | Published | Draws a `foldkit-data-grid` grid as an accessible, virtualized WAI-ARIA grid through Mixins slots. Experimental. |
| [`foldkit-cms`](../packages/cms) | 0.9.0 | Published | What a CMS adds to a declared domain: roles, content types, drafts beside the row, a lifecycle derived from facts, and the authoring editor's state. |
| [`foldkit-mixins-form`](../packages/mixins-form) | 0.11.0 | Published | Draws a `foldkit-form` form as accessible HTML with every element a Mixins Slot. |
| [`foldkit-form-recipes`](../packages/form-recipes) | 0.2.0 | Published | Field recipes for `foldkit-form`: dates, times, amounts (money, decimal, percent) and text-shaped keys (email, web address, telephone, password, slug), each a control, a display and a plain renderer, and an image uploaded where it is chosen. |
| [`foldkit-surface`](../packages/surface) | 0.11.0 | Published | Observation boundary: pure Model projections, field references, and typed Message subsets. |
| [`foldkit-remote`](../packages/remote) | 0.22.0 | Published | Normalized server state as a Foldkit Submodel: entities, selections, queries, connections, mutations, and live changes. |
| [`foldkit-remote-server`](../packages/remote-server) | 0.19.0 | Published | Server sources and handler compilation for Remote: entities, queries, mutations, live, and selection authorization. |
| [`foldkit-remote-drizzle`](../packages/remote-drizzle) | 0.16.0 | Published | Compiles Remote selections and queries to Drizzle's typed query graph, and lands declared writes in one statement that checks their revision, precondition and the Entity's invariants, with an optional ledger for retries. |
| [`foldkit-mirror`](../packages/mirror) | 0.7.0 | Published | A Model slice mirrored into the URL or a key-value store, restored on load. |
| [`foldkit-bundle`](../packages/bundle) | 0.9.0 | Published | A Submodel packaged once and placed through a Link: routing, init, Subscriptions, resources, and view lifted into the parent. |
| [`foldkit-bundle-surface`](../packages/bundle-surface) | 0.5.0 | Published | Placements as Module contracts that own their Model path. |
| [`foldkit-primitives`](../packages/primitives) | 0.16.0 | Published | Ready-made primitives (media, net, time, state, motion, device, events, observers, dom, interaction) under tree-shakeable subpaths. |
| [`foldkit-react`](../packages/react) | 0.5.0 | Published | React components as islands in a Foldkit view, Foldkit programs inside React through Ports, and Suspense over Model-owned `AsyncData`. |
| [`foldkit-react-codegen`](../packages/react-codegen) | 0.3.0 | Published | Compiles Foldkit view functions to React TSX, refusing with a located diagnostic what it cannot translate faithfully. |
| [`foldkit-mixins`](../packages/mixins) | 0.21.0 | Published | Typed slot contracts and inside-out Style/Behavior attachments for Foldkit views. |
| [`foldkit-mixins-surface`](../packages/mixins-surface) | 0.7.0 | Published | Bridges a Surface projection and Message subset to a `SlotView`. |
| [`foldkit-ssr`](../packages/ssr) | 0.9.0 | Published | Server rendering that hands the Model over instead of rerunning `init`, with resumable pages, forms that work without scripts, and lazy bundles. Early: [its plan](./design/ssr-PLAN.md). |
| [`foldkit-richtext`](../packages/richtext) | 0.6.0 | Published | Pure semantic documents and editing transactions for Foldkit. Early. |
| [`foldkit-richtext-dom`](../packages/richtext-dom) | 0.7.0 | Published | The DOM interpreter for a `foldkit-richtext` editable subtree. Early. |
| [`foldkit-mixins-richtext`](../packages/mixins-richtext) | 0.6.0 | Published | The rich-text editor's chrome, drawn through Mixins slots. Early. |
| [`foldkit-richtext-code`](../packages/richtext-code) | 0.3.0 | Published | Total grammars as tokenizers over the shared `syntax-*` kinds, for code decorations. |
| [`foldkit-richtext-code-shiki`](../packages/richtext-code-shiki) | 0.3.0 | Published | Shiki grammars as tokenizers over the same kinds; the application owns the highlighter. |
| [`foldkit-richtext-markdown`](../packages/richtext-markdown) | 0.4.0 | Published | Markdown round-trips for the editor document: task items, tight lists. |
| [`foldkit-builder`](../packages/builder) | 0.4.0 | Published | The page builder's state: a Bundle that edits a composition Document by Operations, with selection and undo, as one form key's control. Experimental: [the page builder design](./design/pagebuilder-DESIGN.md). |
| [`foldkit-mixins-builder`](../packages/mixins-builder) | 0.4.0 | Published | The page Builder drawn as accessible HTML through Mixins slots: palette, layers tree, inspector, and the page in edit mode. Experimental: [the page builder design](./design/pagebuilder-DESIGN.md). |
| [`foldkit-composition`](../packages/composition) | 0.4.0 | Published | What a page is, as data: Blocks in Regions, a stored Document checked against a Catalog. Experimental: [the page builder design](./design/pagebuilder-DESIGN.md). |
| [`foldkit-mixins-ui`](../packages/mixins-ui) | 0.22.0 | Published | `@foldkit/ui` adapters that publish a component's attribute bundles as Slots. |
| [`foldkit-guard`](../packages/guard) | 0.7.0 | Published | Who may do what, declared once on the domain: principal guards implemented on the server, row guards as query expressions, enforced on reads, writes, Sync edits, agents and uploads through its `/server`, `/drizzle`, `/sync`, `/agent` and `/media` subpaths. |
| [`foldkit-site`](../packages/site) | 0.5.0 | Published | A routed application's topology as data: stable route nodes, their hierarchy, typed targets and per-node metadata, compiled to Foldkit's Router, Surface and Bundle primitives. Early. |
| [`foldkit-auth`](../packages/auth) | 0.2.0 | Published | Yielded Auth in Foldkit Plus: a verified session cookie as the principal `serveFetch`, a Sync document host and SSR's posted forms answer as (`foldkit-auth/server`), and the client's subject header (`believing`). Early. |
| [`foldkit-media`](../packages/media) | 0.4.0 | Published | Responsive images as URLs to write: an image's facts, a provider and a layout give every attribute of its markup, a server or a build makes and keeps each variant, and icons are data a build reads from Iconify sets or SVG files. Early: [its design](./design/media-DESIGN.md). |

No package is `private` now. A package that needs to stay off npm sets `"private": true`
in its manifest, and `pnpm publish` skips it.

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
- **A failed publish resumes; nothing needs a new version.** If the publish step
  stops partway (2026-10-22: `TLOG_CREATE_ENTRY_ERROR (409) an equivalent entry
  already exists`, npm's provenance log rejecting an attestation its own retry
  had already written for `foldkit-remote@0.18.1`), re-run the failed job with
  `gh run rerun <run-id> --failed`. pnpm skips the versions that did publish and
  continues from the one that did not, and the GitHub-release step then runs.
  Do not bump: a new version would need every dependent republished too.
- **A publish's registry visibility lags the job by minutes.** After the run
  went green, 15 of the 37 versions were still absent from
  `registry.npmjs.org` and the count fell over the next ten minutes. Judge a
  release from `gh run view` first, and only then from
  `npm view <name> version`.

## Dependency expectations

Every package except `foldkit-metadata` and `foldkit-react-codegen`
peer-depends on `effect@^4.1.0`, the Effect Foldkit 0.170 takes (`~4.1.0`);
`foldkit-auth` also on `@yielded/auth@0.1.0-beta.47` (exact), whose own floor
is the same. Every package also peer-depends on `foldkit@^0.170.0` except the fourteen that never draw or run
a Foldkit runtime: `foldkit-entity`, `foldkit-metadata` and `foldkit-media`
(whose `Icon.draw` takes any builder of its shape), the server and storage
packages (`foldkit-remote-server`, `foldkit-remote-drizzle`,
`foldkit-durable`, `foldkit-cms-drizzle`, `foldkit-guard`, `foldkit-auth`),
the rich-text model and its grammars and Markdown (`foldkit-richtext`,
`foldkit-richtext-code`, `foldkit-richtext-code-shiki`,
`foldkit-richtext-markdown`), and `foldkit-react-codegen`.
`foldkit-react-codegen` is a build tool that reads source text with
TypeScript's compiler API: its only peer is `typescript@>=5.7.2 <7`
(TypeScript 7 has no such API), and it ships a `foldkit-react-codegen` bin.

Regular `dependencies` between workspace packages, declared as `workspace:*`
and rewritten to the exact version on publish:

- `foldkit-surface` and `foldkit-entity` → `foldkit-metadata`;
- `foldkit-agent`, `foldkit-agent-mcp`, `foldkit-mirror`, `foldkit-mixins`,
  `foldkit-media`, `foldkit-ssr` and `foldkit-sync` → `foldkit-surface`;
- `foldkit-remote` → `foldkit-entity`, `foldkit-metadata` and
  `foldkit-surface`;
- `foldkit-remote-server` → `foldkit-entity` and `foldkit-remote`;
- `foldkit-remote-drizzle` → `foldkit-entity`, `foldkit-remote` and
  `foldkit-remote-server`;
- `foldkit-guard` → `foldkit-entity` and `foldkit-metadata`;
- `foldkit-cms-drizzle` → `foldkit-cms`, `foldkit-entity`, `foldkit-guard`,
  `foldkit-remote`, `foldkit-remote-drizzle` and `foldkit-remote-server`;
- `foldkit-bundle-surface` → `foldkit-bundle` and `foldkit-surface`;
- `foldkit-primitives` and `foldkit-data-grid` → `foldkit-bundle`;
- `foldkit-form` → `foldkit-bundle`, `foldkit-entity` and `foldkit-metadata`;
- `foldkit-mixins-form` → `foldkit-bundle`, `foldkit-form` and
  `foldkit-mixins`;
- `foldkit-form-recipes` → `foldkit-bundle`, `foldkit-crud` and
  `foldkit-form`;
- `foldkit-crud` → `foldkit-bundle`, `foldkit-entity`, `foldkit-form`,
  `foldkit-metadata`, `foldkit-remote` and `foldkit-surface`;
- `foldkit-mixins-crud` → `foldkit-crud`, `foldkit-form`, `foldkit-mixins` and
  `foldkit-remote`;
- `foldkit-mixins-data-grid` → `foldkit-data-grid`, `foldkit-mixins` and
  `foldkit-primitives`;
- `foldkit-cms` → `foldkit-bundle`, `foldkit-crud`, `foldkit-entity`,
  `foldkit-form`, `foldkit-metadata`, `foldkit-mixins`, `foldkit-remote` and
  `foldkit-surface`;
- `foldkit-composition` → `foldkit-metadata`;
- `foldkit-builder` → `foldkit-bundle`, `foldkit-composition`,
  `foldkit-entity`, `foldkit-form`, `foldkit-metadata`, `foldkit-mixins` and
  `foldkit-primitives`;
- `foldkit-mixins-builder` → `foldkit-builder`, `foldkit-composition`,
  `foldkit-entity`, `foldkit-form`, `foldkit-mixins`, `foldkit-mixins-form`
  and `foldkit-primitives`;
- `foldkit-richtext` → `foldkit-media`; `foldkit-richtext-dom`,
  `foldkit-richtext-code`, `foldkit-richtext-code-shiki` and
  `foldkit-richtext-markdown` → `foldkit-richtext`;
- `foldkit-mixins-richtext` → `foldkit-media`, `foldkit-mixins`,
  `foldkit-primitives`, `foldkit-richtext`, `foldkit-richtext-dom` and
  `foldkit-richtext-markdown`;
- `foldkit-site` → `foldkit-bundle`, `foldkit-ssr` and `foldkit-surface`;
- `foldkit-plus` → every package except the eight it takes as optional peers
  (below).

Peer edges between workspace packages, declared as `workspace:^` (or
`workspace:*`) and rewritten on publish:

- the four agent adapters (`foldkit-agent-webmcp`, `-mcp`, `-a2a`,
  `-native`) → `foldkit-agent`;
- `foldkit-auth` → `foldkit-remote`;
- `foldkit-mixins-surface` → `foldkit-mixins` and `foldkit-surface`;
- `foldkit-mixins-ui` → `foldkit-mixins`, `foldkit-primitives` and
  `foldkit-media`;
- `foldkit-richtext-dom` → `foldkit-bundle`.

Optional peers, needed only by the subpath or feature that names them:

- `foldkit-primitives` → `foldkit-mixins` (its `interaction` subpath);
- `foldkit-composition` → `foldkit`, `foldkit-richtext`, `foldkit-mixins`, and
  `foldkit-remote` with `foldkit-surface` (its `/foldkit`, `/richtext`,
  `/appearance`, `/remote` and `/surface` subpaths);
- `foldkit-guard` → `foldkit-remote`, `foldkit-remote-server`,
  `foldkit-remote-drizzle`, `foldkit-sync`, `foldkit-media` and
  `drizzle-orm@1.0.0-rc.5`, each for the subpath that enforces guards there;
- `foldkit-sync` → `foldkit-durable` and `foldkit-remote` (its `/journal`,
  `/do` and `/remote` subpaths);
- `foldkit-data-grid` → `foldkit-crud` and `foldkit-remote` (its `/crud` subpath);
- `foldkit-richtext-dom` → `foldkit-form` (its `/input` subpath);
- `foldkit-mixins-form` → `foldkit-mixins-ui` (its `/ui` and `/recipes` subpaths);
- `foldkit-form-recipes` → `foldkit-media`, `foldkit-mixins`,
  `foldkit-mixins-form`, `foldkit-mixins-ui` and `@foldkit/ui@^0.170.0` (its
  `/ui` and `/image` subpaths);
- `foldkit-media` → `sharp@>=0.34.0` and `unpic@^4.0.0` (its `/sharp` and
  `/unpic` subpaths);
- `foldkit-plus` → `foldkit-agent-native`, `foldkit-auth`,
  `foldkit-cms-drizzle`, `foldkit-mixins-ui`, `foldkit-react`,
  `foldkit-react-codegen`, `foldkit-remote-drizzle` and
  `foldkit-richtext-code-shiki`, which bring a library of their own, and
  `esbuild`, `playwright` and `wrangler` for its `testing/*` subpaths.

Libraries outside the workspace: `foldkit-remote-drizzle` and
`foldkit-cms-drizzle` peer-depend on `drizzle-orm@1.0.0-rc.5`, so the
application's Drizzle is the one their tables type-check against;
`foldkit-react` on `react@^19.0.0` and `react-dom@^19.0.0`;
`foldkit-agent-native` on `@agent-native/core@0.214.0`; `foldkit-mixins-ui`
on `@foldkit/ui@^0.170.0`; `foldkit-richtext-code-shiki` on `shiki@^4.4.3`.
`foldkit-durable` depends on `@effect/sql-sqlite-node@^4.1.0`; its Node entry
requires Node 22 for `node:sqlite`, which its `engines.node` (`>=22`) states.
