# `foldkit-plus`

Every Foldkit Plus package in one install, and a setup command for your coding
agent.

```bash
npx foldkit-plus setup
```

Tell your agent to run that in your project. It prints, for that project, how to
install Effect, Foldkit and Foldkit Plus with the package manager the project
uses, how to add the agent skill, and which package does which job. It reads
your `package.json` first and says when `effect` or `foldkit` is missing or at a
version this release does not support. It writes nothing; the agent runs what it
says.

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
is `foldkit-remote`'s, so the two can be mixed in one application.

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
| `foldkit-mixins-ui` | `@foldkit/ui` | `@foldkit/ui` components styled through slots |
| `foldkit-richtext-code-shiki` | `shiki` | Code blocks highlighted with Shiki |
| `foldkit-agent-native` | `@agent-native/core` | Agents through Agent Native |

`npx foldkit-plus setup` lists them with the command that adds each.

`foldkit-media` is installed, but two of its subpaths need a library that is not:
`foldkit-plus/media/sharp` needs `sharp`, and `foldkit-plus/media/unpic` needs `unpic`.

## Versions

`effect` and `foldkit` are peers: this release targets Effect 4 (`^4.0.0`,
tested on 4.0.4) and Foldkit `0.168`, and `setup` installs the Effect that
Foldkit names (`4.0.0`). Each release of `foldkit-plus` pins the release of every
package it brings, so the set is one tested combination; the
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
