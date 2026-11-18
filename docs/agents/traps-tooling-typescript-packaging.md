# Traps: TypeScript tooling, package resolution and Vite

Read before changing a tsconfig, a package export, how a workspace package resolves, a Vite config, or running tsc.

## tsc

- **A re-exported type and a same-named const collide.**
  `export { type Sync } from './sync.js'` beside `export const Sync = {…}` is `TS2323 Cannot redeclare exported variable`. Both names must originate in the same module: import the type under an alias (`type Sync as SyncContract`) and re-declare it (`export type Sync<…> = SyncContract<…>`); namespacing a package whose main type shares the namespace's name hits it at once.
- **`@ts-expect-error` is anchored to the next line.**
  Reformatting wrapped a long call and left two directives pointing at a line that no longer errors, so the assertions silently stopped asserting. Put the directive immediately above the offending expression and re-run `pnpm typecheck` after formatting.
- **Nothing reports an unused import here.**
  `tsconfig.base.json` leaves `noUnusedLocals` off: moving `propsFailure` out of `kit.ts` left `Schema` and `RunMark` imported for nothing and seven more dead imports had built up in the richtext packages. After moving or deleting code run `npx tsc -p packages/<name> --noEmit --noUnusedLocals` over the packages touched.
- **`tsc` without `--noEmit` at the root writes `.d.ts` files beside the source.**
  A `vitest.shared.d.ts` and its map appeared untracked and failed `format:check`. Check with `tsc -b` or `--noEmit` and delete such strays.
- **`pnpm typecheck` goes quiet downstream of a red project.**
  `tsc -b` skips every project depending on one that failed, so while another package is red a break your change causes in `crud` or `cms` never prints (a field added to `ActiveSurface` shipped that way and failed CI, which runs `typecheck:force`). When any project is red run `pnpm typecheck:force` and read past errors that are not yours.
- **Package and root typechecks can use different TypeScript versions.**
  `packages/bundles` resolves TS 5.7.2 and the root 5.9.3, whose tighter match-arm inference failed `Idle`/`Interval` updates the package check passed. Verify with the root check (or plain `npx tsc -b <project>`), which CI runs.

## Workspace resolution

- **Workspace packages resolve to source; `paths` are generated.**
  Every export has a `foldkit-plus:source` condition that Vite, Vitest and the examples resolve through, so nothing reads a stale `dist`. TypeScript keeps `paths`, derived by `pnpm paths` from the packages a project references: never edit by hand. `pnpm paths:check` refuses an import of a package the project does not reference (which otherwise compiles against that package's last build: `mixins-richtext` did, for `foldkit-primitives`). A `tsconfig.build.json` does not inherit `references` from the config it extends (`richtext-code` and `richtext-markdown` had none).
- **A new package export needs `pnpm --filter foldkit-plus generate`, then `pnpm paths`.**
  `foldkit-remote/testing` went in without it and `generated.test.ts` failed until `foldkit-plus` re-exported it; the generator adds the subpath but not its `paths` entry and `paths:check` failed on the generated `packages/plus/tsconfig.json`.
- **A Vite config's imports run in Node past the source condition.**
  Vite bundles a config's relative imports, dynamic ones included: Chirp's config imported `media/src/vite/index.ts`, which re-exported `images`, whose dynamic import reached the sharp module and its bare `foldkit-surface` import, and Node found no `dist` on CI. `examples/chirp` importing `icons` from `foldkit-media/vite` read a stale `dist` locally (the very error the fix removed) and on CI, with no `dist`, Node loaded TypeScript source and could not find its `.js` imports (`main`'s e2e red). A plugin whose source imports only types (`foldkit-mixins/foundations`) survives; import any other by relative path to its source, or a module reaching no workspace package (`media/src/vite/icons.ts`). A test reading a config with Vite's `loadConfigFromFile` meets the same (passed locally, failed on CI for every config importing `foldkit-ssr/vite`): import the config through Vitest (`import config from '../vite.config.js'`), as the e2e tests do.
- **A local `dist` hides a test whose own Vite server skips the source condition.**
  `viteStyles.test.ts` made a server with `configFile: false`, so `foldkit-mixins` (aliased to source) loaded `foldkit-surface` from its `dist`: here one existed and it passed; CI builds none and the load's 404 read as "Cannot GET". Give such a server the root config's conditions (`'foldkit-plus:source'` first) and reproduce a CI-only failure with the `dist` folders moved aside.
- **Vitest's resolve conditions are its own, not Vite's.**
  Adding the source condition to Vite's defaults brought in `module`, which loaded `@opentelemetry/api`'s extensionless ESM build, and `browser`, which gave `ws` its stub. `vitest.shared.ts` starts from Vitest's server defaults.
- **`new URL` keeps Windows backslashes and eats the drive.**
  Parsing a `path.join`ed path as a URL yields `\Users\…` (`C:/…` parses as scheme `c:`), while the browser reads `/C:/…` from `import.meta.url`: a build id compared both ways never matched on Windows and hydration refused every page (fine on Linux). Normalize separators and read a drive path as a `file:` URL before comparing (`examples/foldkit/ssg/src/entry.server.ts:buildIdOf`).
- **`import.meta.env` is undefined under tsx.**
  A bare `import.meta.env.FOLDKIT_BUILD_ID` throws there. Keep the bare read in entries only Vite transforms and read `process.env` in scripts tsx runs; a server entry shared by both is a factory taking the id, with one thin Vite-only module applying the define.
- **`@foldkit/vite-plugin` defines `import.meta.env.FOLDKIT_BUILD_ID` only for an id it was given.**
  The id it generates for a client-and-server build is compiled into Foldkit's own `buildToken.js` alone (0.28), so an entry reading the variable got `undefined` and a page stamped with the generated id fell back to the baseline Model silently (#210). Set `FOLDKIT_BUILD_ID` before `foldkit()` reads it; `SSR.hydrate` now reports `NoBuildId` and `OtherBuild`.
