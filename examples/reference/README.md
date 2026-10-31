# Reference: a notebook on the recommended stack

What a new application looks like on the stack `greenfield.md` recommends:
one Cloudflare Worker over D1, Yielded Auth for sign-in, pages rendered by the
Worker as the person reading them, and Remote, Guard and Site in the page. It
is small on purpose: one entity, three screens, three writes. Every seam a
real application crosses is crossed once, and tested on a local workerd and
in Chromium.

A shared notebook. Anyone may sign up; a member reads every note, and writes,
edits and deletes only their own. Another member's note joins the list as it
is written.

It imports only published names (`foldkit-plus/…`, `foldkit`, `effect`,
Yielded, Drizzle), as an application outside this repository would.

## Who owns what

| Fact | Owner | Where |
| --- | --- | --- |
| What a note and a member are; a title's and a body's limits | the domain, declared once | `domain.ts`; the table's CHECKs are compiled from it |
| Who may write a note: its author | the guard; the server decides, the page is told (`may`) | `guard.ts`, `server.ts` |
| The notes and the accounts | D1 | `server.ts`, `auth.ts`, `migrations/` |
| Who a request is | Yielded's session cookie, read by `AuthServer.resolver` | `auth.ts`, `worker.ts` |
| What the page shows of the notes | Remote's cache, a field of the Model | `main.ts` |
| Which page, its title, who may see it | the site tree; the route is in the Model | `main.ts` |
| The first paint | the Worker, rendering as the reader | `page.ts`, `worker.ts` |
| How it looks | the shipped theme (`AppStyle.make({})`) and recipes | `style.ts`, `view.ts` |

Nothing keeps state of its own in the page: Remote's cache, the forms' drafts
and the route are fields of one Model, changed only by `update`.

## The shape

One Worker answers everything:

```text
fetch(request, env)
  /assets/*  -> env.ASSETS                    the page's build (Vite)
  /auth/*    -> Yielded's routes              sign up, sign in, sign out
  /remote    -> serveFetch                    reads, writes, live streams over D1
  otherwise  -> a page, rendered as the reader into the build's index.html
```

A page is read in the Worker's own process, as the session's member, with
no HTTP to itself, and handed to the browser with what it read, so the
browser asks for none of it again:

```text
GET /  -> pageReader (the navigation's principal) -> Data.satisfy(actives) -> 303, or render
       -> the browser adopts the page (SSR.hydrate) -> Remote reads only what it lacks
```

A write is shown before the server answers, and the server decides it:

```text
Add -> NameNote (id) -> Data.mutate(AddNote)   the note, in its place, and its author's count, at once
    -> POST /remote -> what the Note sets from the context (author, time) -> GuardServer.writer: the guard, the decode, the CHECKs -> D1
    -> the answer, reduced into the Model; another member's page hears it from pollLive
```

The notebook reads its list live (`liveQuery(Data, Notes, {}, { … })`):
the page's stream names the list as its read does, and the Worker's `pollLive`
re-reads it inside that stream's own request.

## Run it

```bash
pnpm --filter foldkit-example-reference dev      # build the page, start the Worker, print its origin
```

Nothing needs an account: the Worker runs on a local workerd, configured by
`wrangler.toml` through `foldkit-plus/testing/workers`, with a fresh,
migrated D1. A change to anything the Worker bundles, or to `wrangler.toml`,
swaps it in place, keeping D1; a change to the page needs `pnpm dev` again.

From the repository root:

```bash
npx vitest run examples/reference                                       # unit and Worker tests
npx vitest run --config vitest.e2e.config.ts examples/reference         # Chromium, end to end
pnpm mutate examples/reference/test/reference.mutations.ts              # each test can fail
```

## Walking through it

**The domain** (`domain.ts`, `guard.ts`). A `Member` and a `Note` are
Entities, related by the note's author. A member's `noteCount` is
`Derived.count(Note.relations.author)`: the server counts, the page predicts.
A note's author and its time are `Entity.sets` over `Expr.viewer(Member)` and
`Expr.now`: no input sets them, the server fills them from who asks and the
write's time, and the page predicts them,
so a new note shows in its place in the newest-first list at once.
The title's and the body's limits are Schema checks, in code points, which
is what SQL counts. The guard says a note is written by its author;
`Guards.may` has the server tell the page which notes the reader may edit.

