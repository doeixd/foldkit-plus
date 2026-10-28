# A reference app on the recommended stack (#228)

Status: built (2026-10-28) as `examples/reference`. Its findings are filed as
#264–#271; what is left is under [Deferred](#deferred).

## The problem

`greenfield.md` recommends one stack: a Cloudflare Worker over D1, Yielded
Auth for sign-in, server rendering, and Remote, Guard and Site in the page.
Every package on it is tested alone. Nothing builds the whole stack, so what
breaks **between** packages is found by the first user who builds it (#231's
Chirp found about thirty such faults). `greenfield.md` itself says "No example
here yet shows Yielded's routes or `foldkit-ssr` rendering inside a Worker".

The reference app is that example: small, but every seam a real app crosses,
run on a local workerd in CI and driven in Chromium.

## What the app is

A shared notebook for its members. Anyone may sign up; a member reads every
note, and writes and deletes only their own.

| Screen | Address | What it shows |
| --- | --- | --- |
| Sign in / sign up | `/sign-in?returnTo=` | one form, two modes; a member is sent on |
| The notebook | `/` | every note, newest first, with its author; a form to add one; "you have written N" |
| A note | `/notes/:id` | the note; for its author an editor and Delete |

Each seam the issue names is crossed once:

| Seam | How the app crosses it |
| --- | --- |
| Sign up and sign in | Yielded's password strategy on D1, the account row provisioned in the same batch (#208, #218) |
| One entity, list and detail | `Note`, the `Notebook` query, a page per note (`foldkit-site`) |
| Create, edit, delete, optimistic | three declared writes (`Write.insert`, `update`, `delete`) through `GuardServer.writer`; Remote predicts each |
| A derived member | `Member.noteCount`, `Derived.count(Note.relations.author)`, predicted on create and delete (#233) |
| Rules once | Schema checks on the Entity, compiled into the table's CHECKs (`checkConstraints`, #259); the guard on the server |
| Live updates | `pollLive` over a `rowLog` (#206); another tab's note joins the list |
| Server rendering for a signed-in reader | the Worker renders `/` and `/notes/:id` in process as the reader (`SSR.requestContext`, `pageReader`, `requests: 'navigation'`, #212) |
| Lazy auth client | Yielded's client is a chunk loaded on the first sign-in (`Resource.lazy`, #244) |
| The look | the shipped theme, `AppStyle.make({})` (#255) |
| Failures heard | a failed write is listed with Retry and Dismiss (`Data.failedWrites`, `shared: ['MutationFailed']`); diagnostics go to the default reporter (#237) |
| Tests | `Stack.start` from `wrangler.toml` (#239, #253); `Behaviors.optimistic`, `neverShows`, `consoleErrors` in the e2e |

It imports only published names (`foldkit-plus/…`, `foldkit`, `effect`,
Yielded, Drizzle), as an application outside this repository would, and keeps
the layout `greenfield.md` gives: `src/main.ts` (Model, Message, `update`),
`src/worker.ts`, `src/auth.ts`, `src/client.ts`, `src/style.ts`.

## Who owns what

| Fact | Owner | Where |
| --- | --- | --- |
| What a note and a member are, a title's and a body's limits | the domain, declared once | `domain.ts` (Entity); the CHECKs derived from it |
| Who may write a note | the guard set; the server decides, the page is told (`Guards.may`) | `guard.ts`, `server.ts` |
| The notes | D1 | `server.ts` (Remote server over Drizzle) |
| Who a request is | Yielded's session, read by `AuthServer.resolver` | `auth.ts`, `worker.ts` |
| The accounts | Yielded's tables and `accounts`, written in one batch at sign-up | `auth.ts`, `migrations/` |
| What the page shows of the notes | Remote's cache, in the Model | `main.ts` |
| Which page, its title, who may see it | the site tree, the route in the Model | `site.ts` |
| The first paint | the Worker, rendering as the reader | `page.ts`, `worker.ts` |
| How it looks | the shipped theme and recipes | `style.ts`, `view.ts` |

## One Worker, one bundle

```text
fetch(request, env)
  /assets/*  -> env.ASSETS                        Vite's client build
  /auth/*    -> Yielded's routes                   built once per isolate over env.DB
  /remote    -> serveFetch(remote)                 as the scripted reader
  otherwise  -> handleRequest(PageContext.attach(request, { reader: pageReader(...) }),
                              { renderPage, template })
                template = Vite's index.html, read from env.ASSETS once per isolate
```

The decision that shapes the rest: **the Worker renders pages with its own
copy of the page code**, bundled by the stack's esbuild beside the routes,
with Vite's `index.html` (read through the assets binding) as the template.
The other path, Foldkit's `ssr.build`, emits a `fetch.js` from a second
module graph, needs a `renderDocument` pipeline no example uses, and is where
#212's `AsyncLocalStorage` came from. With one bundle, `SSR.requestContext`
still carries the reader, but nothing has to cross between two copies.

The build id is the one value the two builds must share. The client's is
compiled in by the `foldkit` plugin; the Worker reads its own from the
template, where `vite.config.ts` writes it, so a deploy cannot pair a Worker
with another build's page.

## Options considered

- **Foldkit's `ssr.build` with `renderDocument`.** Rejected above: two module
  graphs, an unused document pipeline, and an `env` the emitted `fetch.js`
  does not forward.
- **The page on Vite, the Worker for `/auth` and `/remote`** (as
  `examples/cloudflare` does). Rejected: then the Worker renders nothing, and
  the seam the issue is about is not crossed.
- **Sign-in as a Remote mutation.** Rejected: Yielded owns the session and its
  cookie; its client posts to its own routes.
- **A principal change handled in place** (`Data.forget`, as `examples/auth`
  does). Rejected for this app: a sign-in or sign-out loads the next page,
  which the Worker renders as the new reader. One path, and the server's 303
  decides access the same way on every load.

## Testing

- **Unit** (`test/notebook.test.ts`, `test/migrations.test.ts`): `update`
  over what the real server reads, on Node's SQLite through `pageReader` (a
  note added shows in the list and the count at once, and leaves both when
  refused; who is shown which page; where a sign-in goes on to), and the
  migrations against the code that derives them.
- **Worker** (`test/worker.test.ts`): `Stack.start` from `wrangler.toml`, over
  real HTTP: sign up and sign in through Yielded's routes, a page rendered
  for a member holds their notes and for a visitor is a 303, a write in
  another's name, or an edit or a delete of another's note, is refused, and
  an empty title is refused by the server's decode and by D1's CHECK.
- **End to end** (`e2e/notebook.e2e.ts`): the Vite build and the Worker on a
  local workerd, driven in Chromium: sign up, add a note
  (`Behaviors.optimistic` with the write held), revisit and reload
  (`Behaviors.neverShows('Loading…')`), edit, delete, a note added in a
  second tab joins the first live, sign out, and no console error
  (`Behaviors.consoleErrors`).
- Mutation specs beside the tests (`test/*.mutations.ts`).

CI's `e2e` job runs `examples/*/e2e/**/*.e2e.ts`, so the app's e2e joins it
with no change to the workflow.

## Findings

Each place the stack made the app hand-wire something, or did something
wrong. Filed where it is a fault or a missing piece; the rest are listed
because a user meets them.

### Filed

| # | Finding | Workaround in the app |
| --- | --- | --- |
| #264 | `GuardServer.validate` refuses `pollLive` over a guarded Entity: only a hub passes, and a hub reaches no one on a Worker. Live updates and the guard's startup check cannot both be had. | `server.ts` validates a second server made without `live`. |
| #265 | A declared delete's answer leaves the author's `Derived.count` one too high once the prediction is released: the answer does not read what the deleted row pointed at. | None; the e2e marks it `test.fails`. |
| #266 | A declared insert joins no list, pending or answered, though the README says it needs no `optimistic` list; an explicit `optimistic` replaces the whole prediction (the link, the count). | `Data.overlay` of a `ConnectionChange.prepend`, lifted only on failure (`main.ts`'s `added`). |
| #267 | A foreign key is a field to Guard and a link to `Derived.count` and selections. Mapped to the link, the guarded writer sees the field unset and refuses every create; mapped to the field, nothing is predicted. | The add's input carries the author twice, `authorId` and `author`. |
| #268 | `Surface.read` compiles without the params a Surface declares, and throws at render (a 500). | Pass them. |
| #269 | `Stack` shows none of the Worker's console, so the 500 above said nothing; and the Worker cannot be told its origin before the stack starts. | Re-ran the render in Node to read the error; the Worker checks each request against its own origin. |
| #270 | A live list (`pollLive`'s `lists`) needs a hand-written Projection over a made-up row id, shared with the server by convention. | `main.ts`'s `watch` and `NOTES_WATCH`. |
| #271 | `Style.usedIn` leaves out the global rules a Style needs (`raise`'s `.fk-raised` depth rules), so a server-rendered Card is unstyled until scripts run. Found by the Worker test that checks every class a page draws has a rule in it. | None; the test is `it.fails`. |

### Listed

- **The host is about 260 lines** (`worker.ts`, `page.ts`): routing, Yielded
  built once per isolate (`ManagedRuntime` over `D1Client`, kept for good),
  the routes and Remote's config per origin, the page's reader, the template
  read from the assets binding, the 303 decided from one read. This is #235's
  `foldkit-plus/host`; the app is its second consumer after Chirp.
- **The build id has no home a Worker can read.** The client's is compiled in
  by the `foldkit` plugin, and a Worker rendering into the template must
  render under the same one. `vite.config.ts` writes it into `index.html` as a
  `<meta>`, and `build.ts` reads it back. Nearest: #210, #235.
- **Yielded on D1** takes the wiring #218 and #222 describe, unchanged since
  `examples/cloudflare`: `register` declared by hand with the strategy's
  schemas, a reset link that is never sent, three refusing services, clock
  tolerance, and a runtime per isolate.
- **Presets cannot be predicted** (#232): the page sends a note's author and
  time, which the server would otherwise stamp; the guard checks the author.
- **Migrations are kept by hand** and held to the code by a test: the CHECKs,
  the revision trigger, the row log and Yielded's tables, with a foreign key
  the binding does not derive (#259's deferred list).
- **`WriteUnheard`** asks for `MutationFailed` to be shared even when the view
  draws `Data.failedWrites`; the app shares it, and lifts the join overlay on it.
- **`validate` warns of an update with no revision** though no write here can
  change the field the rule reads. The app takes the warning's advice
  (`revision`, `revisionTrigger`), as `greenfield.md` recommends anyway.
- **Two access rules that name each other** (the notebook sends visitors to
  sign in, the sign-in page sends members to the notebook) do not type-check
  as node options (TS7022); the second is written in `accessOf`.
- **`@cloudflare/workers-types`' `Fetcher` takes its own `Request`**, not the
  DOM's the handlers make; the assets binding is typed by hand.
- **`pnpm mutate`'s esbuild plugin** is copied from `examples/cloudflare`
  (`mutation.ts`): each Workers example needs it for its edits to reach the
  Worker.

### What held

- `Stack.start` ran `[assets]` with `run_worker_first` as deployed (#253's
  open question), and Yielded, D1 and SSR in one bundle.
- `SSR.requestContext` and `pageReader` made the in-process render a few
  lines; `requests: 'navigation'` let a page read as its member with no forged
  header.
- `Behaviors.optimistic`, `neverShows` and `consoleErrors` found #265 and
  #266 on the first run, and pass for the add, the edit, the delete's list, a
  revisit and a reload.
- `checkConstraints` and the guarded writer refused a forged empty title in
  the decode and in D1.

## Deferred

- **Scaffolding from `create-foldkit-app`**: the example lives in the
  workspace, so its install is pnpm's, not the scaffold's (#229, #200, #204).
- **A deploy**: `pnpm build` writes what `wrangler deploy` uploads; no account
  is used here.
- **`pnpm dev` reloading the page**: the Worker reads its template once per
  isolate, so a page change needs a restart.
- **Password reset and email**, which Yielded serves only with management
  actions and a delivery service.
