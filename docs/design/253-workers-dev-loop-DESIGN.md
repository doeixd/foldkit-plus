# A Workers dev stack read from wrangler.toml (#253)

Status: slice 1 built (2026-10-27) in `examples/cloudflare`. The rest is
listed under [Deferred](#deferred). Since moved, by #239, into
`foldkit-plus/testing/workers` as `Stack.start` and `Stack.writeBundle`,
reading the configuration with Wrangler's own reader instead of
`smol-toml` ([239-plus-testing-DESIGN.md](./239-plus-testing-DESIGN.md)).

## The problem

A Worker on the recommended stack is tested and developed on a local workerd,
and every app writes the same harness by hand. Chirp (#231) had
`scripts/stack.ts` and `scripts/dev.ts`. This repository's
`examples/cloudflare/src/stack.ts` did the same:

- It listed every binding a second time as Miniflare options: `DB`, `MEDIA`,
  `IMAGES`, `LIMITER` with its namespace and limit, and `SYNC_HOST`.
- It copied the compatibility date and flags out of `wrangler.toml`, kept in
  step by a comment. AGENTS.md records what it cost when they drifted: an old
  runtime without `URL.canParse`, then a flag that stopped workerd starting.
- It ran the D1 migrations with its own reader, which split files on newlines.
  The deploy runs them with `wrangler d1 migrations apply`, a different
  reader.
- It hard-coded `dist/worker.js`, the path `main` already names.
- It had no dev loop. Checking a server change meant restarting the stack, and
  every restart lost D1.

Each copy was a second owner of a fact `wrangler.toml` already owns. #239
asks for the same stack as a testing kit, and #235 for the Worker it serves.

## The decision

Wrangler's own test harness (`createTestHarness`, exported by `wrangler`
4.116) runs the Worker from its configuration. The stack keeps one job,
bundling, which Wrangler cannot do the way this workspace needs.

```text
wrangler.toml --parse--> raw config --main = stack's bundle--> Wrangler test harness --> workerd
src/worker.ts --esbuild (source condition, pnpm mutate's edits)--> stack's directory
a change --esbuild watch--> rebuild --> harness.update --> same origin, same storage
```

### Options considered

1. **Keep the hand-written Miniflare options.** This is the status quo, with
   two owners of every binding.
2. **Map `wrangler.toml` to Miniflare ourselves.** We would parse the TOML and
   translate each binding kind. That is a second implementation of
   Wrangler's mapping. It drifts silently when Wrangler adds or changes a
   kind, and it still leaves `.dev.vars`, migrations and reloads to us.
3. **`unstable_getMiniflareWorkerOptions` with our own `Miniflare`.**
   Wrangler would map the bindings, and we would still own migrations,
   `.dev.vars`, vars, secrets and reloads, through an API marked unstable.
4. **Let Wrangler bundle (`main = "src/worker.ts"`).** Rejected. Wrangler's
   esbuild has no `foldkit-plus:source` condition, so it would bundle each
   workspace package's stale `dist`. `pnpm mutate`'s edits would never reach
   the Worker either: AGENTS.md's trap says a Worker esbuild bundles is
   mutated only by the stack's `onLoad` plugin.
5. **Wrangler's test harness, with `main` pointed at the stack's bundle.**
   Chosen. Wrangler reads the bindings, the date and flags, `.dev.vars` and
   the migrations. `applyD1Migrations` is the runner
   `wrangler d1 migrations apply` uses, and it records each file in
   `d1_migrations`. `update` swaps a new script in at the same URL over the
   same storage (probed: a D1 row and the port both survive).

### Why the stack parses the TOML itself

Each stack bundles into a directory of its own, because test files run side by
side and `pnpm mutate`'s mutated bundles must never land in the deploy
artifact. So the harness has to run `wrangler.toml` with a different `main`.
It takes either a config path, which cannot override `main`, or an inline
config. Wrangler's normalized config (`unstable_readConfig`) cannot be fed
back in, because re-validating it fails on its own defaults
(`triggers.crons`). So the stack parses the file with `smol-toml`, the parser
Wrangler bundles, and passes the raw table on unchanged except for `main`.
Wrangler then validates the whole of it. The stack decodes only the four keys
it reads itself, with an Effect Schema.

## Where it lives

The code is in the example, `examples/cloudflare/src/workers.ts`, not in a
package:

- It has one consumer. A shape proven by one app is a guess at the API #239
  wants, and the reference app (#228) is the second consumer that would
  settle it.
- Published, it would make `wrangler`, `miniflare` and `esbuild` peers of a
  package that installs into browsers' dependency trees.
- The user asked for no new package. The destination #239 names is a subpath,
  `foldkit-plus/testing/workers`.

`workers.ts` imports nothing from the example. `stack.ts` is the example's
call: its entry, its local `AUTH_ORIGIN` and a fresh `UPLOAD_TOKEN`. Lifting
it into a subpath is a move, not a rewrite. The one repository-specific piece
it carries is the `pnpm mutate` plugin, which would become a `plugins` option
then.

## The API

```ts
startWorkersStack<Env>({
  wrangler: string,                     // the Worker's wrangler.toml
  entry: string,                        // the source bundled into what `main` names
  vars?: Record<string, string>,        // local values for vars set elsewhere when deployed
  secrets?: Record<string, string>,     // local values, over `.dev.vars`
}): Promise<WorkersStack<Env>>

interface WorkersStack<Env> {
  origin: string                        // real HTTP
  env(): Promise<Env>                   // the bindings; a swap retires earlier ones
  dispatch: DispatchFetch               // straight to the Worker; upgrades hand back the socket
  watch(listener: { onSwap, onBuildError, onStopped }): Promise<void>
  stop(): Promise<void>
}

writeWorker({ wrangler, entry })        // the deploy bundle, where `main` says
```

- Each `startWorkersStack` is a stack of its own. It gets fresh, migrated D1
  for every `[[d1_databases]]` and empty R2 and Durable Object storage, so
  test files share nothing.
- `env` is a function because Miniflare poisons binding stubs on every
  reload. A test that held the first `env` across a swap failed with
  "Attempted to use poisoned stub".
- `watch` runs esbuild in watch mode. The files watched are the ones the
  bundle read, the workspace packages' sources included. Each rebuild whose
  output differs is written and swapped in with `harness.update`.

In the example, `pnpm dev` (`src/dev.ts`) is the stack plus the page on Vite
at `PAGE_ORIGIN`, the origin the Worker's auth trusts. `/remote` is proxied,
as the deployed page's `_worker.js` does. The e2e test serves the page through
the same `servePage`.

## Derived from wrangler.toml, and what is not

| Fact | Owner |
| --- | --- |
| Bindings (D1, R2, Images, rate limits, Durable Objects and their SQLite migrations) | `wrangler.toml`, read by Wrangler |
| Compatibility date and flags | `wrangler.toml`, read by Wrangler, checked by the stack against the installed workerd |
| D1 migrations and their directory | `wrangler.toml` (`migrations_dir`), applied by Wrangler's runner |
| Secrets for local runs | `.dev.vars` (read by Wrangler), or `secrets` given to the stack |
| Where the deploy bundle goes | `main` |
| What gets bundled | the stack's `entry` (Wrangler has no source entry when `no_bundle` is set) |
| Vars the deploy sets elsewhere (`AUTH_ORIGIN`) | the example's `stack.ts`, as local values |

## Failing loudly

These are refused before anything starts:

- **A compatibility date newer than the installed workerd supports.**
  Miniflare would quietly run its own latest date, with a warning the
  harness, which logs nothing, does not print. The tests would pass on a runtime the
  deploy does not get.
- **`no_bundle` unset.** Wrangler would bundle `main` again on deploy, so the
  deploy would run other code than the tests.
- **An `[env.*]` section.** The stack runs the top-level Worker and would
  otherwise ignore it in silence.
- **A missing date, a missing `main`, or a source that does not build.**

While watching:

- **A change that does not build** is reported (`onBuildError`), and the last
  Worker keeps answering.
- **A Worker that builds but does not start.** Examples are a named export
  that is not a handler, or a top-level throw. Wrangler's harness tears its
  whole session down with it, then comes back on a new port with new storage
  (probed). The stack reports `onStopped`, stops swapping, and `pnpm dev`
  exits. Promising "same origin, same storage" past that point would be false.

## Deferred

- **Attaching to a running stack** (`startStack({ reuse: true })`). Tests read
  D1 and R2 and upgrade sockets through in-process binding proxies, and
  Miniflare offers those only to the process that owns the runtime. Attaching
  needs a control channel from the dev process, and isolation between test
  files that share one runtime. That second need is #253's per-file D1
  snapshots. For now each test file starts its own stack (about 2 s).
- **Surviving a Worker that does not start.** This needs a stable front that
  outlives the runtime, as `wrangler dev`'s proxy Worker is. The harness gives
  none.
- **Printing the Worker's logs under `pnpm dev`.** The harness captures them
  (`getLogs`) and offers no subscription. Done by #269: the stack drains them.
- **Watching `wrangler.toml` itself.** Restart `pnpm dev` after editing it.
- **Assets with `run_worker_first`.** The example has no assets binding. The
  harness reads `[assets]`, but a stack that sets one has not been run. Since
  run by `examples/reference` (#269): `binding` and `run_worker_first = true`
  behave as deployed.
- **Lifting `workers.ts` into `foldkit-plus/testing/workers`** (#239), with
  the typed Remote client and the Playwright behavior assertions #239
  proposes, once #228's reference app is the second consumer.
- **No build before `test`.** This follows from attaching.

## Costs

- `wrangler` is now a dev dependency of the example (about 21 MB). It also
  serves `pnpm exec wrangler deploy`.
- `wrangler` pins `miniflare` and `workerd` exactly. The example's own
  `miniflare` pin must move with it: the stack reads
  `supportedCompatibilityDate` from `miniflare`, and two copies would answer
  for different runtimes. `wrangler` 4.116.0 and `miniflare` 4.20260730.0 are
  one copy each.
- `wrangler` brings `esbuild` 0.28.1 beside the workspace's 0.28.2. Only
  Wrangler's bundler, which the stack does not use, runs it.
- The harness is a recent Wrangler API. The stack relies on `createTestHarness`,
  `listen`, `update`, `getWorker().applyD1Migrations`, `getEnv` and `fetch`.
