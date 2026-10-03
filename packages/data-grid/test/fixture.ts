/** One grid shared by the tests: products, four columns, and a layout to move over. */
import {
  type CellAddress,
  type ColumnId,
  type ColumnLayout,
  Columns,
  GridProjection,
  RowModel,
} from 'foldkit-data-grid'

export interface Product {
  readonly id: string
  readonly sku: string
  readonly name: string
  readonly price: number
}

// Ids agree up to a prefix, and the array is not in key order, so a lookup
// by prefix or by position cannot pass for a lookup by key.
export const products: ReadonlyArray<Product> = [
  { id: 'p:10', sku: 'B-2', name: 'Bolt', price: 2 },
  { id: 'p:1', sku: 'A-1', name: 'Anchor', price: 9 },
  { id: 'p:100', sku: 'C-3', name: 'Cable', price: 4 },
]

export const productKey = (product: Product) => product.id

// Definition order is not the order any test displays, so a projection that
// ignored the layout would put the wrong column first.
export const columns = Columns.define<Product>()({
  name: { header: 'Name', value: product => product.name },
  sku: { header: 'SKU', value: product => product.sku },
  price: { header: 'Price', value: product => product.price },
  notes: { header: 'Notes', value: () => '' },
})
export type Id = ColumnId<typeof columns>

export const rows = RowModel.fromArray(products, productKey)

export const layout = (overrides: Partial<ColumnLayout<Id>>): ColumnLayout<Id> => ({
  start: [],
  center: [],
  end: [],
  hidden: [],
  ...overrides,
})

export const project = (columnLayout: ColumnLayout<Id>, rowModel: RowModel<Product> = rows) =>
  GridProjection.make({ rows: rowModel, columns, layout: columnLayout })

export const at = (row: string, column: Id): CellAddress<Id> => ({ row, column })

// Display order: sku | price, name (notes hidden between them) | nothing at the end.
export const moving = project(
  layout({ start: ['sku'], center: ['price', 'notes', 'name'], hidden: ['notes'] }),
)
