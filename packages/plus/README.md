# `foldkit-plus`

Every Foldkit Plus package in one install, and a setup command for your coding
agent.

## What it is

[Foldkit Plus](https://foldkit-plus.pages.dev) is a family of packages that
extend a [Foldkit](https://foldkit.dev) application to agents, servers, other
devices, the URL and design systems without a second place to keep state. Each
is published on its own (`foldkit-remote`, `foldkit-sync`, …). This package
depends on them, so one install brings the set, and re-exports each:

```text
foldkit-remote              ->  foldkit-plus/remote
foldkit-remote/port         ->  foldkit-plus/remote/port
foldkit-remote-server       ->  foldkit-plus/remote-server
foldkit-mixins/theme        ->  foldkit-plus/mixins/theme
```

A subpath is the package itself, re-exported: `foldkit-plus/remote`'s `Remote`
is `foldkit-remote`'s, so the two can be mixed in one application. This package
owns no state and adds no runtime API of its own: what each package owns is in
its own guide. What it adds is the `setup` and `docs` commands, and two subpaths
for testing a running application.

## Setup

```bash
npx --legacy-peer-deps foldkit-plus setup
```

Tell your agent to run that in your project. It writes nothing: it prints, for
that project, what the agent should run, in order:

1. **Check the project.** It reads your `package.json` and says when `effect`
   or `foldkit` is missing or at a version this release does not support. When
   no `.gitattributes` applies to the project, it gives one that keeps text
   files LF (`* text=auto eol=lf`), so a Windows checkout does not warn of
   every file; one the project has is left as it is.
2. **Install** Effect, Foldkit and Foldkit Plus with the package manager the
   project uses, after the version pins described under [Versions](#versions),
   and the command that adds each [adapter](#what-it-does-not-install-adapters).
3. **Add the agent skill**, and paste its `AGENTS.md` block into the project.
4. **Import**: which package does which job.

`--legacy-peer-deps` only stops npx installing the package's peers beside it,
which the CLI never reads (it carries everything it runs on): npx adds a newer
`foldkit-plus` to the tree an older one left in its cache, and their peers'
Foldkit versions clash (`ERESOLVE`) where none is needed.

For a new application, run it in an empty folder. With no `package.json` it
sends the agent to the skill's
[greenfield guide](https://github.com/doeixd/foldkit-plus/blob/main/skills/foldkit-plus/references/greenfield.md):
ask about the goals, the look (a theme designed at
[/create](https://foldkit-plus.pages.dev/create)) and the domain first, record
the answers in the project, map them to these packages with you, plan the
architecture, performance, SEO, testing, CI and deployment, and build once you
agree. It prints the `create-foldkit-app` command, at the release that installs
this release's Foldkit, for when it is time to scaffold.

## Import

The namespaces most applications use come from the root:

```ts
import { Projection, Remote, Surface, Sync } from 'foldkit-plus'
```

The root holds `Agent`, `Bundle`, `Entity`, `Expr`, `Order`, `Query`,
`Relation`, `Form`, `Mirror`, the Mixins vocabulary (`Style`, `Slot`, `Slots`,
`SlotView`, `Behavior`, `Capability`, `Event`), `Remote`, `RemoteClient`,
`RemoteData`, `RemotePolicy`, `Site`, `Surface`, `Projection`, `MessageSet`,
`Sync`, `DocumentId` and `ReplicaId`. A name two packages export is left to
their subpaths, so nothing at the root is ambiguous. Nothing at the root runs
only on a server: import `foldkit-plus/ssr`, `foldkit-plus/remote-server` or
`foldkit-plus/durable` where the server is.

## What it does not install: adapters

A package that needs a library of its own is an optional peer here, so
installing `foldkit-plus` installs none of those libraries. Its subpath works
once you add it with its library:

| Adapter | Library | For |
| --- | --- | --- |
| `foldkit-react` | `react`, `react-dom` | React interop |
| `foldkit-react-codegen` | `typescript` | Views compiled to React TSX |
| `foldkit-remote-drizzle` | `drizzle-orm` | Remote reads answered with Drizzle |
| `foldkit-cms-drizzle` | `drizzle-orm` | The CMS's server on Drizzle |
| `foldkit-auth` | `@yielded/auth` | Sign-in and sessions with Yielded Auth |
| `foldkit-mixins-ui` | `@foldkit/ui` | `@foldkit/ui` components styled through slots |
| `foldkit-richtext-code-shiki` | `shiki` | Code blocks highlighted with Shiki |
| `foldkit-agent-native` | `@agent-native/core` | Agents through Agent Native |

`setup` lists them with the command that adds each, at the library version the
adapter peers on.

`foldkit-media` is installed, but two of its subpaths need a library that is not:
`foldkit-plus/media/sharp` needs `sharp`, and `foldkit-plus/media/unpic` needs `unpic`.

## Docs for the versions you have

```bash
npx foldkit-plus docs Data.preload        # a symbol: its declaration and its sections
npx foldkit-plus docs "optimistic delete" # words: the three best sections
npx foldkit-plus docs --list remote       # one topic's headings, with line numbers
```

`docs` answers from what is installed in the project it runs in, so it
describes the versions the application has, not `main`. It reads the README
of each Foldkit Plus package that an import from the project would load (one
the project names from its own folder; the rest from beside `foldkit-plus`),
the `foldkit-plus` skill if it is installed in a dot-folder's `skills/` (the
project's, its repository's, or the home folder's), and for a symbol the
package's `.d.mts`. Each section comes with its file and line, so the rest is
one read away. Nothing is indexed ahead of time and nothing is fetched.
`--json` prints the same for a program. A query that matches nothing, a
project with no Foldkit Plus package, or one whose `package.json` names a
package that is not installed exits 1 and says which.

## Testing a running application

Two subpaths of this package's own drive the tools an application tests with.
Those tools are optional peers too: add them as dev dependencies, and a
subpath that needs one it cannot find says which.

| Subpath | Needs | For |
| --- | --- | --- |
| `foldkit-plus/testing/workers` | `wrangler`, `esbuild` | `Stack.start`: the Worker on a local workerd, configured by its own `wrangler.toml`, with fresh migrated D1 per stack; `Stack.writeBundle`: the same bundle where `main` says, for `wrangler deploy` |
| `foldkit-plus/testing/playwright` | `playwright` (types) | `Behaviors`: a write shows while it is held at the network, holds still until its answer is drawn, and shows after (`optimistic`), a text never shows during some steps, even for one frame (`neverShows`), and the page's errors (`consoleErrors`) |

<!-- docs-check
interface Env { readonly ORIGIN: string }
-->

```ts
import { Stack } from 'foldkit-plus/testing/workers'

const stack = await Stack.start<Env>({
  wrangler: 'wrangler.toml', // bindings, compatibility date and flags, D1 migrations
  entry: 'src/worker.ts', // bundled into what `main` names; `no_bundle = true`
  vars: origin => ({ ORIGIN: origin }), // or a plain record; a function is given the stack's origin
})
await fetch(stack.origin)
stack.logs() // what the Worker wrote to its console since the last call; also printed as it arrives
await stack.stop()
```

The Worker's console is printed here as it arrives, each line with Node's
console method of its level and prefixed `[worker]`, so a 500 shows the error
behind it with its stack; `console: 'quiet'` keeps the lines for `logs()`
alone. The lines travel beside the response, not on it, so a test reading
what one request wrote polls (`expect.poll(() => stack.logs())`).

`stack.watch({ onSwap, onRefused, onStopped })` is the dev loop. It
rebuilds on every change to a file the bundle read, and rereads
`wrangler.toml` when it changes. Each change is started first on a workerd
of its own, with fresh storage and its D1 migrated. Only a change that
starts is swapped in at the same origin, over the same D1, R2 and Durable
Object storage, and the migrations not yet applied are applied. A change
that does not build, or builds a Worker that does not start, or a
configuration the stack refuses, goes to `onRefused`, and the Worker running
keeps answering. `onStopped` is the rest: a swap that failed after its trial
started, which takes Wrangler's harness down with its storage.

<!-- docs-check
import type { Page } from 'playwright'
import { expect } from 'vitest'
declare const page: Page
-->

```ts
import { Behaviors } from 'foldkit-plus/testing/playwright'

const errors = Behaviors.consoleErrors(page)
await Behaviors.neverShows(page, {
  text: 'Loading…',
  during: () =>
    Behaviors.optimistic(page, {
      act: () => page.getByRole('button', { name: 'Add' }).click(),
      shows: page.getByRole('button', { name: 'Buy milk', exact: true }),
    }),
})
expect(errors()).toEqual([])
```

These check the drawn page over the real network. `optimistic` holds every
Remote mutation at the network and requires `shows` within `within` of the
action; from then until the write settles, each element `shows` resolves to
must stay the same node, in the same place in its parent, within 1px of where
it was drawn, and visible. A prediction that is drawn again, pushed down by a
line said only while the write is pending, or hidden for a frame fails with
what moved and when. Settled is evidence: no Remote request of the page in
flight (an answer can ask for more), then three quiet frames. `stays` names
what must hold still instead (a `Locator`: the list around a row its answer
deliberately draws again), or `'shown'` for only "shows after". Writes that
reach the server another way (a port to a SharedWorker) pass `writes: {
answered }`, and the page holds them itself; `examples/chirp`'s end-to-end
test opens its sandbox with `?latency=1500` and reads its outbox. An error the
page logs while a write settles fails it too. `consoleErrors` lists
`console.error` and uncaught exceptions, which includes every `error`
diagnostic the default `Diagnostics` reporter logs. To find which Message makes
a read blink, `foldkit-plus/remote/testing`'s `Trace` runs `update` and Remote's
Subscriptions without a browser and records every Model.
[examples/cloudflare](https://github.com/doeixd/foldkit-plus/tree/main/examples/cloudflare)
uses both subpaths.

## Versions

`effect` and `foldkit` are peers: this release targets Effect 4.1 (`^4.1.0`)
and Foldkit `0.170`, and `setup` installs the Foldkit and the Effect this
repository tests (`package.json`'s `setup` field). Foldkit and its Vite plugin
take one Effect minor (`~4.1.0`), and each `@effect/*` release peers on an
`effect` at least its own, so `setup` first has the project pin every Effect
package to the tested one, which keeps one copy of each:

- npm: `overrides`, and the project's own Effect dependencies set to the same
  release, since npm overrides a direct dependency only where the project
  names that version;
- pnpm: `overrides` with `peerDependencyRules`, at the workspace root, the only
  place pnpm reads them (its `pnpm-workspace.yaml`, or its `package.json` where
  that already holds a `pnpm` field);
- Yarn: `resolutions`; Bun: `overrides`.

npm keeps a package its lockfile holds rather than move it down to an
override, and a scaffold locks the newest Effect patch under
`@foldkit/vite-plugin`. Where `package-lock.json` already holds a later patch
of the tested minor, `setup` pins that one instead.

That also holds `foldkit-durable`'s `@effect/sql-sqlite-node`, whose every
release peers on an `effect` at least its own version. Each release of
`foldkit-plus` pins the release of every package it brings, so the set is one
tested combination; the
[release matrix](https://github.com/doeixd/foldkit-plus/blob/main/docs/releases.md)
lists them.

## In this repository

The re-exports, the manifest's exports and dependencies, and the tsconfigs'
references are generated from the workspace:

```bash
pnpm --filter foldkit-plus generate   # then pnpm install and pnpm paths
```

`test/generated.test.ts` fails until it has run after a package or an entry
point is added, moved or removed, and when the setup guide's list of adapters
or jobs leaves a package out.
