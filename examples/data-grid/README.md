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
grid's OutMessage (`Edited` or `Pasted`), carrying text that the column's
`validate` has already accepted, and `onOut` in [main.ts](src/main.ts) writes it
into the products. A refused cell stays in the editor with its message, or is
listed under `refused` in a paste.

## Run it

```bash
pnpm install                                   # from the repository root
pnpm --filter foldkit-example-data-grid dev
```

The workspace packages resolve to their source, so no build is needed first.

## Read it

1. [products.ts](src/products.ts) makes the 100,000 rows, the same every time.
2. [main.ts](src/main.ts) defines the columns (which pin, which edit and how
   they validate), makes the grid with `DataGrid.make`, places it with
   `Bundle.declare`, and applies its OutMessage in `onOut`.
3. The view hands the grid a `RowModel` over the array. The grid draws only the
   rows and columns in view, while `aria-rowcount` counts all of them.

## Tests

- `test/registry.test.ts` (jsdom) edits a price, has a bad one refused, pastes
  two rows with one refused cell, and selects every product.
- `test/registry.browser.test.ts` (Chromium) scrolls to the last product at
  full size, checks that a window of rows is drawn, and checks that the UPC
  stays at the left edge while the rest scrolls sideways.

```bash
npx vitest run examples/data-grid                   # from the repository root
```
