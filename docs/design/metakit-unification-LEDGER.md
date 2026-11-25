# Metakit unification: the ledger

Each phase of `metakit-unification-PLAN.md` changes code that pages run, and the plan's byte rules say a phase proves it did not make a page heavier. This file is where the proof lives: the size of every page budget, how long the type checker takes, and how long a redraw takes, each with the commit it was read at. A phase writes its reading before it starts and again when it ends, so a reviewer can subtract one from the other.

## How to add a line

1. Take the reading in a tree that holds only the commit you name. Note `git status` and write the commit hash (`git log -1 --format=%h`) beside the reading. A reading with no hash is not a reading.
2. Add a row to the section the measurement belongs to, keeping the old row. Never overwrite one: the next phase's before is this phase's after.
3. For a bundle, write `before`, `after` and the commit of each in the "Phase readings" table at the end. A budget is raised only for code every page under it runs, with the measurement beside the number (rule 4 of the plan).

How to take each reading:

- **Client bundle (brotli).** `node scripts/bundle-report.mjs examples/<name>` prints the total; `--json out.json` keeps it. For a page with routes, add `--route name=src/file.ts` as its `*.test.ts` does. The foldkit ports are `examples/foldkit/<port>`.
- **Worker (raw bytes).** `node scripts/bundle-report.mjs examples/foldkit/domains-plus --server`; for the cloudflare example, `node scripts/bundle-report.mjs examples/cloudflare --worker src/worker.ts`.
- **Type-check time.** `pnpm exec tsc -b <project> --force --extendedDiagnostics`, one project at a time.
- **Redraw time.** `node scripts/render-baseline.mjs --app grid --reps 10` (see "Redraw time").

`scripts/bundle-report.mjs` rebuilds a package's `dist` when its source is newer, and the rebuild leaves out declaration files and, for `foldkit-plus`, most of `dist`. After a run, rebuild each package it reported with `pnpm --filter <package> build`.

## What the columns mean

- **Ceiling.** The number in the budget's test. The test fails above it, and also fails if the reading falls under 90% of it (a ceiling that far above the page is stale).
- **Reading.** The size today, measured at the commit in the table's heading.
- **Headroom.** Ceiling minus reading, in bytes. Negative means the budget's test fails today. A page that grows by more than its headroom turns its budget red.
- **Last note.** The date of the newest dated comment in the budget's test file, which says what the last change to the ceiling bought.
- **Client** budgets count the brotli-compressed JavaScript a page loads at start, built against each package's `dist` as an installed application gets it. **Client route** budgets count the same for one route's first load. **Worker** budgets count the raw bytes of the one file `wrangler deploy` uploads, since a Worker is parsed whole.

## Bundle budgets, read at `845d4b9c2`

Every budget in the repository, tightest headroom first. All were read in one sequence at `845d4b9c2` with a clean tree, apart from the `publishedBuild.test.ts` edit of this bout, which no page imports. The readings are local builds; CI's readings differ by tens to a few thousand bytes (the Worker's comments record 3 kB). `examples/todo-app` was read last, and its source (`machine.ts`, `surface.ts`) and `metakit` were being edited by another session at the time, so its row is the one most likely to move.

| Budget | Kind | Ceiling | Reading | Headroom | Last note |
| --- | --- | ---: | ---: | ---: | --- |
| cloudflare | client | 224,500 | 224,776 | **-276** | 2026-11-19 |
| auth | client | 228,500 | 228,498 | **2** | 2026-11-19 |
| cms | client | 164,500 | 164,495 | **5** | 2026-11-19 |
| reference | client | 252,300 | 252,274 | **26** | 2026-11-21 |
| foldkit/kanban | client | 137,600 | 137,552 | **48** | 2026-11-18 |
| registry | client | 262,300 | 262,209 | **91** | 2026-11-21 |
| data-grid | client | 147,000 | 146,848 | **152** | 2026-11-15 |
| foldkit/auth | client | 152,500 | 152,333 | **167** | 2026-11-18 |
| foldkit/counter | client | 116,500 | 116,286 | **214** | 2026-11-19 |
| domains-plus Worker | Worker | 3,277,700 | 3,277,469 | **231** | 2026-11-21 |
| site gallery first load | client route | 458,000 | 457,648 | 352 | 2026-11-18 |
| widgets | client | 156,000 | 155,625 | 375 | 2026-11-18 |
| entity | client | 222,000 | 221,621 | 379 | 2026-11-19 |
| cms studio first load | client route | 372,500 | 372,089 | 411 | none |
| foldkit/form | client | 148,500 | 148,086 | 414 | 2026-11-19 |
| foldkit/snake | client | 117,500 | 117,073 | 427 | 2026-11-11 |
| foldkit/route-transitions | client | 117,500 | 117,056 | 444 | 2026-11-11 |
| foldkit/ssr | client | 130,500 | 130,003 | 497 | 2026-11-11 |
| todo-app | client | 171,000 | 170,481 | 519 | 2026-11-21 |
| foldkit/todo | client | 131,000 | 130,440 | 560 | 2026-11-11 |
| foldkit/websocket-chat | client | 130,000 | 129,261 | 739 | 2026-11-18 |
| foldkit/ssg | client | 125,500 | 124,723 | 777 | 2026-11-11 |
| foldkit/api-cache | client | 204,500 | 203,672 | 828 | 2026-11-17 |
| foldkit/routing | client | 136,500 | 135,666 | 834 | 2026-11-18 |
| foldkit/query-sync | client | 140,000 | 139,154 | 846 | 2026-11-11 |
| foldkit/shopping-cart | client | 123,500 | 122,635 | 865 | 2026-11-18 |
| foldkit/weather | client | 127,500 | 126,584 | 916 | 2026-11-18 |
| richtext-playground | client | 208,000 | 206,895 | 1,105 | 2026-11-15 |
| foldkit/job-application | client | 188,500 | 187,283 | 1,217 | 2026-11-11 |
| chirp | client | 245,700 | 244,358 | 1,342 | 2026-11-17 |
| pages | client | 236,000 | 234,316 | 1,684 | 2026-11-15 |
| cms site first load | client route | 328,500 | 326,223 | 2,277 | none |
| site shell first load | client route | 188,000 | 184,927 | 3,073 | 2026-11-18 |
| foldkit/pixel-art | client | 156,000 | 152,865 | 3,135 | 2026-11-15 |
| authoring | client | 155,500 | 152,229 | 3,271 | 2026-11-15 |
| foldkit/domains | client | 191,000 | 187,729 | 3,271 | 2026-11-11 |
| foldkit/ui-showcase | client | 202,000 | 198,063 | 3,937 | 2026-11-11 |
| domains-plus | client | 201,000 | 196,840 | 4,160 | 2026-11-15 |
| design-system | client | 151,500 | 145,005 | 6,495 | 2026-11-15 |
| cloudflare Worker | Worker | 4,577,000 | 4,546,351 | 30,649 | 2026-11-13 |

Notes on the table:

- The five tightest are `auth` (2 bytes), `cms` (5), `reference` (26), `foldkit/kanban` (48) and `registry` (91). `cloudflare` is over its ceiling by 276 bytes, so its test fails on this machine today; `domains-plus` Worker has 231 left.
- The `foldkit/<port>` budgets are one table in `examples/foldkit/test/bundle.test.ts`. The ports that carry no dated note since 2026-11-11 have not grown past their first reading plus about 2%.
- The domains-plus client reading here (196,840) is the budget test's build, against each package's `dist`. The phase-6 note's 212,869 below is a different build path of the same page and must not be compared with it.
- `examples/foldkit/domains-plus`, `cloudflare` and `chirp` have CPU budgets as well (`cpu.test.ts`); they are not bundle budgets and are not in this ledger.

