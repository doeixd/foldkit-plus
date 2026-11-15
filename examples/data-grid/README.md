# Product registry

A data grid over 100,000 products: the UPC pinned at the left, descriptions
and prices edited in place, rows and cell ranges selected, columns resized,
dragged, and hidden or pinned from their menus, and copy and paste with a
spreadsheet.

It shows the ownership split in [`foldkit-data-grid`](../../packages/data-grid/README.md):

```text
the application owns the products   (Model.products, changed only by onOut)
the grid owns the interaction       (focus, selection, column widths and order, viewport, the open editor)
```

The grid never writes a product. A committed edit or a paste comes out as the
grid's OutMessage (`Edited`, `Pasted`, or `Filled`, whose cells `Grid.fill` works out from the products; this example keeps no undo history, so it ignores `UndoRequested` and `RedoRequested`), carrying text that the column's
`validate` has already accepted, and `onOut` in [main.ts](src/main.ts) writes it
into the products. A refused cell stays in the editor with its message, or is
listed under `refused` in a paste.

The filters are the page's too: the grid reports each as `Filtered`, and
`rowsOf` filters the products before the grid sees a row. Around the grid the
page says what to try, shows how many products a filter keeps ("42 of 100,000
products match") beside a Clear filters button, and announces what an action
did in a live region of its own. The selection count stays outside it: it
changes on every key, and a screen reader would read it each time. The button
stays drawn (`aria-disabled` when no filter is on), so pressing it never drops
focus.

Above the grid, a toolbar searches the products (description, line or UPC, on
top of the column filters) and sets the row density. The search text and the
density are the toolbar's Model slice; `rowsOf` reads the text, and the view
reads the density as the grid's `rowHeight`. The toolbar is a `Bundle.lazy`
in [toolbar.ts](src/toolbar.ts): its Model, Messages and a plain field that
stands in are in the first load, and its widgets (`SearchField`, `Segmented`,
in [toolbarBody.ts](src/toolbarBody.ts)) are a chunk fetched right after the
page starts. `test/bundle.test.ts` holds both the size and that those widget
modules are absent at start.

Go to row takes a number from one and scrolls the least that shows it
(`Placed.helpers.reveal`, which moves no focus); a Command then puts the keyboard
on that row's UPC cell, since the reveal does not. A range of cells says its size
in the counts (`Grid.rangeSize`), and a copy says what it took ("Copied 3 rows by
2 columns") through the grid's `Out.Copied`. The toolbar's "Keyboard shortcuts"
disclosure lists the keys with `formatHotkey`, so a Mac reads `⌘C` where
Windows reads `Ctrl+C`; it is in the toolbar's chunk, so the first load does not
carry it.

On a phone (40rem or narrower), a viewer with no saved layout starts with the
UPC at 124px and the description at 200px, so the second column shows beside
the pinned one. The rest scrolls sideways inside the grid; the page does not.

The columns stay as you leave them, in this browser. After any transition
that changes the column state (a width, the order, a pin, a hidden column),
`update` saves it to `localStorage` with a Command, and the entry reads it
back as the page opens through `Grid.columnState.restore`, which drops a
column no longer defined and keeps the rest. It is one viewer's
convenience, so a private window, which refuses storage, opens the columns
as declared.

**Try it:** it is published at
[foldkit-grid-demo.pages.dev](https://foldkit-grid-demo.pages.dev/), as static
files; the rows are made in the page.

## Run it

```bash
pnpm install                                   # from the repository root
pnpm --filter foldkit-example-data-grid dev
pnpm --filter foldkit-example-data-grid build   # static files, to dist/
```

The workspace packages resolve to their source, so no build is needed first.

## Read it

1. [products.ts](src/products.ts) makes the 100,000 rows, the same every time.
2. [main.ts](src/main.ts) defines the columns (which pin, which edit and how
   they validate), makes the grid with `DataGrid.make`, places it with
   `Bundle.declare`, and applies its OutMessage in `onOut`.
3. `savedLayout`, `init` and `update` in main.ts keep the column layout.
4. The view hands the grid a `RowModel` over the array. The grid draws only the
   rows and columns in view, while `aria-rowcount` counts all of them.

## Tests

- `test/registry.test.ts` (jsdom) edits a price, has a bad one refused, pastes
  two rows with one refused cell, and selects every product.
- `test/layout.test.ts` saves a resized column, opens the page from the
  save, and reads a save naming a removed column.
- `test/registry.test.ts` also searches through the toolbar and sets a density;
  `test/toolbar.mutations.ts` breaks each.
- `test/filters.test.ts` clears filters, and a clear with none on returns the
  same Model.
- `test/layout.test.ts` also starts a narrow screen with the narrower columns,
  and keeps a saved layout over them.
- `e2e/grid.e2e.ts` drives the page: a price edit, a filter by keyboard with
  its live announcement and Clear filters, and the page at 390px.
- `test/registry.browser.test.ts` (Chromium) scrolls to the last product at
  full size, checks that a window of rows is drawn, and checks that the UPC
  stays at the left edge while the rest scrolls sideways.

```bash
npx vitest run examples/data-grid                   # from the repository root
```
