import { Option } from 'effect'
import { describe, expect, test } from 'vitest'
import {
  type CellAddress,
  type ColumnId,
  ColumnLayout,
  Columns,
  GridProjection,
  RowCount,
  RowModel,
} from 'foldkit-data-grid'

interface Product {
  readonly id: string
  readonly sku: string
  readonly name: string
  readonly price: number
}

// Ids agree up to a prefix, and the array is not in key order, so a lookup
// by prefix or by position cannot pass for a lookup by key.
const products: ReadonlyArray<Product> = [
  { id: 'p:10', sku: 'B-2', name: 'Bolt', price: 2 },
  { id: 'p:1', sku: 'A-1', name: 'Anchor', price: 9 },
  { id: 'p:100', sku: 'C-3', name: 'Cable', price: 4 },
]

const productKey = (product: Product) => product.id

// Definition order is not the order any test displays, so a projection that
// ignored the layout would put the wrong column first.
const columns = Columns.define<Product>()({
  name: { header: 'Name', value: product => product.name },
  sku: { header: 'SKU', value: product => product.sku },
  price: { header: 'Price', value: product => product.price },
  notes: { header: 'Notes', value: () => '' },
})
type Id = ColumnId<typeof columns>

const rows = RowModel.fromArray(products, productKey)

const layout = (overrides: Partial<ColumnLayout<Id>>): ColumnLayout<Id> => ({
  start: [],
  center: [],
  end: [],
  hidden: [],
  ...overrides,
})

const project = (columnLayout: ColumnLayout<Id>, rowModel: RowModel<Product> = rows) =>
  GridProjection.make({ rows: rowModel, columns, layout: columnLayout })

const at = (row: string, column: Id): CellAddress<Id> => ({ row, column })

describe('RowModel.fromArray', () => {
  test('reads rows and keys by index, and indexes by key', () => {
    expect(rows.count).toEqual(RowCount.Known({ total: 3 }))
    expect(rows.rowAt(1)).toEqual(Option.some(products[1]))
    expect(rows.keyAt(2)).toEqual(Option.some('p:100'))
    expect(rows.indexOf('p:1')).toEqual(Option.some(1))
    expect(rows.indexOf('p:1000')).toEqual(Option.none())
  })

  test.each([-1, 3, 1.5, Number.NaN])('has no row at index %s', index => {
    expect(rows.rowAt(index)).toEqual(Option.none())
    expect(rows.keyAt(index)).toEqual(Option.none())
  })

  test('refuses two rows with one key, naming both', () => {
    const twice = [...products, { id: 'p:1', sku: 'D-4', name: 'Dowel', price: 1 }]
    expect(() => RowModel.fromArray(twice, productKey)).toThrow(/rows 1 and 3 share the key "p:1"/)
  })

  test('indexes an array once per key function', () => {
    expect(RowModel.fromArray(products, productKey)).toBe(rows)
    const bySku = RowModel.fromArray(products, product => product.sku)
    expect(bySku).not.toBe(rows)
    expect(bySku.keyAt(0)).toEqual(Option.some('B-2'))
  })
})

describe('Columns.define', () => {
  test('keeps definition order and gives each column its id', () => {
    expect(columns.ids).toEqual(['name', 'sku', 'price', 'notes'])
    expect(columns.byId.price.id).toBe('price')
    expect(columns.byId.price.value(products[0]!)).toBe(2)
  })

  test('refuses an id JavaScript would enumerate first', () => {
    expect(() =>
      Columns.define<Product>()({
        name: { header: 'Name', value: product => product.name },
        2024: { header: '2024', value: () => 0 },
      }),
    ).toThrow(/"2024" is an array index/)
  })

  test.each([
    ['a literal key, which sets the prototype', { __proto__: { header: 'Proto', value: () => 0 } }],
    ['a computed key', { ['__proto__']: { header: 'Proto', value: () => 0 } }],
  ])('refuses __proto__ as %s', (_, specs) => {
    expect(() => Columns.define<Product>()(specs)).toThrow(/"__proto__" cannot name a column/)
  })
})

describe('ColumnLayout.initial', () => {
  test('places each column in its pinned region, in definition order', () => {
    const pinned = Columns.define<Product>()({
      name: { header: 'Name', value: product => product.name },
      sku: { header: 'SKU', value: product => product.sku, pinned: 'start' },
      price: { header: 'Price', value: product => product.price, pinned: 'end' },
      notes: { header: 'Notes', value: () => '', hidden: true },
      id: { header: 'Id', value: product => product.id, pinned: 'start', hidden: true },
    })
    expect(ColumnLayout.initial(pinned)).toEqual({
      start: ['sku', 'id'],
      center: ['name', 'notes'],
      end: ['price'],
      hidden: ['notes', 'id'],
    })
  })
})