## Budget notes (plan, Phase 0, item 3)

For each budget raised in the last week (its test file's dated comments, 2026-11-14 onward) and each with under 350 bytes of headroom: what grew, and whether every page under that budget runs it. "Runs it" means the code is in the page's bundle and reachable, not that a user presses something. Readings quoted from a comment are CI's or its author's; readings in the table are this ledger's.

**Shared causes, so each line below can be short.**

- **Remote since 0.43.0** (`packages/remote/src`): the read entry reuses its plan (`30d7a5fe0`, `3bf01ad1a`: `observeEntry`, `askReads`, `storeOnly`), reads and resumes name their store's path (`storePaths`), the store reports each write (`storeSteps.ts`, `editing`, `stepped`), and a read answered beside a pending write is kept for the stream (`keptOver` in `model.ts`, with `keepRead` in `liveEvents.ts`; `6782b2e93`). Every page that bundles `foldkit-remote` runs the first three. Only a page that keeps Remote's live capability carries `keepRead` itself: today `cloudflare`, `reference` and `registry` (`foldkit-remote/liveEvents.js` is in their bundles and in no other client page). Since Phase 5 item 5 (`684abd795`) it is in `keeping.ts` and every page with writes carries it, live or not; see "Phase readings".
- **Verdict** (`6e319f5ff`, 2026-11-21): `foldkit-entity` answers with metakit's `Verdict`, so every page that bundles `foldkit-entity` carries `metakit/verdict.js` (683 bytes minified, 310 brotli on its own). The plan's rule 2 allows exactly that module. Every page under `auth`, `cms`, `cloudflare`, `entity`, `reference`, `registry`, `chirp` and `api-cache` runs it. `domains-plus`'s client bundles entity and does not carry it.
- **`recipe.add` and `.style`** (2026-11-17 and 2026-11-19, `style.ts` of `foldkit-mixins`): +47 to +454 minified in every page that uses `Style`, which is every page that draws a recipe.
- **Expr and Mutation additions** (#600, 2026-11-19: `Expr.add`/`sub`/`implies`, `Entity.transition`, `decrement`, `Mutation.update`'s `input`): in `foldkit-entity` and `foldkit-remote`, so in every page that bundles them.

| Budget | What grew (last dated note, then the reading since) | Does every page under it run it |
| --- | --- | --- |
| cloudflare client (-276) | Last note 2026-11-19: CI read 224,160 after #600. Now 224,776, +616 over that reading; the candidates are the Verdict (310 brotli) and the Remote growth listed above. Not bisected, since the two share one tree. | One page, and it runs both: it carries entity (so Verdict) and Remote's live capability (so `keepRead`). The test is red until the ceiling is raised or the growth moved. |
| auth (2) | Last note 2026-11-19: CI read 228,029 after `.style` and #600. Now 228,498, +469: Verdict and Remote's reuse of plans. | One page; carries entity and Remote without the live capability, so no `keepRead`. |
| cms (5) | Last note 2026-11-19: CI read 164,044 after #600; the ceiling was raised 500 for it. Now 164,495, +451, the same shared causes. The studio and site chunks are counted apart (`cms studio`, `cms site` rows), and their ceilings carry no note. | The entry holds entity and Remote, which both applications share; each application's chunk runs them. |
| reference (26) | 2026-11-19 +650 (`.style` and #600); 2026-11-21 +300: a read answered under a pending write is read again (`6782b2e93`, +109 here by its author), the store's key bookkeeping and the plan reuse (`30d7a5fe0`). Now 252,274. | One page; carries the live capability, so runs everything listed, `keepRead` included. The note says aggregates, the declared-writes skip, declared forms and sync transitions were moved to subpaths first and are not in the page: confirmed, no `foldkit-remote/aggregate` module is in it. |
| foldkit/kanban (48) | 2026-11-18 +171: themed text selection (`defaults.ts`, `theme/oklch.ts`). Now 137,552, which is 206 over the 137,346 of that note; the note's later `recipe.add` (2026-11-17, in `style.ts`) and `.style` (2026-11-19) are the candidates. | Every port that draws a recipe runs `style.ts`; the ports that draw none do not. The port carries no Remote and no entity. |
| registry (91) | 2026-11-19 +650 (`.style`, #600); 2026-11-21 +300: the same Remote growth as `reference` (+73 here by its author); Sync's transition processing was moved out first (about -285). Now 262,209. | One page; carries the live capability and runs everything above, as `reference` does. |
| data-grid (152) | Last note 2026-11-15, 146,044 against 143,531; nothing in the dated notes since, so the 152 left is what the budget had. Now 146,848 (+804 since that note): not attributed. | The page carries no Remote and no entity; whatever grew is the grid or the shared Style. Not bisected. |
| foldkit/auth (167) | 2026-11-18: the Input recipe's grouped sides and variants (`recipes/field.ts`, `adornments`, `input`, `textarea`). Now 152,333, +447 over that note's 151,886: `.style` and the Style additions. | Runs every page that draws Input, Textarea or Field. No Remote. |
| foldkit/counter (214) | 2026-11-19 +151: recipe `.style` (116,286 reading). Unchanged since. | Every page drawing a recipe. |
| domains-plus Worker (231) | 2026-11-19 +5,000 (#600) and 2026-11-21 +4,700. The 11-21 note blamed 1.4 kB of `foldkit-remote` on no cause; the next section traces it. Now 3,277,469: 1,859 over the 3,275,610 of that note, which the Verdict (about 1.25 kB raw) and `keptOver` (0.45 kB) account for. | The Worker runs all of it: it renders the page, so it carries `foldkit-remote`'s model, store and read entry and `metakit/verdict.js`. `keepRead` is not in it (no `liveEvents.js`). |
| entity (379) | 2026-11-19 +1,000: CI read 221,307 after #600. Now 221,621, +314: Verdict and Remote. | One page; carries entity and Remote without live. |
| widgets (375) | 2026-11-18 +1,000: the start chunk's mixins-ui modules (toolbar, window list, Button recipe states) and `recipe.add`. Now 155,625, which is 348 over the 155,277 of that note: not attributed. | One page; no Remote, no entity. |
| chirp (1,342) | 2026-11-17 +494: `recipe.add`/default look (+145) and #593's `runtimeJson`, Remote's Model schema (+447). Headroom is above 350; listed because it was raised this week. | Every Remote page runs `runtimeJson`. |
| foldkit/form (414), foldkit/api-cache (828), foldkit/websocket-chat (739), foldkit/routing, shopping-cart, weather | Raised 2026-11-17 to 2026-11-19 by `recipe.add`, the Input recipe's new sides, `.style`, and for `form` `Entity.transition` (#600), each reading in its comment. | Each runs only what its page draws: Input, Textarea or Field for the first four; `api-cache` carries Remote and entity. |
| site (gallery 352, shell 3,073), todo-app (519) | `site`: the layout, data and chat families and the Primitives gallery (2026-11-18). `todo-app`: 2026-11-21 +4,200: the application opts into `foldkit-surface/writes` and carries 12.2 kB minified of metakit, 1.1 kB of writes, 1.1 kB of declarations, as its comment says. | `site`: the gallery chunk is loaded by component pages and no guide. `todo-app`: it is the one page that opts in, so every byte of the growth is used. Left alone: another session is editing it. |

### Where the Worker's 1.4 kB came from

The earlier estimate: `storeSteps.js` with `editing` and `stepped` in `store.ts` about 0.5 kB, `storePath.js` and its call sites about 0.3 kB, plan reuse in `observeEntry` about 0.5 kB. I checked it against `git diff v0.43.0..HEAD -- packages/remote/src` (v0.43.0 is `a6c1fe7d4`), without building the old tree, in two ways.

First, a per-module reading of the `foldkit-remote` files the Worker carries. Each file at `v0.43.0` and at `845d4b9c2` was compiled from TypeScript to JavaScript with esbuild, with no minifying, no comments and no tree shaking, and the sizes subtracted. That is an upper bound on what a module can add, since the bundle then drops unused exports:

| Module | v0.43.0 | HEAD | Change |
| --- | ---: | ---: | ---: |
| `domain.ts` | 31,692 | 32,599 | +907 |
| `storeSteps.ts` (new) | 0 | 512 | +512 |
| `model.ts` | 63,251 | 63,739 | +488 |
| `active.ts` | 2,386 | 2,703 | +317 |
| `remote.ts` | 47,613 | 47,821 | +208 |
| `storePath.ts` (new) | 0 | 107 | +107 |
| `resume.ts` | 10,116 | 10,199 | +83 |
| `store.ts` | 9,472 | 9,491 | +19 |
| Total (every other carried module unchanged) | 298,384 | 301,025 | +2,641 |

Second, the pieces as they sit in the Worker's bundle (`845d4b9c2`, 3,277,460 bytes in the file I kept; raw bytes of each statement, indentation included, tree shaking applied):

| Piece | Bytes in the Worker |
| --- | ---: |
| `stepped` and `editing` (`storeSteps.ts`); the registration function `watchStoreSteps` is not in the Worker | 377 |
| The 16 lines of `store.ts` that call `editing` | 580, replacing about 600 of inline `next ??= …` code, so net about +0 to +20 |
| `storePaths` and its five call sites (`domain.ts`, `remote.ts`) | 83 + 189 = 272 |
| Plan reuse in `observeEntry`: `valueAtPath` 227, `readValues` 135, the reuse test 289, `remember` 260, its calls and `last` about 75 | about 990 |
| `askReads` and `storeOnly` (`active.ts`) with their two call sites | 270 + 70 = 340 |
| `keptOver` and its two call sites (`model.ts`) | 241 + 211 = 452 |

Reading the two together:

- **Store bookkeeping: confirmed.** About 0.4 kB (377 for the two functions, net of the inline code they replaced), against the estimated 0.5.
- **`storePath.js` and call sites: confirmed.** 272 bytes gross and about 0.2 kB net of the inline expressions they replaced, against 0.3.
- **Plan reuse: corrected upward.** About 1.0 kB in `observeEntry` plus 0.34 kB in `active.ts`, so about 1.3 kB, against 0.5.
- **Missed by the estimate:** `keptOver` in `model.ts`, 452 bytes, from `6782b2e93` (a read answered beside a pending write, #480). The Worker has no live capability, so the `onNone` branch is all it runs.
- The three estimates add to 1.3 kB, which is why the comment said about 1.4. With the correction, `foldkit-remote`'s growth in the Worker since v0.43.0 is about 2.4 kB raw (the module table's 2.6 kB less the 0.14 kB of `watchStoreSteps` that the bundler drops).

Part of that growth was already inside the 2026-11-19 ceiling, which was raised for #600 after `3bf01ad1a` and `30d7a5fe0` were not yet in. That is why no single date accounts for 1.4 kB.

### Opt-in code that pages carry without using it

Listed with its bytes and file for a later bout. Nothing here was moved.

| What | Where | Bytes | Who carries it without using it |
| --- | --- | ---: | --- |
| `keptOver`, the call to Remote's live capability from each read answer | `packages/remote/src/model.ts` | 452 raw in the Worker; about 150 brotli est. in a client page | Every Remote page without live reads (`auth`, `cms`, `chirp`, `entity`, `api-cache`, `domains-plus` client and Worker). The call could be a method of the live capability that takes the model, so a page without it loses the `Option.match` and the two call sites. |
| `editing`'s `keys` array and `stepped`'s indirection: they exist only to feed `watchStoreSteps`, which `foldkit-remote/aggregate` calls | `packages/remote/src/storeSteps.ts`, `store.ts` | about 150 raw (`keys` array, push, the `stepped` wrapper); the registration itself is already dropped | Every Remote page, since `store.ts` imports the module. A store without a watcher could use the plain `{ ...store }` path. |
| `restores: storePaths(domain.store)` in the resume part | `packages/remote/src/resume.ts` | 83 raw | Every page that resumes Remote; only a server-rendered page uses it. |
| `metakit/store.js`, the store check run at set-up | `packages/metakit/src/store.ts`, imported by `foldkit-remote-server`'s main entry | 1.1 kB raw, plus about 700 in `remote-server` | Every server. Intended by the plan's rule 2 (runs on a server only), but the `api-cache` client page carries `metakit/store.js` because it runs its server in the browser. |
| `metakit/verdict.js` | `packages/metakit/src/verdict.ts` | 683 minified, 310 brotli; 1,249 raw | Every page that bundles `foldkit-entity`. Allowed by rule 2. |

Not opt-in, so not listed: plan reuse in `observeEntry` and `storePaths` in the read paths, which every Remote page's reads use; the `todo-app` metakit code, which the application opts into.

## Published-build rows

`scripts/test/publishedBuild.test.ts` asserts that a main entry keeps no metakit module but `verdict`. It had rows for `foldkit-form`, `foldkit-guard` and `foldkit-sync`. This bout adds `foldkit-agent` (`Agent.forApplication`) and `foldkit-mixins-form` (`FormView.define`), each built from the package's own `tsdown.config.ts` and from source.

To prove they can fail, a module-level `import { Expr } from 'metakit'` with `console.log(Expr)` was added by hand to `packages/agent/src/naming.ts` and to `packages/mixins-form/src/index.ts`. Both rows went red, listing the metakit modules `Expr` reaches (`node.ts`, `path.ts`, `ops/core.ts`, `expr.ts` and more; 20 entries for the agent row). Both files were then restored from a copy made first; `git status` shows no change to either. The three older rows and the two new ones pass.

The `foldkit-agent` row checks that a page keeps some module of the package's source, not `src/index.ts`, because that file only re-exports a namespace and a page keeps the modules the namespace reaches.

## Numbers of the phase 6 note

Copied from `docs/design/metakit-phase-6-DESIGN.md`, taken at commit `c671476ec` (2026-11-21) by `node scripts/phase6-baseline.mjs`: Windows 11, Ryzen 7 6800U, Chromium 156.0.8078.4, CPU slowed 4 times, a fresh browser context per run, 7 runs after 2 warm-ups, the whole script run twice. The tree also held another session's uncommitted edits to four files of `packages/remote/src`. The page is domains-plus over `/?q=acme`, built as its own `vite build` does, so its script figure is not comparable with the budget table above.

**Bytes.** These repeat exactly, apart from a time the page stamps (about 30 bytes of compressed HTML).

| What | Bytes |
| --- | ---: |
| The page, HTML | 89,167 (6,016 to 6,044 brotli) |
| Resume envelope, as written in the page | 10,769 |
| Resume envelope, JSON | 10,741 (857 brotli) |
| of which `parts.remote`, the rows read | 7,923 |
| of which `bindings`, which element sends which Message | 2,437 |
| of which `state` (five fields) | 259 |
| of which `events`, `route`, `plan`, `v` | 48 |
| Script loaded before takeover (one file) | 877,636 (212,869 brotli) |

**Time at 4x CPU.** Median of 7, with the least and most in brackets. The two columns are the two runs of the script.

| What | First run, ms | Second run, ms |
| --- | ---: | ---: |
| Blocking, every long task | 1,474 (1,441 to 1,643) | 1,522 (1,468 to 1,651) |
| Blocking past 50 ms per task | 1,324 (1,291 to 1,443) | 1,372 (1,318 to 1,498) |
| Longest task | 1,207 (1,172 to 1,284) | 1,241 (1,191 to 1,317) |
| Takeover, from navigation start | 1,333 (1,245 to 1,382) | 1,364 (1,240 to 1,419) |
| Press at rest: input delay | 4.6 (3.6 to 6.5) | 4.7 (3.4 to 5.4) |
| Press at rest: to next paint | 104 (88 to 152) | 104 (88 to 120) |
| Press at rest: to the cart showing it | 280 (223 to 346) | 279 (236 to 292) |
| Press at `load`: input delay | 4.2 (3.0 to 5.3) | 4.1 (3.2 to 5.1) |
| Press at `load`: to next paint | 104 (96 to 120) | 104 (88 to 112) |
| Press at `load`: to the cart showing it | 706 (583 to 737) | 675 (636 to 736) |

A later difference counts only when it is larger than the widest range seen for that figure: 202 ms for blocking, 179 ms for takeover, 154 ms for the press at `load`, 123 ms for the press at rest, 64 ms for time to next paint. With Foldkit's own timing switched on (`--phases`), before takeover the view ran for 203 ms (193 to 238) and the patch that matches it to the served elements for 121 ms (98 to 136).

## Redraw time

`scripts/render-baseline.mjs` times each `view` and `patch` Foldkit runs, per Message, using Foldkit's own `slow` probe. It builds the app for production, serves it and drives headless Chromium. `--app domains` serves domains-plus through `wrangler dev --local`, which this bout was told not to run, so only the data grid was read; the domains-plus redraw numbers are still to take.

Data grid (100,000 rows), taken at `845d4b9c2`, 2026-11-21, Windows 11, Ryzen 7 6800U with 16 threads, 28 GiB, Chromium 156.0.8078.4, headless, 1440 by 900, CPU not slowed, 10 repetitions after 3 warm-ups. The run took 25 seconds. The frame is named by its last Message; "its update" is the time the `update` function took.

| Interaction | Last Message of the frame | Frames | View ms, median (p10 to p90) | Patch ms, median (p10 to p90) | Max view / patch | Its update, median |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| select a cell | `GotGridMessage/CellPressed` | 10 | 3.6 (3.3 to 4.1) | 0.6 (0.4 to 0.9) | 5.3 / 1.1 | 0.1 |
| scroll a page | `GotGridMessage/Measured` | 10 | 8.9 (2.6 to 12.9) | 2.5 (2.3 to 3.1) | 14.9 / 3.7 | 0.1 |
| edit a cell | `GotGridMessage/CellPressed` | 10 | 2.5 (2.4 to 2.7) | 0.4 (0.3 to 0.4) | 3.1 / 0.5 | 0.1 |
| edit a cell | `GotGridMessage/EditStarted` | 10 | 2.5 (2.2 to 2.7) | 1.5 (1.3 to 1.6) | 2.7 / 1.7 | 0.1 |
| edit a cell | `GotGridMessage/EditCommitted` | 10 | 19.4 (17.7 to 23.5) | 1.8 (1.7 to 2.5) | 24.9 / 6.0 | 5.2 |
| edit a cell | `GotGridMessage/EditChanged` | 5 | 2.0 (2.0 to 2.4) | 0.3 (0.2 to 0.4) | 2.6 / 0.4 | 0.0 |

## Type-check time

`pnpm exec tsc -b <project> --force --extendedDiagnostics`, one project at a time, at `845d4b9c2` (TypeScript 7.0.2, the native checker), on a machine another session was also using. `--force` rebuilds every project the named one references, so there are two readings: the named project alone and the aggregate over the projects it forced. The time of a native checker this short is mostly start-up and varies by tens of milliseconds between runs; the instantiation count does not vary.

| Project | Projects built | Its own check time | Its own instantiations | Aggregate check time | Aggregate instantiations | Aggregate total time |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `packages/entity` | 3 | 0.581 s | 878,257 | 0.709 s | 994,043 | 1.318 s |
| `packages/remote` | 6 | 1.290 s | 1,898,977 | 2.304 s | 2,836,837 | 3.484 s |
| `examples/reference` | 50 | 2.098 s | 3,376,808 | 51.232 s | 24,267,193 | 51.183 s |

Phase 1, step 10, read on 2026-11-22 the same way, before at `8c1dc9a7b` and after at `f5a752354`, on a machine short of memory with other sessions at work (the times vary by seconds; the counts do not):

| Project | Its own check time | Its own instantiations | Aggregate check time | Aggregate instantiations |
| --- | ---: | ---: | ---: | ---: |
| `packages/entity`, before | 0.996 s | 911,679 | 1.230 s | 1,082,947 |
| `packages/entity`, after | 0.610 s | 828,950 | 0.777 s | 1,000,734 |
| `examples/reference`, before | not read | not read | 66.793 s | 23,692,274 |
| `examples/reference`, after | not read | not read | 49.428 s | 23,862,964 |

Entity's own instantiations fell 9%; reference's aggregate rose 0.7%. The note predicted about equal counts, and the plan's bar (15% over the recorded time) holds.

Phase 3 readings at `89fd7eb7a` with TypeScript 7.0.2 in the shared worktree. Run `pnpm exec tsc -b examples/todo-app examples/reference examples/foldkit/domains-plus --force --extendedDiagnostics --verbose --pretty false` and read each example's project block. The command built 53 projects in 105.287 s. It exited with TS2307 because the shared Remote refactor removed `foldkit-remote/aggregate` ahead of the Plus alias update. Use a clean build for a gate comparison.

| Project | Own check time | Own instantiations |
| --- | ---: | ---: |
| `examples/todo-app` | 4.202 s | 2,177,856 |
| `examples/reference` | 3.360 s | 3,071,559 |
| `examples/foldkit/domains-plus` | 7.699 s | 2,177,516 |

## Dependency checks

Phase 2 readings at `be8cf74ef` in the shared worktree with the maintained-values refactor in progress. The machine was an AMD Ryzen 7 6800U on Windows 11 with Node 22.23.4. The graph timings use a Node unit test with five warm-ups and 20 samples. Build the modules before timing. Time `Graph.of` with `performance.now()` and report the median and range.

| Module | Readers | Writers | Median | Range |
| --- | ---: | ---: | ---: | ---: |
| reference | 3 | 3 | 0.090 ms | 0.067–0.179 ms |
| todo-app | 5 | 34 | 0.248 ms | 0.203–2.965 ms |

Put the probe in `scripts/test/metakitGraphReading.test.ts` with `// @vitest-environment node`. Import `Graph` from `packages/surface/src/graph.ts` and `Module` and `Surface` from `packages/surface/src/index.ts` by relative path. For reference, construct `reference = Module.make(App, [Data, Session, Surface.contract(NotebookPage, { viewer: 'reader' }), Surface.contract(NotePage, { id: 'note' })])` with the exports from `examples/reference/src/main.ts`. Call `Graph.of(reference)` for every sample. For todo-app, call `Graph.of(TodoModule, { machine: todoMachine, sends: declared.messageEdges })` with the exports from `module.ts` and `surface.ts`. Reuse the assembled module for each run and count `graph.dependencies.readers.size` and `graph.dependencies.writers.size`. Run `pnpm exec vitest run scripts/test/metakitGraphReading.test.ts --project unit --maxWorkers=1 --silent=false`.

At the same snapshot, the Todo test “draws only the Surfaces that read a field a Message declares it writes” counted one renderer call each for `DraftChanged` (Composer), `FilterSelected` (Board) and `RenamedList` (Header), with zero calls to the other instrumented renderers after each Message. The Remote test “without building the ask while the store is the same and the ask reads nothing else” counted zero additional projection builds for two draft changes, then one after the store received the answer. Re-run with `pnpm exec vitest run examples/todo-app/test/machine.test.ts packages/remote/test/readEntryReuse.test.ts --project unit --maxWorkers=1`.

## Todo handler size

Phase 3's 23 matching Todo handlers have a median of 4 lines in the handwritten update and 7 in the declared machine. The median of the per-handler ratios is 1.57, above the 1.5 target. Each property span includes its internal comments, blank lines and any state or input declaration. Count shared helpers separately when comparing complete implementations.

Read the original handler object from `Message.match` in `git show "70585f667^:examples/todo-app/src/app.ts"` and the new object from `transitions` in `examples/todo-app/src/machine.ts` at `be8cf74ef`. Parse both files with `typescript-6`'s `createSourceFile`. Match members by Message name and count the lines from `property.getStart(source)` through `property.end`, inclusive. The only unmatched declared handler is the later `ListRenameRequested`. The unmatched handwritten handlers are `UrlChanged` and `MirrorRestored`, which `makeMachine` delegates to the mirror adapters.

## Phase readings

Add a row per phase and per budget it touches. Keep the earlier rows.

| Phase and step | Budget or measure | Before (commit) | After (commit) | Note |
| --- | --- | --- | --- | --- |
| Phase 0, items 2 and 3 | every budget above | none | `845d4b9c2` | this ledger |
| Phase 2 (dependency graph) | `metakit/graph/match` isolated subpath | `graph.ts` pulled `expr`/`sqlLowering` | `40a0a1c13` | `dist/graph/match.js` 1.09 kB gzip; zero `ops/residualize` or `sqlLowering` |
| Phase 1 (soundness model) | TLC2 v2.19 model check | none | `781288b97` | `MetaKitSoundness.tla` models Phase 1's soundness rules (a model beside the code, not a proof of it). Its count (81 states, 0 errors) is as reported then, unverified: nobody re-ran TLC for this ledger |
| Phase 2 (invalidation model) | TLC2 v2.19 model check | none | `781288b97` | `WritesInvalidation.tla` models the rule `Writes` keeps drawings by; it does not verify the `Writes` code. Its count (69,504 distinct states, depth 13, 0 errors) is as reported then, unverified: nobody re-ran TLC for this ledger |
| Phase 3 gate (`examples/todo-app`) | Messages declared | 11 of 25 (`70585f667`) | 25 of 25 (`92d3114e2`) | 23 pure transitions + 2 `Transition.opaque` (`UrlChanged`, `MirrorRestored`). `Transition.opaque` Messages are ordinary code declared by their paths: they do not count as declared for the Phase 3 gate, and 23 of 25 passes the >=21 bar without them. At `31b10117c` the application has 26 Messages (`ListRenameRequested` added), 24 pure and the same 2 opaque |
| Phase 3 gate (`examples/todo-app`) | Command-sending Messages via `Declared.of` | 0% (`70585f667`) | 100% (`92d3114e2`) | At `92d3114e2` all 7 emitted record tags (`Rename`, `Focus`, `Mint`, `Delete`, `FocusNeighbour`, `ExpireUndo`, `Restore`) routed through `todoCommands`; `app.ts` and `surface.ts` together -44 lines (-49 and +5). `6f6257848` replaced `Mint` with supplied values and the record `Submit`; today there are eight tags (`RenameList` added) |
| Phase 3 gate (`examples/todo-app`) | `tsc -b examples/todo-app` | none | 3.034 s, 2,114,035 own instantiations: unverified | read by hand and recorded at `9d82ad7a2` without a command or commit that produced them; nobody re-ran it. `21bbb5355` is not a measurement commit (it adds `GraphEdge.Sends`) |
| Phase 3 gate (`examples/todo-app`) | client brotli (`bundle.test.ts`, ceiling 173,500) | 171,558 (2026-11-21, the comment in `bundle.test.ts`) | 173,086 (`31b10117c`, read 2026-11-22 with `node scripts/bundle-report.mjs examples/todo-app --rebuild --json`, after rebuilding `foldkit-sync` and `foldkit-surface`) | +1,528 over the earlier reading, from every change in the tree since (`fromMachine` in the page, `ListRenameRequested`, step 10's `todo-app` +284); not split by cause. 414 bytes of headroom |
| Phase 3 gate (`examples/foldkit/domains-plus`) | Messages declared | none | 0 of 39 own Messages (`31b10117c`) | counted from `own` in `src/client/message.ts`; the application has no Machine yet (the plan gives it one in Phase 3), so the plan's "three in four" is not measured. An earlier note listed 41 Messages as 19 pure and 22 `Transition.opaque`: unverified, off by two on the count, and `Transition.opaque` Messages are not declared for this gate |
| Phase 1, step 5 (`66d25a4ed`, `b61064cb4`, `12a8b4f7b`) | the six Remote and entity page budgets | pre-step-5 ceilings below | raised by the readings below (+300) | entity's judge on metakit through the translation layer; see "Owed by step 10" |
| Lean judge (`103e5f790`) | the six Remote and entity page budgets | the step-5 readings below | 331 to 606 brotli lower each; ceilings lowered to reading +300 | the page judges without partial evaluation; see "After the lean judge" |
| Phase 1, step 7 (`c02c2dcf1`) | registry, cms client, cms studio first load | 269,436, 171,569, 379,499 (`c02c2dcf1~1`'s entity, in the tree of `3a69bedb5`) | 269,417, 171,654, 379,607 (`c02c2dcf1`) | `Laws` left the main entry and `bounds.ts` was deleted; minified bytes identical, so no change to what a page runs; see "Laws on metakit's checker" |

| Phase 1, step 10 (`207a36783` to `f5a752354`) | every Remote page, the cms routes, both Workers | the readings at `8c1dc9a7b` | 1,511 to 2,796 brotli lower each (todo-app +284); ceilings at reading +300, permanent | constructors build metakit nodes, the layer deleted, `Rows` reading on demand; see "Closed by step 10" |
| Phase 5, item 5 (`684abd795`, `59eca3d44`) | registry, cloudflare, reference, auth, cms, todo-app client (ceilings 268,160, 229,839, 259,060, 234,141, 169,656, 173,500) | 267,887, 229,668, 258,635, 233,806, 169,472, 173,217 (`ba59e6c73`) | 267,799, 229,808, 258,771, 233,647, 169,565, 173,217 (`59eca3d44`) | a read's kept values move from the live capability to the layer capability (`keeping.ts`). Minified, every Remote page is 83 to 94 bytes smaller (`model.ts` loses the `Option.match` on the live capability); the brotli moves of -159 to +140 come with no minified growth. No ceiling raised. The first after-reading, with the keeping code still in `kept.ts`, put 1.3 kB minified (+256 brotli) into cms's first chunk, whose writes load later; `59eca3d44` moved it out. `todo-app` bundles no Remote. All readings with `node scripts/bundle-report.mjs examples/<name> --json`, one at a time, after `pnpm --filter foldkit-plus build` (the reference build otherwise fails on a missing `dist/mixins/foundations.mjs`) |
| Phase 5, item 10 (`ca26ec8cf` to `c0197407e`) | registry, cloudflare, reference, auth, cms, todo-app client (ceilings 268,160, 229,839, 259,060, 234,141, 169,656, 173,500) | 268,022, 229,810, 258,511, 233,569, 169,443, 173,138 (`55bb49d7b`) | 268,431, 229,953, 259,066, 233,495, 169,449, 173,138 (`c0197407e`) | one rule replays a pending write over a newer value: `foldkit-remote/replay.js` replaces `keeping.js` (+362 minified), metakit's `ops/ways.js` rows for `set` and `add` (+251) and the call sites in `model.js` and `layers.js` (+96), about 710 minified on each page whose start bundle has the layer capability (registry, cloudflare, reference). The first reading kept the whole table (852 minified) because a bundler keeps an object spread; the table is now built from literals and Remote imports the two rows. auth and cms load the layer capability after their start bundle and moved by noise; `todo-app` bundles no Remote. Ceilings raised to the reading plus 300: registry 268,731, cloudflare 230,253, reference 259,366. Same method as item 5 |
| Phase 5, item 10 follow-up (`1b78d2cdd`) | registry, cloudflare, reference client (ceilings 268,731, 230,253, 259,366) | 268,315, 230,055, 258,789 (`6dab5aff3`) | 268,224, 229,897, 258,947 (`1b78d2cdd`) | an `add`'s answer equal to its replay settles without a read only at the revision right after the newer value (`rightAfter` in `replay.ts`): +139 to +163 minified on each page; the brotli moves of -158 to +158 are noise around that. No ceiling raised. Same method as item 5, after `pnpm --filter foldkit-remote build` |
| Phase 5 review, findings 1 and 6 (`bad8758c4` and the revision answer after it) | registry, cloudflare, reference client (ceilings 268,731, 230,253, 259,366); cloudflare and domains-plus Worker (ceilings 4,654,152, 3,293,703) | clients 268,333, 230,170, 258,918; Workers 4,649,541, 3,293,877 (`331a7de4b`) | clients 268,449, 230,009, 259,048; Workers 4,650,074, 3,293,877 with `bad8758c4` alone, 4,652,596, 3,294,985 with the revision answer | a read beside a pending `add` no longer has the amount added (`included` in `kept.ts`, `unincluded` in `optimistic.ts`): +281 to +298 minified on each client page; the brotli moves of -161 to +130 are noise around that. A writer answers the row's revision (`EntityWriter.revision`, the Drizzle and memory writers' `revision` option, the guard's pin) and the mutate handler keeps it: +2,522 raw on the cloudflare Worker and +1,108 on domains-plus, server code every server with declared writes runs. No ceiling raised. domains-plus was over its ceiling by 174 at `331a7de4b`, before this change, and is over by 1,282 after it; it is left for the coordinator, since the rule raises a ceiling only one change alone exceeds. Clients with `node scripts/bundle-report.mjs examples/<name> --json`, Workers with `measureWorker` and `measureServer` as their tests call them, one at a time, after `pnpm --filter foldkit-remote build` |
| Phase 5 review, store findings 3, 7 and 8 (`89bc972e1` to `ab41873a8`) | cloudflare and domains-plus Worker (ceilings 4,654,152, 3,295,285) | 4,652,596, 3,294,985 (the row above, with the revision answer; no reading at `c645f76b7` in a clean tree) | 4,660,217, 3,297,496 (`ab41873a8`) | a delete through an onDelete relation, and a link through one, held to the store in `RemoteServer.write`; the Drizzle writer's link check and foreign-key reading; `Judged` gains `constraint`; a Sync host holds a document's laws to its journal's store. Estimated per module with esbuild (TypeScript to JavaScript, no minifying, each file before and after each commit): +6,231 raw on the cloudflare Worker (remote-drizzle 3,248, remote-server 2,247, sync 465, metakit 273), +2,520 on domains-plus (remote-server and metakit). domains-plus moved +2,511, all of it this change; cloudflare +7,621, of which about 1,390 is other sessions' metakit and sync changes in between. Ceilings raised to the reading plus 300: 4,660,517 and 3,297,796. Workers with `measureWorker` and `measureServer` as their tests call them, one at a time, after building the six changed packages. CI read cloudflare at 4,666,028 before this change, over its ceiling then |
| Phase 5 review, store findings: the independent review's fixes | cloudflare and domains-plus Worker (ceilings 4,660,517, 3,297,796) | 4,660,217, 3,297,496 (`ab41873a8`) | 4,664,580, 3,298,462 (the fix's tree, over `1b401baa4`) | `RemoteServer.memoryWriter` checks a link through an onDelete relation (+912 estimated, both Workers); the Drizzle writer leaves unset columns to the table's defaults (+182, cloudflare). domains-plus moved +966, raised to the reading plus 300 (3,298,762). cloudflare moved +4,363, of which 3,269 came with other sessions' commits between (`9bf8c0510`, `1b401baa4`); raised by this change's estimate only, to 4,661,611, so it stays over by that growth. Same method as the row above |

## Owed by step 10

**Closed on 2026-11-22: see "Closed by step 10" below.** Step 5 put entity's in-memory judge on metakit through a translation layer (`lower.ts`, `lowerEnv.ts`, `lowerOperator.ts`). Every page that reaches entity grew by about 7.4 kB brotli. The coordinator accepts the growth until step 10, because the layer is temporary. Each ceiling was raised on 2026-11-21 to the reading plus 300 bytes, with a dated comment in its budget test. **Step 10 must bring each back to its target.**

| Budget | Pre-step-5 ceiling (target) | Reading at step 5 | Ceiling now | Forecast after step 10 (estimate) | Step 10 must remove |
| --- | ---: | ---: | ---: | ---: | ---: |
| cloudflare | 224,500 | 232,465 | 232,765 | 230,500 to 231,800 | 7,965 |
| cms | 164,500 | 171,911 | 172,211 | 170,000 to 171,300 | 7,411 |
| reference | 252,300 | 260,108 | 260,408 | 258,200 to 259,500 | 7,808 |
| auth | 228,500 | 235,875 | 236,175 | 234,000 to 235,200 | 7,375 |
| registry | 262,300 | 269,797 | 270,097 | 267,900 to 269,200 | 7,497 |
| entity | 222,000 | 229,410 | 229,710 | 227,500 to 228,800 | 7,410 |

The forecast is not met: deleting the layer is expected to return about 0.6 to 1.9 kB of the 7.4 to 8.0 kB (estimated from minified size at each page's brotli ratio, 0.275 to 0.277; not a build with the modules removed). Registry, minified: `lower` 2,332, `lowerEnv` 2,536, `lowerOperator` 2,072 (6,940, about 1,900 B brotli if all three go; `lowerEnv` and `lowerOperator` may survive as the environment and foreign-operator code the direct constructors still need, leaving `lower` alone at about 640 B). What stays after step 10 is metakit's own code the page runs (22.5 kB minified: `ops/residualize` 3,886, `node` 3,608, `ops/rows` 2,766, `ops/kind` 2,641, `properties` 1,947, `ops/eval` 1,619, `ops/residualizeRows` 1,207, `ops/str` 1,081, the rest about 3.8 kB), plus entity's `rowOrder`, `judgeRun`, `queryErrors`, `pins` (4.4 kB), against the old `evaluate.js` that went (10.9 kB). Reachable waste in that code, not yet removed (minified, from reading the sources; the `properties` and `kind` figures are esbuild minifications of the pieces): `ops/rows` and `ops/residualizeRows` (3,973, no page budgeted here calls `Expr.exists`), the part of `properties` that only the checker, aggregates and transitions read (about 1,150), `ops/kind`'s `isInteger` and the length bounds of `textChecksOf` (about 450). Together about 5.6 kB minified, 1.5 kB brotli. Even with that and the whole layer gone, about 4 kB of the debt would remain unless `expr.js` (27.6 kB minified) shrinks when its constructors build metakit nodes directly.

The kernel note's prototype (25,300 against 32,639 brotli) measured a page with three temporary constructors and none of `expr.js` (21,360 minified, all of entity's other constructors, `Query`, relations, ordering, dependencies, `show`), and with `ops/rows`, `residualizeRows`, `properties` and the larger `kind` and `node` absent (8,028 of metakit against 22.5 kB now). It replaced all of entity's expression code with three constructors; the real page keeps all of it.

### After the lean judge (2026-11-21, `103e5f790`)

A page now judges held rows with `judgeNode` and `settleNode` (`ops/judge.ts`), which evaluate with "not yet known" as a value and never build the expression partial evaluation leaves. The rules are stated once (`ops/laws.ts`, `ops/partial.ts`, `ops/partialRows.ts`) and read by both readers; `residualizeNode` stays for `Graph.pruneStatic`, `queryReadiness`, SQL statements and `Expr.residualize`, none of which a budgeted page loads. One meaning is held by two differentials against `residualSettled` of `metakit/conformance` (16,000 seeded random expressions in metakit; every judgement entity's tests make, 646 tests' worth) and `packages/metakit/test/lean-judge.mutations.ts`. Each page measured with `scripts/bundle-report.mjs` against fresh `dist`s, before and after, in one tree:

| Budget | Target | Before (step 5) | After | Ceiling now | Still owed |
| --- | ---: | ---: | ---: | ---: | ---: |
| cloudflare | 224,500 | 232,465 | 231,859 | 232,159 | 7,359 |
| cms | 164,500 | 171,911 | 171,580 | 171,880 | 7,080 |
| reference | 252,300 | 260,108 | 259,576 | 259,876 | 7,276 |
| auth | 228,500 | 235,875 | 235,368 | 235,668 | 6,868 |
| registry | 262,300 | 269,797 | 269,371 | 269,671 | 7,071 |
| entity | 222,000 | 229,410 | 228,876 | 229,176 | 6,876 |

A cloudflare reading of 241,406 reported earlier on 2026-11-21 was not reproduced: the page read 232,465 at `e40e4ffd6` and 231,859 after, and its budget test passes, with no package more than 0.1 kB apart between the two. `bundle-report.mjs` rebuilds a stale `dist` itself, and on this day its rebuild of `foldkit-plus` left `dist/mixins/foundations.mjs` out (the reference page failed to build until `pnpm --filter foldkit-plus build`), so a reading taken over such a `dist` measures another program.

Registry, minified, metakit's share went from 22,564 to 20,024 bytes: `ops/residualize` (3,899), `ops/residualizeRows` (1,212), `properties` (1,948) and most of `ops/reads` (685 to 182) left, `node` fell 3,622 to 2,007 (`Node.key` is no longer reached), `ops/kind` 2,654 to 2,245 (the length bounds of `textChecksOf` moved to `ops/textChecks.ts`), `ops/eq` lost its folds (819 to 689); `ops/judge` (2,844), `ops/laws` (2,575), `ops/partialRows` (1,185) and `ops/partial` (626) came in. `isInteger` was already tree-shaken off every page, so moving it saved nothing.

Not removed: `ops/rows` (2,773) and the `Rows` reading. Registering them from the `Rows` constructors and `Expr.exists` would not take them off: `Expr` is one object, so every page that names it keeps `existsOf` (found in the registry bundle) and with it whatever `existsOf` imports. It holds once step 10 splits `expr.ts` into named exports; then `ops/rows`, `ops/partialRows` and the `Rows` case of `ops/eval` (about 4.2 kB minified, about 1.15 kB brotli) can arrive only with `exists`.

The Worker bundles, raw bytes, after (neither ceiling raised; the coordinator decides those): `examples/foldkit/domains-plus` 3,328,366 against 3,277,700 (it read about 3,333,078 after step 5); `examples/cloudflare` 4,636,820 against 4,577,000 (it read 4,636,226 before this change in another tree, with about 19 kB of step 8's `remote-drizzle` lowering in it; not measured before and after in one tree here, so the +594 is not attributed). A Worker carries both readers.

### Guard on the translation (Phase 1, step 9, `d78fa53c1`)

`foldkit-guard`'s condition evaluator, its page-side judge and `may`'s prediction now read each row guard through `foldkit-entity/lowering` and metakit's `settleNode` and `judgeNode`, instead of calling entity's `evaluateEach` and `Judge.predicate` per guard and joining the answers with its own `every` and `some`. Each page read with its budget test (`PERF_REPORT`), one at a time, in one tree: before with `packages/guard/src` as at `0bf652dcc`, after as at `d78fa53c1`. Another session was building in the tree, and two of the first after-runs failed to build; each reading below is from a run that passed.

| Budget | Before | After | Change | Ceiling |
| --- | ---: | ---: | ---: | ---: |
| cloudflare | 232,195 | 232,085 | −110 | 232,159 |
| reference | 259,541 | 259,853 | +312 | 259,876 |
| registry | 269,417 | 269,504 | +87 | 269,671 |
| auth | 235,209 | 235,565 | +356 | 235,668 |

Deleting guard's own joining did not shrink the pages that predict `may` (reference, auth): what replaced it (building one metakit expression of the guards, a stored row as a holder, the refusal of a malformed link) is larger than the `Match` over the condition it replaced, and the translation and judge it calls were on those pages already through entity's judge. Every budget still passed at `d78fa53c1`; reference had 23 bytes of headroom. After the review's fix (`528df1f53`, a principal's field no reader agrees on refuses the rule, so `Condition.holds` and `residual` read the guards' inputs) the pages read cloudflare 232,233, reference 259,946, registry 269,537 and auth 235,762: cloudflare, reference and auth over their ceilings by 74, 70 and 94 bytes. No ceiling was raised; the coordinator decides. Chirp read 252,667 against its 245,700 ceiling in the same run, not measured before this step, so not attributed. Step 10 owes these with the rest: `Condition.holds` and `Condition.residual` are server-side and sit on the page only because `Condition` is one exported object.

**Forecast for step 10 on top**, from minified sizes at a 0.275 brotli ratio, not a build: deleting `lower`, `lowerEnv` and `lowerOperator` (6,927 minified in registry) returns 0.6 to 1.9 kB; the `Rows` reading off pages that do not call `exists`, once `expr.ts` is split, about 1.15 kB more. That leaves about 3.8 to 5.6 kB of each page's debt, unless the split of `expr.js` (27.7 kB minified) itself returns it.

### Closed by step 10 (2026-11-22, `207a36783` to `f5a752354`)

Entity's constructors build metakit nodes (`207a36783`), `lower.ts` and `lowerOperator.ts` are deleted and `lowerEnv.ts` is `environment.ts`; `Expr`, `Query` and `Order` are namespaces, so a page keeps only the members it calls; metakit's reading of `Rows` arrives with the first `Rows` node built (`e5eb986d4`, `2e15048c8`: `ops/rowsReading.ts`, `ops/rowsLoad.ts`), so a page that never asks `Expr.exists` keeps neither `ops/rows` nor `ops/partialRows`, and a page that runs list folds without judging keeps `ops/rows` alone. Each page read with `scripts/bundle-report.mjs`, one at a time, before at `8c1dc9a7b` and after at `f5a752354`, with fresh `dist`s (the before reading of `reference` after `pnpm --filter foldkit-plus build`, for the reason above). The tree also held commits of another session between the two (`f406360c3`, metakit's SQL `num.add`/`num.sub`; `c66424a55`, sync's README), which no client page measured here runs.

| Budget | Target (pre-step-5) | Before | After | Change | Over target | Ceiling set |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| cloudflare | 224,500 | 232,300 | 229,539 | −2,761 | 5,039 | 229,839 |
| cms | 164,500 | 171,585 | 169,356 | −2,229 | 4,856 | 169,656 |
| cms studio first load | 372,500 | 379,562 | 377,768 | −1,794 | 5,268 | 378,068 |
| cms site first load | 328,500 | 333,714 | 331,814 | −1,900 | 3,314 | 332,114 |
| reference | 252,300 | 260,376 | 257,608 | −2,768 | 5,308 | 257,908 |
| auth | 228,500 | 235,736 | 232,966 | −2,770 | 4,466 | 233,266 |
| registry | 262,300 | 269,570 | 267,860 | −1,710 | 5,560 | 268,160 |
| entity | 222,000 | 229,294 | 226,807 | −2,487 | 4,807 | 227,107 |
| chirp | 245,700 | 252,677 | 250,791 | −1,886 | 5,091 | 251,091 |
| todo-app | none (173,500 ceiling) | 172,648 | 172,932 | +284 | none | 173,500, unchanged |
| domains-plus Worker (raw) | 3,277,700 | 3,331,100 | 3,292,063 | −39,037 | 14,363 | 3,292,363 |
| cloudflare Worker (raw) | 4,577,000 | 4,645,318 | 4,639,160 | −6,158 | 62,160 | 4,639,460 |

Minified, by package, before and after (`sizes` of each report):

| Page | foldkit-entity | metakit |
| --- | ---: | ---: |
| cloudflare | 79,708 → 72,698 | 20,533 → 15,758 |
| cms | 61,348 → 54,135 | 20,524 → 15,885 |
| reference | 83,509 → 76,566 | 20,857 → 16,074 |
| auth | 55,973 → 47,347 | 19,698 → 15,218 |
| registry | 77,933 → 73,413 | 20,617 → 16,634 |
| entity | 82,319 → 76,123 | 20,534 → 15,892 |
| chirp | 83,473 → 76,531 | 22,941 → 18,182 |

So of each page's fall, about 1.2 to 2.4 kB brotli is entity's (the layer gone, `expr.js`'s 27.6 kB replaced by modules a page keeps by name) and about 1.1 to 1.3 kB metakit's (the `Rows` reading). todo-app grew 284: its list folds read through the new indirection (260 minified, the slot and its message); with judgement loaded too it had grown 722, which is why a list fold loads evaluation alone.

No page is back under its target. The ceilings are the reading plus 300, each with a permanent comment: what stays is metakit's evaluator and judge on every page that reaches entity (15.2 to 18.2 kB minified: `node`, `ops/judge`, `ops/laws`, `ops/eval`, `ops/kind` and the operation modules), accepted by the maintainer on 2026-11-21. The Workers carry both readers (evaluation and the SQL lowering of step 8). "Owed by step 10" is closed.

## Laws on metakit's checker (Phase 1, step 7, `c02c2dcf1`)

`Laws` moved to `foldkit-entity/laws` and `bounds.ts` (1,127 lines) was deleted. A page never loaded either: the main entry's `Laws` export was tree-shaken from any page that did not use it, so the byte reading is a check that nothing changed, not a saving. `examples/registry` and `examples/cms` were each read twice in one tree (HEAD `3a69bedb5`; the working tree held only docs and tests that no page imports), once with `packages/entity/src/{index,laws,bounds}.ts` as of `c02c2dcf1~1` (before) and once as committed (after), each with `scripts/bundle-report.mjs`, then `pnpm --filter foldkit-entity build`.

| Reading | Before | After | Ceiling | Minified, before and after |
| --- | ---: | ---: | ---: | ---: |
| registry client | 269,436 | 269,417 | 269,671 | 980,392 and 980,392 |
| cms client | 171,569 | 171,654 | 171,880 | 593,002 and 593,002 |
| cms studio first load | 379,499 | 379,607 | 372,500 | not read |

The minified bytes of both clients are equal to the byte. The brotli differences (-19, +85, +108) come from the names of the chunk files a bundle writes (a hash of the modules each reaches), which are the same length and not the same text; no code a page runs changed. The studio first load is over its ceiling by 6,999 before and 7,107 after: the step-5 growth recorded under "Owed by step 10", which that table does not list for this route. Neither budget shrank, because nothing left a page.

### The differential, before `bounds.ts` was deleted

Every write the entity tests and the examples declare (577 writes, 679 pairs of a write and an invariant), run through `Laws.check` as it was (`bounds.ts`) and as it is (metakit's `Abstract.checkGoal` over `transitionOf(write)`, in each case of the finite members' values, with a witness search behind it). The bank fixture is `packages/entity/test/accountFixture.ts`; `examples/writes` and `writes-domain` declare 13 pairs; `examples/chirp` declares writes and no invariant, and `examples/cms` declares neither, so they hold no pair. 400 more pairs are the random domains of `lawsBounds.test.ts`. The differential's own file read the fixtures as they were at the time, with the plain `Schema.Number` fields; the table below is that run, before the fixtures named under (b) were changed.

| Class | Pairs |
| --- | ---: |
| Unchanged: no number to decide (disjointness, enumeration, create, delete) | 143 |
| Both decided alike: kept (`bounds` or `vacuous` became `zone`) | 186 |
| Both decided alike: refused (the witnesses differ) | 278 |
| Both undecided | 34 |
| (a) metakit decides what `bounds` left open: kept | 11 |
| (a) the same: refused, with a row the reference judge refuses | 8 |
| (b) `bounds` kept it, metakit says Unknown | 19 |
| (b) `bounds` refused it, metakit and the search say Unknown | 0 |
| (c) opposite answers | 0 |

The searches for a refusal were widened (values near each Schema's ends, near the numbers the rule and the write name, and one past each other member's) until the refusals the old pass found were found again: before that, 56 pairs it refused read Undecided. Each of the 19 in (b), by its reason:

| Pairs | Where | Why | The Schema that decides it |
| ---: | --- | --- | --- |
| 8 | `Product`, `soldNeverFalls` (`after.sold >= before.sold`), writes of `name`, `status`, `stock` | `sold: Schema.Number` may be NaN, and NaN is not at least itself; evaluation refuses it | `sold: Schema.Finite` (done in `laws.test.ts`; now kept by `zone`) |
| 1 | `LedgerDoc`, `archivedKeepsTen` | `score: Schema.Number` may be NaN, and a comparison is refused before `or` is settled by its other side | `score: Schema.Finite` (checked: kept by `zone`) |
| 1 | random `Prop1126`, `x + amount` | two numbers that nothing bounds may sum past the safe range, or to NaN | a bound on each (`Schema.isBetween`), as well as `Schema.Finite` |
| 9 | random `Prop1027`, `1045`, `1056`, `1088`, `1130`, `1136`, `1141`, `1169`, `1225` | a strict comparison of a number that is not an integer: the checker's intervals are closed, so below zero reads as at most zero, which a row at zero meets, and it cannot see that `x < 0` and `x >= 0` contradict | `Schema.Int` where the number is one (the generator picks a non-integer domain for these); otherwise the checker |

The same cause costs 10 `Unmeetable` findings (a write no row can meet): `x < 0` against a state invariant of `x >= 0` is not seen to be empty. The bank fixture's `Overdraw` test now guards with `balance <= -1`, which the closed intervals do decide. No (c) was found, so `bounds.ts` is deleted.

What the checker does not do, for the person who owns it: (1) a strict comparison over a non-integer number should narrow by the next double (`hi = nextDown(m)` for `x < m`), which is exact for doubles and would restore the 9 pairs and the 10 findings; (2) `Write.update`'s `decrement` is `add` of a negated amount, and the zone does not relate `x + (-y)` to `x - y`, so a `when: balance >= amount` over `decrement: { balance: 'amount' }` is Unknown where `compute: Expr.sub(row.balance, input.amount)` is kept by `zone`; `transitionOf` could write a decrement as `num.sub`.
