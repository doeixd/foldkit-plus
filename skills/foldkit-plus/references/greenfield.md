# Starting a new application

Checked against `foldkit-plus` 0.17.0.

For an empty folder, or a user who says "build me an app". Extending an
existing application is `npx --legacy-peer-deps foldkit-plus setup` alone.

The order is the point: **understand, record, map, plan, agree, then build.** Do not
scaffold features before the domain is agreed; do not write entities before
the user has said what the domain is. Every phase leaves a file in the project,
so a later session (or another agent) picks up where this one stopped.

```text
1 brief -> 2 look -> 3 scaffold -> 4 domain rounds -> 5 mapping -> 6 plan -> 7 implement
  ask      design     create        ask, record     read, propose  agree     on "go"
```

Two whole applications show where the phases lead; read them before phase 5.
[`examples/chirp`](https://github.com/doeixd/foldkit-plus/tree/main/examples/chirp)
is a small Twitter clone with one file per package: the domain in
`src/domain.ts`, the guards in `src/guard.ts`, the server in
`src/server/server.ts`, Remote and the outbox in `src/app.ts`, the forms in
`src/compose.ts` and `src/editor.ts`, the routes in `src/site.ts`, the look
in `src/style.ts`. [`examples/reference`](https://github.com/doeixd/foldkit-plus/tree/main/examples/reference)
is the recommended stack on one Worker over D1 (phase 6).

## 1. The brief

Ask, in one message, and wait for the answers:

- **Name** of the project (it becomes the folder and `package.json` name).
- **Goal**: what it is for, in a sentence, and who uses it.
- **Must-haves** for a first version, and what is explicitly later.
- **Where it runs**: a static host, a Node server, Cloudflare Workers; does
  it need SEO or a first paint before scripts (decides `ssg`/`ssr` over `spa`)?
- **Package manager** (pnpm, npm, yarn, bun), if they care.

Ask about constraints that change architecture now, not later: offline use,
several devices editing the same thing, sign-in, content editors who are not
developers, AI agents acting in the app.

## 2. The look

Before the domain, settle how the application looks, so every screen the
mapping implies is drawn in it from the start. Ask the user to design a theme
at https://foldkit-plus.pages.dev/create: starting from a preset, its knobs
(colour, shape, type, icons and motion, in light and dark) restyle every
component as they move, and the page writes the theme as a module beside
them. Ask them to paste
back two things:

- **The code** under the preview: a module importing `AppStyle` from
  `foldkit-mixins/app` and `Theme` from `foldkit-mixins/theme`, holding
  `const theme = Theme.make({ … })` (none for the shipped theme) and exporting `t`, `slots`, `forSlots` and
  `stylesheet` from `AppStyle.make`. With `foldkit-plus` installed, change those
  two imports to `foldkit-plus/mixins/app` and `foldkit-plus/mixins/theme`.
  A theme with another icon pack also imports `Icons` from `foldkit-mixins-ui`
  (an adapter, installed on its own) and icons from `virtual:foldkit-icons/<set>`,
  which `foldkit-media/vite`'s `icons` plugin serves (see [media.md](media.md)).
- **The page's address**: the theme is in its query, so the link reopens it
  for a later change.

If they would rather not design one, start from the shipped theme: the
style module is `export const { t, slots, forSlots, stylesheet } =
AppStyle.make({})`, a vivid blue on pure greys with bold headings, inverted
menus and Heroicons, what `/create` opens on as its Default preset. Ask a few
questions only if that is not the look they want (a calm or a bold look;
light, dark or both; dense or roomy; sharp or round; one accent colour; a
typeface they like), and choose the nearest of the page's presets with them. Either way, write the answers, the link and the code into
`docs/domain/brief.md` under **Look**; phase 3 saves the code as the
application's style module.

## 3. Scaffold

In the parent folder, run `npx --legacy-peer-deps foldkit-plus setup`: with no `package.json` it
prints the `create-foldkit-app` release whose Foldkit matches this release, as
a non-interactive command. Run it with the brief's answers:

```bash
# spa:
npx create-foldkit-app@<version setup names> --name <name> --rendering spa --example counter --package-manager <manager>
# ssg or ssr, which take no --example (the scaffold refuses one); with npm,
# setup gives ssg `npx --force`, which its devtools' floating peer needs:
npx create-foldkit-app@<version setup names> --name <name> --rendering <ssg|ssr> --package-manager <manager>
cd <name>
npx --legacy-peer-deps foldkit-plus setup
```

Follow the second `setup` output: the `.gitattributes` it gives when the
project has none, the block that pins every Effect package to the release
Foldkit Plus is tested on (in a pnpm workspace it names the root's file, since
pnpm reads pins only there), the install, the skill, and the imports. Install
an adapter only when the mapping (phase 5) calls for it. Then:

- Run the project's `typecheck` and `test` once, so a later failure is yours.
- Keep the root application's Model, Message and `update` in `src/main.ts`, as
  phase 6's layout has it, not in `src/app.ts` as some of this repository's
  examples do. The scaffold's lint (`foldkit(no-child-message-construction-in-root)`)
  takes a Message as the root's only from a sibling module named `main`,
  `message`, `index` or `schema`; one from `./app` is a child's, and every
  Message the root's view constructs fails `npm run lint`.
- Create `docs/domain/` and add a line under **Project Notes** in the
  scaffold's `AGENTS.md`: "The domain, its decisions and its mapping to Foldkit
  Plus are in `docs/domain/`; read them before changing the app." Below it,
  paste the block in [agents-md.md](agents-md.md), with the project's own
  scripts filled in.
- Write `docs/domain/brief.md` from phase 1's answers, and the look from phase 2.
- Save phase 2's theme code as `src/style.ts`, and keep its link in a comment
  above it; the views of phase 7 draw through its `slots` and `stylesheet`
  (see [mixins.md](mixins.md), `AppStyle`). The scaffold also styles with
  Tailwind (`src/styles.css`): keep it beside the theme only if the user wants
  both, and say so in phase 6's plan.

What the scaffold starts with (an spa's counter) is a placeholder: leave it
until phase 7 replaces it.

## 4. Domain rounds

Before the first round, tell the user whose call the end is: **the user says
when the questions stop**, not the agent. The agent does not run out of
questions and must not decide the domain is settled, so a plain "stop",
"enough" or "that's the domain" is what ends the rounds, and the user should
know it is theirs to say. Then ask a few questions at a time (three to six),
grouped by topic, and record the answers before asking more. Keep going, round
after round, until they say so. Use their words for names; ask when two words
might mean one thing. Skip a topic the brief already settled, and come back to
one an answer reopened.

| Topic | Ask |
| --- | --- |
| Language | What are the nouns? Which are things with identity (a Project), which are values (an address)? Which words do users use for them? |
| Fields | What does each thing hold? Which fields are required, unique, derived from others, limited (a length, a range, one of a set)? |
| Identity | How is each identified: generated id, a slug, a natural key? Can it change? |
| Relationships | What belongs to what? One or many on each side? What happens to the children when a parent goes? |
| Lifecycle | What states does a thing pass through (draft, published, archived)? Which moves are allowed, and which are not? |
| Invariants | What must always be true of a thing ("stock is never negative", "reserved never exceeds stock")? Which changes must never happen, whatever the two states ("a shipped order never goes back to placed")? |
| Concurrency | Can two people change the same thing at once, and who wins? Which interactions add to a count (stock, a balance, votes), where sending one twice would count twice? |
| Interactions | What can a user do: create, edit, archive, approve, invite, reorder? Which are one step, which a flow? |
| People | Who uses it: visitors, members, editors, admins? How do they sign in? |
| Permissions | Who may see and do each interaction, and on which rows ("only the owner", "members of its project")? Which fields are hidden from whom? |
| Ownership of data | What lives on a server and is shared? What does one person write that must survive going offline? What belongs in the URL (filters, the open item)? What is only on screen? |
| Display | Which screens, lists, details, forms? Filtering, sorting, pagination? Anything a grid, a board or a builder? |
| Content | Long-form text, drafts and publishing, pages an editor lays out, images and uploads? |
| Live and offline | Must others' changes appear without a reload? Must it work offline, on several devices at once? |
| Agents | Should an AI agent read or act in the app? Which actions, for whom? |

Record every round in `docs/domain/`:

- `rounds.md`: each question and the user's answer, verbatim, dated, appended.
- `model.md`: the current understanding, rewritten as answers come in: each
  entity with its fields, identity, relationships, lifecycle and invariants;
  each interaction and who may do it; open questions at the bottom.

Beside each decision in `model.md`, note the package it points to, as a hint
for phase 5 ("archived only by an admin → a principal guard on an `Archive`
interaction, `foldkit-guard`"; "stock never negative → `Entity.invariant` on
`Product`"; "publish only a draft → `when` on the `Publish` write").

## 5. Survey and mapping

Before proposing anything, read this skill's `SKILL.md` and the reference of
every package the model touches, so the mapping uses the APIs as they are.
Then write `docs/domain/mapping.md`: every concept of the model, where it
lives, and through which API.

### How the pieces stack

```text
Schema    a value's shape and checks, decoded at every boundary
  Entity  the domain: identity, fields, Relations, derived members, Selections
    Remote  server-owned rows: queries and mutations over the Entity
    Form    one mutation's input as a draft: controls, validation, a value
    Crud    a list over a query, an editor over a form and a mutation
Guard     who may read or change an Entity's rows, enforced on the server
Auth      the session Guard's principal comes from
Site      the routes and titles the Crud screens hang on
Composition  a page as Blocks in Regions, stored as a field, drawn by a route
```

A worked path for a `Project` with an owner and tasks, in the order the
mapping names it:

- **Schema** (`effect`'s `Schema`): `Project`'s fields — its id, `ownerId`, its
  name — and Person's and Task's, one Schema decoding the value wherever it
  crosses in: a request, a row, a form. A check here is the first boundary.
- **Entity**: `Entity.define('Project', Schema.Struct({ … }))`, then
  `const Domain = Entity.relate({ Project, Person, Task }, { Project: { owner:
  Relation.one(Person), tasks: Relation.many(Task) } })` for the relations and
  `Entity.derived` for the counts; `Entity.select(Domain.Project, { name: true
  })` names what one screen reads, from the related set rather than the bare
  one. Remote, Drizzle and Form read this declaration; none of them repeats it.
  What every stored row, or every change of one, must hold is declared here too,
  `Entity.invariant('hasName', ({ after }) => Expr.not(Expr.eq(after.name, '')),
  { message })`, and an interaction's write as data,
  `Write.update(Entity.input(Domain.Project, RenameInput), { id: 'id' })`, with
  `when` for the state it applies from. An invariant only `update` checks is a UI
  rule, not an invariant: a second device, an agent or a handler passes it.
- **Guard**: the `rename` interaction's row guard, declared once with
  `Guards.declare` as `Expr.eq(Project.fields.ownerId, p.id)` (`p` the
  principal), enforced by `remote-server`, `-drizzle`, Sync and agents. A guard
  says who may; it never excuses an invariant.
- **Auth**: `AuthServer.resolver` reads the request's session and answers as
  that principal, a visitor, or a refusal. Guard decides on it; Auth signs
  nobody in.
- **Remote**: `Remote.make({ model, entities: Object.values(Domain), queries:
  [ProjectsByOwner], mutations: [RenameProject] })`, with `RenameProject =
  Mutation.write('RenameProject', write)` over the Entity's write and its
  `Input` the Schema the form fills; `remote-server` serves it through
  `remote-drizzle`'s `writer`, which checks the write's `when`, revision and the
  invariants in the one statement that lands it, and binds the Entity to tables.
- **Form**: `Form.make('Rename', Entity.input(Domain.Project, RenameInput))` —
  the mutation's input as a draft, validated, its decoded value handed on.
- **Crud**: `Crud.editor('ProjectEditor', { form, mutation })` loads the row,
  fills the form, saves and reports the status; a list is a query drawn as a
  table.
- **Site**: `Site.route(router, Route.Project, { title, access })` and its
  parent, so the screen has an address, a title, and who may see it; the Crud
  screens are the views.
- **Composition**: if the `Project` carries a page as a field, it is a
  `Catalog` of Blocks and a stored `Document` of Blocks in Regions
  (`Composition.validate` checks one against the other), edited by the Builder;
  the route that draws it is still Site's.

Keep one copy of each fact: the field on the Entity, the check on the Schema,
the rule on the Guard. A fact in two rows of `mapping.md` has two owners, and
one of them is wrong.

| In the domain | Owned by | Reference |
| --- | --- | --- |
| A thing with fields, identity, relations, derived members | `foldkit-entity`: `Entity.define`, `Relation`, Selections | [entity.md](entity.md) |
| What every row, or every change of one, must hold; what an interaction writes, from which state | `foldkit-entity`: `Entity.invariant`, `Write` (`when`, `expect`, `increment`); enforced by `foldkit-remote-drizzle`'s `writer` | [entity.md](entity.md) |
| Shared server data, its queries and mutations, live updates | `foldkit-remote`, `foldkit-remote-server`, `foldkit-remote-drizzle` | [remote.md](remote.md) |
| One person's edits that survive offline and converge across devices | `foldkit-sync` (`/entity`, `/journal`) over `foldkit-durable` | [sync.md](sync.md) |
| Who may see and do what, per interaction and row | `foldkit-guard` and its seam subpaths | [guard.md](guard.md) |
| Who is signed in | `foldkit-auth` over Yielded Auth | [auth.md](auth.md) |
| A screen's state in the URL, or remembered locally | `foldkit-mirror` | [mirror.md](mirror.md) |
| Routes, their hierarchy and titles | `foldkit-site` | [site.md](site.md) |
| Forms, drafts, validation | `foldkit-form`, `foldkit-mixins-form` | [form.md](form.md) |
| Edit, create, list and detail screens over Remote | `foldkit-crud`, `foldkit-mixins-crud` | [crud.md](crud.md) |
| A spreadsheet-like grid | `foldkit-data-grid`, `foldkit-mixins-data-grid` | [data-grid.md](data-grid.md) |
| Drafts, revisions, publishing, editor roles | `foldkit-cms`, `foldkit-cms-drizzle` | [cms.md](cms.md) |
| Pages an editor lays out from blocks | `foldkit-composition`, `foldkit-builder` | [composition.md](composition.md) |
| Long-form text, Markdown, code | `foldkit-richtext` and its family | [richtext.md](richtext.md) |
| Images, uploads, icons | `foldkit-media`, `foldkit-mixins-ui`'s `Image` | [media.md](media.md) |
| Components, themes, styling | `foldkit-mixins`, `foldkit-mixins-ui` | [mixins.md](mixins.md) |
| A feature's view of the Model and the Messages it may send | `foldkit-surface` | [surface.md](surface.md) |
| A reusable piece placed several times | `foldkit-bundle` | [bundle.md](bundle.md) |
| Server rendering, static pages | `foldkit-ssr` | [ssr.md](ssr.md) |
| An AI agent reading and acting | `foldkit-agent` and an adapter | [agent.md](agent.md) |
| Timers, media queries, sockets, clipboard, undo | `foldkit-primitives` | [primitives.md](primitives.md) |

In `mapping.md`, for each entity and interaction: the package, the API, where
its state lives (the Model, the server, a replica, the URL), and which guard
decides it. Write each rule down with its one owner: a Schema check (a value's
shape, on decode), an `Entity.invariant` (every stored row, or every change,
whoever writes it), a write's `when` (whether this write applies to the row as it
is), or a guard (who may). For each count an interaction adds to, say how a retry
is kept from adding twice: an `expect`ed revision, or a ledger. A create whose
answer may be lost needs a ledger too: without one, sending it again is
refused, since a taken id answers alike whatever its row holds. Keep one
owner per fact: if a datum appears in two rows of the mapping, one of them is
wrong. Name what is deliberately left out, and the adapters to install.

Then show the user `mapping.md`, ask what is wrong or missing, and revise it.
Repeat until they say it is right. A disagreement about the domain goes back to
`model.md` and `rounds.md` first.

## 6. Plan the build

With the mapping agreed, settle how the application is built, shipped and
held to a standard, before any of it is. Ask topic by topic, as in phase 4,
propose an answer where the brief and the mapping already suggest one, and
record the decisions in `docs/domain/plan.md`.

| Topic | Settle |
| --- | --- |
| Architecture | The rendering mode, confirmed against what SEO and first paint need. Where the server runs (Node, Cloudflare Workers) and what it holds: Remote's server, Sync's journal, the media server. The database and its driver (SQLite, Postgres, D1 through Drizzle); D1 has no transactions, so its write ledger commits each row with its record in one batch. How the code is laid out: shared domain (Entities, the guard set), server, client, views; a Surface per feature. |
| Performance | Budgets, written as numbers: Lighthouse scores, LCP, CLS, INP, the client bundle's size. What the largest image is and how it loads (`priority`, `Image.preloadsIn`). That server-only modules stay out of the client bundle (import `foldkit-ssr/client`, never `foldkit-ssr`, in the browser). Fonts. Measure them on a mid-range phone over a slowed network too, not only on a desktop, and size each image for the phone's width. |
| SEO and sharing | Which routes are indexed. A title per route (`foldkit-site`'s `title`), a description and a canonical URL in each page's head; Foldkit fills head tags the HTML template already holds and adds none, so the template needs each one. A sitemap and `robots.txt` (a static site's build writes both). Open Graph images (`Picture.ogImage`). |
| Accessibility | The level aimed for (WCAG 2.2 AA is the usual answer). Keyboard paths through every flow, focus after each navigation and dialog, reduced motion, contrast through the theme. |
| Mobile | The devices and the smallest width aimed for, and whether the app is phone-first. A recipe's controls are already at least 44px on a coarse pointer (`Defaults.reset`'s `--fk-touch-floor`); `Touch.target` or `Touch.targets` floors your own. One column at 320–360px with no sideways scroll. The screen's safe areas (`Theme.tokens.safe`, with a `viewport-fit=cover` meta when a fixed bar pads an edge). A field's text at 16px or more on a coarse pointer, so iOS Safari does not zoom into it. Nothing that only a hover shows (`hover: none` draws it too, as a Card's dismiss does), drags and swipes read from pointer events, and a `*.touch.browser.test.ts` for what only a phone shows. |
| Design and polish | The look from phase 2, revisited now that the screens are known: dark mode, more than one theme, the components from `foldkit-mixins-ui`. Every screen's empty, loading, failed and offline state. Copy and tone. |
| Testing | What each kind proves: `update` and invariants as unit tests, views as Scene tests, focus, layout and the pointer as browser tests, flows that cross the server as end-to-end tests in a real browser. On Workers, `Stack.start` (`foldkit-plus/testing/workers`) runs the Worker from its `wrangler.toml` on a local workerd with a migrated D1, and `Behaviors` (`foldkit-plus/testing/playwright`) checks a page in Chromium: a write shows before its answer, holds still until the answer is drawn, and shows after it (`optimistic`), a text never shows during some steps (`neverShows`), no error is logged (`consoleErrors`); `examples/reference` tests itself this way. Guards and invariants under mutation testing, so each test is shown able to fail. Type tests for what must not compile. |
| CI | The checks every push runs (format, typecheck, tests, end-to-end, build) and what blocks a merge. Preview deployments, if the host offers them. |
| Deployment | The host and its project, environments (preview, production), domains, secrets (session keys, an upload token), database migrations (with each table's `checkConstraints` or `entityChecks`, a `revisionTrigger` where a guarded writer pins a revision, and the ledger's table) and backups, where images are kept and resized (`foldkit-media`'s server, a CDN). Who may deploy, and confirm before the first public one. Propose the CAFE stack below, and ask. |
| Security | Authentication and its CSRF and origin checks (`foldkit-auth`), guards checked at startup (`GuardServer.validate`), who may upload, rate limits, response headers. |
| Operations | Logs, error reports, analytics if any, and what is done when a deploy goes wrong. |
| Milestones | The slices of phase 7, in order, each with what "done" means, so the user can stop after any one with something that works. |

### The CAFE stack

Prefer **the CAFE stack**, with **Yielded Auth** for sign-in. CAFE stands for
Cloudflare, Alchemy, Foldkit and Effect. **Ask the user to confirm it** rather
than assuming: the host, the infrastructure and the auth are theirs, and any
of them may be replaced. The pieces fit because each is Effect-native, so one
error model and one Schema reach from `alchemy.run.ts` to the browser.

- **Cloudflare is the host.** One Worker hosts the application's server, over
  D1 for SQLite and R2 for uploads: Remote's `serveFetch`, the media server
  and Sync's `defineDocumentHost` Durable Object. `foldkit-remote-server`,
  `foldkit-sync/do` and `foldkit-media` are written for that shape.
  `examples/cloudflare` is the working Worker. Its demo and tests run on
  miniflare with no account.
- **Alchemy is the infrastructure.** `alchemy.run.ts` declares the site, the
  Worker, D1, R2, the Durable Object, the rate limit and the secrets as Effect
  values. `Cloudflare.InferEnv` types the Worker's `env` from them, so a
  required binding the stack does not declare is a type error (an optional
  one, such as a secret the Worker can run without, is not).
  - Follow [alchemy.md](alchemy.md). Its stack declares `examples/cloudflare`'s
    Worker as one `Cloudflare.Website.Foldkit`. It type-checks; it has not
    been deployed here (alchemy.md says what was checked).
  - Alchemy v2 is in beta. Pin its version, and run `alchemy dev` and
    `alchemy plan` before the first `alchemy deploy`.
  - **Wrangler** is the fallback, and the path `examples/cloudflare` itself
    publishes with: `wrangler.toml` plus the commands at the end of its
    README. Choose it when the user does not want a beta tool in the deploy.
    The Worker code is the same either way.
- **Foldkit is the application.** `Model`, `Message`, `update` and the views
  are the app. Its Vite build is what the site serves, and the runtime is the
  only thing that moves state in the browser.
- **Effect is the backend.** Each request is one Effect program. Its Layers
  provide the database (`foldkit-remote-drizzle`'s Effect SQL) and `Auth`,
  built from the Worker's `env` (its bindings and secrets), with typed
  failures and `Schema` at every boundary. The Worker entry is one composed
  `fetch` (`src/worker.ts`), not a set of ad-hoc handlers.
- **Yielded Auth handles sign-in.** `AuthContract`, `Auth.make` and
  `Http.layer` give the account routes and the session cookie.
  `foldkit-auth`'s `AuthServer.resolver` turns that session into the
  principal that Remote, Sync, SSR's forms and agents resolve, and
  `foldkit-guard` then decides what that principal may do. The layout gains
  `src/auth.ts`, and its routes mount beside the Worker's own.

[`examples/reference`](https://github.com/doeixd/foldkit-plus/tree/main/examples/reference)
runs Yielded's routes and `foldkit-ssr` inside one Worker's `fetch`
(`src/worker.ts`, `src/page.ts`) over D1, tested on a local workerd and in
Chromium; start the first slice from it. It deploys with `wrangler.toml`; no
Alchemy stack for it has been checked here (see [alchemy.md](alchemy.md)).

Adopting CAFE keeps `create-foldkit-app`'s scaffold and adds the Alchemy
packages and `alchemy.run.ts`. Phase 7's first slice wires them to the
deployment. The layout:

```text
alchemy.run.ts  the Stack: the Foldkit site and its Worker, D1, R2, the Durable Object, secrets
src/worker.ts   the Worker's fetch: Effect Layers (database, auth) → Remote, Sync's host, media, Yielded's routes
src/auth.ts     Yielded's contract and server (Auth.make, Http.layer) and the application's principal
src/client.ts   the browser: RemoteClient or SyncClient, and the runtime that boots the app
src/main.ts     Model, Message, update, view
src/style.ts    the theme from phase 2
```

On the Wrangler path, `wrangler.toml` takes the place of `alchemy.run.ts`.

### The Worker: bundle, migrations, local stack, deploy

How `examples/reference` and `examples/cloudflare` build and run their
Worker; follow it on the Wrangler path. One `wrangler.toml` is read by the
tests, `pnpm dev` and the deploy alike, so the local Worker cannot drift from
the deployed one:

```toml
name = "my-app"
main = "dist/worker.js"   # written by the bundle step below
no_bundle = true          # Wrangler uploads that bundle as is
compatibility_date = "2026-07-30"
compatibility_flags = ["nodejs_compat"]   # Yielded's password hashing

[assets]                  # the page's `vite build`, served by the Worker
directory = "dist/client"
binding = "ASSETS"
run_worker_first = true

[[d1_databases]]
binding = "DB"
database_name = "my-app"
database_id = "00000000-0000-0000-0000-000000000000"   # from `wrangler d1 create`
migrations_dir = "migrations"
```

- **Bundle.** `Stack` from `foldkit-plus/testing/workers` (with `wrangler`
  and `esbuild` installed as dev dependencies) bundles the entry with esbuild
  as ESM for the browser platform, keeps `cloudflare:workers` and `node:*`
  external for `nodejs_compat`, and copies each imported `.wasm` (Yielded's
  Argon2) beside the script, where `no_bundle` Wrangler loads it as a compiled
  module. The tests and the deploy use one bundle:

  ```ts
  // src/stack.ts
  import { Stack } from 'foldkit-plus/testing/workers'
  import { fileURLToPath } from 'node:url'

  interface WorkerEnv {
    readonly ORIGIN: string
  }

  const here = (file: string) => fileURLToPath(new URL(file, import.meta.url))
  const worker = { wrangler: here('../wrangler.toml'), entry: here('./worker.ts') }

  /** The Worker on a local workerd, told the origin it answers at. */
  export const startStack = () =>
    Stack.start<WorkerEnv>({ ...worker, vars: origin => ({ ORIGIN: origin }) })

  /** Writes `dist/worker.js`, where `main` says, for `wrangler deploy`. */
  export const writeDeployBundle = () => Stack.writeBundle(worker)
  ```

  The scripts: `"build": "vite build && tsx src/bundle.ts"` (a file that
  awaits `writeDeployBundle()`) and `"dev": "tsx src/dev.ts"` (starts the
  stack and `stack.watch(…)`s it).
- **Migrations.** Numbered SQL files in `migrations/`, written from the code
  rather than by hand: the tables' `checkConstraints`, a `revisionTrigger`
  where a guarded writer pins a revision, `rowChangeLog` for `pollLive`, the
  writer's ledger table, and Yielded's tables from its storage schema. A test
  holds each file to what the code returns (`examples/reference`'s
  `test/migrations.test.ts`), so a changed rule fails there, not in a deployed
  database. `Stack.start` applies them to a fresh D1 on every start.
- **The compatibility date** is one date for every run, since all read
  `wrangler.toml`. Without one, Miniflare runs an old runtime (it lacked
  `URL.canParse`, which the auth resolver needs). `Stack.start` refuses a date
  newer than the installed workerd knows: move `wrangler` and `miniflare`
  together to raise it.
- **The local stack.** `Stack.start` runs the Worker on a real workerd over
  real HTTP with its bindings; `stack.env()` reads them again after each swap,
  since a reload retires the old handles ("poisoned stub"). Test a D1 write
  there, not on Node's SQLite: D1 has no transactions, so the ledger writes in
  a batch only workerd runs.
- **Deploy**, from the app's folder, one Wrangler command at a time (they
  share one login), after confirming the account and the Worker's name:

  ```sh
  pnpm build
  wrangler d1 create my-app        # put its database_id in wrangler.toml
  wrangler d1 migrations apply my-app --remote
  wrangler secret put UPLOAD_TOKEN     # each secret the Worker reads, if any
  wrangler deploy
  ```

  Set `ORIGIN` (where the deploy serves) in `[vars]` first: the reference
  Worker answers every scripted call against that origin.

If the user picks another host or auth, drop the pieces it replaces and record
the choice in `plan.md`: what changes is the server entry, the deployment and
the session seam, not the domain or the views.

Show the user `plan.md`, revise it with them, and wait for them to say to go
ahead. A decision here that changes the domain goes back to `mapping.md`.

## 7. Implement

Only after the user approves the mapping and the plan. Set up CI and the
deployment target first, so every slice is checked and could ship. Then build
in the plan's milestones, slices that each run:

1. The domain: Entities, their Schemas, invariants and declared writes (`foldkit-entity`).
2. Who may do what: the guard set, implemented on the server.
3. The data path: Remote's server and client, or Sync, per the mapping; Auth.
4. The screens: routes (`foldkit-site`), views and forms, through Mixins.
5. What remains of the mapping: media, content, agents, server rendering.

For each slice: the tests `plan.md` calls for, each able to fail (an invariant
broken, a guard refusing), `typecheck` and `test` green, the performance
budgets checked where the slice touches a page, a commit, and `mapping.md` and
`plan.md` updated where the build departed from them. When either is wrong,
stop and ask the user, rather than quietly building something else.

See also: [Foldkit](https://foldkit.dev),
[the guides](https://foldkit-plus.pages.dev).
