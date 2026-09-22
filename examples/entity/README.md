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
   Crud.editor({ form, mutation })  query(PostsQuery), query(AuthorsQuery)
   Crud.list({ query, selection })
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

## A first pass through the code

Begin with one scalar: follow the Post title in [domain.ts](src/domain.ts),
its `headline` column mapping in [server.ts](src/server.ts), and its selection
in the client. A domain field name does not have to match a SQL column name.
Only after that path is clear, follow `author` and then `comments`.

In the browser, change a title and save. The form owns the unsaved draft;
the server owns the row; Remote installs returned patches into its cache.
Canceling an edit should not require undoing a database write. Use this
ownership split when adapting the example to another domain.

## Run it

```bash
pnpm install
pnpm build
pnpm --filter foldkit-example-entity demo
```

It seeds an in-memory `node:sqlite` database, so there is no service to start.

### In a browser

```bash
pnpm build
pnpm --filter foldkit-example-entity dev
```

This starts the same server behind one HTTP endpoint and Vite on
<http://127.0.0.1:5174>. Click a post to edit it; the table row changes when the
save lands, with no refetch. The page is the application the trace runs
(`app.ts`), drawn by `view.ts`: the table from the list's own columns, the form
by `foldkit-mixins-form`. The data is in memory, so a restart resets it.

The first load after an install is slow: Vite pre-bundles the workspace packages
and reloads the page once.

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

### Managing

```text
form controls: Title:Text*, Published:Toggle, Editor:RelationOne
post list: p1 "Notes on the Engine", p2 "Compilers" (draft)
row before: {"id":"p2","headline":"Compilers","published":0,"author_id":"a1","editor_id":"a2"}
editor plan: Post:p2 [editor]; status Loading
filled: Title="Compilers", Published=false, Editor="a2"; status Editing
editor choices: a1 Ada, a2 Grace
invalid submit: Title="" (Title is required), Published=false ok, Editor="a2" ok; status Editing
valid submit:
  command Remote.mutate(EditPost): MutationSucceeded
status: Saved
row after: {"id":"p2","headline":"Compilers, revised","published":1,"author_id":"a1","editor_id":"a1"}
edited: Ready {"id":"p2","title":"Compilers, revised","published":true,"editor":{"entity":"Author","id":"a1"}}
author again: Ready {"name":"Ada","posts":[… "Compilers, revised" …]}
post list again: p1 "Notes on the Engine", p2 "Compilers, revised"
```

- **`form controls`** is what `Form.make` resolved from the input and the Entity,
  with nothing said about controls except that `id` is hidden. `Title` is
  required because its schema admits no empty value; `Editor` is a picker
  because `editorId` is mapped to the `editor` relation, and its label is Entity
  metadata since a relation has no schema to annotate.
- **`post list`** is `Crud.list`: a query and a Selection, run as keyset SQL by
  the Drizzle query source. The list holds no state; its page is Remote's.
- **`editor plan`** is `Crud.editor` at work. Opening the draft row makes the
  members the form writes a requirement, like a Surface's. Only `editor` is
  planned: the list already brought `id`, `title` and `published` into the store.
- **`editor choices`** is `Crud.options`: the form's editor picker is fed by the
  author list, because that list is over the relation's target. Nothing reads the
  authors table because a relation points at it; a query someone declared does.
- **`filled`** is the form starting from the loaded value. Neither what to load
  nor how to fill is written: both follow from the form's input, the editor's ref
  read back as the id the form holds.
- **`invalid submit`** goes nowhere: the form emits no out Message while a key
  fails the input's schema, so no mutation starts.
- **`valid submit`** is the editor's `onOut` turning the decoded `EditPostInput`
  into `Data.mutate`, and **`status`** reading Remote's own mutation state. The
  form knows nothing of Remote. The editor was picked from the choices.
- **`row after`** is the database itself: `headline`, `published`, and
  `editor_id` changed by an ordinary Drizzle `update`.
- **`edited`**, **`author again`** and **`post list again`** moved without a refetch. The mutation
  returned patches for the columns it wrote, and both Projections read the one
  normalized post.

### A page of a relation

```text
page plan: [comments@first=1] {"comments@first=1":{"first":1}}
latest comment: Ready {"title":"Notes on the Engine","comments":{"items":[{"body":"Remarkable."}],"hasNext":true,"hasPrevious":false}}
```

`LatestComment` selects `comments` with `Entity.page(..., { first: 1 })`. The
window travels with the read, SQL answers with one row and whether more follow,
and the value is the page the Selection's schema describes. The Model already
held every comment of that post from the read above; the page is read under a
name of its own, so only it is planned, and afterwards both are there
(`every comment, still: 2`).

### A nested write

