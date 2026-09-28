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

## Follow one save before publishing

Read [domain.ts](src/domain.ts), then the editor placement in
[app.ts](src/app.ts), then `CmsServer.make` in [server.ts](src/server.ts).
A saved draft and a published row are different records. Autosave can retain
invalid text; publish must validate and pass the server's authorization rule.

Try saving an unfinished title as the writer, then read the public site as a
visitor. Saving the draft must not make it public. Switch to the editor and
publish a valid form; only then should the public row change. A successful
save is not evidence of a successful publish.

## Run it

```bash
pnpm install
pnpm build
pnpm --filter foldkit-example-cms demo  # the scripted run, printed
pnpm --filter foldkit-example-cms dev   # the same application, in a browser
```

Both use an in-memory `node:sqlite` database, so there is no service to start,
and a restart is a fresh start. `test/demo.test.ts` pins the transcript.

### The address

The studio keeps what is open in the address, so a reload or a shared link lands
where one was: `?post=<entry>`, `?q=` and `?archive=1` for the posts,
`?page=<entry>&block=<node>` for the pages, beside the chair, `?as=`. Opening or
closing a post or a page is a step Back returns from; a search or a selection
replaces the address in place ([address.ts](src/address.ts)).

### As a static site

```bash
pnpm --filter foldkit-example-cms build:sandbox   # to examples/cms/dist
```

The same application with the same server, run in the page on SQLite compiled
to WebAssembly (`sql.js`, in [browser.ts](src/browser.ts)), so it needs no
backend and deploys as static files. Each visitor has a sandbox of their own,
kept in the browser's storage, so a change of chair, which reloads the page,
keeps what was written; `?reset` in the address starts afresh. Nothing is
shared between visitors, so nothing a visitor writes is public. The server is
[server.ts](src/server.ts) given a different database; [endpoint.ts](src/endpoint.ts)
answers a request for both hosts. The page is drawn while the sandbox starts,
the sandbox's code and its wasm are fetched with the page, and
[public/_headers](public/_headers) has Cloudflare Pages keep what is under
`/assets` for a year, since its names change with its content.

The build then renders the public site with `foldkit-ssr` ([prerender.ts](src/prerender.ts),
run by [generate.ts](src/generate.ts)). It runs the same server in Node over the
seed, reads everything each page shows through Remote, and writes every
published page and post as HTML at its address (`site/blog/a-page-is-data.html`),
along with `sitemap.xml` and `robots.txt`. Each page carries its text, its
styles, a description, a link preview (Open Graph and Twitter), a canonical
address and, for a post, its article facts, so a reader, a crawler and a link
preview see it with no script. The studio's pages are `noindex`.

In the browser the site takes a generated page over without drawing it again
or reading any of it ([sitePlan.ts](src/sitePlan.ts), loaded only then). That page
shows the seed, so it is taken over only while the visitor's sandbox still
holds the seed and the page is read as a visitor; after a change, or with
`?as=`, the site draws afresh from the visitor's own sandbox
(`takesOver` in [siteConfig.ts](src/siteConfig.ts)). The seed is dated from a
fixed day, so both show the same dates.

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

## A page, built with the page Builder

The run then tells the same story for a page. A Page is declared the way a Post
is, in [pageDomain.ts](src/pageDomain.ts): an Entity, a form, two mutations and a
content type. The one difference is the `document` key, whose control is the
page Builder from [`foldkit-builder`](../../packages/builder/README.md), over the
site's Blocks in [site.ts](src/site.ts). The CMS is not told there is a Builder,
and the Builder adds no CMS state.

| In the transcript | What it is |
| --- | --- |
| `every change is saved as a draft: Saved; sent SaveDraft, …` | Each Block added and each prop typed is an edit of the `document` key, which the editor autosaves. A selection is not an edit. |
| `resumed from the Model … undo starts over after a reload: 0 steps` | The draft keeps the page as it was left. Undo is the editor's state, not the page's, and does not survive a reload. |
| `the writer's page: Welcome \| Read the blog` | The preview is the site's own Renderer drawing the form's page, laid over Remote's store. Nothing is sent. |
| `a visitor at /home: …` | A visitor gets the page the site draws from the published row. |
| `revisions: 1, 2 … restored as a draft … discarded` | Revisions, restore and discard are the CMS's, for a page as for a post. |
| `in the morning a visitor reads: Good morning …` | A scheduled page goes out when the host asks what is due. |
| `writer: Saved; editor: Conflict` | Two people on one page meet the CMS's conflict rule. |
| `at once, from the pages the editor read to pick from … read through Remote` | `LatestPages` is a Query Block: it reads the worklist through Remote, as the reader may see it. The editor had already read the site's pages for the inspector's picker, so the canvas draws them at once. |
| `it may leave out one of: none, Home … leaving out the page it is on` | Its `except` prop is `Input.relationOne(Cms.Entities.Entry)`. `pageApp.ts` reads the site's pages and gives them to the Builder as the picker's choices (`builderInputs`); the Block stores the chosen entry's id. |

The page column is JSON (`text('document', { mode: 'json' })`), read back through
the composition's tolerant codec, so a stored page always reads. What a publish
takes must also fit the site's Catalog: `PageInput` checks its `document` with
`Composition.valid(Site)`.

## The files

- `domain.ts` imports neither Remote's client nor Drizzle. It declares the
  Entity, the form, the two publish mutations, and the content type.
- `server.ts` binds the Entity to SQLite with a `visible` rule, writes the two
  handlers, and gives both to `CmsServer.make`. Note `cms.sources`, not
  `source(Db.Post)`, and the unique index on `slug`.
