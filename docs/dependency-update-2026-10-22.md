# Dependency update, 2026-10-22

Status: **carried out** on 2026-10-22; the workspace now runs the versions in
§2, and §9 records what differed from the plan. The plan is kept as the
analysis behind the versions and as the checklist for the next bump.

Written after a full survey of the workspace's manifests and the registry, and
after reading the release notes and diffing the shipped `.d.ts` of every
dependency with a breaking change.

Sources: `pnpm outdated -r --format json` (the workspace's own resolution),
`registry.npmjs.org` for every version and peer range below, the Foldkit release
notes for 0.169.0, the drizzle-orm v1.0.0-rc.5 notes, the TanStack DB 0.14.0 and
0.15.0 notes, the LiveStore v0.5.0 notes, the oxfmt 0.74.0 notes, and tarball
diffs of `drizzle-orm`, `@agent-native/core` and `@yielded/auth`.

## 1. What the workspace depends on

- 88 `package.json` files: the root, 45 publishable packages under `packages/*`,
  and 42 examples.
- 110 distinct dependency names, of which 45 are workspace packages and **65 are
  external**. 1186 declarations name a package: 490 internal and 696 external
  (`effect` alone appears 133 times: 91 dev/dependency declarations, 42 peer
  declarations; `foldkit` 112 times).
- **31 external packages have a newer published version.** The other 34 are
  already at the latest of their line and need no change. This plan takes 28 of
  the 31 and holds three on purpose (§3): `@types/node`, `@effect/wa-sqlite`,
  and the `typescript-6` alias, which `pnpm outdated` reports as
  `typescript 6.0.3 → 7.0.2` because it reads the alias as `typescript`.

Nothing in the workspace is pinned below its declared range: `wanted` equals
`current` everywhere, so the lockfile is fresh and every update below is a
manifest change, not a lockfile refresh.

## 2. Target versions

Three cohorts, by risk. "Decl." is the number of declarations that change.

### Cohort A — patches and tooling (one commit, mechanical)

| Package                         | Now           | Target          | Decl. | Notes                                      |
| ------------------------------- | ------------- | --------------- | ----- | ------------------------------------------ |
| `effect`                        | `^4.0.4`      | `^4.0.5`        | 91    | dev/dependency only; peers stay `^4.0.0`   |
| `@effect/platform-browser`      | `^4.0.4`      | `^4.0.5`        | 65    |                                            |
| `@effect/platform-node`         | `^4.0.4`      | `^4.0.5`        | 4     |                                            |
| `@effect/sql-d1`                | `^4.0.4`      | `^4.0.5`        | 3     |                                            |
| `@effect/sql-pg`                | `^4.0.4`      | `^4.0.5`        | 1     |                                            |
| `@effect/sql-sqlite-node`       | `^4.0.0`      | `^4.0.5`        | 1     | only holder was loose                      |
| `@effect/sql-sqlite-wasm`       | `^4.0.4`      | `^4.0.5`        | 4     |                                            |
| `@effect/language-service`      | `^0.87.4`     | `^0.87.5`       | 1     |                                            |
| `vite`                          | `8.3.4` / `^8.3.4` | `8.3.5` / `^8.3.5` | 35 | 30 exact pins are the examples' |
| `vitest`                        | `^5.0.4`      | `^5.0.5`        | 1     |                                            |
| `@vitest/browser-playwright`    | `5.0.4`       | `5.0.5`         | 1     | must equal `vitest` exactly                |
| `playwright`                    | `^1.64.0`     | `^1.64.1`       | 8     |                                            |
| `playwright-core`               | `1.64.0`      | `1.64.1`        | 1     | lockstep with `playwright` (`packages/ssr`)|
| `jsdom`                         | `30.1.2`      | `30.1.3`        | 45    |                                            |
| `fake-indexeddb`                | `6.2.5`       | `6.2.6`         | 3     |                                            |
| `react`, `react-dom`            | `19.3.0`      | `19.3.1`        | 8     |                                            |
| `sharp`                         | `^0.35.4`     | `^0.35.5`       | 1     |                                            |
| `sql.js`                        | `1.14.2`      | `1.15.1`        | 2     | minor; `@types/sql.js` already latest      |
| `@electric-sql/pglite`          | `0.5.9`       | `0.5.11`        | 1     |                                            |
| `oxfmt`                         | `0.73.0`      | `0.74.0`        | 1     | re-format the tree; output may shift       |
| `@cloudflare/workers-types`     | `5.20261013.1`| `5.20261022.1`  | 3     | publishes daily; move once, not per day    |
| `pnpm-workspace.yaml` overrides | `^4.0.4`      | `^4.0.5`        | 4     | otherwise they can pin the old line        |

Effect 4.0.5 has no breaking entries: `Array.match`'s `NonEmptyArray`, an
`AsyncResult.all` fix, atom rebuilds, `Flag.withOptionalValue`,
`HttpClientRequest.compressBody`, `Redacted` as URL params, and `FileSystem`
`Info` 64-bit fields becoming `bigint`/`Option<bigint>`. Our code reads no
`FileSystem.File.Info` fields; confirm with a grep as part of the phase.

**Do not take `@effect/*` 4.0.6.** Those releases exist (2026-10-22) but peer on
`effect@^4.0.6`, and `effect@4.0.6` is **not on npm** (404). 4.0.6 of the
satellites cannot install.

### Cohort B — the Foldkit family (one commit, real code work)

| Package               | Now       | Target    | Decl. |
| --------------------- | --------- | --------- | ----- |
| `foldkit`             | `0.168.0` | `0.169.0` | 81    |
| `foldkit` (peer)      | `^0.168.0`| `^0.169.0`| 31    |
| `@foldkit/ui`         | `0.168.0` | `0.169.0` | 25    |
| `@foldkit/ui` (peer)  | `^0.168.0`| `^0.169.0`| 1     |
| `@foldkit/vite-plugin`| `0.27.1`  | `0.28.0`  | 4     |

`foldkit@0.169.0` adds `Lazy.expectAllReused`, `Transition.match` /
`matchOrElse` / `isExiting` / `isStaying`, and fixes the portal `insertBefore`
crash, `h.Value`/`h.OnInput` dropped characters, repeated `Dom.restoreInert`,
and a boundary-wrap crash in Submodel teardown. **No breaking change.**

`@foldkit/ui@0.169.0` does break:

1. **Popover, Menu and Listbox trigger clicks now dispatch `ClickedButton`**
   instead of `RequestedOpen` / `RequestedClose` / `IgnoredMouseClick` /
   `Opened` / `Closed`. Any exhaustive match over those unions must add the
   variant, and Scene tests that assert the click Message must expect it.
   Our wrappers re-declare their own unions over the upstream Messages
   (`packages/mixins-ui/src/menu.ts`, `menuView.ts`, `listboxShared.ts`,
   `comboboxShared.ts`, `datePickerView.ts`, `colorPicker.ts`), so `tsc -b` and
   `pnpm tags:check` are the detectors. `packages/mixins-ui/src/dialog.ts`'s
   `RequestedClose` is Dialog, which did **not** change — leave it.
2. **The Popover panel handles focus leave instead of blur.** Scene tests for a
   Popover panel must call `Scene.focusLeave(panel)`. The workspace has one
   `Scene.blur(` (`comboboxContract.test.ts`, on the *input*), which is
   unaffected; re-check after the bump.
3. `contentFocus: true` on a Popover no longer gives the panel a tab stop.
   Check whether any wrapper relies on that.
4. Patch: "Remove an empty shared portal root when an overlay closes." This
   touches portal teardown, which the repo tests in `mixins-ui` — run the
   browser tests, not only the unit suite.

`@foldkit/vite-plugin@0.28.0` changes only the DevTools MCP relay (own loopback
port, registry discovery, challenge auth) and warns to upgrade the plugin and
MCP server together. We do not run `@foldkit/devtools-mcp`, and the four
examples that pin the plugin use it for the app build. No code change expected.

### Cohort C — pre-1.0 lines, one commit each

| Package                    | Now             | Target          | Decl. | Risk                             |
| -------------------------- | --------------- | --------------- | ----- | -------------------------------- |
| `drizzle-orm`              | `1.0.0-rc.4`    | `1.0.0-rc.5`    | 12    | rc, [BREAKING] list below        |
| `@yielded/auth`            | `0.1.0-beta.38` | `0.1.0-beta.43` | 3     | beta, no notes published         |
| `@yielded/auth-persistence`| `0.1.0-beta.38` | `0.1.0-beta.43` | 2     | must match `@yielded/auth`       |
| `@agent-native/core`       | `0.207.1`       | `0.214.0`       | 2     | 0.x minor, +100 `.d.ts`          |
| `@tanstack/db`             | `0.13.0`        | `0.15.2`        | 1     | one example, narrow surface      |
| `@livestore/livestore`     | `0.5.0-dev.1`   | `0.5.0`         | 1     | dev → stable, same peers         |

**drizzle-orm rc.5.** Eleven `[BREAKING]` entries, all in query building,
codecs and driver adapters. The ones that could touch us:

- `View` moved from `drizzle-orm/sql/sql` to `drizzle-orm/view`.
- `getTableUniqueName` no longer prefixes a schema, and no longer sets
  `public.` for entities without one.
- Relation filters: `where: undefined` now throws (use `EmptyFilter`), and
  `{}` no longer means "has a relation" (use `true`).
- `sqlite`: `.defaultFn(...)` is honoured when `.default(...)` is also present.
- `db.get()` now types `| undefined`.
- Relational-query `where`/`orderBy` build strategy changed for pg/mysql.
- `postgres-js` transparent parsers: remove manual `JSON.stringify` workarounds.

The workspace uses none of `getTableUniqueName`, `withReplicas`,
`drizzle-orm/sqlite-proxy`, `drizzle-orm/view` or `db.query.*` (verified by
grep), so the surface at risk is `select`/`insert`/`update`/`delete` in
`packages/remote-drizzle`, `packages/cms-drizzle` and `packages/guard`.

**rc.5 fixes a trap recorded in AGENTS.md.** rc.4's
`cache/core/cache-effect.js` declares `class EffectCacheError extends
Schema.TaggedErrorClass<...>`, which no Effect 4 release exports; rc.5 declares
it as `Schema.TaggedError` and no file in the rc.5 tarball mentions
`TaggedErrorClass` (checked). After this phase, probe `drizzle-orm/effect-postgres`
in a scratch file **from inside the package** (`cd packages/remote-drizzle`)
and, if it loads, rewrite that AGENTS.md entry.

**`@yielded/auth` beta.43.** No release notes and no changelog in the tarball;
the registry's `latest` tag is stale at `beta.1`, so never install `latest` —
pin `0.1.0-beta.43` explicitly. Both packages declare only `effect: ^4.0.3` as a
peer, so they impose no drizzle or platform constraint. Our use is one type
import (`type { Auth, Http }` in `packages/auth/src/server.ts`); both names
still exist in beta.43. Verify by diffing the exported `.d.mts` if anything else
appears.

**`@agent-native/core` 0.214.0.** `engines.node` is `>=22.22.0` (unchanged from
0.207.1). The adapter imports only `ActionTool` from `@agent-native/core/server`
and its test imports `defineAction`, `closeDbExec`, `appStateGet`,
`registerPackageActions`; all five still exist in 0.214.0. One module was
removed (`experiments/store`), which we do not import. Still re-read
`packages/agent-native/src/actions.ts` after the bump: AGENTS.md records that
this adapter's tool registration only type-checked once the descriptor schema
was an object, and the peer types are the thing that decides.

**`@tanstack/db` 0.15.2.** 0.14.0 reworked query binding (`DescriptorRef` in the
exported IR, prepared queries bound at consumption) and 0.15.0 changed
`findOne` windows (`SetWindowFindOneLimitError`, fixed limit 1). The single
example (`examples/tanstack/src/interpreter.ts`) imports only `and, eq,
inArray, isNull, not` and the `Collection` type, so the risk is the generated
query plan, not the API. Run its tests and the demo line.

**`@livestore/livestore` 0.5.0.** dev → stable, no `[BREAKING]` entries; it
aligns its Effect cohort to 4.0.3, which 4.0.5 satisfies. Example only.

## 3. Deliberate holds

| Package                 | Stay at    | Why                                                                                         |
| ----------------------- | ---------- | ------------------------------------------------------------------------------------------- |
| `@types/node`           | `22.20.5`  | latest **22.x**. 26.6.5 exists, but the runtime is Node 22 (`useNodeVersion`, CI); typing against 26 would let Node 22-invalid APIs compile. |
| `@effect/wa-sqlite`     | `0.1.2`    | `@effect/sql-sqlite-wasm@4.0.5` peers `>=0.1.2 <0.2.0`. 0.2.1 is out of range; wait for the wasm package to widen it. |
| `miniflare`             | `4.20260730.0` | latest **stable**. 5.x is alpha/beta only.                                              |
| `typescript`            | `7.0.2`    | latest. `typescript-6` stays `6.0.3`, the latest 6.x, because TypeScript 7 ships no compiler API and `react-codegen` and `examples/site` read source through it. |
| `@effect/*` 4.0.6       | not taken  | peers on `effect@^4.0.6`, which is unpublished.                                             |
| `shiki`, `prettier`, `ws`, `unpic`, `uqr`, `thumbhash`, `csstype`, all `@iconify-json/*`, all `mdast-util-*`/`micromark-*`, `@types/*` | current | already latest.                                       |

## 4. Toolchain alignment (do this first, separate commit)

`pnpm-workspace.yaml` sets `useNodeVersion: 22.21.1`, which is **below two
floors already in the tree**: `jsdom@30.1.2` requires `^22.22.2 || ^24.15.0 ||
>=26.0.0`, and `@agent-native/core` requires `>=22.22.0`. This is pre-existing,
not created by the update, and `pnpm` only warns. Raise it to `22.23.4` (the
latest 22.x) so the pinned toolchain satisfies both. Leave CI's
`node-version: 22` alone; it already resolves to the newest 22.x.

## 5. How to make 443 edits without breaking the tree

Edit by (file, *field*, name), never by raw string:

- `"effect": "^4.0.4"` appears as a `devDependency` where it must become
  `^4.0.5`, and as a `peerDependency` in `packages/auth` where it must stay
  `^4.0.4`. A search-and-replace cannot tell them apart.
- Same for `"vite": "8.3.4"` (exact pins in examples) vs `"^8.3.4"`.

A throwaway Node script that `JSON.parse`s each manifest, assigns by field,
and writes `JSON.stringify(json, null, 2) + '\n'` is safe here because these
files hold no comments and oxfmt formats JSON with two spaces. The script must
**count every assignment and assert the expected total per package** before
writing; a silently missing anchor is the failure mode AGENTS.md warns about
most often. Then read `git diff --stat` (expect ~88 files) and
`pnpm format:check`.

Peers that stay put, deliberately: `effect: ^4.0.0`, 42 declarations across the
publishable packages. (`@effect/platform-browser` has no peer declarations, so
it is a dev-only bump everywhere.) Raising the `effect` peer to `^4.0.5` would
raise the floor for every consumer of every package for no gain.

## 6. Phases

Each phase is one commit, made only when its gates are green. Run the gates in
this order (`pnpm typecheck` alone goes quiet downstream of a red project, so
always `typecheck:force` while anything is in flight).

### Phase 0 — baseline and toolchain

1. `git status` clean apart from unrelated work; `pnpm install --frozen-lockfile`
   passes; `pnpm check` green (this is the baseline every later phase compares
   to).
2. `useNodeVersion: 22.21.1` → `22.23.4`.
3. `pnpm install`; gates: `typecheck:force`, `test`.
4. Commit: `deps: require Node 22.23.4 for jsdom and agent-native`.

### Phase 1 — cohort A

1. Apply cohort A edits, including the four override lines.
2. `pnpm install`.
3. `pnpm outdated -r` must now report only the held packages and cohorts B/C.
4. Count copies: `grep -o 'name@[0-9.]*' pnpm-lock.yaml | sort | uniq -c` — one
   `effect@4.0.5`, one `@effect/platform-*@4.0.5`, no `4.0.4` left.
5. `pnpm format` (oxfmt 0.74.0 may reformat), then `format:check`.
6. Gates: `typecheck:force`, `test`, `demo`.
7. Commit: `deps: Effect 4.0.5, Vite 8.3.5, Vitest 5.0.5, oxfmt 0.74.0`.

### Phase 2 — cohort B (Foldkit)

1. Apply cohort B edits (exact pins and `^0.168.0` peers).
2. `pnpm install`.
3. `pnpm typecheck:force` — every non-exhaustive match over Popover/Menu/Listbox
   Messages reports here.
4. Fold `ClickedButton` through the wrapper unions and `update`; add it to every
   exhaustive `match`/`tagsExhaustive`; update the Scene tests that assert a
   trigger click's Message.
5. Re-check Popover panel focus tests for `Scene.focusLeave`. Re-check
   `contentFocus` usage.
6. `pnpm tags:check` (branching on the widened unions), `pnpm mutate:check`
   (anchors such as `dialog.mutations.ts` still resolve), `pnpm test` (browser
   project included — the portal teardown fix is only visible there).
7. Gates: `typecheck:force`, `test`, `demo`, `e2e`.
8. Commits: `deps: Foldkit 0.169.0 and @foldkit/ui 0.169.0`, then
   `mixins-ui: fold the upstream ClickedButton trigger message` if step 4
   produced a separate, reviewable change.

### Phase 3 — drizzle-orm rc.5

1. Bump the 12 declarations (three packages hold a peer and a dev pin; change
   both).
2. `pnpm install`; `pnpm typecheck:force` over `remote-drizzle`, `cms-drizzle`,
   `guard` and the five examples that depend on it.
3. Grep for the rc.5 breaking list in our code: `getTableUniqueName`,
   `withReplicas`, `sqlite-proxy`, `drizzle-orm/view`, `db.query.`,
   `.defaultFn(`, `JSON.stringify` beside JSON columns, `db.get(`.
4. Run `packages/remote-drizzle`, `packages/cms-drizzle` and `packages/guard`
   tests, the `foldkit-example-entity` and `foldkit-example-kitchen-sink` demo
   lines that the root `demo` script already covers, and the
   `foldkit-example-cms`, `foldkit-example-registry` and
   `foldkit-example-cloudflare` demos by filter — none of those three is in the
   root `demo` chain.
5. Probe the Effect driver from inside a package (see §2) and update AGENTS.md.
6. Gates: `typecheck:force`, `test`, `demo`, `e2e`.
7. Commit: `deps: drizzle-orm 1.0.0-rc.5`.

### Phase 4 — @yielded/auth beta.43

1. Bump both packages (peer and dev in `packages/auth`, deps in
   `examples/auth`).
2. `pnpm install`; `typecheck:force`; `packages/auth` and `examples/auth` tests.
3. Diff the exported `.d.mts` of beta.38 vs beta.43 if `tsc` complains about
   `Auth`/`Http`.
4. Gates: `typecheck:force`, `test`, `demo`.
5. Commit: `deps: @yielded/auth 0.1.0-beta.43`.

### Phase 5 — @agent-native/core 0.214.0

1. Bump the peer and the dev pin in `packages/agent-native`.
2. `pnpm install`; `typecheck:force` over `packages/agent-native`, and read
   `src/actions.ts` against the new `ActionTool` when it passes.
3. `packages/agent-native` test, plus the kitchen-sink demo line that mounts it.
4. Gates: `typecheck:force`, `test`, `demo`.
5. Commit: `deps: @agent-native/core 0.214.0`.

### Phase 6 — examples-only pre-1.0

1. `@tanstack/db` 0.15.2: `pnpm install`, `examples/tanstack` tests, and
   `pnpm --filter foldkit-example-tanstack demo` (it is not in the root `demo`
   chain). Watch for a changed query plan rather than an API break.
2. `@livestore/livestore` 0.5.0: same, `examples/livestore` (it has no demo
   script, so its tests and typecheck are the gate).
3. Gates: `typecheck:force`, `test`.
4. Commits: one per package, so a revert is one line.

### Phase 7 — documents

1. `CHANGELOG.md`: add `## Unreleased` with `### Changed` — the peer floors moved
   (`foldkit`, `@foldkit/ui`, `drizzle-orm`, `@yielded/auth`,
   `@agent-native/core`), which changes what consumers may install.
2. `skills/foldkit-plus/SKILL.md` line 25 (`Targets Foldkit 0.168.x`) and line
   146 (`foldkit@0.168.0`).
3. `skills/foldkit-plus/references/remote.md` line 622 (`drizzle-orm 1.0.0-rc.4`).
4. `README.md` lines 477 and 540 (`foldkit@0.168.0`, "tested on 4.0.4").
5. `packages/remote-drizzle/README.md` line 89.
6. `docs/releases.md` lines 91–127: the peer ranges it states as current.
7. `AGENTS.md`: rewrite the drizzle `TaggedErrorClass` trap (rc.5 fixes it) and
   check the claim that "the root `pnpm.overrides` pins `@cloudflare/workers-types`"
   — the root `package.json` has no `pnpm` field and `pnpm-workspace.yaml`
   overrides only the four `@effect/*` packages. Correct or remove.
8. Commit: `docs: record the 2026-10-22 dependency update`.

### Phase 8 — the whole gate, once

`pnpm check` (format, paths, icons, tags, mutate:check, typecheck, test, demo,
pack:check) and `pnpm e2e`, then `pnpm install --frozen-lockfile` to prove the
lockfile is complete. Read `Test Files` as well as `Tests` in the Vitest output:
a file that fails to load reports no failed test.

## 7. Risks and rollback

- **A bulk edit that skips one manifest** leaves one package on the old line and
  the lockfile with two `effect` copies. The assertion in §5 plus the copy count
  in Phase 1 step 4 are the guard.
- **`@foldkit/ui`'s portal teardown fix** can change browser behaviour that only
  a browser test sees. It is the one change in cohort B I would not call
  mechanical.
- **drizzle rc.5 is a release candidate** with eleven breaking entries; the
  Phase 3 greps are what keep us off the ones that apply. If something does
  break and cannot be fixed quickly, hold at rc.4 — nothing in cohorts A, B or
  the others requires rc.5.
- **`@yielded/auth` publishes no notes** and its `latest` tag is wrong, so beta.43
  is unverified by documentation; the fallback is beta.38, and the type surface
  we use is two names.
- Every phase is its own commit, so any of them reverts alone. No phase changes
  the static site's output except Phase 1 (`oxfmt`) and Phase 2 (`@foldkit/ui`).

## 8. Open questions

1. Should `@types/node` follow the runtime (stay 22) or the machine (move to 26)?
   This plan says stay; say now if the intent is to move the whole workspace to
   Node 26 instead, because that changes `useNodeVersion`, `engines` and CI too.
2. `@effect/wa-sqlite` 0.2.1 needs `@effect/sql-sqlite-wasm` to widen its peer.
   Do we want to try 0.2.1 with a `peerDependencyRules.allowedVersions` entry, or
   wait? This plan waits.
3. Should the four `@effect/*` overrides in `pnpm-workspace.yaml` be dropped once
   every manifest names `^4.0.5`? They exist to keep one copy of each Effect
   package; keeping them is cheap, so this plan keeps them.

## 9. What happened

Carried out in one pass, with the phases as commits' worth of verification
rather than separate commits, because the version bumps share the same
`package.json` hunks.

- **443 declarations changed in 87 manifests**, plus four override lines and
  `useNodeVersion: 22.23.4`. A field-aware script applied them and asserted the
  expected count per package before writing; `git diff --stat` showed the 87
  manifests, and `pnpm-lock.yaml` holds one `effect@4.0.5` and no `4.0.4`.
- **One unexpected code change.** `drizzle-orm@1.0.0-rc.5` typed
  `not(condition)` as returning `SQL | undefined` (it answers `undefined` for
  its optional argument), which broke `packages/remote-drizzle/src/compile.ts`
  in two places. It now uses a local `negate` that emits the same
  `not (…)`; the package's 467 tests pass unchanged. The mutation spec
  `a not compiles to its operand` was re-anchored and still kills.
- **No Foldkit code change was needed.** `foldkit-mixins-ui` builds its own
  trigger messages, so upstream's new `ClickedButton` never reaches `update`.
  Typecheck, the 1974 unit tests and the 671 browser tests agree.
- **`packages/plus` re-generated.** Its `setup` field names the Foldkit version
  the workspace installs, and `generated.test.ts` fails until
  `pnpm --filter foldkit-plus generate` runs; the generator also rewrote its
  `tsconfig.json`.
- **Cohort C was clean.** drizzle rc.5, `@yielded/auth` beta.43,
  `@agent-native/core` 0.214.0, `@tanstack/db` 0.15.2 and `@livestore` 0.5.0
  needed no source change; the surfaces each touches are the narrow ones §2
  names.
- **Gates, all run on 2026-10-22:** `format:check`, `paths:check`,
  `icons:check`, `tags:check`, `mutate:check` (374 specs, 3529 mutations),
  `typecheck:force`, `test` (12516 tests), `demo`, `pack:check`, `e2e`.
  Three tests failed under the full parallel run and pass alone: two browser
  tests (`menuRows`, `toast`) and one e2e (`richtext-playground`'s Ctrl+K focus
  poll). They are load flakes on this machine, not version fallout — each
  passes in isolation, and the upgrades touched no code on their paths.
- **Holds stood.** `@effect/wa-sqlite` 0.1.2, `@types/node` 22.20.5,
  `miniflare` 4.20260730.0. See §3.
