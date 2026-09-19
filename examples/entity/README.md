# `foldkit-entity` example

One domain declaration, read from both ends:

```text
                    domain.ts
        Entities · relations · Selections
        (imports neither Remote nor Drizzle)
              |                     |
              v                     v
          demo.ts               server.ts
   Remote.make({ entities })        bind(Blog, { tables })
   Data.get(PostPage, id)           Drizzle sources, RemoteServer
              |                     |
              +---- in process -----+
   plan -> read -> SQL -> refs -> store -> decoded value
```

The point is what each file is allowed to know. `domain.ts` says a Post has one
Author and many Comments, and nothing about refs, tables, or foreign keys. The
client learns that relations arrive as refs. The server learns that `author` is
the `author_id` column and `title` is stored as `headline`. Neither repeats what
the domain already said, so neither can disagree with it.

## Run it

```bash
pnpm install
pnpm build
pnpm --filter foldkit-example-entity demo
```

It seeds an in-memory `node:sqlite` database, so there is no service to start.

## What the trace shows

```text
plan: Post:p1 [title,published,commentCount,author,editor,comments]
plan follows: author,editor,comments
before fetch: Initial
after fetch: Ready {"title":"Notes on the Engine", … "editor":null,"comments":[…]}
matches the domain's Selection: true
second plan: Author:a1 [posts]
author: Ready {"name":"Ada","posts":[…]}
```

- **`plan`** comes from `Data.get(PostPage, id)`: the domain's Selection,
  compiled into the requirement graph Remote plans from. Nested Selections
  become the relations it follows.
- **`after fetch`** is real SQL. `RemoteServer` reads through the bound sources:
  a foreign key for `author`, a null one for the optional `editor`, an ordered
  child query for `comments`, and a count for the derived `commentCount`.
- **`matches the domain's Selection`** checks the value the client assembled
  against `PostPage.schema`, the schema `foldkit-entity` built without knowing
  how the value would be fetched.
- **`second plan`** walks the graph from the other side. Ada's name arrived as
  the post's author, so the normalized store already holds it and only `posts`
  is planned.

## What to read

| File | Read it for |
| --- | --- |
| [`src/domain.ts`](./src/domain.ts) | `Entity.define`, `Entity.relate` (a cycle: Post, Comment, Author), `Entity.derived`, and reusable `Entity.select` views |
| [`src/server.ts`](./src/server.ts) | `bind`: tables, a renamed column, the three kinds of relation storage, a derived count |
| [`src/demo.ts`](./src/demo.ts) | An ordinary Remote application and Surface over the domain's Entities and Selections |

`Remote.make` and `Data.get` take the domain's Entities and Selections as they
are, so the client imports nothing of Remote's own `Entity` or `Selection`.

## What it leaves out

Queries, mutations, live updates, and pagination work on these descriptors as
they do on any other, and are covered by the [`remote`](../remote) example and
the [`foldkit-remote-drizzle`](../../packages/remote-drizzle) README. A paginated
relation is still written as a Remote `Selection.connection`, since an Entity
Selection has no windows.
