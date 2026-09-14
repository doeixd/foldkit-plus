# Project improvements

Status: suggestions from one working session that reviewed and fixed
`foldkit-remote`, `foldkit-durable`, and `foldkit-sync`, built
`examples/kitchen-sink`, and revised the docs, with the items since resolved
marked as such. Each item names the concrete friction that prompted it, so it
can be judged rather than taken on faith.

## If you do three things

1. **Fix the runtime seam.** Resolved by `Sync.mount`: once replay was
   guaranteed state-only, applying `update` first and persisting after needed no
   upstream hook (`docs/sync-runtime-binding.md`).
2. **Stop sharing one worktree between agents.** Two sessions committing to the
   same tree caused `git add -A` to sweep edits, and stale `.tsbuild` caches that
   passed alone but failed when rebuilt inside another project's graph.
3. **Split build tsconfig from test tsconfig.** Resolved: every package has a
   `tsconfig.build.json` that excludes `test`, and CI runs `typecheck:force`.

## Tooling and process

- **`tsc -b` compiles referenced projects' tests.** Resolved: each package has
  a `tsconfig.build.json` that excludes `test`, and leaf projects reference it.
- **Incremental builds hide real breakage.** Resolved: CI runs
  `typecheck:force`.
- **One module-resolution story.** Examples resolve `foldkit-*` through `paths`
  to source; `foldkit-remote-drizzle` had to resolve from its built `dist`
  because source compilation broke it. The base config's module resolution
  ignores `exports`, so `dist` resolution is inconsistent. Pick
  `bundler`/`nodenext` and a single strategy, and document it.
- **A `pnpm check` script.** Resolved: it runs `format:check`, `typecheck`,
  `test`, `demo`, and `pack:check`.
- **`node:sqlite` under Vite** cost time twice. A Vite `ssr.external` / `test.server.deps.external`
  entry does not prevent the rewrite; a shared `createRequire` helper (the
  workaround recorded in `AGENTS.md`) is the fix, and it should live in one place
  rather than be copied into every sqlite-using package.

## Cross-package API consistency

- **Encoded typing should be universal.** `foldkit-durable` has
  `Codec<Value, Encoded>`, `foldkit-remote` preserves `Encoded` through
  `ModelRef`/`Selection`, and `foldkit-sync`'s `journalContract` is typed by the
  derived `Operation` and shared shape. What remains is one shared `Codec` (or
  Effect `Schema.Codec`) rather than three idioms for the same wire-side concept.
- **Brands collide by name, not by meaning.** `foldkit-durable`'s `Sequence` and
  `foldkit-sync`'s `Sequence` are both "a document position" but different
  brands, so every cross-package seam needs `sequence(Number(...))` conversions
  (visible in `examples/kitchen-sink` and `examples/sync`). Share the brands, or
  namespace them so the conversion is obviously intentional. Still open.
- **Config vocabulary should match across siblings.** Resolved by #60:
  `forApplication(App).make(config)` across Agent and Sync, `Surface.make` for a
  feature Surface, `Projection`/`MessageSet` as the shared primitives.
- **Owner tokens should be checked everywhere.** Resolved: `Sync` and
  `Agent.exposeSubset` refuse a foreign subset, and `Module.validate` reports a
  foreign contract; each has a test.

## Architecture

- **The runtime seam.** Resolved by `Sync.mount` (see above). What an upstream
  handle would still add is `model()`/`dispatch()` conveniences, not correctness.
- **Sync's replay drops Commands.** Resolved: the derived replay refuses a
  durable Message whose `update` returns a Command or writes outside the shared
  projection, naming the Message and the fields.
- **Durable recovery needs a worker.** Resolved: `journal.recover({ key, from,
  intents, onUnresolved })` runs a document's effect intents after a cursor and
  returns the cursor up to which everything settled.
- **Remote's live adapter is unspecified.** Resolved: `Remote.clientLayer`
  adapts an Effect RPC client for `RemoteRpc` into a `RemoteClient` and rebuilds
  `LiveEvent` from the wire's `LiveChange`; `RemoteServer.live` is the server
  half.
- **One owner per datum deserves teeth.** Resolved: every contract carries a
  `kind` (`sync`, `remote`, `agent`, `mirror`, `surface`) and what it owns or
  observes; `Module.validate` reports two owners of overlapping Model paths, and
  `Module.manifest` prints the owner of each path.
- **Re-evaluate `foldkit-remote-drizzle`.** It is the largest and most fragile
  adapter, with a provisional bar in its own README. After the `EntityBinding`
  migration settles, decide whether it earns a package or is a recipe.

## Docs

- **Index `docs/` and retire superseded guides.** Resolved: `docs/README.md`
  indexes the guides, one per extension, and marks `sync-dx.md` as history.
- **Separate guide from API.** The guides and the package READMEs restate each
  other; a guide should link the READMEs and own the mental model only.
- **Move design notes out of package directories.** Done: `docs/design/` holds
  the agent, mixins, remote-drizzle, and surface design notes, so package
  directories are code + README.
- **A publish matrix.** Resolved: `docs/releases.md` is the matrix, and every
  package publishes from 0.3.0.

## Testing

- **Enforce "every test can fail".** The rule is in `AGENTS.md` but nothing
  checks it. A mutation pass over the pure cores (store, planner, connection,
  the Remote reducer) would find the redundant guards the rule warns about.
- **Make the examples the acceptance suite.** Resolved: CI runs `pnpm demo`
  as its own step, and each example's test pins its transcript.
- **Formalize cross-package type seams.** I added
  `examples/sync/test/journalContract.test-d.ts` to prove
  `Sync.journalContract()` satisfies `makeJournal`'s options. A handful of those
  ("this contract satisfies that consumer") would catch sibling drift at compile
  time.

## TypeScript DX

- **Declaration portability needs a pattern.** Exported values whose inferred
  types reach Foldkit-private schema aliases fail declaration emit in an example
  (`TS2742`); the fix is annotating with a public type, as `examples/sync` does
  with `Sync<Message, Shared>`. Either publish the missing public aliases (a
  nameable projection/definition type) or document the annotation pattern once.
- **Dynamic Model access should be safe by default.** `Optic.at` is a prism, so
  `optic.replace` on an absent key is a silent no-op (already in the trap list).
  A container-aware setter would make dynamic keys hard to get wrong.

## Smaller API notes

- **Remote's registry.** `Remote.make`'s `queries`/`mutations` now build a
  `registry`; use it to compile or validate server sources so its existence is
  load-bearing.
- **Sync subscription count.** `Replica.statusChanges` and `Presence.changes` are
  separate streams; a single `Replica.stream` for status + shared would cut the
  number of subscriptions a UI holds.
- **Agent adapter duplication.** Partly resolved: `Agent.summarize` gives the
  adapters one outcome summary. Tool listing and error mapping are still
  repeated per adapter.
