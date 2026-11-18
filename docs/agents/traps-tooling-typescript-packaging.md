# Traps: TypeScript tooling, package resolution and Vite

Read before changing a tsconfig, a package export, how a workspace package resolves, a Vite config, or running tsc.

- **A re-exported type and a same-named const collide.** `export { type Sync }
  from './sync.js'` beside `export const Sync = {…}` is `TS2323 Cannot redeclare
  exported variable`, even though a type and a value may share a name. Both
  names have to originate in the same module: import the type under an alias
  (`type Sync as SyncContract`) and re-declare it (`export type Sync<…> =
  SyncContract<…>`). Namespacing a package whose main type shares the
  namespace's name hits this immediately.
- **`@ts-expect-error` is anchored to the next line.** Reformatting wrapped a
  long call and left two directives pointing at a line that no longer errors, so
  the assertions silently stopped asserting. Put the directive immediately above
  the offending expression, not above a call that contains it, and re-run
  `pnpm typecheck` after formatting.
- **Nothing reports an unused import here.** `tsconfig.base.json` leaves
  `noUnusedLocals` off, so moving `propsFailure` out of `kit.ts` left `Schema` and
  `RunMark` imported for nothing, and seven more dead imports had built up in the
  richtext packages. After moving or deleting code, run
  `npx tsc -p packages/<name> --noEmit --noUnusedLocals` over the packages touched.
- **A new package export needs `pnpm --filter foldkit-plus generate`.**
  `foldkit-remote/testing` went in without it, and `generated.test.ts` failed
  until `foldkit-plus` re-exported it. Then run `pnpm paths`: the generator
  adds the subpath but not its `paths` entry, and `paths:check` failed on the
  generated `packages/plus/tsconfig.json`.
- **`tsc` without `--noEmit` at the root writes `.d.ts` files beside the
  source.** A `vitest.shared.d.ts` and its map appeared untracked and failed
  `format:check` locally. Check with `tsc -b` or `--noEmit`, and delete such
  strays.
- **`pnpm typecheck` goes quiet downstream of a red project.** `tsc -b` skips
  every project that depends on one that failed, so while another package is
  red (someone else's work in progress, say) a break your change causes in
  `crud` or `cms` never prints. A field added to `ActiveSurface` shipped that
  way and failed CI, which runs `typecheck:force`. When any project is red,
  run `pnpm typecheck:force` and read past the errors that are not yours.
- **Package and root typechecks can use different TypeScript versions.**
  `packages/bundles` resolves TS 5.7.2 while the root resolves 5.9.3, whose
  tighter match-arm inference failed `Idle`/`Interval` updates the package
  check passed. The root check is what CI runs: verify with it (or plain
  `npx tsc -b <project>`) before committing, not just the package script.
- **`new URL` keeps Windows backslashes and eats the drive.** Parsing a
  `path.join`ed file path as a URL yields `\Users\…` (and `C:/…` parses as
  scheme `c:`, dropping the drive), while the browser reads the same file as
  `/C:/…` from `import.meta.url` — so a build id compared the two ways never
  matched on Windows and hydration refused every page, which passed on Linux
  for good. Normalize separators and read a drive path as a `file:` URL
  before comparing (`examples/foldkit/ssg/src/entry.server.ts:buildIdOf`).
- **Workspace packages resolve to source; `paths` are generated.** Every
  export has a `foldkit-plus:source` condition, which Vite, Vitest and the
  examples resolve through, so nothing reads a stale `dist`. TypeScript keeps
  `paths`, derived by `pnpm paths` from the packages a project references;
  never edit them by hand. `pnpm paths:check` refuses an import of a package
  the project does not reference, which otherwise compiles against that
  package's last build (`mixins-richtext` did, for `foldkit-primitives`). A
  `tsconfig.build.json` does not inherit `references` from the config it
  extends: `richtext-code` and `richtext-markdown` had none.
- **Vite bundles a config's relative imports, dynamic ones included.** Chirp's
  config imported `media/src/vite/index.ts`, which re-exported `images`, whose
  dynamic import reached the sharp module and its bare `foldkit-surface`
  import; Node found no `dist` on CI. A config imports a module that reaches
  no workspace package (`media/src/vite/icons.ts`).
- **A Vite config's import of a workspace plugin runs in Node, past the source
  condition.** `examples/chirp` imported `icons` from `foldkit-media/vite`:
  locally that read a `dist` built before a fix and failed with the very error
  the fix removed, and on CI, which builds no `dist`, Node loaded the plugin's
  TypeScript source and could not find its `.js` imports, so `main`'s e2e went
  red. A plugin whose source imports only types (`foldkit-mixins/foundations`)
  survives; import any other by relative path to its source, which Vite bundles
  into the config itself. A test that reads a config with Vite's
  `loadConfigFromFile` meets the same: it passed locally and failed on CI for
  every config importing `foldkit-ssr/vite`. Import the config through Vitest
  (`import config from '../vite.config.js'`), as the e2e tests do.
- **A local `dist` hides a test whose own Vite server skips the source
  condition.** `viteStyles.test.ts` made a dev server with `configFile:
  false`, so `foldkit-mixins` (aliased to source) loaded `foldkit-surface`
  from its `dist`: here one existed and the test passed; CI builds none, and
  the load's 404 read as "Cannot GET". Give such a server the root config's
  conditions (`'foldkit-plus:source'` first), and reproduce a CI-only failure
  with the `dist` folders moved aside.
- **Vitest's resolve conditions are its own, not Vite's.** Adding the source
  condition to Vite's defaults brought in `module`, which loaded
  `@opentelemetry/api`'s extensionless ESM build, and `browser`, which gave
  `ws` its stub. `vitest.shared.ts` starts from Vitest's server defaults.
- **`import.meta.env` is undefined under tsx.** A bare
  `import.meta.env.FOLDKIT_BUILD_ID` throws there, so a module that both Vite
  and tsx load cannot read it at the top level. Keep the bare read in entries
  only Vite transforms, and read `process.env` in scripts tsx runs; a server
  entry shared by both is a factory taking the id, with one thin Vite-only
  module applying the define.
- **`@foldkit/vite-plugin` defines `import.meta.env.FOLDKIT_BUILD_ID` only
  for an id it was given.** The id it generates for a client-and-server build
  is compiled into Foldkit's own `buildToken.js` alone (0.28), so an entry
  reading the variable got `undefined`, and a page stamped with the generated
  id fell back to the baseline Model with nothing said (#210). Set
  `FOLDKIT_BUILD_ID` before `foldkit()` reads it; `SSR.hydrate` now reports
  `NoBuildId` and `OtherBuild`.