- `app.ts` places the editor, a worklist, and the application's own reading of a
  post. Nothing about the placement is CMS-specific.
- `demo.ts` is the three chairs and the clock.
- `site.ts`, `pageDomain.ts`, `pageApp.ts` and `pageDemo.ts` are the page's
  vocabulary, domain, application and story, placed the same way.
- `siteApp.ts` and `siteView.ts` are the public site: its routes, its reads, and
  its view. `seed.ts` is what `pnpm dev` starts with.
- `shell.ts`, `view.ts` and `pagesView.ts` are the studio's views, and
  `icons.ts` its icons, drawn as SVG by the same html builder; `style.ts` is
  its appearance and the site's, as `foldkit-mixins` Style, and `sheet.ts` the
  page's foundations (layers, reset, tokens, theme).

## In the browser

`pnpm dev` starts the server with eight published posts, which explain how the
demo is made, and two published pages (`seed.ts`, written as a publish would
have left them), and serves three
applications on Foldkit's runtime, over an HTTP transport in place of the
in-process one:

| Address | What it is |
| --- | --- |
| `/` | **The studio's posts**: the worklist (active or archived, with search), and a post opened across the screen: a bar with its state and Publish, the post written as it will read, and its publishing, history and other actions beside it. Preview swaps the form for the site's own article. |
| `/pages` | **The studio's pages**: the site's pages, and a page opened in the page Builder: the Blocks to add and the page's layers on the left, the page in the middle, the selected Block's settings on the right. |
| `/site` | **The public site**: the home page, the blog at `/site/blog` (the newest post leading), a post at `/site/blog/<slug>`, and any other page at `/site/<slug>`, read as a visitor may see them. |

**Which chair you sit in is in the address** (`?as=wren`, `?as=edda`,
`?as=visitor`), and the studio's sidebar switches it, so a reload is a change
of chair, and two windows side by side are two authors on one entry. What a
chair may do is the server's `allow`, read back per entry: the writer's editor
has no Publish button and says an editor publishes, where the editor's has one. The site reads as a visitor unless the address
says otherwise, so it shows only what is published.

- **The site is the Builder's output, drawn by the same views.** `site.ts` is
  the vocabulary: Hero, Section, Columns, Heading, Text, Image, Quote, Callout,
  Divider and Button, and three Blocks that read (PostList, FeaturedPost,
  LatestPages). The Builder's canvas and the public site draw a page with the
  one `SiteRenderer`, so what an author arranges is what a visitor gets.
- **A Block's look is a choice, not CSS.** Each Block's look is a
  `foldkit-mixins` recipe made into appearance axes (`Appearance.make`): a
  Hero's `tone` and `align`, a Section's `width`, a Button's tone and variant
  (the mixins-ui button recipe itself). The inspector offers them; the page
  stores only the names.
- **FeaturedPost's post is picked, not typed.** Its prop is
  `Input.relationOne(Post)`; the page app reads the published posts and gives
  them to the Builder as the picker's choices (`builderInputs`).
- **There is no CSS file, and no list of styles.** `style.ts` holds the theme
  (one accent color, `Theme.oklch`) and the Slots the views publish, styled.
  A Style's rules arrive when a view draws it, so `sheet.ts` holds only what
  no Slot draws: the layer order, the reset, the tokens and the theme.
  `vite.config.ts` writes it into the HTML, so a page's first paint already
  has the theme's background rather than white.
- **A new screen starts at the top, and Back returns where it was**
  (`scroll.ts`), once the screen it returns to has drawn its content: the
  browser's own restoring ran before Foldkit drew, against a page still
  loading. A wait shows "Loading…" only once it is noticeable, marked
  `aria-busy`, so a quick answer draws no flash.
- **The address holds what a reload should come back to.** Two kinds of state
  go there, in two ways:
  - The worklist's search and tab are the application's own fields, so a
    `foldkit-mirror` URL mirror shows them (`?q=…&archive=true`) and reads them
    back (`Narrowing` in `app.ts`).
  - The open post and its preview, and the open page with the Builder's
    selection, panel and preview width
    (`/pages?as=edda&page=…&block=…&panel=layers&view=narrow`), belong to the
    editor and the Builder. A navigation asks them through their own Messages
    (`Selected`, `PanelChosen`, `ViewportChosen`, `PreviewShown`), and a
    Subscription writes what they show back (the Builder README's recipe).
    Neither has a Model until its entry has loaded, so what a link asks waits
    in `linked` (pages) or `previewAsked` (posts) until then.
  - Something new is `new=<id>` until its first save turns it into
    `post=<id>` or `page=<id>`, in place. A reload of `new=<id>` opens the id
    first, in case that save already landed, and begins it blank only if the
    server does not have it (`openNamed` and `beginMissing` in `address.ts`).
- **A connection is a list the server put in order**, so something newly made
  joins one only when the query is asked again. The worklist and the pages list
  do that for themselves (`listing` in `app.ts` and `pageApp.ts`).
- `http.ts` keeps time: the CMS owns no timer, so the host asks what is due every
  five seconds. Schedule something a minute out and watch it go.
- **`x-chair` stands in for authentication.** It is the client saying who it is,
  which no real server believes: a real one derives the principal from a session
  it has verified. Everything else about the boundary is real — a visitor's reads
  are refused by the same `visible` rules.

What building this example found in the packages, and what was fixed, is in
[`docs/design/cms-example-FINDINGS.md`](../../docs/design/cms-example-FINDINGS.md).
