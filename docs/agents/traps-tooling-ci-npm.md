# Traps: CI, npm, dependencies, publishing and Jev

Read before changing a dependency or lockfile, a publish or release step, a CI job, or running a Jev review.

## Before pushing, and reading CI

- **Run the CI sequence before committing, not after.**
  `format:check`, `typecheck`, `test`, `demo`: a commit shipped that would have failed `format:check` because only the last three were run.
- **`pnpm ci` is a pnpm builtin, not your script.**
  A root script named `ci` never runs (`ERR_PNPM_CI_NOT_IMPLEMENTED`); the full-check script is `check`. `server` is one too: two example READMEs said `pnpm server`, which fails with `Unknown option: 'recursive'`; write `pnpm run server`.
- **A fast red hides slower reds.**
  Fixing the 30s install failure revealed a `tags:check` failure the red main had masked for days. After a CI repair watch a full run to green.
- **A runner a job starves loses its log, not only its job.**
  PR #564's fourth test shard ran the Foldkit ports' 19-page bundle build beside the browser and workerd tests; the runner "lost communication with the server", the job hung 48 minutes and GitHub kept no log (only the check run's annotations, `gh api …/check-runs/<id>/annotations`, said why). Production builds run in their own `builds` job (`buildTests`) and every job has a `timeout-minutes`.

## Dependencies and lockfile

- **A `package.json` change without `pnpm install` reds every job.**
  CI installs with `--frozen-lockfile`, so a new dependency without a regenerated lockfile fails all jobs in 30s. Regenerate in the same change and prove it with `pnpm install --frozen-lockfile` before pushing.
- **A caret range accepts an Effect minor that removed what the package imports, and an `@effect/*` package floats past Foldkit's exact Effect.**
  `@yielded/auth@0.1.0-beta.43` peers on `effect@^4.0.3`, so it installed beside 4.1.0 although it imports `effect/Crypto`, which 4.1 removed (only `tsc` saw it, as an `any` requirement in every auth Layer): on an Effect minor check each dependency that imports `effect` for the release that moved with it (Yielded's beta.47). Each `@effect/*` release peers on an `effect` at least its own version, so `foldkit-durable`'s `@effect/sql-sqlite-node: ^4.0.5` took 4.1.0 the day it shipped and every install warned: `setup` pins the Effect packages `pnpm-workspace.yaml` pins.
- **A dependency's new peer set re-resolves its optional peers to the newest.**
  Moving the `@effect/sql-*` packages to 4.0.4 changed drizzle-orm's peer set and pnpm resolved its optional `@cloudflare/workers-types` peer again (that day's release in most projects, the pinned one in two), so two drizzles existed and `examples/cloudflare` failed to typecheck. That package publishes daily and is pinned exactly wherever declared: a version move is one deliberate edit per manifest (2026-11-12: `5.20261112.1`); no override covers it. After any move count the copies (`grep -o 'name@[0-9.]*' pnpm-lock.yaml | sort | uniq -c`) and regenerate from the old lockfile.
- **A bare library name installs its `latest` tag.**
  `@yielded/auth`'s is beta.1 while `foldkit-auth` peers on beta.43: npm picked the peer's version, pnpm the tag. A printed install line names the version the peer asks for.
- **A subpath's optional peer is its importer's dependency.**
  `foldkit-builder` imports `foldkit-primitives/interaction`, whose types import `foldkit-mixins`, an optional peer of primitives; builder listed mixins only under `devDependencies`, so its published types failed TS2307 from npm. `pack:check` compiles inside the workspace and cannot see it: a package importing such a subpath declares the peer itself.
- **npx adds a newer version to the tree an older one cached.**
  `npx foldkit-plus setup` reused `_npx/<hash>` holding 0.10.0 and its peers and adding 0.17.0 failed `ERESOLVE` on the old tree's `foldkit` (#200); a fresh cache passed, so "cannot reproduce" was the cache. A bin that reads no peer runs as `npx --legacy-peer-deps`. Reproduce with `npm_config_cache` set to a folder holding such a tree.
- **npm `overrides` does let a peer in.**
  #205 said it does not; it does, for a package the project depends on only where `dependencies` names the override's exact spec (else `EOVERRIDE`, or a literal override leaving the peer refused). `$name` references follow the dependency, but npm 10 (Node 22) fails a scoped one (`$@effect/platform-browser`) with "Unable to resolve reference": CI's `pack` went red where npm 11 passed. Write the version in both places and test npm steps with npm 10 too (`volta run --node 22 --bundled-npm`).
- **A script under `pnpm <script>` carries pnpm's user agent to its children.**
  `setup` picks the manager from `npm_config_user_agent`, so the npm setup check passed run by `node` and printed pnpm's commands in CI's `pnpm pack:check`. Give a child the agent of the tool you are imitating.

## Publishing

- **A failed publish resumes, and the registry lags a green one.**
  `npm publish` with provenance can stop on `TLOG_CREATE_ENTRY_ERROR (409) an equivalent entry already exists` when its retry collides with the attestation it just wrote (`foldkit-remote@0.18.1`, 2026-10-22): re-run the failed job (`gh run rerun <id> --failed`); pnpm skips versions already in the registry and the release step still runs; bumping would drag every dependent along. Ten minutes after a green run 15 of 37 new versions were still absent from `registry.npmjs.org`: read `gh run view` for the verdict and `npm view` only to confirm afterwards.

## Jev

- **Include the skill reference and README with a public API change, repeat `--include` per file, and commit only on `approve`.**
  Reviewing with `--include` over the sources alone answered `fix_now` (`foldkit_skill_sync`) though the skill reference was updated: the change-level check sees only the included diff. `jev-pref review --include a b c` reviews only `a`: repeat the flag or run one file at a time. `jev-pref review … ; git commit …` commits whatever the review says (one change went in on a `fix_now` and needed a follow-up): branch on the verdict.
- **Jev's skill-sync check reads an ownership change.**
  A guard handing the rules it cannot judge to its writer stayed `fix_now` on `foldkit_skill_sync` with every reference updated until `SKILL.md`'s ownership column named the new seam. When the check persists, ask whether the change moved who owns a decision and say so in that table.