describe('GridProjection columns', () => {
  test.each<{
    readonly name: string
    readonly layout: ColumnLayout<Id>
    readonly start: ReadonlyArray<Id>
    readonly center: ReadonlyArray<Id>
    readonly end: ReadonlyArray<Id>
  }>([
    {
      name: 'the initial layout keeps definition order',
      layout: ColumnLayout.initial(columns),
      start: [],
      center: ['name', 'sku', 'price', 'notes'],
      end: [],
    },
    {
      name: 'a reorder is the display order',
      layout: layout({ center: ['price', 'notes', 'sku', 'name'] }),
      start: [],
      center: ['price', 'notes', 'sku', 'name'],
      end: [],
    },
    {
      name: 'a hidden column leaves its region',
      layout: layout({ center: ['price', 'notes', 'sku', 'name'], hidden: ['notes'] }),
      start: [],
      center: ['price', 'sku', 'name'],
      end: [],
    },
    {
      name: 'pinned columns stand at their edges',
      layout: layout({ start: ['sku'], center: ['name', 'notes'], end: ['price'] }),
      start: ['sku'],
      center: ['name', 'notes'],
      end: ['price'],
    },
    {
      name: 'a hidden pinned column leaves its edge',
      layout: layout({ start: ['sku', 'price'], center: ['name', 'notes'], hidden: ['sku'] }),
      start: ['price'],
      center: ['name', 'notes'],
      end: [],
    },
    {
      name: 'columns a saved layout omits join the center in definition order',
      layout: layout({ start: ['price'], center: ['notes'] }),
      start: ['price'],
      center: ['notes', 'name', 'sku'],
      end: [],
    },
    {
      name: 'a column named twice keeps its first place',
      layout: layout({ start: ['sku'], center: ['name', 'sku', 'price', 'notes'], end: ['name'] }),
      start: ['sku'],
      center: ['name', 'price', 'notes'],
      end: [],
    },
  ])('$name', ({ layout: columnLayout, start, center, end }) => {
    const projection = project(columnLayout)
    expect(projection.start).toEqual(start)
    expect(projection.center).toEqual(center)
    expect(projection.end).toEqual(end)
    expect(projection.columns).toEqual([...start, ...center, ...end])
    expect([...projection.columns].map(id => projection.columnIndex(id))).toEqual(
      projection.columns.map((_, index) => Option.some(index)),
    )
  })

  test('drops a saved id the columns do not define, prototype names included', () => {
    const projection = project({
      // @ts-expect-error a saved layout can name a column that no longer exists
      start: ['constructor', 'sku'],
      // @ts-expect-error a saved layout can name a column that no longer exists
      center: ['removed', 'name', 'price', 'notes'],
      end: [],
      hidden: [],
    })
    expect(projection.columns).toEqual(['sku', 'name', 'price', 'notes'])
  })

  test('has no column index for a hidden column', () => {
    const projection = project(
      layout({ center: ['name', 'sku', 'price', 'notes'], hidden: ['sku'] }),
    )
    expect(projection.columnIndex('sku')).toEqual(Option.none())
    expect(projection.columnIndex('price')).toEqual(Option.some(1))
  })
})

// Display order: sku | price, name (notes hidden between them) | nothing at the end.
const moving = project(
  layout({ start: ['sku'], center: ['price', 'notes', 'name'], hidden: ['notes'] }),
)

