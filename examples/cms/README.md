# `foldkit-cms` example

A post's life, from its first keystroke to being taken off show, told from three
chairs: a writer who may not publish, an editor who may, and a visitor who is
nobody. One server, in process; each chair has its own Model.

```text
                          domain.ts
     Post · PostInput · PostForm · CreatePost · UpdatePost
     Cms.roles({ label, slug, published }) · Cms.content('posts', …)
              |                                   |
              v                                   v
           app.ts                             server.ts
   Cms.editor({ content })             bind({ Post }, { visible: published(…) })
   Crud.list over Cms.Entries          your create / update handlers
   Data.get(PostPage, id)              CmsServer.make({ content, transaction, allow })
              |                                   |
              +------------- in process ----------+
   typing -> draft (beside the row) -> publish -> your mutation -> the row -> a visitor
```

The point is where unfinished work lives. The `posts` table holds what is
published and nothing else: no status column, no half-written row. What a writer
has entered and not sent is a draft, kept beside it, which a visitor's read
cannot reach because it never touches drafts. Read the last line of the run: the
row was never a draft's to spoil.

## Run it

```bash
pnpm install
pnpm build
pnpm --filter foldkit-example-cms demo
```

It uses an in-memory `node:sqlite` database, so there is no service to start.
`test/demo.test.ts` pins the transcript.

## What the run shows

| In the transcript | What it is |
| --- | --- |
| `no title yet … and it is saved` | Autosave keeps a form that does not validate. Publishing would refuse it. |
| `the address follows the title` | `Cms.slug('title')`: the slug follows until the writer writes it. |
| `a visitor at /blog/hello-world: 404`, `a visitor's worklist: empty` | The audience boundary: to a visitor, entries and drafts are empty tables. |
| `the writer's page: … / preview off: NotFound` | In-app preview is the form laid over Remote's store. Nothing is sent, and with it off there is no row to read. |
| `writer: PublishFailed (This author may not publish…)` | The server asks your `allow`: anyone may write, an editor puts it in front of visitors. |
| `resumed from the Model` | The editor opens the writer's draft exactly as it was left. |
| `Changed, scheduled` / `what is due that evening: []` | A promise for later. The host calls `cms.due(now, { as })`; the package owns no timer. |
| `editor: Conflict, with "Edda was here." still in the form` | A second save is a conflict, not an overwrite, and the text is kept. |
| `restored as a draft … nothing was published by that` | A revision comes back as a draft like any other. |
| `state Unpublished … 404 … still has it` | Off show, and still the editor's to work on. |

## The files

- `domain.ts` imports neither Remote's client nor Drizzle. It declares the
  Entity, the form, the two publish mutations, and the content type.
- `server.ts` binds the Entity to SQLite with a `visible` rule, writes the two
  handlers, and gives both to `CmsServer.make`. Note `cms.sources`, not
  `source(Db.Post)`, and the unique index on `slug`.
- `app.ts` places the editor, a worklist, and the application's own reading of a
  post. Nothing about the placement is CMS-specific.
- `demo.ts` is the three chairs and the clock.

There is no browser mode yet. The views would be `FormView` over the editor's
form with `Cms.controlRenderers()`, and `ListView` over the worklist with
`Cms.displayRenderers()`.
