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
| The posts, their like counts, who liked each | the server's database | `server/server.ts` (`foldkit-remote-server`, `foldkit-remote-drizzle`) |
| The posts the page shows, cached in the Model | Remote, inside the Model | `app.ts` (`foldkit-remote`) |
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
(`PostChirp`), which shows it at once and sends it. The server checks the
guards, stamps the author and the time, writes it, and answers; the answer is
reduced into the Model like any other Message.

## Run it

```sh
pnpm install
pnpm --filter foldkit-example-chirp dev
```

Open the address it prints. Add `?as=ada` to be Ada, the admin, or
`?as=grace`, `?as=linus`; `?reset` starts the sandbox again from the seed.
`pnpm --filter foldkit-example-chirp build:sandbox` builds the published demo
into `dist/`.

## Walking through it

**The domain** (`domain.ts`). A `User` and a `Post` are Entities: their
fields as one Schema, `likeCount` derived (the server counts it), and the
relations between them (`Entity.relate`). A person's `postCount` is
`Derived.count(Chirp.Post.relations.author)`: it says what it counts, so the
server's binding needs no entry for it, and a new chirp's answer carries its
author's new count with no code naming it. `likeCount` counts a join table
with no Entity, so it stays `Derived.make` with the binding's count. The 280-character rule is the
body's own Schema check (`isMaxCodePoints`, characters as SQL counts them), and a
handle's is a pattern with its lengths. The server's decode and the form read
them, and `server/server.ts` makes each table's `CHECK`s from them with
`checkConstraints`, so the database refuses the same thing and no rule is
written twice.

**The guards** (`guard.ts`). `Guards.declare` names two guards: `isAuthor`, a
row guard over the post's `authorId`, and `isAdmin`, whose body only the
server has (`G.implement` in `server/server.ts`). `Guards.attach` says a post
is written by its author or an admin, and `Guards.may` has the server tell
the page, per post, whether you may edit it: the page shows Edit there. That
is a hint; the server's writer checks the rule on every write.

**The server** (`server/server.ts`). The Entities are bound to SQLite tables
through Drizzle (`bind`); the timeline and a person's posts are queries
(`operations.ts`) the server compiles to SQL. Posting and editing are declared
writes: the guarded writer lands them, and `presets` stamp a new chirp's
author and time from who is asking, so the browser sends neither. A like is
the server's own handler (`ToggleLike`): it takes your like back or makes it,
and names the post in its answer. Every answer carries what the page shows of
the rows it names: the page sends what its Surfaces read with each write, and
the server reads those fields after the write, so a new chirp lands with its
count and author, and a like with the post's new count.

**The client** (`app.ts`). `Remote.make` registers the domain; each page
declares what it reads with a Surface (`Home`, `Profile`, `Status`), and is
active while its route is the page's. A Surface does no I/O: Remote reads what
the active ones are missing and reduces the answers into the Model.

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
- **A like** shows at once and is settled by the server's answer. If the
  server refuses it, the count and the heart go back.
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
