# `foldkit-entity` example

One domain declaration, read from both ends and written back through a form:

```text
                    domain.ts
   Entities · relations · Selections · EditPostInput
        (imports neither Remote nor Drizzle)
              |                     |
              v                     v
   demo.ts + editForm.ts        server.ts
   Remote.make({ entities })        bind(Blog, { tables })
   Data.get(PostPage, id)           Drizzle sources, RemoteServer
   Form.make(Entity.input(…))       RemoteServer.mutation(EditPost)
   Admin.editor({ form, mutation })
              |                     |
              +---- in process -----+
   read:  plan -> read -> SQL -> refs -> store -> decoded value
   write: keystroke -> form -> mutation -> SQL row -> patches -> store
```

The point is what each file is allowed to know. `domain.ts` says a Post has one
Author and many Comments, and that editing a post may change its title, whether
it is published, and its editor. It says nothing about refs, tables, foreign
keys, or controls. The client learns that relations arrive as refs and that
`editorId` is edited with a picker. The server learns that `author` is the
`author_id` column and `title` is stored as `headline`. Neither repeats what the
domain already said, so neither can disagree with it.

## Run it

```bash
pnpm install
pnpm build
pnpm --filter foldkit-example-entity demo
```

It seeds an in-memory `node:sqlite` database, so there is no service to start.

## What the trace shows

### Reading

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

### Editing

```text
form controls: Title:Text*, Published:Toggle, Editor:RelationOne
row before: {"id":"p2","headline":"Compilers","published":0,"author_id":"a1","editor_id":"a2"}
editor plan: Post:p2 [id,published,editor]; status Loading
filled: Title="Compilers", Published=false, Editor="a2"; status Editing
invalid submit: Title="" (Required), Published=false ok, Editor="a2" ok; status Editing
valid submit:
  command Remote.mutate(EditPost): MutationSucceeded
status: Saved
row after: {"id":"p2","headline":"Compilers, revised","published":1,"author_id":"a1","editor_id":null}
edited: Ready {"id":"p2","title":"Compilers, revised","published":true,"editor":null}
author again: Ready {"name":"Ada","posts":[… "Compilers, revised" …]}
```

- **`form controls`** is what `Form.make` resolved from the input and the Entity,
  with nothing said about controls except that `id` is hidden. `Title` is
  required because its schema admits no empty value; `Editor` is a picker
  because `editorId` is mapped to the `editor` relation, and its label is Entity
  metadata since a relation has no schema to annotate.
- **`editor plan`** is `Admin.editor` at work. Opening `p2` makes the members the
  form writes a requirement, like a Surface's. `title` is missing from the plan
  because the author page already brought it into the store.
- **`filled`** is the form starting from the loaded value. Neither what to load
  nor how to fill is written: both follow from the form's input, the editor's ref
  read back as the id the form holds.
- **`invalid submit`** goes nowhere: the form emits no out Message while a key
  fails the input's schema, so no mutation starts.
- **`valid submit`** is the editor's `onOut` turning the decoded `EditPostInput`
  into `Data.mutate`, and **`status`** reading Remote's own mutation state. The
  form knows nothing of Remote. An empty editor draft
  submitted `null`, because the input admits it.
- **`row after`** is the database itself: `headline`, `published`, and
  `editor_id` changed by an ordinary Drizzle `update`.
- **`edited`** and **`author again`** moved without a refetch. The mutation
  returned patches for the columns it wrote, and both Projections read the one
  normalized post.

## What to read

| File | Read it for |
| --- | --- |
| [`src/domain.ts`](./src/domain.ts) | `Entity.define`, `Entity.relate` (a cycle: Post, Comment, Author), `Entity.derived`, reusable `Entity.select` views, and the operation's input struct |
| [`src/operations.ts`](./src/operations.ts) | The mutation both sides share, over the domain's input |
| [`src/editForm.ts`](./src/editForm.ts) | `Entity.input` and `Form.make`: a relation key, a relation's label, a hidden id |
| [`src/server.ts`](./src/server.ts) | `bind`: tables, a renamed column, the kinds of relation storage, a derived count; a mutation as plain Drizzle with `returning` |
| [`src/demo.ts`](./src/demo.ts) | A Remote application with `Admin.editor` placed as a Bundle: `at`, `onOut`, `after`, `active`, `status` |

`Remote.make` and `Data.get` take the domain's Entities and Selections as they
are, so the client imports nothing of Remote's own `Entity` or `Selection`.

## What it leaves out

There is no view: the trace reads the form's state the way a view would, through
`controls` and `field`. Queries, live updates, and pagination work on these
descriptors as they do on any other, and are covered by the
[`remote`](../remote) example and the
[`foldkit-remote-drizzle`](../../packages/remote-drizzle) README. A paginated
relation is still written as a Remote `Selection.connection`, since an Entity
Selection has no windows.