```text
nested invalid submit: author.name Invalid; sent false
nested submit: {"title":"On Looms","author":{"name":"Joseph"}}
  command Remote.mutate(WritePost): MutationSucceeded
rows after write: 2 posts, 3 authors
new post: Ready {"title":"On Looms","author":{"name":"Joseph"}}
```

`WritePost` maps its `author` key with `Relation.nested`, so `WritePostForm`
holds a row of the author's own form. An empty submit fails inside the row; a
valid one carries the author in the value. The server inserts the author, then
the post, and returns both as patches, so the new post reads with its author and
no fetch. This runs in the printed trace; the browser page does not draw it.

### The drawn list

The post table is `foldkit-mixins-crud`'s `ListView` over `PostList`: its
columns, labels and cell text come from the list and its Displays, and the page
passes in what opening a row, sorting, "more" and "try again" mean as Messages.

### When the list cannot be read

If the query fails, the table says so in a `role="alert"` line, with a **Try
again** button. Remote does not retry a failed read on its own, so the button
is the retry: `onRetry` sends `RetriedPosts`, and `update` returns
`Posts.refresh(model)`. A refresh that fails with rows already shown keeps them
below the error. `test/page.test.ts` drives this against a server that is
unreachable and then comes back.

### Searching and sorting

The post list's search box and its sortable Title header change two Model
fields, `postSearch` and `postSort`. Those are `PostsQuery`'s input, so the list
now names another connection, and Remote fetches it because it is on screen. No
Message asks for data. On the server the same input picks the `where` and the
`orderBy`; the sort is a name (`'title'`), never a column. `Sort.make(['title'])`
is that state written once: the Model's field, the header's toggle, and the
query's input, with `sortTerms` giving it meaning on the server.

### A picker that searches

The editor's Editor picker has a search box. Its text is the form's
(`EditPostForm.search`), and the author list takes it as `AuthorsQuery`'s input,
so the server finds authors by name. The post's current editor stays a choice
when the search no longer finds them: `Crud.options` was given the form's Model
as `chosen`, and `pickers.active` is wired beside the lists.

### Deleting

```text
asked to delete p1: Confirming; rows 2 posts, 2 comments
  command Remote.mutate(DeletePost): MutationSucceeded
confirmed: Deleted; rows 1 posts, 0 comments
post list after delete: p2 "Compilers, revised"
author after delete: Ready {"name":"Ada","posts":[{"title":"Compilers, revised", …}]}
```

`Crud.remover` asks first; the yes becomes the mutation. The server deletes the
rows and says only what is gone. The post left the list and Ada's `posts` with no
refetch and with no list named, and on the page the editor open on it reads that
its post no longer exists.

### Ids

`AuthorId` and `PostId` are branded in `domain.ts`. The editor opens a `PostId`,
the remover is asked about a `PostId`, the form's editor picker submits an
`AuthorId`, and a list row's `id` arrives as one; passing one where the other
belongs does not compile. On the wire and in SQLite they are plain text.

## What to read

| File | Read it for |
| --- | --- |
| [`src/domain.ts`](./src/domain.ts) | `Entity.define`, `Entity.relate` (a cycle: Post, Comment, Author), `Entity.derived`, reusable `Entity.select` views, and the operation's input struct |
| [`src/operations.ts`](./src/operations.ts) | The mutation and the two list queries both sides share |
| [`src/editForm.ts`](./src/editForm.ts) | `Entity.input` and `Form.make`: a relation key, a relation's label, a hidden id |
| [`src/server.ts`](./src/server.ts) | `bind`: tables, a renamed column, the kinds of relation storage, a derived count; a mutation as plain Drizzle with `returning` |
| [`src/app.ts`](./src/app.ts) | The client application: `Crud.editor` placed as a Bundle (`at`, `onOut`, `after`, `status`), two `Crud.list`s, `Crud.options` joining them, and `Data.wiring` putting all three on screen |
| [`src/view.ts`](./src/view.ts) | The page drawn: a table from `PostList.columns`, the form through `foldkit-mixins-form`, the editor's `status` and `saveError` |
| [`src/demo.ts`](./src/demo.ts) | The trace above, over that application and the in-process server |
| [`src/transport.ts`](./src/transport.ts), [`src/http.ts`](./src/http.ts) | The browser's transport: Remote's three calls as JSON over HTTP, adapted by `Remote.clientLayer` |

`Remote.make` and `Data.get` take the domain's Entities and Selections as they
are, so the client imports nothing of Remote's own `Entity` or `Selection`.

## What it leaves out

The HTTP transport has no live stream and no authentication. Queries, live updates, and pagination work on these
descriptors as they do on any other, and are covered by the
[`remote`](../remote) example and the
[`foldkit-remote-drizzle`](../../packages/remote-drizzle) README. A paginated
relation is still written as a Remote `Selection.connection`, since an Entity
Selection has no windows.
