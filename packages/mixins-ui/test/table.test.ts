/**
 * Table as markup: headings and rows from columns, and what the application
 * owns drawn from its Model: the sort as `aria-sort` on a heading whose
 * button sends the column, the rows chosen as checkboxes with one in the
 * heading for all, the rows open with their detail below, and an empty
 * state while there are no rows.
 */
import { Option, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Scene } from 'foldkit/test'
import { describe, expect, it } from 'vitest'
import { Capability, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import {
  TableSlots,
  checkboxes,
  configure,
  defineColumns,
  nextSort,
  view,
  type TableView,
} from '../src/table.js'
// From the modules, not the index: the test reads nothing else.
import { CheckboxSlots } from '../src/checkbox.js'
import { Table } from '../src/recipes/table.js'
import { Checkbox } from '../src/recipes/toggle.js'
import { sends } from './fixture.js'

const Pressed = defineMessageUnion({
  Sorted: { column: Schema.String },
  Chose: { name: Schema.String, selected: Schema.Boolean },
  ChoseAll: { selected: Schema.Boolean },
  Opened: { name: Schema.String, expanded: Schema.Boolean },
})
type Pressed = typeof Pressed.Type

const h = SlotView.inertBuilder<Pressed>()

interface Product {
  readonly name: string
  readonly price: string
}

const rows: ReadonlyArray<Product> = [
  { name: 'Apples', price: '4.99' },
  { name: 'Bread', price: '2.50' },
  { name: 'Cheese', price: '7.25' },
]

const columns = [
  { header: 'Product', sortKey: 'name', value: (row: Product) => row.name },
  { header: 'Price', numeric: true, value: (row: Product) => row.price },
]

const style = Style.forSlots(TableSlots)(Table({}))
const checkbox = Style.forSlots(CheckboxSlots)(Checkbox({}))

const drawn = (options: Partial<TableView<Product, Pressed>> = {}, builder = h) =>
  view<Product, Pressed>({ columns, rows, rowKey: row => row.name, style, ...options }, builder)

const selection = (chosen: ReadonlyArray<string>) => ({
  id: 'products',
  isSelected: (row: Product) => chosen.includes(row.name),
  onToggle: (row: Product, selected: boolean) => Pressed.Chose({ name: row.name, selected }),
  onToggleAll: (selected: boolean) => Pressed.ChoseAll({ selected }),
  rowLabel: (row: Product) => `Select ${row.name}`,
  control: checkboxes(checkbox),
})

const expansion = (open: ReadonlyArray<string>) => ({
  id: 'details',
  isExpanded: (row: Product) => open.includes(row.name),
  onToggle: (row: Product, expanded: boolean) => Pressed.Opened({ name: row.name, expanded }),
  detail: (row: Product) => h.p([], [`About ${row.name}`]),
  label: (row: Product) => `Details of ${row.name}`,
})

const sort = (by: Option.Option<{ column: string; direction: 'ascending' | 'descending' }>) => ({
  by,
  onSort: (column: string) => Pressed.Sorted({ column }),
})

const boxes = (table: ReturnType<typeof drawn>) => Inert.byRole(table, 'checkbox')

describe('TableSlots', () => {
  it('publishes containers, and buttons only where a press is a Message', () => {
    const interactive = Object.entries(TableSlots)
      .filter(([, slot]) => slot.capability === Capability.Interactive)
      .map(([name]) => name)
    expect(interactive).toEqual(['sortButton', 'expandButton'])
  })
})

describe('Table view', () => {
  it('draws headings, rows, and an optional caption', () => {
    const table = drawn({ caption: 'Groceries' })
    expect(Inert.byTag(table, 'caption')).toHaveLength(1)
    expect(Inert.byTag(table, 'th')).toHaveLength(2)
    expect(Inert.byTag(table, 'tr')).toHaveLength(4)
    expect(Inert.byTag(table, 'td')).toHaveLength(6)
    expect(Inert.text(table)).toContain('Apples')
  })

  it('marks numeric columns, heading and cells, for end alignment', () => {
    const table = drawn()
    const cells = Inert.byTag(table, 'td')
    expect(Inert.value(cells[0], 'data-numeric')).toBeUndefined()
    expect(Inert.value(cells[1], 'data-numeric')).toBe('')
    expect(Inert.value(Inert.byTag(table, 'th')[1], 'data-numeric')).toBe('')
  })

  it('draws no markup outside its slots', () => {
    const Drawn = SlotView.forMessages<Pressed>().define(TableSlots, (_: undefined, __, builder) =>
      view<Product, Pressed>(
        {
          columns,
          rows,
          sort: sort(Option.none()),
          selection: selection([]),
          expansion: expansion(['Bread']),
        },
        builder,
      ),
    )
    // What a detail holds is the application's.
    expect(Inert.unslotted(Inert.draw(Drawn, undefined), { inside: ['detailCell'] })).toEqual([])
  })
})

describe('Table sort', () => {
  it('is a button on a sortable heading only, and `aria-sort` on the column sorted', () => {
    const [name, price] = Inert.byTag(
      drawn({ sort: sort(Option.some({ column: 'name', direction: 'descending' })) }),
      'th',
    )
    expect(Inert.byTag(name, 'button')).toHaveLength(1)
    expect(Inert.value(name, 'aria-sort')).toBe('descending')
    expect(Inert.byTag(price, 'button')).toHaveLength(0)
    expect(Inert.value(price, 'aria-sort')).toBeUndefined()
  })

  it('leaves `aria-sort` off while another column, or none, sorts the rows', () => {
    const [name] = Inert.byTag(
      drawn({ sort: sort(Option.some({ column: 'price', direction: 'ascending' })) }),
      'th',
    )
    expect(Inert.value(name, 'aria-sort')).toBeUndefined()
  })

  it('sends the column a heading sorts by', () => {
    sends(
      (builder: HtmlBuilder<Pressed>) => drawn({ sort: sort(Option.none()) }, builder),
      Scene.click(Scene.role('button', { name: 'Product' })),
      Scene.expectOutMessage(Pressed.Sorted({ column: 'name' })),
    )
  })

  it('without a sort, a sortable heading is plain text', () => {
    expect(Inert.byTag(drawn(), 'button')).toHaveLength(0)
  })

  it('cycles ascending, descending, none, and starts over on another column', () => {
    const asc = nextSort(Option.none(), 'name')
    expect(asc).toEqual(Option.some({ column: 'name', direction: 'ascending' }))
    const desc = nextSort(asc, 'name')
    expect(desc).toEqual(Option.some({ column: 'name', direction: 'descending' }))
    expect(nextSort(desc, 'name')).toEqual(Option.none())
    expect(nextSort(desc, 'price')).toEqual(
      Option.some({ column: 'price', direction: 'ascending' }),
    )
  })
})

describe('Table cells', () => {
  it('draws an Html value as the cell, beside a string one', () => {
    const table = drawn({
      columns: [
        { header: 'Product', value: (row: Product) => h.strong([], [row.name]) },
        { header: 'Price', value: (row: Product) => row.price },
      ],
    })
    expect(Inert.byTag(table, 'strong')).toHaveLength(3)
    expect(Inert.text(Inert.byTag(table, 'td')[1])).toBe('4.99')
  })

  it('draws a row header as `th scope="row"` in the cell slot, and no `td` for that column', () => {
    const table = drawn({
      columns: [{ ...columns[0]!, rowHeader: true }, columns[1]!],
    })
    const body = Inert.byTag(table, 'tr').slice(1)
    const [first] = Inert.byTag(body[0], 'th')
    expect(Inert.text(first)).toBe('Apples')
    expect(Inert.value(first, 'scope')).toBe('row')
    expect(Inert.byTag(body[0], 'td')).toHaveLength(1)
    // The heading row keeps its column headings.
    expect(Inert.byTag(Inert.byTag(table, 'thead')[0], 'th')).toHaveLength(2)
  })

  it('names the expansion column with a heading, for a screen reader alone', () => {
    const table = drawn({ expansion: expansion([]) })
    const [head] = Inert.byTag(Inert.byTag(table, 'thead')[0], 'th')
    expect(Inert.text(head)).toBe('Details')
    expect(Inert.value(head, 'scope')).toBe('col')
    expect(Inert.byTag(Inert.byTag(table, 'thead')[0], 'td')).toHaveLength(0)
    const named = drawn({ expansion: expansion([]), words: { details: 'Mehr' } })
    expect(Inert.text(Inert.byTag(Inert.byTag(named, 'thead')[0], 'th')[0])).toBe('Mehr')
  })
})

describe('Table selection', () => {
  it('checks the rows chosen, and the heading is mixed while only some are', () => {
    const states = boxes(drawn({ selection: selection(['Bread']) })).map(box =>
      Inert.value(box, 'aria-checked'),
    )
    expect(states).toEqual(['mixed', 'false', 'true', 'false'])
  })

  it('checks the heading once every row is chosen, and clears it for none', () => {
    const all = boxes(drawn({ selection: selection(['Apples', 'Bread', 'Cheese']) }))
    expect(Inert.value(all[0], 'aria-checked')).toBe('true')
    const none = boxes(drawn({ selection: selection([]) }))
    expect(Inert.value(none[0], 'aria-checked')).toBe('false')
    // No rows are not every row chosen.
    const empty = boxes(drawn({ rows: [], selection: selection([]) }))
    expect(Inert.value(empty[0], 'aria-checked')).toBe('false')
  })

  it('names each box, the heading by its own label', () => {
    const table = drawn({ selection: selection([]) })
    expect(Inert.text(Inert.byTag(table, 'thead')[0])).toContain('Select all rows')
    expect(Inert.byLabel(table, 'Select Cheese')).toHaveLength(1)
  })

  it('marks a chosen row', () => {
    const body = Inert.byTag(drawn({ selection: selection(['Bread']) }), 'tr').slice(1)
    expect(body.map(row => Inert.value(row, 'data-selected'))).toEqual([undefined, '', undefined])
  })

  it('sends the row a box chooses, and all from a partly chosen heading', () => {
    sends(
      (builder: HtmlBuilder<Pressed>) => drawn({ selection: selection(['Bread']) }, builder),
      Scene.click(Scene.label('Select Cheese')),
      Scene.expectOutMessage(Pressed.Chose({ name: 'Cheese', selected: true })),
      Scene.click(Scene.label('Select Bread')),
      Scene.expectOutMessage(Pressed.Chose({ name: 'Bread', selected: false })),
      Scene.click(Scene.label('Select all rows')),
      Scene.expectOutMessage(Pressed.ChoseAll({ selected: true })),
    )
  })

  it('a full heading chooses none', () => {
    sends(
      (builder: HtmlBuilder<Pressed>) =>
        drawn({ selection: selection(['Apples', 'Bread', 'Cheese']) }, builder),
      Scene.click(Scene.label('Select all rows')),
      Scene.expectOutMessage(Pressed.ChoseAll({ selected: false })),
    )
  })

  it('gives each box an id of its own, from its row key', () => {
    const ids = boxes(drawn({ selection: selection([]) })).map(box =>
      Inert.value(box, 'aria-labelledby'),
    )
    expect(new Set(ids).size).toBe(4)
    expect(ids[3]).toContain('Cheese')
  })
})

describe('Table expansion', () => {
  it('draws an open row’s detail below it, across every column, named by its button', () => {
    const table = drawn({ selection: selection([]), expansion: expansion(['Bread']) })
    const body = Inert.byTag(table, 'tr').slice(1)
    expect(body.map(row => Inert.value(row, 'data-detail'))).toEqual([
      undefined,
      undefined,
      '',
      undefined,
    ])
    const detail = body[2]!
    const [cell] = Inert.byTag(detail, 'td')
    // Two control columns and two of data.
    expect(Inert.value(cell, 'colSpan') ?? Inert.value(cell, 'colspan')).toBe(4)
    expect(Inert.text(detail)).toBe('About Bread')
    const [, bread] = Inert.byTag(table, 'button').filter(
      button => Inert.value(button, 'aria-expanded') !== undefined,
    )
    expect(Inert.value(bread, 'aria-expanded')).toBe('true')
    expect(Inert.value(bread, 'aria-controls')).toBe(Inert.value(detail, 'id'))
  })

  it('names no detail while shut', () => {
    const [apples] = Inert.byLabel(drawn({ expansion: expansion([]) }), 'Details of Apples')
    expect(Inert.value(apples, 'aria-expanded')).toBe('false')
    expect(Inert.value(apples, 'aria-controls')).toBeUndefined()
  })

  it('sends the row to open, and to shut', () => {
    sends(
      (builder: HtmlBuilder<Pressed>) => drawn({ expansion: expansion(['Bread']) }, builder),
      Scene.click(Scene.label('Details of Apples')),
      Scene.expectOutMessage(Pressed.Opened({ name: 'Apples', expanded: true })),
      Scene.click(Scene.label('Details of Bread')),
      Scene.expectOutMessage(Pressed.Opened({ name: 'Bread', expanded: false })),
    )
  })
})

describe('Table empty state', () => {
  const empty = h.p([], ['No products yet'])

  it('stands across the table while there are no rows', () => {
    const table = drawn({ rows: [], empty, selection: selection([]) })
    const body = Inert.byTag(Inert.byTag(table, 'tbody')[0], 'tr')
    expect(body).toHaveLength(1)
    const [cell] = Inert.byTag(body[0], 'td')
    expect(Inert.value(cell, 'colSpan') ?? Inert.value(cell, 'colspan')).toBe(3)
    expect(Inert.text(cell)).toBe('No products yet')
  })

  it('is not drawn beside rows', () => {
    expect(Inert.text(drawn({ empty }))).not.toContain('No products yet')
  })
})

describe('defineColumns', () => {
  it('returns the columns it was given, drawn as written', () => {
    const named = defineColumns<Product>()([
      { header: 'Name', sortKey: 'name', value: row => row.name },
    ])
    const table = drawn({
      columns: named,
      sort: { by: Option.none(), onSort: column => Pressed.Sorted({ column }) },
    })
    expect(named).toHaveLength(1)
    expect(Inert.byTag(table, 'button')).toHaveLength(1)
    expect(Inert.text(table)).toContain(rows[0]?.name)
  })
})

describe('Table footer', () => {
  const totals = [
    { header: 'Product', value: (row: Product) => row.name, footer: 'Total' },
    { header: 'Price', numeric: true, value: (row: Product) => row.price, footer: '25.50' },
  ]

  it('draws one totals row after the body, numeric cells marked', () => {
    const table = drawn({ columns: totals })
    const [foot] = Inert.byTag(table, 'tfoot')
    const cells = Inert.byTag(foot!, 'td')
    expect(cells.map(cell => Inert.text(cell))).toEqual(['Total', '25.50'])
    expect(Inert.value(cells[1], 'data-numeric')).toBe('')
    expect(Inert.value(cells[0], 'data-numeric')).toBeUndefined()
  })

  it('is not drawn when no column has a footer', () => {
    expect(Inert.byTag(drawn(), 'tfoot')).toHaveLength(0)
  })

  it('leaves the control columns blank so the totals line up with their columns', () => {
    const table = drawn({
      columns: totals,
      selection: selection([]),
      expansion: expansion([]),
    })
    const [foot] = Inert.byTag(table, 'tfoot')
    const cells = Inert.byTag(foot!, 'td').map(cell => Inert.text(cell))
    expect(cells).toEqual(['', '', 'Total', '25.50'])
  })
})

describe('Table words and header', () => {
  it('names the boxes and the open buttons from words, and a row from its own label', () => {
    const table = drawn({
      selection: { ...selection([]), rowLabel: undefined },
      expansion: { ...expansion([]), label: undefined },
      words: { selectRow: 'Wählen', selectAll: 'Alle wählen', showDetails: 'Öffnen' },
    })
    const names = Inert.byTag(table, 'span').map(span => Inert.text(span))
    expect(names).toContain('Alle wählen')
    expect(names.filter(name => name === 'Wählen')).toHaveLength(3)
    const buttons = Inert.byTag(table, 'button').filter(
      button => Inert.value(button, 'aria-expanded') !== undefined,
    )
    expect(buttons.map(button => Inert.value(button, 'aria-label'))).toEqual([
      'Öffnen',
      'Öffnen',
      'Öffnen',
    ])
  })

  it('draws markup in a heading', () => {
    const table = drawn({
      columns: [{ header: h.em([], ['Price']), value: (row: Product) => row.price }],
    })
    expect(Inert.byTag(Inert.byTag(table, 'th')[0]!, 'em')).toHaveLength(1)
  })
})

describe('Table.configure', () => {
  it('binds the style and words, and the call wins over both', () => {
    const configured = configure({
      base: { style, words: { selectAll: 'Everything' } },
      presets: { german: { words: { selectAll: 'Alle' } } },
    })
    const draw = (options: {
      readonly preset?: 'german'
      readonly words?: { selectAll: string }
    }) =>
      configured.view(
        {
          columns,
          rows,
          selection: selection([]),
          ...options,
        },
        h,
      )
    const named = (table: ReturnType<typeof draw>) =>
      Inert.byTag(table, 'span').map(span => Inert.text(span))
    expect(named(draw({}))).toContain('Everything')
    expect(named(draw({ preset: 'german' }))).toContain('Alle')
    expect(named(draw({ preset: 'german', words: { selectAll: 'Tout' } }))).toContain('Tout')
  })
})
