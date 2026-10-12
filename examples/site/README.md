# The website

The project's website, [foldkit-plus.pages.dev](https://foldkit-plus.pages.dev/):
a home page that explains Foldkit Plus with real code, the demos, and a subsite
per package family whose sidebar holds its **Guides**, cut from the repository's
Markdown, and its **API**, read from each package's source.

It is a Foldkit Plus application itself: every page is rendered at build time
by `foldkit-ssr`'s `staticSite`, taken over in the browser, and styled with
`foldkit-mixins`, with no CSS file. [`examples/foldkit/ssg`](../foldkit/ssg) is
the same build at its smallest.

## How a page is made

```text
catalog.ts ─┬─ READMEs, docs/*.md ──▶ guides.ts (cut at ## headings, links rewritten)
            └─ packages' entry points ──▶ API pages       (api/extract.ts, the TypeScript checker)
                     │
                     ▼
            content/library.ts ──▶ static regions ──▶ HTML at build time
main.ts: Model { path, page, menuOpen, example, copied } ──▶ the browser
```

- **The catalog owns the map.** [`src/catalog.ts`](src/catalog.ts) names each
  subsite, the packages it documents and the documents its guides are cut
  from. The home page's cards and every sidebar are drawn from it.
- **The content is the server's.** The guides, the API pages, the sidebars and
  the home page's coloured code are `SSR.static` regions: rendered once, at
  build time, and adopted by the browser as they are. The browser's bundle
  holds none of it; `src/library.ts`'s `browserLibrary` draws nothing.
- **The browser owns little.** The plan sends the address and what the page is
  (its title and description). The phone menu, the home page's example tab and
  the copy button's state start fresh on every page. Links are ordinary links:
  each page is a new document.

A guide page is one `##` section of its file; a section shorter than about 700
characters stays on the page before it. A link to another file that is on the
site goes to the page holding its target, and anything else to GitHub.

Code in prose links to what it names (`src/content/links.ts`): `` `Remote.make` ``
to the member on its API page, `` `foldkit-sync` `` to the package's guides. It
links only a name that names one thing: a re-export yields to the declaration,
a name two packages declare links only from a page of one of them, and a
lowercase word, a name every application has (`Model`, `Schema`) or a plain
word that is not a namespace stays text outside its own family. Each export's
page lists the guide pages that name it, under "In the guides".

### Moving between pages

Each page is a new document, so the build makes that fast rather than avoiding
it. Pages are written as `remote.html`, which the host serves at `/remote` with
no redirect. `index.html` asks the browser to prerender a link the pointer rests
on (speculation rules), so a click shows it at once, with no animation between
the two. A small script in `index.html` keeps the
sidebar's scroll from page to page, or brings the current entry into view; it
places the rail again whenever the application draws a new one.

## One list of demos

[`src/demos.ts`](src/demos.ts) holds every demo once. The site draws its rows
from it, every demo draws its guide (the "How to try this demo" pill in its
corner) from its own entry, and the root README's list of demos is written from
it:

```bash
pnpm --filter foldkit-example-site readme   # rewrites the list between <!-- demos --> markers
```

`test/demos.test.ts` fails when the README's list and the data differ, and when
a demo names an example, a file or a package that does not exist.

## Run it

```bash
pnpm --filter foldkit-example-site dev
FOLDKIT_BUILD_ID=local pnpm --filter foldkit-example-site build   # to examples/site/dist
```

The build needs `FOLDKIT_BUILD_ID`, the deployment the pages belong to, as
every `foldkit-ssr` build does.

`test/prerender.test.ts` builds every page and checks that each link leads to a
page the build wrote, an anchor on it, or a file in the repository, so a
renamed heading or a moved file fails the test rather than a reader.

## Files

- `src/catalog.ts`: the subsites, their packages and their documents.
- `src/main.ts`: the Model, the Messages, `update`, the resume plan and the
  document's head.
- `src/view/`: the frame and rail (`layout.ts`), the home page, the demos, and a
  doc page's two regions.
- `src/content/`: the build-time half: Markdown cut into guide pages, drawn with
  the inert builder, code tokenized by `foldkit-richtext-code-shiki` into the
  `syntax-*` kinds and drawn by `foldkit-mixins-ui`'s `CodeBlock`, colored by
  the theme, and the library the view asks. A code block's copy button is in a
  static region, which draws no handler: a click subscription in `main.ts`
  finds which button was pressed and copies its block's code.
- `src/api/`: the API data, read with the TypeScript checker from the source
  file behind each of a package's `exports`, when the library is built. An
  entry point is a page listing its exports by kind, and each export a page
  of its own with its declaration, doc comment and members.
- `src/snippets/`: the home page's examples, real modules the typecheck
  compiles.
- `src/style.ts`: the Slots and their Styles.
- `src/guide.ts`: the guide each demo draws, a pill fixed in the corner that
  opens a short panel with the demo's steps; exported as
  `foldkit-example-site/guide` (the data as `foldkit-example-site/demos`). It
  carries its own colours, each a `light-dark()` pair, so it looks the same in
  every demo whatever its theme and follows the reader's colour scheme. An
  application calls `demoGuide<Message>()` once, for its Messages.
- `src/site.ts`, `src/entry.server.ts`, `src/entry.ts`: what `staticSite`
  renders, what the dev server serves, and the browser's takeover.
- `src/readme.ts`, `scripts/readme.ts`: the root README's list, and the script that writes it.
