import { Option } from 'effect'
import type { KeyboardModifiers } from 'foldkit/html'
import {
  type CellAddress,
  type CellRange,
  ColumnLayout,
  GridSelection,
  RowCount,
  type RowModel,
  RowSelection,
} from 'foldkit-data-grid'
import { describe, expect, test } from 'vitest'
import { type Id, type Product, at, columns, moving, project, rows } from './fixture.js'

const plain: KeyboardModifiers = { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false }
const shift: KeyboardModifiers = { ...plain, shiftKey: true }

describe('RowSelection', () => {
  test('a toggle adds a row, and removes it again', () => {
    const one = GridSelection.toggle(GridSelection.none, 'p:1')
    expect(GridSelection.isSelected(one)('p:1')).toBe(true)
    expect(GridSelection.isSelected(one)('p:10')).toBe(false)
    expect(GridSelection.toggle(one, 'p:1')).toEqual(RowSelection.Keys({ keys: [] }))
  })

  test('all but some: a toggle takes a row out, and puts it back', () => {
    const all = RowSelection.AllExcept({ except: [] })
    const lessOne = GridSelection.toggle(all, 'p:1')
    expect(lessOne).toEqual(RowSelection.AllExcept({ except: ['p:1'] }))
    expect(GridSelection.isSelected(lessOne)('p:1')).toBe(false)
    expect(GridSelection.isSelected(lessOne)('anything else')).toBe(true)
    expect(GridSelection.toggle(lessOne, 'p:1')).toEqual(all)
  })

  test('add selects the rows not already selected, once each', () => {
    const one = RowSelection.Keys({ keys: ['p:1'] })
    expect(GridSelection.add(one, ['p:1', 'p:10', 'p:10'])).toEqual(
      RowSelection.Keys({ keys: ['p:1', 'p:10'] }),
    )
    expect(GridSelection.add(one, ['p:1'])).toBe(one)
    const lessTwo = RowSelection.AllExcept({ except: ['p:1', 'p:10'] })
    expect(GridSelection.add(lessTwo, ['p:10'])).toEqual(
      RowSelection.AllExcept({ except: ['p:1'] }),
    )
  })

  test('the rows between two follow the projection’s order, in either direction', () => {
    // Rows in order: p:10, p:1, p:100.
    expect(GridSelection.rowsBetween(moving, 'p:10', 'p:100')).toEqual(['p:10', 'p:1', 'p:100'])
    expect(GridSelection.rowsBetween(moving, 'p:100', 'p:1')).toEqual(['p:1', 'p:100'])
    expect(GridSelection.rowsBetween(moving, 'p:1', 'p:1')).toEqual(['p:1'])
    expect(GridSelection.rowsBetween(moving, 'p:1', 'gone')).toEqual([])
  })

  test('the rows between skip rows counted but not loaded', () => {
    const partly: RowModel<Product> = {
      count: RowCount.Known({ total: 5 }),
      rowAt: index => rows.rowAt(index),
      keyAt: index => (index === 1 ? Option.none() : rows.keyAt(index)),
      indexOf: key => rows.indexOf(key),
    }
    const grid = project(ColumnLayout.initial(columns), partly)
    expect(GridSelection.rowsBetween(grid, 'p:10', 'p:100')).toEqual(['p:10', 'p:100'])
  })
})

const range = (anchor: CellAddress<Id>, focus: CellAddress<Id>): CellRange<Id> => ({
  anchor,
  focus,
})

