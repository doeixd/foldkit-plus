# Traps: bundling, declarations and bundle budgets

Read before changing a package's build (tsdown), exports or declarations, a bundle budget, or adding an import that may pull a namespace or a server into a page.

- **Vite 8's `port: 0` is a probe, not a bind.** `httpServerStart` listens on
  an ephemeral port, closes it, and binds it again, so another process can
  take it between: CI's cloudflare e2e failed "Port 41893 is already in use",
  `strictPort` or not. Start an e2e server with `onFreePort(() =>
  vite.listen())` (`scripts/free-port.mjs`), which retries only that error.
- **The bundler merges emitted assets of equal bytes.** A `?image` build that
  made every ladder width, wider than the original or not, wrote the same five
  files as the right one: sharp does not enlarge, so the wider variants matched
  the original's own, and Rolldown kept one of them under the name that sorts
  first. A test of the files alone passed; only the provider's widths showed
  the lie. Assert what the module offers, not only what it wrote.
- **A linked `export * as` is an object, and a page keeps all of it.** tsdown
  linked `foldkit-mixins-ui` into one file, and rolldown wrote `export * as
  Recipes` as an object of getters; reading `Recipes.Avatar` kept every recipe,
  `@foldkit/ui` and floating-ui (238.6 kB gzipped, not 99.2). `sideEffects:
  false` cannot help, and the examples never showed it because they resolve
  source. Keep namespaces ESM (one entry per file, relative imports external,
  `mixins-ui/tsdown.config.ts`), and measure a package's `dist`, not its source.
- **A workspace build brands a package's `dist`; an installed one does not.**
  `foldkit:view-identity` writes each view function's module path into the
  bundle and skips `node_modules`, so Chirp's entry built in the workspace
  measured 1,031 to 1,039 kB where an installed app's is 806, and a linked
  chunk's longer name (`condition-DheT5fC0.mjs`) made `foldkit-guard` look
  2.7 kB worse than one file per module, which it was not. Measure an example against `dist`
  with that plugin spliced out of `config.plugins` in a `configResolved` hook.
- **A declaration the emitter writes out in full may not check.** `Form.input`
  returned `Entity.input`'s type, whose `InputMembers` `foldkit-entity` did not
  export, so the emitter expanded it into conditionals that fail alone (TS2536)
  and every consumer with `skipLibCheck: false` failed, while the workspace,
  reading source with library checks skipped, never did. Name an exported type
  for what a public function returns; `pack:check`'s consumer compile
  (`scripts/published-types.mjs`) catches the rest.
