# Traps: Vitest, pnpm mutate and local dev servers

Read before running Vitest or pnpm mutate, adding a Vitest config or alias, or driving a dev server and browser.

- **Vite will not bundle `node:sqlite` for a jsdom test.** Vite 5 rewrote the
  static import to a bare `sqlite`; Vite 8 refuses it outright in the client
  environment that jsdom tests run in. `vitest.config.ts` aliases `node:sqlite`
  to `test-support/sqlite.ts`, so a normal static import works in Vitest and
  tsx. Do not reinstate per-file `createRequire`, and do not drop the alias
  because the Node-environment tests pass without it.

- **Run a test from the repo root, not from its package.** The root
  `vitest.config.ts` aliases every workspace package to its `src`; run from
  `examples/remote`, Vitest resolved `foldkit-remote` to a stale local build,
  and a demo line that passed under `tsx` failed its test for no reason in the
  change. `npx vitest run examples/remote` from the root tests the source.
- **`pnpm mutate`'s browser baseline sometimes fails on its first run.** It
  can stop at "Failed to fetch dynamically imported module", before any
  mutation runs, and pass when run again unchanged. Rerun once before reading it as a
  red baseline; a second failure is real.
- **A test's own Vite build is outside `pnpm mutate` unless it takes the
  plugin.** The edits are a Vite plugin, and a nested `build()` has none, so
  every mutation of what it bundles read "not applied". Pass `mutation()`
  from `scripts/mutation-plugin.mjs` in that build's `plugins`. A test's worker
  thread is the same: `examples/site/test/prerender.worker.mjs` loads the site
  through a Vite server of its own with `mutation()` and `test-resolve.mjs`.
- **jsdom's `DOMParser` parses every inline stylesheet too.** The site's link
  check read 3,666 pages with it, each carrying 110 KB of CSS, and spent about
  a quarter of its eight minutes there; parse5 (which jsdom builds on) reads
  one such page in 4ms, against jsdom's 18ms and the queries after it.
  Read links, ids and attributes of many pages with parse5, and keep jsdom for
  the few a test queries.
- **`pnpm mutate` reaches only modules Vitest loads.** A worker esbuild bundles
  for miniflare was never mutated, so a mutation of worker code read as "not
  applied". A `Stack` takes the same edits through `workerMutation`
  (`scripts/mutation-plugin.mjs`) in its `plugins`; another esbuild-bundled
  stack needs the same.
- **`pnpm mutate` cannot reach code a test builds from the disk.**
  `cli.test.ts` builds `src/cli.ts` with tsdown, so a mutation of `cli.ts`
  reads "not applied". Mutate such code by hand (copy the file aside, edit,
  run, copy back) and say so in the spec, or move the logic to a module the
  tests import (`project.ts`, `docs.ts`).
- **Vitest 5 caches transformed modules on disk, keyed without the environment.**
  `fsModuleCache` is on by default in 5.0.4 (5.0.1 ran without it), so a
  plugin whose output depends on an environment variable (`pnpm mutate`'s
  edits) is skipped on a cached module: the fixture's mutations all read "not
  applied", and a mutated run was served an earlier run's transform without
  the plugin seeing it. `scripts/mutate.mjs` passes `--fsModuleCache=false`;
  any other env-driven transform must too. The cache also served a stale
  transform for a browser test file whose imports had changed: every test in
  it failed with "Failed to fetch dynamically imported module" while a
  renamed copy passed. It keeps an `import.meta.glob`'s list too: after the
  site gained `previews/disclosure.ts`, a wide unit run failed twelve site
  files with "previews/disclosure.ts is missing" while the folder alone
  passed. Run browser tests with `--fsModuleCache=false`, and
  the `unit` and `browser` projects in separate runs (`--project`): one run
  given a file of each failed to load the browser one.
- **Read `Test Files`, not only `Tests`.** A file that fails to load, from a
  module-level `window` read in a node test or the machine running out of
  memory under a wide run ("22 failed" with every test passing), counts no
  failed test. A grep for `Tests` showed all green twice here. Grep both lines.
  The root config sizes its workers by the memory free at start
  (`vitest.config.ts`), so a wide run no longer needs `--maxWorkers`; pass a
  smaller one if something else is using the memory as the run goes.
- **Vitest does not typecheck.** A demo line mapped over the dependencies of a
  `Data.subscriptions` entry (typed `any`) passed its test and failed
  `pnpm typecheck` with an implicit `any`, after it was pushed. After editing an
  example, run the root typecheck, not only its test.
- **Two sessions' browser tests collide on Vitest's default port.** A second
  run fails "Failed to fetch dynamically imported module". Give each its own
  with `--browser.api.port=<port>`.
- **A tab left open across a dev-server restart hangs.** The page waits on the
  old server, and every browser tool times out against it ("page is busy").
  Close it and open a fresh tab rather than retrying.
- **A hidden browser tab shows its first frame for good.** Foldkit renders on
  `requestAnimationFrame`, which a hidden tab never runs, so a page driven by
  the browser tools sat on "Loading…" while its Model had long filled, and an
  hour went to a bug that was not there. Before calling a screen stuck, check
  `document.visibilityState` and read the Model, not the DOM.
- **The root Vitest config runs its own projects.** `vitest.config.ts` defines
  `projects` with workspace-wide globs, so a per-example `vitest.config.ts`
  never loads on a root run: `setupFiles` in one silently never ran and every
  test that needed its env failed. Scope env and setup to what the test file
  itself imports (a factory with an explicit argument, `vi.stubEnv` before a
  dynamic import), which works from any working directory.
- **`pnpm mutate --only` takes one name.** Given several, it ran the first
  and reported "1 of 1". Run the spec whole, or one `--only` per run.