// `moving` shows sku | price, name; rows p:10, p:1, p:100.
describe('GridSelection.extend', () => {
  test.each<{
    readonly name: string
    readonly key: string
    readonly modifiers?: KeyboardModifiers
    readonly range: Option.Option<CellRange<Id>>
    readonly current?: Option.Option<CellAddress<Id>>
    readonly direction?: 'ltr' | 'rtl'
    readonly to: Option.Option<CellRange<Id>>
  }>([
    {
      name: 'Shift+ArrowDown grows a range from the focused cell',
      key: 'ArrowDown',
      range: Option.none(),
      current: Option.some(at('p:10', 'sku')),
      to: Option.some(range(at('p:10', 'sku'), at('p:1', 'sku'))),
    },
    {
      name: 'Shift+ArrowRight moves the far corner, the near one stays',
      key: 'ArrowRight',
      range: Option.some(range(at('p:10', 'sku'), at('p:1', 'sku'))),
      to: Option.some(range(at('p:10', 'sku'), at('p:1', 'price'))),
    },
    {
      name: 'rtl swaps the arrows',
      key: 'ArrowLeft',
      direction: 'rtl',
      range: Option.some(range(at('p:10', 'sku'), at('p:10', 'sku'))),
      to: Option.some(range(at('p:10', 'sku'), at('p:10', 'price'))),
    },
    {
      name: 'Shift+End reaches the row’s last column',
      key: 'End',
      range: Option.some(range(at('p:1', 'sku'), at('p:1', 'sku'))),
      to: Option.some(range(at('p:1', 'sku'), at('p:1', 'name'))),
    },
    {
      name: 'Shift+Home reaches the row’s first column',
      key: 'Home',
      range: Option.some(range(at('p:1', 'name'), at('p:1', 'name'))),
      to: Option.some(range(at('p:1', 'name'), at('p:1', 'sku'))),
    },
    {
      name: 'Shift+PageDown moves a page',
      key: 'PageDown',
      range: Option.some(range(at('p:10', 'sku'), at('p:10', 'sku'))),
      to: Option.some(range(at('p:10', 'sku'), at('p:100', 'sku'))),
    },
    {
      name: 'Shift+PageUp moves a page back',
      key: 'PageUp',
      range: Option.some(range(at('p:100', 'sku'), at('p:100', 'sku'))),
      to: Option.some(range(at('p:100', 'sku'), at('p:10', 'sku'))),
    },
    {
      name: 'at an edge the range stays',
      key: 'ArrowUp',
      range: Option.some(range(at('p:1', 'sku'), at('p:10', 'sku'))),
      to: Option.some(range(at('p:1', 'sku'), at('p:10', 'sku'))),
    },
    {
      name: 'without Shift it is not a range key',
      key: 'ArrowDown',
      modifiers: plain,
      range: Option.none(),
      current: Option.some(at('p:10', 'sku')),
      to: Option.none(),
    },
    {
      name: 'Ctrl+Shift is left alone',
      key: 'ArrowDown',
      modifiers: { ...shift, ctrlKey: true },
      range: Option.none(),
      current: Option.some(at('p:10', 'sku')),
      to: Option.none(),
    },
    {
      name: 'another key is left alone',
      key: 'Enter',
      range: Option.none(),
      current: Option.some(at('p:10', 'sku')),
      to: Option.none(),
    },
    {
      name: 'with nothing focused and no range, there is nothing to grow',
      key: 'ArrowDown',
      range: Option.none(),
      current: Option.none(),
      to: Option.none(),
    },
  ])('$name', ({ key, modifiers, range: given, current, direction, to }) => {
    expect(
      GridSelection.extend(moving, {
        key,
        modifiers: modifiers ?? shift,
        range: given,
        current: current ?? Option.none(),
        pageRows: 2,
        ...(direction === undefined ? {} : { direction }),
      }),
    ).toEqual(to)
  })

  test('a range onto a row not loaded stays as it is', () => {
    const partly: RowModel<Product> = {
      count: RowCount.Known({ total: 5 }),
      rowAt: index => rows.rowAt(index),
      keyAt: index => rows.keyAt(index),
      indexOf: key => rows.indexOf(key),
    }
    const grid = project(ColumnLayout.initial(columns), partly)
    const held = range(at('p:1', 'sku'), at('p:100', 'sku'))
    expect(
      GridSelection.extend(grid, {
        key: 'ArrowDown',
        modifiers: shift,
        range: Option.some(held),
        current: Option.none(),
        pageRows: 2,
      }),
    ).toEqual(Option.some(held))
  })

  test('a range’s cells are the rectangle its corners span now', () => {
    expect(GridSelection.boxOf(moving, range(at('p:100', 'name'), at('p:10', 'price')))).toEqual(
      Option.some({ rows: { start: 0, end: 3 }, columns: ['price', 'name'] }),
    )
  })
})
