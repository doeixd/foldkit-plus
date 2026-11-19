---
title: Composition over copy and paste: Foldkit Plus 0.41
description: Foldkit Plus 0.41 gives you a component's variations by calling the package instead of copying its source, and ships only what you call.
date: 2026-11-18
author: Claude
tags: [release, mixins-ui, expressions, remote, primitives, bundle-size]
---

# Composition over copy and paste: Foldkit Plus 0.41

A popular way to ship UI components today is to copy them. You run a
command, it writes `table.tsx` into your repository, and from then on the
table is yours. That is a fast start. A year later it is a file you maintain:
the library's fixes no longer reach your copy, each variation you needed (a
denser table, one whose rows highlight under the pointer, one with
checkboxes) is an edit to code you did not write, and two projects' copies
have drifted apart.

Foldkit Plus takes the other road. It is a set of open-source packages for
[Foldkit](https://foldkit.dev/), a TypeScript framework for web applications
in which the whole page's state lives in one object and changes only in
response to named events. One of those packages, `foldkit-mixins-ui`, holds
about ninety styled, accessible components: buttons, fields, menus, dialogs,
tables, charts. In release 0.41 you get each variation of a component by
calling the package with different arguments, and your page ships the code
for the arguments you pass and nothing more.

<!-- image: https://foldkit-plus.pages.dev/components/table, three of its examples (Basic, Following highlight, Configure once) side by side, light scheme -->

You do not need to know Foldkit to read this post: the examples are
functions that return HTML.

This release is large, 377 changelog entries, so after the main story there
is a tour of the rest.

In this post:

- [Why not copy, and why not a flag](#why-not-copy-and-why-not-a-flag)
- [One table, three variations](#one-table-three-variations)
- [What it saves: 27.8 kB off every breadcrumb page](#what-it-saves-278-kb-off-every-breadcrumb-page)
- [A tour of the rest of 0.41](#a-tour-of-the-rest-of-041)
- [Upgrading from 0.40](#upgrading-from-040)
- [A colour bug only Chrome 157 had](#a-colour-bug-only-chrome-157-had)
- [See it, try it](#see-it-try-it)

## Why not copy, and why not a flag

Copying is honest about one thing: a component library cannot foresee every
variation, so it hands you the source. The price is that you now own it, and
everything the library learns afterwards (an accessibility fix, a browser
bug) stops at your copy.

The usual alternative is options: `<Table striped hoverHighlight
selectable>`. You keep receiving fixes, but you meet two other limits. The
variation you need is not an option, and you wait or you fork. And a flag
such as `hoverHighlight: true` means the highlight's code has to be in the
bundle whether or not a page sets it, because the library cannot know in
advance which pages will.

We wanted the fixes of options without either limit. So in 0.41 an argument
to a component is one of three things:

- **plain data**, such as a caption, the rows, or the text of a button;
- **a look**, written as data with named choices, which you can extend from
  outside with a choice the package does not have;
- **a feature you import and pass**, such as the table's hover highlight.
  A page that never imports it never ships it.

| | Copied source | An option that is a flag | A value you pass |
| --- | --- | --- | --- |
| Gets the library's fixes | No, you merge them by hand | Yes | Yes |
| A variation the library lacks | Edit your copy | Wait, or fork | Add it from outside |
| Code on a page that does not use a feature | Only what you copied | Shipped anyway | None |

Copying is still the right tool when you want something structurally unlike
any of our components. For that we ship the building blocks the components
are made from (keyboard navigation, focus handling, drag and drop), so you
can assemble your own without starting from nothing.

## One table, three variations

Here is a whole table. A few names need a word first. `Table.view` draws the
table from the arguments it is given. `h` is Foldkit's HTML builder, passed
to every function that draws (`HtmlBuilder` is its type). `Recipes.Table` is
the table's shipped look, written as data with named choices; the package
calls such a look a *recipe*, and `rows: 'striped'` is one choice on it.
`Style.forSlots(TableSlots)` turns that look into CSS classes for the table's
named parts, which the package calls *slots* (the table, its rows, its
cells); `TableSlots` is the list of those names.

```ts standalone
import type { HtmlBuilder } from 'foldkit/html'
import { Style } from 'foldkit-mixins'
import { Recipes, Table, TableSlots } from 'foldkit-mixins-ui'

const invoices = [
  { id: 'INV-001', status: 'Paid', amount: '$250.00' },
  { id: 'INV-002', status: 'Pending', amount: '$150.00' },
]

const Striped = Style.forSlots(TableSlots)(Recipes.Table({ rows: 'striped' }))

export const invoiceTable = (h: HtmlBuilder<never>) =>
  Table.view(
    {
      caption: 'Recent invoices',
      columns: [
        { header: 'Invoice', rowHeader: true, value: row => row.id },
        { header: 'Amount', numeric: true, value: row => row.amount },
      ],
      rows: invoices,
      style: Striped,
    },
    h,
  )
```

Most of those lines are your data: the rows and which column shows what. The
library's part is the two lines that pick a look. The markup is a real
`<table>` with a `<caption>`; `numeric` aligns a column of figures, and
`rowHeader` makes the invoice number the row's `<th scope="row">`, which is
what a screen reader names a row by.

**A look the package does not have.** Say your tables need a heavy rule under
each row. You do not fork the recipe; you give it one more choice with `add`,
and every choice it already had still works. `Style.self` wraps ordinary CSS
declarations, written as an object, as a piece of a look:

```ts
const Tables = Recipes.Table.add({
  rows: { ruled: { row: Style.self({ borderBlockEnd: '2px solid rebeccapurple' }) } },
})
const Ruled = Style.forSlots(TableSlots)(Tables({ rows: 'ruled', density: 'compact' }))
```

`add` refuses a choice the recipe already has, both as a type error and when
the module loads, so it cannot quietly replace a shipped look; changing one is
`.extend`'s job.

**A feature you pass.** The hover highlight is one soft shape behind the
rows that glides to the row under the pointer. It is a value, `Table.fluid`,
in a file of its own:

```ts
export const highlightedTable = (h: HtmlBuilder<never>) =>
  Table.view(
    {
      columns: [{ header: 'Invoice', rowHeader: true, value: row => row.id }],
      rows: invoices,
      style: Ruled,
      fluid: Table.fluid,
    },
    h,
  )
```

A page that never writes `Table.fluid` never downloads the highlight's code.

<!-- image: https://foldkit-plus.pages.dev/components/table, the "Following highlight" example with the pointer over the second row and the highlight behind it -->

**The same table, configured once.** An application usually wants every
table to look alike. `Table.configure` takes the arguments that never change
and gives back a `view` that needs only what differs:

```ts
const AppTable = Table.configure({ base: { style: Striped, fluid: Table.fluid } })

export const ordersTable = (h: HtmlBuilder<never>) =>
  AppTable.view({ columns: [{ header: 'Order', value: row => row.id }], rows: invoices }, h)
```

It can also hold named presets (`presets: { dense: { … } }`, then
`preset: 'dense'` at a call), and a misspelt preset name is a type error.
About fifty components have a `configure`. Each of these examples, written out
as a whole module, is on the
[table's page](https://foldkit-plus.pages.dev/components/table); the code
shown there is the code that draws it.

**Components that remember something.** A listbox has to remember whether it
is open and which row the arrow keys are on. In 0.40 you wired that memory
into your application's state by hand. In 0.41 about forty such components
come with it packaged, as a *Bundle*: you name the field of your state it
lives in, and the package writes the wiring. Writing it by hand still works
and adds nothing to the page; the first Bundle costs about 6 kB (compressed
with brotli), shared by every later one. The
[README shows both ways](https://github.com/doeixd/foldkit-plus/blob/v0.41.0/packages/mixins-ui/README.md#state-fold-it-by-hand-or-place-a-bundle),
and the [Listbox page](https://foldkit-plus.pages.dev/components/listbox)
runs it.

## What it saves: 27.8 kB off every breadcrumb page

A page that draws a breadcrumb trail is 27.8 kB lighter in 0.41, compressed.
That comes from the flag rule above. In 0.40 a breadcrumb could fold its middle steps into a menu, so the breadcrumb
imported our Menu component for every trail, folded or not. In 0.41 the fold
is a value you pass (`max` is how many steps stay visible):

```diff
- Breadcrumb.view({ ...options, collapse: { max: 3, menu } }, h)
+ Breadcrumb.view({ ...options, collapse: BreadcrumbMenu.make({ max: 3, menu }) }, h)
```

A minified page of just a trail is now 68.4 kB of JavaScript compressed with
brotli; the same page with the menu passed is 96.2 kB. Every trail page used
to carry that difference. Table's highlight and checkboxes, each chart kind,
the avatar's image-service support, the card group's highlight and the image
cropper's zoom slider went the same way.

The second change is to freeze styles. A recipe is code holding every choice
it offers, and a bundler cannot tell which choices you picked. The build
plugin of `foldkit-mixins`, our styling package, can run your style modules
at build time and ship only the class names they produced
([how](https://github.com/doeixd/foldkit-plus/blob/v0.41.0/packages/mixins/README.md#style-modules-shipped-as-data)).
On a page that draws one styled button, that took the JavaScript from
114.1 kB to 91.8 kB. Our design-system example, which draws most of the
catalogue, went from 220.7 kB to 184.2 kB. The new component APIs in this
post are all built so they can be frozen.

We also measured an idea that did not pay: splitting each recipe into a file
per choice. Narrowing the button's recipe by hand to the one look the page
used saved 136 bytes, so we kept recipes whole.

The breadcrumb figure is held by
[a test](https://github.com/doeixd/foldkit-plus/blob/v0.41.0/packages/mixins-ui/test/breadcrumbBuild.test.ts)
that fails if the menu reaches a plain trail page again, and the
design-system figure by its
[size budget](https://github.com/doeixd/foldkit-plus/blob/v0.41.0/examples/design-system/test/bundle.test.ts).
The one-button figure was measured once, with Vite 8 on 2026-11-17, and no
test holds it.

## A tour of the rest of 0.41

### Write a rule once, and let every side read it

Every application states the same rules in several places. "Products in
stock" is a SQL `where` on the server, a filter over the rows the page
already holds, and a check in a form, and the copies drift until the page
shows something the server will not say. `foldkit-entity`, our package for
describing an application's records, lets you write such a rule once, as an
*expression*: a condition stored as a value instead of code that runs.

In the snippet, `Schema` comes from Effect, the TypeScript library Foldkit
is built on, and describes the shape of a value.

```ts standalone
import { Schema } from 'effect'
import { Entity, Expr, Query, evaluate } from 'foldkit-entity'

// A kind of record and its fields, much like a table definition.
const Product = Entity.define(
  'Product',
  Schema.Struct({ id: Schema.String, status: Schema.Literals(['draft', 'published']), stock: Schema.Number }),
)

// "Products in stock", as a value (Expr.gt is "greater than"). Building it runs nothing.
const InStock = Query.from(Product).pipe(Query.where(Expr.gt(Product.fields.stock, 0)))

// evaluate answers it over rows you hand it, as the page does with the rows it holds:
evaluate(InStock, {}, [
  { id: 'a', status: 'draft', stock: 2 },
  { id: 'b', status: 'published', stock: 0 },
]) // [{ id: 'a', … }]
```

On the server, `foldkit-remote-drizzle`, our adapter for the Drizzle SQL
toolkit, compiles the same `InStock` value to SQL for SQLite, Cloudflare D1
or Postgres. A shared suite of test cases holds every reader of the value
(the SQL compiler, `evaluate`, the page) to one answer, and a reader that
cannot answer (the page does not hold a row it would need) says
"unknown" instead of guessing. The server keeps the authority; what the page
works out is a hint until the server's answer arrives.

None of that is new in 0.41: expressions have filtered queries since 0.8.0,
rules about who may write since 0.17.0, rules every record must keep since
0.33.0, and conditions over related records, the asking user and the time
since 0.36.0. What 0.41 adds is a guide that finally teaches it as one
language: [Expressions](https://foldkit-plus.pages.dev/entity/guides/expressions).

### New: named states, and a check of every write

A record often moves through states: a product is a draft, then published.
0.41 lets you name a state once, and declare that a write starts in one
state and leaves the record in another. A *write* here is a change the
server accepts, declared as data so that the page and the server read the
same declaration; `foldkit-remote`, our package for server data, declares one
with `Mutation.write`. `Laws.check` then judges every declared write against
every rule, with no database:

```ts
import { Laws, Write } from 'foldkit-entity'
import { Mutation } from 'foldkit-remote'

// Two named states of a product.
const Draft = Entity.refine(Product, 'Draft', { status: 'draft' })
const Published = Entity.refine(Product, 'Published', { status: 'published' })

// A write that takes a draft and leaves it published. Its input names the
// product and its new status.
const Release = Mutation.write(
  'Release',
  Write.update(
    Entity.input(Product, Schema.Struct({ id: Schema.String, status: Schema.Literal('published') })),
    { id: 'id', from: Draft, becomes: Published },
  ),
)

export const report = Laws.show(Laws.check({ writes: [Release] }))
```

A product that is not a draft is refused. "Leaves it published" is checked
where the write is declared, by trying every record it could start from. The
report lists, for each write and each rule, whether the write can break it,
and flags a state nothing reaches or nothing leaves. `npx foldkit-plus laws`
prints the same report from a terminal. Beside it, `Data.can` tells a page
whether a write would be refused before it sends it, and `Scenario` writes a
test case as data and runs it against the page and the server alike. The
[Laws guide](https://foldkit-plus.pages.dev/entity/guides/laws) walks through
it.

### An event-sourced server behind Remote

`foldkit-remote` is our package for server data: it keeps the rows a page
reads from a server in the page's state and sends its writes. 0.41 adds
`foldkit-remote-domain`, a new and experimental package that puts an
[Alchemy Domain](https://alchemy.run/domain) model behind it. Alchemy Domain
is an event-sourcing library: instead of updating rows, the server records
events ("reserved", "cancelled") and builds the rows by replaying them. With
the new package, a page reads and writes such a server the way it reads and
writes any other, without keeping a second copy of the rows. It pins the
Alchemy beta it was checked against. Start with
[An event-sourced domain behind Remote](https://foldkit-plus.pages.dev/remote/guides/event-sourced-domains).

### Server answers that are newer, and failures that say less

Two changes to how `foldkit-remote`, the server-data package, talks to a
server matter even if you never read the wire. Each row now carries a revision number, and an answer older than
the row the page already holds is ignored, so a slow read can no longer
undo what a write just showed. And a failure on the server's own side no
longer sends its message to the browser, where a database error or the
name of a hidden field used to leak. The caller reads "Internal error" and an
incident id, the cause goes to the server's logs under the same id, and
`RemoteData.incident` lets a page show the id to quote. Words meant for the
user are now said on purpose, with `RemoteServer.tell`. `foldkit-sync`, our
package for offline edits that agree across devices, follows the same rule.

### Building blocks for keys, focus and drags

`foldkit-primitives` holds the building blocks the components are made from,
each usable on its own. New in 0.41: `InlineEdit` (a value edited in place,
started by Enter, F2, a double click or typing), `SpatialNavigation` (arrow
keys move to the nearest item on a board or a canvas), `Reorder` (moving an
item in a list or tree with the keyboard, beside the mouse), `SwipeActions`
(actions behind a row, with a keyboard way in) and `FocusRecovery` (where
focus goes when the focused element disappears). Drag and drop gains
scrolling at the edges, a lasso on empty space and drops between items. The
site's new [Primitives gallery](https://foldkit-plus.pages.dev/primitives/gallery)
shows each one, several running live.

<!-- image: https://foldkit-plus.pages.dev/primitives/gallery, the first screen of cards with one live example in view -->

### Two new components: FileUpload and CodeBlock

**FileUpload** is a field of files with a status each. Drop, pick and paste
all arrive the same way, a refused file says why, files upload a few at a
time with previews, and a failed one can be retried. Reach for it for a
profile picture or a batch of attachments
([page](https://foldkit-plus.pages.dev/components/file-upload)).

<!-- image: https://foldkit-plus.pages.dev/components/file-upload, a zone with three files: one sent, one uploading with its bar, one refused for its size -->

**CodeBlock** can now mark whole lines as added, removed or highlighted,
fold a long block behind an "expand" button, and make each line number a
button, which is what a code review or a tutorial wants
([page](https://foldkit-plus.pages.dev/components/code-block)).

<!-- image: https://foldkit-plus.pages.dev/components/code-block, a block with added and removed lines and a folded tail -->

### The page builder, rich text and the data grid

The drag-and-drop page builder shows what you are carrying, gives the
selected block a handle big enough for a finger, and drops between blocks
instead of at the page's end
([page](https://foldkit-plus.pages.dev/composition/guides/mixins-builder)).
The rich text editor gains a standard formatting toolbar that tucks the tools
it has no room for into a "More" menu on a phone, and can keep Markdown text
in a form field while you edit formatted text
([page](https://foldkit-plus.pages.dev/richtext)). The data grid copies a
selection as an HTML table beside the plain text, so it pastes into a
document as a table, and can scroll to a row for a "go to row" control
([page](https://foldkit-plus.pages.dev/data-grid)).

### Selected text in your theme's colour

When you select text, the highlight now takes your theme's accent colour, in
light and dark schemes, instead of the browser's default. The default theme
also now casts soft shadows and rounds corners a little more. Both are
settings you can turn back.

Everything else, entry by entry, is in the
[0.41.0 changelog](https://github.com/doeixd/foldkit-plus/blob/v0.41.0/CHANGELOG.md#0410).

## Upgrading from 0.40

Most of the breaking changes are renames, and a rename is a type error where
you used the old name, so the TypeScript compiler gives you the list.
[Upgrading to 0.41](https://github.com/doeixd/foldkit-plus/blob/main/docs/upgrading-0.41.md)
covers every package, with a before and after for each change. Four changes
compile either way, so check them by eye:

1. **The default theme** casts shadows, rounds corners more and deepens the
   accent; the guide has the five settings that bring 0.40's look back.
2. **A card group** draws its pointer highlight only when you pass
   `fluid: Card.fluid`.
3. **An image cropper** draws its zoom slider only when you pass
   `zoom: ImageCropper.zoomSlider()`.
4. **A color picker's eyedropper** is off unless you pass `eyedropper`.

## A colour bug only Chrome 157 had

The day before the release, selected rows in our demos turned pink, in
Chrome and Edge 157 only. OKLCH and OKLab are two CSS colour spaces; OKLCH
describes a colour by its lightness, chroma (how colourful it is) and hue.
Our theme derives pale tints of the accent colour with CSS relative colour
syntax, `oklch(from <mix> l c h)`, which reads those three values from a
mixed colour and writes them back. Chrome 157 reads no hue from
a colour with very little chroma unless it was written in OKLCH, and our pale
blue tint had a chroma of 0.017: its hue came back as 0, a pinkish red.

The fix writes the tint in OKLab instead, scaling its two colour axes (`a`
and `b`) together, so there is no hue to lose. Firefox, WebKit and earlier
Chromium paint it exactly as before. If you derive tints with relative colour
syntax, look at them in Chrome 157.

## See it, try it

See it first:

- [The table's page](https://foldkit-plus.pages.dev/components/table), and
  the [component pages](https://foldkit-plus.pages.dev/components) for the
  other ninety.
- [The widgets demo](https://foldkit-widgets-demo.pages.dev/), a small
  application that uses many of them together.
- [The Primitives gallery](https://foldkit-plus.pages.dev/primitives/gallery),
  for the building blocks.

<!-- image: https://foldkit-widgets-demo.pages.dev/, the first screen in a dark scheme -->

Then try it. Install the widget package and the packages it builds on:

```bash
pnpm add foldkit foldkit-mixins foldkit-mixins-ui foldkit-primitives @foldkit/ui effect
```

and draw the table from [One table, three variations](#one-table-three-variations).
[The widget package's guide](https://foldkit-plus.pages.dev/mixins/guides/mixins-ui)
starts from a single button.

Next we are giving dialogs and popovers the same one-call drawing the table
has, since a dialog example is still fifty lines today.
