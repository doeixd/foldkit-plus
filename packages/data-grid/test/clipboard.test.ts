import { Option } from 'effect'
import { Clipboard, ColumnLayout, RowCount, type RowModel } from 'foldkit-data-grid'
import { describe, expect, test } from 'vitest'
import { type Id, type Product, at, columns, moving, project, rows } from './fixture.js'

describe('Clipboard TSV', () => {
  test.each<{ readonly name: string; readonly rows: ReadonlyArray<ReadonlyArray<string>> }>([
    {
      name: 'plain cells',
      rows: [
        ['a', 'b'],
        ['c', 'd'],
      ],
    },
    {
      name: 'empty cells keep their place',
      rows: [
        ['', 'b', ''],
        ['', '', ''],
      ],
    },
    { name: 'a tab inside a cell', rows: [['a\tb', 'c']] },
    {
      name: 'a line break inside a cell',
      rows: [
        ['first\nsecond', 'x'],
        ['y', 'z'],
      ],
    },
    { name: 'quotes inside a cell', rows: [['say "hi"', '"']] },
    { name: 'a carriage return inside a cell', rows: [['a\rb']] },
  ])('reads back what it writes: $name', ({ rows: matrix }) => {
    expect(Clipboard.parseTsv(Clipboard.toTsv(matrix))).toEqual(matrix)
  })

  test('quotes only the cells that need it', () => {
    expect(Clipboard.toTsv([['plain', 'a\tb', 'say "hi"']])).toBe('plain\t"a\tb"\t"say ""hi"""')
  })

  test.each<{
    readonly name: string
    readonly text: string
    readonly rows: ReadonlyArray<ReadonlyArray<string>>
  }>([
    {
      name: 'the line break after the last row adds no row',
      text: 'a\tb\nc\td\n',
      rows: [
        ['a', 'b'],
        ['c', 'd'],
      ],
    },
    {
      name: 'Windows line ends',
      text: 'a\tb\r\nc\td\r\n',
      rows: [
        ['a', 'b'],
        ['c', 'd'],
      ],
    },
    { name: 'old Mac line ends', text: 'a\rb', rows: [['a'], ['b']] },
    { name: 'a trailing tab is an empty last cell', text: 'a\t', rows: [['a', '']] },
    { name: 'a quote within an unquoted cell is text', text: 'a"b\tc', rows: [['a"b', 'c']] },
    { name: 'nothing is no rows', text: '', rows: [] },
    { name: 'a blank line is one empty cell', text: '\n', rows: [['']] },
  ])('parses $name', ({ text, rows: matrix }) => {
    expect(Clipboard.parseTsv(text)).toEqual(matrix)
  })
})

// `moving` shows sku | price, name with notes hidden; rows p:10, p:1, p:100.
describe('Clipboard.copy', () => {
  test('copies a box row by row in the projection’s order and display order', () => {
    const box = Option.getOrThrow(moving.box(at('p:10', 'sku'), at('p:1', 'name')))
    const text = Clipboard.copy(moving, box, address => `${address.row}/${address.column}`)
    expect(Clipboard.parseTsv(text)).toEqual([
      ['p:10/sku', 'p:10/price', 'p:10/name'],
      ['p:1/sku', 'p:1/price', 'p:1/name'],
    ])
  })

  test('copies a row not loaded as empty cells, keeping the box’s shape', () => {
    const partly: RowModel<Product> = {
      count: RowCount.Known({ total: 3 }),
      rowAt: index => rows.rowAt(index),
      keyAt: index => (index === 1 ? Option.none() : rows.keyAt(index)),
      indexOf: key => rows.indexOf(key),
    }
    const grid = project(ColumnLayout.initial(columns), partly)
    const box = { rows: { start: 0, end: 3 }, columns: ['sku'] as const }
    expect(Clipboard.parseTsv(Clipboard.copy(grid, box, address => address.row))).toEqual([
      ['p:10'],
      [''],
      ['p:100'],
    ])
  })
})

describe('Clipboard.pasteAt', () => {
  const editable = (column: Id) => column !== 'sku'
  // Each cell's own address, so a cell given another's `from` shows.
  const from = ({ row, column }: { readonly row: string; readonly column: Id }) =>
    `${row}/${column}`
  const cells = { editable, from }
  const any = { editable: () => true, from }

  test('lays the cells from the anchor, skipping a column that does not edit', () => {
    expect(
      Clipboard.pasteAt(
        moving,
        at('p:10', 'sku'),
        [
          ['A', 'B', 'C'],
          ['D', 'E', 'F'],
        ],
        cells,
      ),
    ).toEqual([
      { row: 'p:10', column: 'price', text: 'B', from: 'p:10/price' },
      { row: 'p:10', column: 'name', text: 'C', from: 'p:10/name' },
      { row: 'p:1', column: 'price', text: 'E', from: 'p:1/price' },
      { row: 'p:1', column: 'name', text: 'F', from: 'p:1/name' },
    ])
  })

  test('drops cells past the grid’s edges', () => {
    expect(
      Clipboard.pasteAt(
        moving,
        at('p:100', 'name'),
        [
          ['A', 'B'],
          ['C', 'D'],
        ],
        cells,
      ),
    ).toEqual([{ row: 'p:100', column: 'name', text: 'A', from: 'p:100/name' }])
  })

  test('lands nothing from an anchor that is not shown', () => {
    expect(Clipboard.pasteAt(moving, at('p:1', 'notes'), [['A']], any)).toEqual([])
  })

  test('skips a row counted but not loaded', () => {
    const partly: RowModel<Product> = {
      count: RowCount.Known({ total: 3 }),
      rowAt: index => rows.rowAt(index),
      keyAt: index => (index === 1 ? Option.none() : rows.keyAt(index)),
      indexOf: key => rows.indexOf(key),
    }
    const grid = project(ColumnLayout.initial(columns), partly)
    expect(Clipboard.pasteAt(grid, at('p:10', 'name'), [['A'], ['B'], ['C']], any)).toEqual([
      { row: 'p:10', column: 'name', text: 'A', from: 'p:10/name' },
      { row: 'p:100', column: 'name', text: 'C', from: 'p:100/name' },
    ])
  })
})
