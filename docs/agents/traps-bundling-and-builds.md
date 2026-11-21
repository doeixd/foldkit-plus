# Traps: bundling, declarations and bundle budgets

Read before changing a package's build (tsdown), exports or declarations, a bundle budget, or adding an import that may pull a namespace or a server into a page.

## A page keeps modules it does not use

- **A page keeps every module its imports run, read or not.** Causes found, all invisible in the examples because they resolve source:
  - A linked `export * as X` is an object of getters: reading `Recipes.Avatar` kept every recipe plus `@foldkit/ui` and floating-ui (238.6 kB gzipped, not 99.2). `sideEffects: false` cannot help. Keep namespaces ESM (one entry per file, relative imports external, `mixins-ui/tsdown.config.ts`) and measure a package's `dist`, not source.
  - One linked file keeps its top-level `Schema.Struct(...)` calls in every page (`foldkit-entity`: `Collation.binary` alone kept 73 kB of the build, 1.9 kB of source). Make each source file an entry (#215) and add the package to `scripts/test/publishedBuild.test.ts`.
  - A helper reached through a namespace object (`Behaviors.idSelector`) carries the namespace (registry +300 bytes brotli); so does a server reading `Sync.forApplication` (cloudflare Worker: Sync's client mount, sockets, presence and IndexedDB, 492 kB raw). Import the one function by name from the module that holds it; compare module by module in fresh builds of both commits before raising a ceiling.
  - A module-level call keeps its module (`AuthApi = AuthContract.make(…)` in the auth example's `domain.ts` kept Yielded's operations in the entry after the client went behind `Resource.lazy`). Move what only a lazy chunk or the server needs into a module of its own and check which modules a chunk holds (`split.test.ts`), not only its size.
  - A flag that switches a capability on imports it (`Crud.list`'s `live: boolean` kept Remote's live reads, about 1.5 kB brotli, in every list page). Take the capability from the caller (`live: liveQuery`), import only its type, and pin it with a budget's `absent`. So does a main entry that accepts or offers another package's values: `Guards.check` on the `Guards` object and `Sync.make` evaluating metakit expressions each put metakit's checker in every page (about 10 kB brotli each, seven budgets red); the metakit side lives in a subpath (`foldkit-guard/check`, `foldkit-sync/metakit`) that hands the main entry plain functions, held by `publishedBuild.test.ts`.
  - A constant from `foldkit/experimental/server` (`FOLDKIT_APP_ATTRIBUTE` in `client.ts`) brought the server renderer and HTML parser into the browser bundle (700 KB to 880 KB); so does anything imported from `foldkit-ssr` (use `foldkit-ssr/client`). Check bundle size after importing from a package that also runs on a server.

## Measuring

- **Measure an example against `dist` with `foldkit:view-identity` spliced out.**
  The workspace build writes each view function's module path into the bundle and skips `node_modules`: Chirp's entry measured 1,031 to 1,039 kB where an installed app's is 806, and a linked chunk's longer name (`condition-DheT5fC0.mjs`) made `foldkit-guard` look 2.7 kB worse. Remove the plugin from `config.plugins` in a `configResolved` hook.
- **A budget built from whatever `dist` exists measures two programs.**
  `bundle-report.mjs` built `dist` only for an example's `dependencies` and peers, but the site bundles nine packages under `devDependencies`: on a fresh checkout the first build read them as `.ts`, the second as `.js` (351,300 against 351,723 bytes, failing one run in two, #504). Two guesses fixed real but different things: make a flaky size explain itself (`explainDifference`) before guessing again.
- **Assert what a bundle offers, not only what it wrote.**
  A `?image` build made every ladder width, but sharp does not enlarge, so wider variants had the original's bytes and Rolldown merged the equal files under the first name; a test of the files passed and only the provider's widths showed it.

## Declarations

- **Name an exported type for what a public function returns.**
  `Form.input` returned `Entity.input`'s type whose `InputMembers` `foldkit-entity` did not export, so the emitter expanded it into conditionals that fail alone (TS2536) for every consumer with `skipLibCheck: false`; the workspace never saw it. `pack:check`'s consumer compile (`scripts/published-types.mjs`) catches the rest.
- **Type a member by the one field it reads or writes.**
  `form.over` named the whole form Model twice, and `examples/entity`'s `writeForm.ts` (a form nesting a form) failed `typecheck:force` with TS7056 while the package passed: `<M extends Pick<Model, 'over'>>`.
- **A reference directive after a statement is ignored, silently.**
  The consumer `published-types.mjs` put `/// <reference types="foldkit-media/client" />` after the imports, so `client.d.ts` was never read (#278); in first place it failed TS2688 since a directive does not resolve a package's own name. Directives go first, the package is linked into the probe's `node_modules`, and `--listFiles` must name every ambient export's file.
- **tsdown's declarations depend on a referenced project's `.tsbuild`.**
  With TypeScript 7, rolldown-plugin-dts uses `tsgo`, running `tsc -p tsconfig.json --noCheck --emitDeclarationOnly` (no build mode): stale `.tsbuild/build` declarations are emitted as they are, missing ones (fresh checkout) are TS6305 errors `--noCheck` hides, and thirteen packages emitted names they never declared (`Root_1`, `RemoteMessage`). The root `build` and `build:packages` run `scripts/declarations.mjs` first (`tsc -b --noCheck`: 10s, where a checked root `tsc -b` took 4 minutes and added 3.5 to CI's `pack` job). A plain `pnpm -r build` skipped it and published `declare const Query: any` (#340): each package's `build` now runs it for its references, then `scripts/declared-any.mjs`. Reproduce a CI-only build fault in a fresh clone.

## Resolving and running

- **Start an e2e server with `onFreePort(() => vite.listen())` (`scripts/free-port.mjs`).**
  Vite 8's `port: 0` listens on an ephemeral port, closes it and binds again, so another process can take it between: CI's cloudflare e2e failed "Port 41893 is already in use", `strictPort` or not.
- **`require.resolve.paths` is not where an import looks.**
  It adds `NODE_PATH` (pnpm sets it under `pnpm exec` and Vitest) and global folders, which ESM reads neither: `foldkit-plus docs` found a stray `foldkit-remote@0.21.0` in `.pnpm/node_modules`. Walk the `node_modules` folders above the importer yourself.
- **Run a probe from the package, not the repo root.**
  From the root it resolves a different, v3-era `effect` than the pinned rc the package compiles against, and answers about the wrong library authoritatively. `cd packages/<name>` first.
