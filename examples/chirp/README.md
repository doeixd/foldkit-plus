# Chirp

A small Twitter clone: a timeline, a profile per person and a page per post,
posting, editing your own posts, and likes, built from the Foldkit Plus
packages one at a time. The `// #region` comments mark the excerpts the
explainer video shows.

Try it at **https://foldkit-chirp-demo.pages.dev/**. The server runs in your
browser, so nothing you post leaves it.

## What each package owns here

| Fact | Owner | Where |
| --- | --- | --- |
| What a user and a post are, that a body holds at most 280 characters, and what a handle may be | the domain, declared once; the tables' `CHECK`s are compiled from it | `domain.ts` (`foldkit-entity`), `server/server.ts` (`checkConstraints`) |
| Who may write a post: its author, or an admin | the domain declares it; the server decides | `guard.ts`, `server/server.ts` (`foldkit-guard`) |
| The posts and the likes | the server's database | `server/server.ts` (`foldkit-remote-server`, `foldkit-remote-drizzle`) |
| The posts the page shows, cached in the Model | Remote, inside the Model | `app.ts` (`foldkit-remote`) |
| A chirp posted and not yet answered | Remote's outbox, in the Model and copied to `localStorage` | `app.ts` (`Data.outbox`), `client.ts` |
| The draft in the compose box and the editor | the forms, inside the Model | `compose.ts`, `editor.ts` (`foldkit-form`, `foldkit-crud`) |
| Which page you are on, its address and title | the site's tree; the route is in the Model | `site.ts` (`foldkit-site`) |
| How it looks | one theme, the slots, the shipped recipes | `style.ts`, `view.ts` (`foldkit-mixins`, `foldkit-mixins-ui`) |
| Who you are | the page's address (`?as=ada`) | `client.ts` |

Nothing keeps state of its own: Remote's cache, the forms' drafts and the
route are fields of one Model, changed only by `update`.

## The loop

```text
view ──Message──▶ update ──▶ Model ──▶ view
                    │
                    └─ Data.mutate ──▶ server ──▶ answer, reduced into the Model
```

A chirp posted is a Message; `update` hands it to Remote as a declared write
(`PostChirp`), which predicts it and sends it. The server sets the author
and the time, checks the guards, writes it, and answers; the answer is
reduced into the Model like any other Message.

## Run it

```sh
pnpm install
pnpm --filter foldkit-example-chirp dev
```

Open the address it prints. Add `?as=ada` to be Ada, the admin, or
`?as=grace`, `?as=linus`; `?reset` starts the sandbox again from the seed;
`?offline` makes the sandbox refuse every write as a dropped connection
would, to watch a chirp wait in the outbox; `?latency=1500` holds each write
that long before sending it, as a slow network would, to watch a chirp drawn
before its answer (the end-to-end test checks that it holds still meanwhile).
`pnpm --filter foldkit-example-chirp build:sandbox` builds the published demo
into `dist/`.

## Walking through it

**The domain** (`domain.ts`). A `User`, a `Post` and a `Like` are Entities:
their fields as one Schema, and the relations between them
(`Entity.relate`): a like points at a post and at the person who likes it. A
person's `postCount` is `Derived.count(Chirp.Post.relations.author)` and a
post's `likeCount` is `Derived.count(Chirp.Like.relations.post)`: each says
what it counts, so the server's binding needs no entry for it, and a write's
answer carries the new count with no code naming the row it is on. A post's
`liked` is `Derived.exists(Chirp.Like.relations.post, { viewer:
Chirp.Like.relations.user })`: your Like's id, or none, read for whoever asks,
so the page never reads who else liked a post. What the server chooses when a
row is made is said once, on the Entity, with `Entity.sets`: a post's `author`
link and a like's `user` are `Expr.viewer(User)`, whoever asks, and a post's
`createdAt` is `Expr.now`, on create. The link is the one member over its
column: a rule or a query compares it directly. No write's input sets them; the server fills them, and the page predicts them.
Nothing else about a write's effects is declared: counts follow from the
`Derived` members, and a list's membership and order from its query's body.
The 280-character rule is the
body's own Schema check (`isMaxCodePoints`, characters as SQL counts them), and a
handle's is a pattern with its lengths. The server's decode and the form read
them, and `server/server.ts` makes each table's `CHECK`s from them with
`checkConstraints`, so the database refuses the same thing and no rule is
written twice.

**The guards** (`guard.ts`). `Guards.declare` names three guards: `isAuthor`,
a row guard comparing the post's `author` link with the asker
(`Expr.eq(Chirp.Post.relations.author, Expr.viewer(UserFields))`, the set
naming `viewer: UserFields`), `isLiker`, the like's `user`, and `isAdmin`,
whose body only the server has (`G.implement` in `server/server.ts`).
`Guards.attach` says a post is created and edited by its author or an admin,
deleted by its author alone, and a like written by its liker, and
`Guards.may` has the server tell the page, per post, whether you may edit or
delete it: the page shows Edit and Delete there. A chirp you just posted is drawn
before the answer with its Edit: the page reads the same rules, and its author
is you whatever the server says of admins. That is a hint; the server's writer
checks the rule on every write.