- **A member typed with a form's Model can push a nesting form past TS7056.**
  `form.over`'s signature named the whole form Model a second time, and
  `examples/entity`'s `writeForm.ts`, a form nesting another form, failed
  `typecheck:force` ("inferred type exceeds the maximum length the compiler
  will serialize") while the package's own check passed. Type such a member
  by the one field it reads or writes (`<M extends Pick<Model, 'over'>>`).
- **A helper reached through a namespace object carries the namespace.**
  Primitives read `Behaviors.idSelector`, and every page with roving focus
  kept every Behavior module, `Keys` included (registry +300 bytes brotli).
  Import a shared helper by name from a module that holds it; a budget that
  creeps after a "share one helper" commit is this.
- **A reference directive after a statement is ignored, silently.** The
  consumer `published-types.mjs` wrote `/// <reference types=
  "foldkit-media/client" />` after the imports, so `client.d.ts` was never
  read and an error in it passed (#278); in first place it failed TS2688 too,
  since a directive, unlike an import, does not resolve a package's own name.
  Directives go first, the package is linked into the probe's `node_modules`,
  and the compile's `--listFiles` must name every ambient export's file.
- **tsdown's declarations depend on a referenced project's `.tsbuild`.** With
  TypeScript 7 installed, rolldown-plugin-dts picks its `tsgo` generator, which
  runs `tsc -p tsconfig.json --noCheck --emitDeclarationOnly` (no build mode).
  A referenced package then resolves to its `.tsbuild/build` declarations:
  stale ones are emitted as they are (a reverted edit was still emitted), and
  missing ones, as on a fresh checkout, are TS6305 errors `--noCheck` hides, so
  the imports read as nothing and thirteen packages emitted names they never
  declared (`Root_1`, `RemoteMessage`). The root `build` and `build:packages`
  first run `scripts/declarations.mjs` (`tsc -b --noCheck` over the packages'
  build projects: 10s here, where a checked root `tsc -b` took 4 minutes and
  added 3.5 to CI's `pack` job); a later checked `tsc -b` still reports what it
  skipped. A plain `pnpm -r build` skipped it and published `declare const
  Query: any` (#340): each package's `build` now runs it for its own
  references and then `scripts/declared-any.mjs`. Reproduce a CI-only build
  fault in a fresh clone.
- **A linked package keeps what its modules run, read or not.** Without one
  namespace, `foldkit-entity`'s one linked file kept its top-level
  `Schema.Struct(...)` calls in every page: `Collation.binary` alone kept 73 kB
  of the build, 1.9 kB of the source, since `sideEffects: false` drops files and
  there was one. Make each source file an entry (#215), and add the package to
  `scripts/test/publishedBuild.test.ts`, which compares a page against the
  build and against the source.
- **A module-level call keeps its module in the chunk, read or not.**
  `AuthApi = AuthContract.make(…)` in the auth example's `domain.ts` kept
  Yielded's operations and sessions in the entry after the client moved
  behind `Resource.lazy`, since the entry imported `domain.ts` for `Me`. Move
  what only a lazy chunk and the server need into a module of its own, and
  check which modules a chunk holds (`split.test.ts`), not only its size.
- **A budget built from whatever `dist` exists measures two programs.**
  `bundle-report.mjs` built `dist` only for an example's `dependencies` and
  peers, and the site bundles nine packages it lists under `devDependencies`,
  so on CI's fresh checkout its first build read them as `.ts` source and its
  second, after other tests had built them, as `.js`: 351,300 against 351,723
  bytes, failing one run in two (#504). Two guesses (a lock, an import sort)
  fixed real but different things. Make a flaky size explain itself (which
  modules differ, `explainDifference`) before guessing again.
- **A flag that switches a capability on keeps it in every page.** `Crud.list`'s
  `live: boolean` made Crud import `liveQuery` to honour it, so every page
  drawing a list kept Remote's live reads (about 1.5 kB brotli) and read
  nothing live. Take the capability from the caller (`live: liveQuery`) and
  import only its type, and pin it with a budget's `absent`.
- **A namespace object (`Sync.forApplication`) keeps every member's module.**
  The cloudflare Worker read `Sync.forApplication` and carried Sync's client
  mount, sockets, presence and IndexedDB, 492 kB raw, until it imported
  `forApplication` by name. A server imports the one function it calls, and a
  budget that creeps up should be compared module by module in fresh builds
  of both commits before its ceiling is raised.
- **A constant from `foldkit/experimental/server` brings the server along.**
  `client.ts` imported `FOLDKIT_APP_ATTRIBUTE` from it, and the browser bundle
  grew by the server renderer and its HTML parser (700 KB to 880 KB); so does
  anything imported from `foldkit-ssr`; import `foldkit-ssr/client` in the
  browser. Check the bundle's size after adding an import from a package that
  also runs on a server.
- **`require.resolve.paths` is not where an import looks.** It adds
  `NODE_PATH` (pnpm sets it under `pnpm exec` and Vitest) and the global
  folders, which ESM reads neither of: `foldkit-plus docs` found a stray
  `foldkit-remote@0.21.0` in `.pnpm/node_modules` that way. Walk the
  `node_modules` folders above the importer yourself.
- **Run the probe from the package, not the repo root.** A scratch probe run
  from the root resolves a different, v3-era `effect` than the pinned rc the
  package actually compiles against, so it answers a question about the wrong
  library and looks authoritative doing it. `cd packages/<name>` first.
