/**
 * Table: eight Container slots with no state behind them, a view drawing
 * headings and rows from columns, and a variant-free recipe (one table
 * look; sorting, selection, and paging live with the data).
 */
import { describe, expect, it } from 'vitest'
import { Capability, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { TableSlots, view } from '../src/table.js'
import { Recipes } from '../src/index.js'

const h = SlotView.inertBuilder<never>()

interface Product {
  readonly name: string
  readonly price: string
}

const columns = [
  { header: 'Product', value: (row: Product) => row.name },
  { header: 'Price', numeric: true, value: (row: Product) => row.price },
] as const

const rows: ReadonlyArray<Product> = [
  { name: 'Apples', price: '4.99' },
  { name: 'Bread', price: '2.50' },
]

describe('TableSlots', () => {
  it('publishes eight containers and nothing stateful', () => {
    expect(Object.keys(TableSlots)).toEqual([
      'root',
      'caption',
      'head',
      'headerRow',
      'headerCell',
      'body',
      'row',
      'cell',
    ])
    for (const slot of Object.values(TableSlots)) {
      expect(slot.capability).toBe(Capability.Container)
    }
  })
})

describe('Table view', () => {
  it('draws headings, rows, and an optional caption', () => {
    const table = view(
      {
        columns: [...columns],
        rows,
        caption: 'Groceries',
        style: Style.forSlots(TableSlots)(Recipes.Table({})),
      },
      h,
    )
    expect(Inert.byTag(table, 'table')).toHaveLength(1)
    expect(Inert.byTag(table, 'caption')).toHaveLength(1)
    expect(Inert.byTag(table, 'th')).toHaveLength(2)
    expect(Inert.byTag(table, 'tr')).toHaveLength(3)
    expect(Inert.byTag(table, 'td')).toHaveLength(4)
    expect(Inert.text(table)).toContain('Apples')
  })

  it('marks numeric columns for end alignment', () => {
    const table = view({ columns: [...columns], rows }, h)
    const cells = Inert.byTag(table, 'td')
    expect(Inert.value(cells[0], 'data-numeric')).toBeUndefined()
    expect(Inert.value(cells[1], 'data-numeric')).toBe('')
  })
})

describe('Table recipe', () => {
  it('collapses hairline rows with muted uppercase headings', () => {
    const sheet = Style.forSlots(TableSlots)(Recipes.Table({})).css
    expect(sheet).toContain('border-collapse:collapse')
    expect(sheet).toContain('text-transform:uppercase')
    expect(sheet).toContain('text-align:end')
  })
})
