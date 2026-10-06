/**
 * A product registry in a data grid: 100,000 rows with the UPC pinned,
 * editable descriptions and prices, rows and ranges selected, columns resized,
 * dragged, hidden and pinned from their menus, and copy and paste with a
 * spreadsheet.
 *
 * The products are the application's: they are in its Model, and only its
 * `onOut` changes them, from the text the grid reports. The grid owns where
 * focus is, what is selected, how the columns stand, and the viewport.
 */
import { Option, Schema, SchemaGetter } from 'effect'
import { type Document, type HtmlBuilder } from 'foldkit/html'
import { gridDemo } from 'foldkit-example-site/demos'
import { demoGuide } from 'foldkit-example-site/guide'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Bundle } from 'foldkit-bundle'
import { Columns, DataGrid, RowModel, RowSelection } from 'foldkit-data-grid'
import { Style } from 'foldkit-mixins'
import { DataGridView, GridSlots, GridStyle } from 'foldkit-mixins-data-grid'
import { Product, products } from './products.js'

/** A description as typed: its spaces around dropped, and something left. */
const Description = Schema.Trim.pipe(
  Schema.decodeTo(Schema.String.check(Schema.isMinLength(1, { message: 'Say what it is' }))),
)

/** A price as typed, in dollars with at most two decimals, and the number it means. */
const Price = Schema.Trim.pipe(
  Schema.decodeTo(
    Schema.String.check(Schema.isPattern(/^\d+(\.\d{1,2})?$/, { message: 'A price, like 4.99' })),
  ),
  Schema.decodeTo(Schema.Number, {
    decode: SchemaGetter.transform(text => Number(text)),
    encode: SchemaGetter.transform(price => price.toFixed(2)),
  }),
)

export const columns = Columns.define<Product>()({
  upc: {
    header: 'UPC',
    value: product => product.upc,
    pinned: 'start',
    width: 150,
    hideable: false,
  },
  description: {
    header: 'Description',
    value: product => product.description,
    width: 320,
    minWidth: 120,
    edit: { schema: Description },
  },
  line: { header: 'Line', value: product => product.line, width: 130 },
  // One of the Product's own statuses: edited as a choice of them.
  status: {
    header: 'Status',
    value: product => product.status,
    width: 120,
    edit: { schema: Product.fields.status },
  },
  price: {
    header: 'Price',
    value: product => product.price.toFixed(2),
    width: 110,
    edit: { schema: Price },
  },
})

export const Grid = DataGrid.make({
  id: 'products',
  columns,
  rowSelection: 'multiple',
  cellSelection: true,
})

const Placement = Bundle.declare(Grid.bundle, 'grid')

export const Model = Schema.Struct({
  ...Placement.fields,
  products: Schema.Array(Product),
  /** What the last change said: what it wrote, or why some cells were refused. */
  notice: Schema.String,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({ ...Placement.cases })
export type Message = typeof Message.Type

const productKey = (product: Product) => product.id
const rowsOf = (model: Model) => RowModel.fromArray(model.products, productKey)

type Cell = {
  readonly row: string
  readonly column: keyof typeof columns.byId
  readonly text: string
}

/**
 * The products with each cell's value written into its field. The column's
 * schema decoded the text when the grid took it; `matchEdit` reads that value
 * back, typed for its column.
 */
const written = (model: Model, cells: ReadonlyArray<Cell>): ReadonlyArray<Product> => {
  const rows = rowsOf(model)
  const next = [...model.products]
  for (const cell of cells) {
    const index = rows.indexOf(cell.row)
    if (Option.isNone(index)) continue
    const product = next[index.value]!
    next[index.value] = Grid.matchEdit(cell, {
      description: ({ value }) => ({ ...product, description: value }),
      price: ({ value }) => ({ ...product, price: value }),
      status: ({ value }) => ({ ...product, status: value }),
    })
  }
  return next
}

/** A paste's or a fill's cells written, and what the columns refused said. */
const laid = (
  model: Model,
  verb: 'Pasted' | 'Filled',
  accepted: ReadonlyArray<Cell>,
  refused: ReadonlyArray<Cell & { readonly error: string }>,
) => ({
  model: modifyFields(model, {
    products: () => written(model, accepted),
    notice: () =>
      refused.length === 0
        ? `${verb} ${accepted.length} cells.`
        : `${verb} ${accepted.length} cells; refused ${refused.length}: ${refused[0]!.error}.`,
  }),
})

const application = Bundle.assemble<Model, Message>()([
  Bundle.parent({ Model, Message }).at(Placement, {
    onOut: out => model =>
      Grid.Out.match(out, {
        Edited: edited => ({
          model: modifyFields(model, {
            products: () => written(model, [edited]),
            notice: () => `Saved ${edited.column} of ${edited.row}.`,
          }),
        }),
        Pasted: ({ accepted, refused }) => laid(model, 'Pasted', accepted, refused),
        // What a fill writes is worked out from the products as they are now.
        Filled: request => {
          const { accepted, refused } = Grid.fill(rowsOf(model), model.grid, request)
          return accepted.length === 0 && refused.length === 0
            ? { model }
            : laid(model, 'Filled', accepted, refused)
        },
        // These rows keep no history; the registry demo shows undo as new edits.
        UndoRequested: () => ({ model }),
        RedoRequested: () => ({ model }),
      }),
  }),
])

export const init = (count = 100_000) =>
  application.initial({ products: products(count), notice: '' })
export const update = application.update()

const Registry = DataGridView<Message>()
  .define(Grid)
  .pipe(
    Style.attach(GridStyle),
    Style.attach(
      Style.forSlots(GridSlots)({
        root: Style.inline({
          height: '70vh',
          border: '1px solid light-dark(#e4e4e7, #2e2e33)',
          borderRadius: '10px',
        }),
      }),
    ),
  )

const DemoGuide = demoGuide<Message>()

export const view = (model: Model, h: HtmlBuilder<Message>): Document => {
  // Counted from the selection, not by asking each of 100,000 rows every render.
  const selectedCount = RowSelection.match(model.grid.selection.rows, {
    Keys: ({ keys }) => keys.length,
    AllExcept: ({ except }) => model.products.length - except.length,
  })
  return {
    title: 'Product registry',
    body: h.main(
      [
        h.Style({
          boxSizing: 'border-box',
          display: 'grid',
          gap: '0.25rem',
          // The columns' 830px, the grid's border and this padding: no empty band beside the grid.
          maxWidth: '55rem',
          margin: '0 auto',
          padding: '2.5rem 1.5rem',
          font: '14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif',
          color: 'var(--fk-text-default)',
        }),
      ],
      [
        h.h1(
          [
            h.Style({
              margin: '0',
              fontSize: '1.375rem',
              fontWeight: '600',
              letterSpacing: '-0.015em',
            }),
          ],
          ['Product registry'],
        ),
        h.p(
          [
            h.Role('status'),
            h.Style({ margin: '0 0 1.25rem', color: 'var(--fk-text-muted)', fontSize: '13px' }),
          ],
          [
            `${model.products.length.toLocaleString()} products, ${selectedCount.toLocaleString()} selected. `,
            model.notice,
          ],
        ),
        Registry(
          {
            state: model.grid,
            rows: rowsOf(model),
            wrap: message => Placement.wrapper.make(message),
            label: 'Products',
            rowHeight: 32,
            headerHeight: 36,
            overscan: { rows: 6, columns: 1 },
            columnMenu: true,
          },
          h,
        ),
        DemoGuide({ demo: gridDemo }, h),
      ],
    ),
  }
}
