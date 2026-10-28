# A reference app on the recommended stack (#228)

Status: in progress (2026-10-28), in `examples/reference`.

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
| Failures heard | the page reports `Diagnostics` (#237); the server's 500s name their cause |
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

- **Unit** (`test/*.test.ts`): `update` and the optimistic predictions with
  `Trace` where a read's states matter; the migrations against the code that
  derives them.
- **Worker** (`test/worker.test.ts`): `Stack.start` from `wrangler.toml`, over
  real HTTP: sign up and sign in through Yielded's routes, a page rendered
  for a member holds their notes and for a visitor is a 303, a write in
  another's name is refused, a body over its limit is refused by D1's CHECK
  as well as the decode.
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

Each place the stack made the app hand-wire something, filled in as built.

## Deferred
