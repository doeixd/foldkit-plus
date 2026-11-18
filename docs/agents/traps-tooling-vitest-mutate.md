# Traps: Vitest, pnpm mutate and local dev servers

Read before running Vitest or pnpm mutate, adding a Vitest config or alias, or driving a dev server and browser.

## Running Vitest

- **Run a test from the repo root, not from its package.**
  The root `vitest.config.ts` aliases every workspace package to its `src`; run from `examples/remote`, Vitest resolved `foldkit-remote` to a stale local build and a demo line that passed under `tsx` failed. `npx vitest run examples/remote` from the root tests the source.
- **The root Vitest config runs its own projects.**
  Its `projects` use workspace-wide globs, so a per-example `vitest.config.ts` never loads on a root run (`setupFiles` silently never ran and every test needing its env failed). Scope env and setup to what the test file imports (a factory with an explicit argument, `vi.stubEnv` before a dynamic import).
- **Read `Test Files`, not only `Tests`.**
  A file that fails to load (a module-level `window` read in a node test, or the machine running out of memory in a wide run: "22 failed" with every test passing) counts no failed test; a grep for `Tests` showed all green twice. Grep both lines. The root config sizes workers by memory free at start, so a wide run needs no `--maxWorkers`; pass a smaller one if something else is using memory.
- **Vitest does not typecheck.**
  A demo line mapped over the dependencies of a `Data.subscriptions` entry (typed `any`) passed its test and failed `pnpm typecheck` with an implicit `any` after it was pushed. After editing an example run the root typecheck.
- **Vitest 5 caches transformed modules on disk, keyed without the environment.**
  `fsModuleCache` is on by default in 5.0.4 (5.0.1 ran without), so a plugin whose output depends on an environment variable (`pnpm mutate`'s edits) is skipped on a cached module: every mutation read "not applied" and a mutated run was served an earlier transform. `scripts/mutate.mjs` passes `--fsModuleCache=false`; any other env-driven transform must too. The cache also served a stale transform for a browser test file whose imports had changed (every test failed with "Failed to fetch dynamically imported module" while a renamed copy passed) and kept an `import.meta.glob`'s list (after the site gained `previews/disclosure.ts` a wide unit run failed twelve site files with "previews/disclosure.ts is missing" while the folder alone passed). Run browser tests with `--fsModuleCache=false`, and the `unit` and `browser` projects in separate runs (`--project`): one run given a file of each failed to load the browser one.
- **Vite will not bundle `node:sqlite` for a jsdom test.**
  Vite 5 rewrote the static import to a bare `sqlite`; Vite 8 refuses it in the client environment jsdom tests run in. `vitest.config.ts` aliases `node:sqlite` to `test-support/sqlite.ts`, so a normal static import works in Vitest and tsx: do not reinstate per-file `createRequire` and do not drop the alias because Node-environment tests pass without it.
- **jsdom's `DOMParser` parses every inline stylesheet too.**
  The site's link check read 3,666 pages with it, each carrying 110 KB of CSS, and spent about a quarter of its eight minutes there; parse5 reads one such page in 4ms against jsdom's 18ms. Read links, ids and attributes of many pages with parse5; keep jsdom for the few a test queries.
- **Two sessions' browser tests collide on Vitest's default port.**
  A second run fails "Failed to fetch dynamically imported module". Give each its own with `--browser.api.port=<port>`.

## pnpm mutate

- **`pnpm mutate` reaches only modules Vitest loads.**
  A test's own Vite `build()` has no mutation plugin: pass `mutation()` from `scripts/mutation-plugin.mjs` in its `plugins` (a worker thread loads one too: `examples/site/test/prerender.worker.mjs` loads the site through a Vite server of its own with `mutation()` and `test-resolve.mjs`), or every mutation of what it bundles reads "not applied". A Worker esbuild bundles for miniflare is never mutated: a `Stack` takes the edits through `workerMutation` in its `plugins` (another esbuild-bundled stack needs the same). Code a test builds from disk (`cli.test.ts` builds `src/cli.ts` with tsdown) is unreachable: mutate by hand (copy aside, edit, run, copy back) and say so in the spec, or move the logic to a module the tests import (`project.ts`, `docs.ts`).
- **`pnpm mutate`'s browser baseline sometimes fails on its first run.**
  It can stop at "Failed to fetch dynamically imported module" before any mutation runs and pass when run again unchanged. Rerun once; a second failure is real.
- **`pnpm mutate --only` took one name.**
  Given several, it ran the first and reported "1 of 1"; run the spec whole, or one `--only` per run. (fc7297ff4 made `--only` repeatable: check `scripts/mutate.mjs` before relying on either.)

## Dev servers and browsers

- **A tab left open across a dev-server restart hangs; a hidden tab shows its first frame for good.**
  The page waits on the old server and every browser tool times out ("page is busy"): close it and open a fresh tab. Foldkit renders on `requestAnimationFrame`, which a hidden tab never runs, so a page driven by the browser tools sat on "Loading…" while its Model had long filled and an hour went to a bug that was not there. Before calling a screen stuck check `document.visibilityState` and read the Model, not the DOM.