**The server** (`server/server.ts`). The Entities are bound to SQLite tables
through Drizzle (`bind`); the timeline and a person's posts are queries
(`operations.ts`) the server compiles to SQL. Posting, editing and deleting
(`DeletePost`) are declared writes: the guarded writer lands them, after `RemoteServer.write` has set
a new chirp's author and time, so the browser sends neither. A like is a
declared write too (`LikePost` inserts a Like pointing at whoever asks;
`Unlike` deletes one by the id `liked` holds, and `isLiker` refuses it to
anyone else). A chirp's and a like's id is the browser's, so a create sent
again finds its id taken: both writers keep a ledger (`write_ledger`), which
answers the same operation from the same person (as `Data.retry` sends it)
with its row, and refuses any other create of that id. A deleted chirp's likes
go with it: `likes.post_id` cascades, and the server turns SQLite's foreign
keys on, which sql.js leaves off. `RemoteServer.make` is told who asks (`viewer`), once: `Expr.viewer`
names the asker, and the Post's Source answers each person's own `liked`. Every answer carries what the page shows of the rows
it names or points at: the page sends what its Surfaces read with each write,
and the server reads those fields after the write, so a new chirp lands with
its author's count, and a like with its post's count and `liked`.

**The client** (`app.ts`). `Remote.make` registers the domain; each page
declares what it reads with a Surface (`Home`, `Profile`, `Status`), and is
active while its route is the page's. A Surface does no I/O: Remote reads what
the active ones are missing and reduces the answers into the Model. Told who
reads (`viewer`), Remote shows a like at once from the declarations alone: the
count moves, the heart fills, and nothing in `update` computes either. A new
chirp is predicted the same way: yours, at the time you posted, counted in
your post count, and placed in each loaded list its query admits. `update`
reads no clock, so a post asks for the time first (`Remote.now`), and the
Message it yields starts the write with it; the server keeps that time, so
the answer moves nothing. The timeline draws it when the answer brings `may`, which only
the server can say. A delete is predicted too: the chirp leaves every loaded
list and its author's count at once, and like a post it is durable, so the
outbox keeps it until the server answers.

**The forms** (`compose.ts`, `editor.ts`). The compose box is
`Form.make` over the post's input, with the id hidden and the body a
multiline field; the editor is `Crud.editor` over the edit's input and
mutation, which loads the post, fills the form, saves, and reports its status.
Both are drawn with the UI kit's components (`foldkit-mixins-form/ui`).

**The page** (`view.ts`, `style.ts`). Laid out as the site people know: a
column of posts between hairlines, each a row with its author's `Avatar`, the
nav down the left and the accounts on the right. Below 70rem the nav keeps only
its icons and the accounts move above the posts; on a phone the nav is a bar
along the bottom. Every part is drawn through a slot of `style.ts`, and the
icons are Lucide's, imported by name through `foldkit-media/vite`
(`virtual:foldkit-icons/lucide`): only those imported ship.

## When something fails

- **A write the server refuses** (editing someone else's post, a body too
  long) changes nothing it stores. The editor says why and keeps your draft.
- **A chirp posted while nothing answers** (`?offline`) waits: it shows at
  the top, the page says "1 chirp waiting to send", and a reload reads it back
  from the outbox and shows it again. A page that can reach the server sends
  it, with the id and the time it was written at, and the server keeps it
  once (`Data.mutate(…, { durable: true })`, `Data.outbox`).
- **A like** shows at once and is settled by the server's answer. If the
  server refuses it, the count and the heart go back. A second press before
  the answer takes back the like the first made: `update` reads `liked` from
  the Model, which shows the pending one.
- **The sandbox** lives in your browser: IndexedDB keeps it across reloads,
  every tab shares it through one SharedWorker, and `?reset` starts it again.
  Clearing site data loses it, as it would a real server's disk.

## Limits

- Who you are is a name in the address, not a sign-in. `examples/auth` shows
  Yielded Auth turning a session into the principal these guards read.
- The server runs in the browser so the demo needs no backend. The same
  `openServer` runs on Node's SQLite in the tests (`test/server.test.ts`), and
  `examples/cloudflare` shows Remote served from a Worker over D1.
- Pages are drawn in the browser; `examples/cms` and `examples/auth` show
  server rendering.
- The timeline is read, not followed: a chirp posted in another tab shows
  here once the list is read again (a reload, or a minute after it was read:
  every read is fresh for a minute, `freshness` in `src/app.ts`, so going
  back to a page within it asks nothing), though both tabs share one server.
  A list read live (`Data.query(…, { live: true })` over a live source) would
  follow it; `examples/reference` shows one.