**The server** (`server.ts`). The Entities are bound to D1's tables through
Drizzle. Adding, editing and deleting are declared writes
(`Mutation.write`), landed by the guarded writer, which judges the rule, the
row's revision and the decode in the statement that writes. The notes
table's CHECKs come from `checkConstraints`, its revision trigger from
`revisionTrigger`, and the log `pollLive` reads from `rowChangeLog`:
`test/migrations.test.ts` holds `migrations/` to what each returns, so no
rule is written by hand.

The writer keeps a ledger (`write_ledger`, `migrations/0003_write_ledger.sql`):
each write it lands is recorded by who asked, the operation and the row. A
write whose answer was lost and is sent again under the same operation, as
the page's Retry does, is answered with its row, where a create of a taken id
would otherwise be refused; the same operation id sent with another request
is refused. D1 has no transactions, so the row and its record are written in
one batch, and two copies sent at once land once.

**Auth** (`authApi.ts`, `auth.ts`). Yielded's password strategy over
`@yielded/auth-persistence-drizzle/D1`. Sign-up writes the `accounts` row in
the batch that binds the email, so no account exists half made. The Worker
builds Yielded's services once per isolate. Every scripted call's `Origin`
is checked against one configured origin, the `ORIGIN` var, not the host the
request arrived at, so a second host reaching the same Worker (`workers.dev`
beside a domain) is refused. A deploy sets `ORIGIN` in `[vars]`; the local
stack gives the Worker its own (`vars: origin => ({ ORIGIN: origin })` in
`stack.ts`), and a Worker without one answers everything but its assets with a 500
naming it.

**The page** (`main.ts`, `view.ts`, `forms.ts`). Each screen declares what
it reads with a Surface; Site makes the notebook (and the note pages below
it) members' only, and the sign-in page visitors'. A sign-in or a sign-out
loads the next page, which the Worker renders as the new reader, so the page
never forgets a principal in place. Yielded's client is a chunk of its own,
loaded by the first sign-in (`Resource.lazy`). Hovering a note's link reads
its page ahead (`Site.routing`'s `preload`).

**The Worker** (`worker.ts`, `page.ts`, `build.ts`). The template is the
build's `index.html`, read through the assets binding once per isolate. The
build writes its id into it (`vite.config.ts`), and the Worker renders under
that id, so a page is always adopted by its own build's script.

## When something fails

- **A write the server refuses** (another's note, a title too long) changes
  nothing it stores. The note leaves the list, and the page lists the failed
  write with Retry and Dismiss (`Data.failedWrites`).
- **A write nothing answered** (offline, or a gateway's error page) fails as
  `Unreachable`: the server may or may not have written it, and the page says
  so. Retry sends the same operation, which the ledger answers with its row if
  it landed, so it is written once either way.
- **A session that ended** reads nothing: the page is rendered unread, and
  the browser's read is refused with a reason. A page that needs a member
  sends the reader to sign in, naming where they were.
- **A live stream that breaks** reconnects with backoff, and what it missed
  is read again. The stream asks every five seconds who it serves, so a
  sign-out in another tab ends it.
- **A page that cannot be read** is a 500 that logs why in the Worker.

## Limits

- No password reset or email: Yielded's management actions are not served.
- The deploy is left out: `pnpm build` writes `dist/client` and
  `dist/worker.js`, and `wrangler d1 migrations apply` and `wrangler deploy`
  take it from there, with a real `database_id` in `wrangler.toml`.

## See also

- [`examples/cloudflare`](../cloudflare): Remote, Sync and media on one
  Worker, with the page on Pages.
- [`examples/auth`](../auth): Yielded on Node, with a board shared through Sync.
- [`examples/chirp`](../chirp): a larger domain, served in the browser.
