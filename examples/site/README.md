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
main.ts: Model { path, page, and what the browser changes } ──▶ the browser
```

- **The catalog owns the map.** [`src/catalog.ts`](src/catalog.ts) names each
  subsite, the packages it documents and the documents its guides are cut
  from. The home page's cards and every sidebar are drawn from it.
- **The content is the server's.** The guides, the API pages, the sidebars and
  the home page's coloured code are `SSR.static` regions: rendered once, at
  build time, and adopted by the browser as they are. The browser's bundle
  holds none of it; `src/library.ts`'s `browserLibrary` draws nothing.
- **Two applications, one site.** The guides, API pages, demos and home page
  are the first (`src/shell.ts`); the component pages and the theme creator are
  the second (`src/main.ts`), which is the first plus the previews' state, every
  recipe and the theme `/create` makes. `src/paths.ts` says which draws an
  address, and the build, the dev server and the browser's entry all ask it:
  `site.ts` gives each path its own config and plan (`SiteModule.plan` is a
  function of the path), and `entry.ts` loads only that application's chunk. A
  reader of a guide loads about half the JavaScript a component page does
  (`test/bundle.test.ts` holds both). The shell's Model, Messages and update are
  shared with the second application, which answers them through
  `shell.updateOwn`.
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

## Components and the theme creator

`/components` is a gallery of the recipes `foldkit-mixins-ui` ships, a page per
component, and `/create` a theme creator. Three files hold it:

- [`src/gallery/theme.ts`](src/gallery/theme.ts): the knobs, the presets, and
  the theme module `/create` hands out (`codeOf`; for the defaults it is
  [`src/snippets/theme.ts`](src/snippets/theme.ts), which the typecheck
  compiles and `test/theme.test.ts` compares).
- [`src/snippets/components.ts`](src/snippets/components.ts): each component
  drawn as an application draws it, one `// #region <slug>` each. A
  component's page shows its region, coloured at build time, and its previews
  call the function the region defines, so the code is what drew them.
- [`src/gallery/catalogue.ts`](src/gallery/catalogue.ts) and
  [`src/gallery/previews/`](src/gallery/previews): the list, and one module per
  showcase (`showcases.ts` gathers them for the server and the tests). A
  showcase's variant axes are read from its recipe (`recipe.def.variants`),
  and a value reaches the recipe only if the recipe has it.

A preview declares the whole component theme on its own element, and `/create`
sets its knobs inline there. A custom property resolves where it is declared:
tokens on `:root` would reach the preview already resolved, and a knob set on
it would change nothing. So the site's own look never moves, and every token
in the preview re-derives from the knobs in the browser. The variant picked,
the knobs and the previews' controls are browser-only Model fields
(`local`), fresh on every page.

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

## Writing a post

The blog is at `/blog`, its Atom feed at `/blog/feed.xml`. A post is a Markdown
file in [`docs/blog/`](../../docs/blog), named `<yyyy-mm-dd>-<slug>.md`, that
starts with front matter:

```text
---
title: Composition over copy and paste: Foldkit Plus 0.41
description: One or two sentences: the page's meta description and the index's summary.
date: 2026-11-18
author: Claude
updated: 2026-11-20
image: /blog/og/my-card.png
tags: [release, mixins-ui]
---

# Composition over copy and paste: Foldkit Plus 0.41

The text, from here.
```

`title`, `description`, `date`, `author` and `tags` are required; `updated` and
`image` are not. The keys are read strictly: an unknown key, a missing one, a
date that is not on the calendar, a `date` that differs from the file's name or
an `updated` before it fails the build with the file's name. Values are plain
text on one line (`tags` as `[a, b]`; no other YAML), and a `tags` entry is
lowercase words and hyphens. The address is `/blog/<slug>`, the slug being the
file's name after its date with each `.` made a `-`.

- The first `#` heading in the file is optional, for a reader of the file on
  GitHub; when it is there it must be the title, and the page draws the title
  as its own `h1`. A `##` heading is a section of the table of contents.
- `image` is the social card: a PNG under `public/`, written as the site serves
  it. A post without one shares [`/blog/og/default.png`](public/blog/og/default.png),
  made by `node scripts/social.mjs` from `assets/blog-card.svg`. The card's
  pixels are read from the file for `og:image:width` and `og:image:height`;
  1200 by 630 is what link previews want.
- A paragraph that holds only an image is a `<figure>`: its size is read from the
  file (a PNG or JPEG under `public/`, written `/blog/x.png`), so the page does
  not move as it loads; its title, `![alt](/blog/x.png "A caption")`, is the
  caption. Every image after the first few blocks loads lazily.
- A relative link leads where the guides' links do (a page of the site, or the
  file on GitHub). A TypeScript block of a post is compiled by `scripts/docs-check.mjs`
  like every other document's; mark a fragment `ts sketch`.
- The feed carries each post's summary and a link, not its text: a reader would
  see its code blocks and tables without the site's styles.

To preview, run `pnpm --filter foldkit-example-site dev` and open `/blog`. The
library reads the posts once, so a post you add or edit shows after the dev
server restarts. `test/blog.test.ts` renders the blog on its own, in seconds,
over a repository it makes.

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
- `src/shell.ts`: the first application's Model, Messages, `update`, resume plan
  and document head; `src/main.ts` is the second's, over it; `src/page.ts` the
  pages both name; `src/paths.ts` which application draws an address.
- `src/view/`: the frame and rail (`frame.ts`, written once over either
  application's Message; `shellLayout.ts` and `layout.ts` give it each one's pages), the home page, the demos, the
  component pages and the theme creator, and a doc page's two regions.
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
- `src/blog/`: the blog, build-time only except `meta.ts`: the front matter
  (`frontMatter.ts`), the posts (`posts.ts`), their pages and typography
  (`view.ts`, `style.ts`, drawn into one static region so the browser's bundle
  holds none of it), the head each page's plan writes (`meta.ts`) and the feed
  (`feed.ts`).
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