describe('GridProjection movement', () => {
  test.each<{
    readonly name: string
    readonly move: (from: CellAddress<Id>) => Option.Option<CellAddress<Id>>
    readonly from: CellAddress<Id>
    readonly to: Option.Option<CellAddress<Id>>
  }>([
    {
      name: 'right crosses from the pinned start into the center',
      move: from => moving.moveBy(from, { columns: 1 }),
      from: at('p:10', 'sku'),
      to: Option.some(at('p:10', 'price')),
    },
    {
      name: 'right skips a hidden column',
      move: from => moving.moveBy(from, { columns: 1 }),
      from: at('p:10', 'price'),
      to: Option.some(at('p:10', 'name')),
    },
    {
      name: 'right stops at the last column',
      move: from => moving.moveBy(from, { columns: 1 }),
      from: at('p:10', 'name'),
      to: Option.some(at('p:10', 'name')),
    },
    {
      name: 'left stops at the first column',
      move: from => moving.moveBy(from, { columns: -1 }),
      from: at('p:1', 'sku'),
      to: Option.some(at('p:1', 'sku')),
    },
    {
      name: 'down follows the row order, not the key order',
      move: from => moving.moveBy(from, { rows: 1 }),
      from: at('p:10', 'price'),
      to: Option.some(at('p:1', 'price')),
    },
    {
      name: 'a page down stops at the last row',
      move: from => moving.moveBy(from, { rows: 10 }),
      from: at('p:10', 'price'),
      to: Option.some(at('p:100', 'price')),
    },
    {
      name: 'up stops at the first row',
      move: from => moving.moveBy(from, { rows: -1 }),
      from: at('p:10', 'name'),
      to: Option.some(at('p:10', 'name')),
    },
    {
      name: 'a diagonal move clamps each axis',
      move: from => moving.moveBy(from, { rows: -5, columns: 5 }),
      from: at('p:1', 'sku'),
      to: Option.some(at('p:10', 'name')),
    },
    {
      name: 'nothing moves from a hidden column',
      move: from => moving.moveBy(from, { columns: 1 }),
      from: at('p:10', 'notes'),
      to: Option.none(),
    },
    {
      name: 'nothing moves from a row that is gone',
      move: from => moving.moveBy(from, { rows: 1 }),
      from: at('p:2', 'sku'),
      to: Option.none(),
    },
    {
      name: 'row start is the pinned start column',
      move: from => moving.rowStart(from),
      from: at('p:1', 'name'),
      to: Option.some(at('p:1', 'sku')),
    },
    {
      name: 'row end is the last visible column',
      move: from => moving.rowEnd(from),
      from: at('p:1', 'sku'),
      to: Option.some(at('p:1', 'name')),
    },
  ])('$name', ({ move, from, to }) => {
    expect(move(from)).toEqual(to)
  })

  test('first and last are the corners in display order', () => {
    expect(moving.first()).toEqual(Option.some(at('p:10', 'sku')))
    expect(moving.last()).toEqual(Option.some(at('p:100', 'name')))
  })

  test('an address keeps its cell through a re-sort of the rows', () => {
    const resorted = RowModel.fromArray([products[2]!, products[0]!, products[1]!], productKey)
    const after = project(
      layout({ start: ['sku'], center: ['price', 'notes', 'name'], hidden: ['notes'] }),
      resorted,
    )
    expect(moving.positionOf(at('p:1', 'price'))).toEqual(Option.some({ row: 1, column: 1 }))
    expect(after.positionOf(at('p:1', 'price'))).toEqual(Option.some({ row: 2, column: 1 }))
    expect(after.moveBy(at('p:1', 'price'), { rows: -1 })).toEqual(Option.some(at('p:10', 'price')))
  })

  test('an empty grid has no first cell', () => {
    const empty = project(ColumnLayout.initial(columns), RowModel.fromArray([], productKey))
    expect(empty.first()).toEqual(Option.none())
    expect(empty.last()).toEqual(Option.none())
    const noColumns = project(layout({ hidden: ['name', 'sku', 'price', 'notes'] }))
    expect(noColumns.columns).toEqual([])
    expect(noColumns.first()).toEqual(Option.none())
  })
})

// Five rows counted, the first three loaded: a known total over a partial page.
const partly: RowModel<Product> = {
  count: RowCount.Known({ total: 5 }),
  rowAt: index => rows.rowAt(index),
  keyAt: index => rows.keyAt(index),
  indexOf: key => rows.indexOf(key),
}

// A cursor that has seen three rows and may have more.
const open: RowModel<Product> = { ...partly, count: RowCount.Unknown({ atLeast: 3 }) }

describe('GridProjection over rows not loaded', () => {
  test('a move onto a counted row that is not loaded has no cell yet', () => {
    const projection = project(ColumnLayout.initial(columns), partly)
    expect(projection.moveBy(at('p:100', 'name'), { rows: 1 })).toEqual(Option.none())
    expect(projection.last()).toEqual(Option.none())
  })

  test('an unknown count stops at the rows seen so far', () => {
    const projection = project(ColumnLayout.initial(columns), open)
    expect(projection.rowCount).toEqual(RowCount.Unknown({ atLeast: 3 }))
    expect(projection.moveBy(at('p:100', 'name'), { rows: 1 })).toEqual(
      Option.some(at('p:100', 'name')),
    )
    expect(projection.last()).toEqual(Option.some(at('p:100', 'notes')))
  })
})

describe('GridProjection.box', () => {
  test.each<{
    readonly name: string
    readonly anchor: CellAddress<Id>
    readonly focus: CellAddress<Id>
    readonly box: Option.Option<{
      rows: { start: number; end: number }
      columns: ReadonlyArray<Id>
    }>
  }>([
    {
      name: 'spans the pinned start and the center, skipping a hidden column',
      anchor: at('p:10', 'sku'),
      focus: at('p:1', 'name'),
      box: Option.some({ rows: { start: 0, end: 2 }, columns: ['sku', 'price', 'name'] }),
    },
    {
      name: 'is the same rectangle from either corner',
      anchor: at('p:100', 'price'),
      focus: at('p:10', 'sku'),
      box: Option.some({ rows: { start: 0, end: 3 }, columns: ['sku', 'price'] }),
    },
    {
      name: 'is one cell when both corners are one cell',
      anchor: at('p:1', 'price'),
      focus: at('p:1', 'price'),
      box: Option.some({ rows: { start: 1, end: 2 }, columns: ['price'] }),
    },
    {
      name: 'is absent when a corner is hidden',
      anchor: at('p:1', 'notes'),
      focus: at('p:10', 'sku'),
      box: Option.none(),
    },
  ])('$name', ({ anchor, focus, box }) => {
    expect(moving.box(anchor, focus)).toEqual(box)
  })
})
