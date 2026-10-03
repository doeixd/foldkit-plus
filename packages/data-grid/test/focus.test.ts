import { Option, Schema } from 'effect'
import type { KeyboardModifiers } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import {
  type CellAddress,
  ColumnLayout,
  GridFocus,
  type KeyOptions,
  RowCount,
  type RowModel,
} from 'foldkit-data-grid'
import { describe, expect, test } from 'vitest'
import { type Id, type Product, at, columns, layout, moving, project, rows } from './fixture.js'

const plain: KeyboardModifiers = { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false }
const ctrl: KeyboardModifiers = { ...plain, ctrlKey: true }

const press = (
  key: string,
  current: Option.Option<CellAddress<Id>>,
  overrides: Partial<Omit<KeyOptions<Id>, 'key' | 'current'>> = {},
) => GridFocus.target(moving, { key, current, modifiers: plain, pageRows: 2, ...overrides })

// `moving` shows sku | price, name with notes hidden; rows p:10, p:1, p:100.
describe('GridFocus.target', () => {
  test.each<{
    readonly name: string
    readonly key: string
    readonly from: Option.Option<CellAddress<Id>>
    readonly options?: Partial<Omit<KeyOptions<Id>, 'key' | 'current'>>
    readonly to: Option.Option<CellAddress<Id>>
  }>([
    {
      name: 'ArrowRight steps to the next column',
      key: 'ArrowRight',
      from: Option.some(at('p:10', 'sku')),
      to: Option.some(at('p:10', 'price')),
    },
    {
      name: 'ArrowLeft steps back',
      key: 'ArrowLeft',
      from: Option.some(at('p:10', 'price')),
      to: Option.some(at('p:10', 'sku')),
    },
    {
      name: 'rtl swaps ArrowLeft forward',
      key: 'ArrowLeft',
      from: Option.some(at('p:10', 'sku')),
      options: { direction: 'rtl' },
      to: Option.some(at('p:10', 'price')),
    },
    {
      name: 'rtl swaps ArrowRight back',
      key: 'ArrowRight',
      from: Option.some(at('p:10', 'price')),
      options: { direction: 'rtl' },
      to: Option.some(at('p:10', 'sku')),
    },
    {
      name: 'rtl leaves ArrowDown alone',
      key: 'ArrowDown',
      from: Option.some(at('p:10', 'price')),
      options: { direction: 'rtl' },
      to: Option.some(at('p:1', 'price')),
    },
    {
      name: 'ArrowUp steps to the row above',
      key: 'ArrowUp',
      from: Option.some(at('p:100', 'name')),
      to: Option.some(at('p:1', 'name')),
    },
    {
      name: 'a key at the edge is handled and stays',
      key: 'ArrowDown',
      from: Option.some(at('p:100', 'price')),
      to: Option.some(at('p:100', 'price')),
    },
    {
      name: 'Home is the row start',
      key: 'Home',
      from: Option.some(at('p:1', 'name')),
      to: Option.some(at('p:1', 'sku')),
    },
    {
      name: 'End is the row end',
      key: 'End',
      from: Option.some(at('p:1', 'sku')),
      to: Option.some(at('p:1', 'name')),
    },
    {
      name: 'Ctrl+Home is the first cell',
      key: 'Home',
      from: Option.some(at('p:100', 'name')),
      options: { modifiers: ctrl },
      to: Option.some(at('p:10', 'sku')),
    },
    {
      name: 'Ctrl+End is the last cell',
      key: 'End',
      from: Option.some(at('p:10', 'sku')),
      options: { modifiers: ctrl },
      to: Option.some(at('p:100', 'name')),
    },
    {
      name: 'PageDown moves a page of rows',
      key: 'PageDown',
      from: Option.some(at('p:10', 'price')),
      to: Option.some(at('p:100', 'price')),
    },
    {
      name: 'PageDown moves only as far as the page',
      key: 'PageDown',
      from: Option.some(at('p:10', 'price')),
      options: { pageRows: 1 },
      to: Option.some(at('p:1', 'price')),
    },
    {
      name: 'PageUp moves a page back',
      key: 'PageUp',
      from: Option.some(at('p:100', 'sku')),
      to: Option.some(at('p:10', 'sku')),
    },
    {
      name: 'from nothing, a key moves from the first cell',
      key: 'ArrowRight',
      from: Option.none(),
      to: Option.some(at('p:10', 'price')),
    },
    {
      name: 'from a hidden column, a key moves from the first cell',
      key: 'ArrowDown',
      from: Option.some(at('p:100', 'notes')),
      to: Option.some(at('p:1', 'sku')),
    },
    {
      name: 'from a row that is gone, a key moves from the first cell',
      key: 'ArrowRight',
      from: Option.some(at('p:2', 'name')),
      to: Option.some(at('p:10', 'price')),
    },
    {
      name: 'Ctrl+Arrow is not the grid’s',
      key: 'ArrowRight',
      from: Option.some(at('p:10', 'sku')),
      options: { modifiers: ctrl },
      to: Option.none(),
    },
    {
      name: 'Shift+Arrow is left to selection',
      key: 'ArrowDown',
      from: Option.some(at('p:10', 'sku')),
      options: { modifiers: { ...plain, shiftKey: true } },
      to: Option.none(),
    },
    {
      name: 'Alt is not the grid’s',
      key: 'Home',
      from: Option.some(at('p:10', 'sku')),
      options: { modifiers: { ...plain, altKey: true } },
      to: Option.none(),
    },
    {
      name: 'Meta is not the grid’s',
      key: 'End',
      from: Option.some(at('p:10', 'sku')),
      options: { modifiers: { ...plain, metaKey: true } },
      to: Option.none(),
    },
    {
      name: 'other keys are left to the page',
      key: 'Enter',
      from: Option.some(at('p:10', 'sku')),
      to: Option.none(),
    },
    {
      name: 'a key named like a prototype member is not an arrow',
      key: 'constructor',
      from: Option.some(at('p:10', 'sku')),
      to: Option.none(),
    },
  ])('$name', ({ key, from, options, to }) => {
    expect(press(key, from, options)).toEqual(to)
  })

  test('an empty grid handles no key', () => {
    const empty = project(layout({ hidden: ['name', 'sku', 'price', 'notes'] }))
    const key = { key: 'ArrowDown', current: Option.none(), modifiers: plain, pageRows: 2 }
    expect(GridFocus.target(empty, key)).toEqual(Option.none())
  })

  test('a move onto a row not loaded yet keeps focus', () => {
    const partly: RowModel<Product> = {
      count: RowCount.Known({ total: 5 }),
      rowAt: index => rows.rowAt(index),
      keyAt: index => rows.keyAt(index),
      indexOf: key => rows.indexOf(key),
    }
    const grid = project(ColumnLayout.initial(columns), partly)
    const from = Option.some(at('p:100', 'price'))
    expect(
      GridFocus.target(grid, { key: 'ArrowDown', current: from, modifiers: plain, pageRows: 2 }),
    ).toEqual(from)
  })
})

describe('GridFocus.tabStop', () => {
  test.each<{
    readonly name: string
    readonly current: Option.Option<CellAddress<Id>>
    readonly stop: Option.Option<CellAddress<Id>>
  }>([
    {
      name: 'is the focused cell',
      current: Option.some(at('p:1', 'name')),
      stop: Option.some(at('p:1', 'name')),
    },
    {
      name: 'is the first cell with nothing focused',
      current: Option.none(),
      stop: Option.some(at('p:10', 'sku')),
    },
    {
      name: 'moves to the first cell while the focused column is hidden',
      current: Option.some(at('p:1', 'notes')),
      stop: Option.some(at('p:10', 'sku')),
    },
    {
      name: 'moves to the first cell when the focused row is gone',
      current: Option.some(at('p:2', 'price')),
      stop: Option.some(at('p:10', 'sku')),
    },
  ])('$name', ({ current, stop }) => {
    expect(GridFocus.tabStop(moving, current)).toEqual(stop)
  })
})

describe('GridFocus.cellOf', () => {
  test('reads back the address a cell id names', () => {
    const address = { row: 'a:b c', column: 'price' }
    expect(GridFocus.cellOf('grid', GridFocus.cellId('grid', address))).toEqual(
      Option.some(address),
    )
  })

  test.each([
    ['another grid’s cell', GridFocus.cellId('other', { row: 'a', column: 'b' })],
    ['an id that is not a cell’s', 'grid:a'],
    ['a malformed escape', 'grid:%E0%A4%A:b'],
  ])('is none for %s', (_, id) => {
    expect(GridFocus.cellOf('grid', id)).toEqual(Option.none())
  })
})

describe('GridFocus.cellId', () => {
  test('no two cells share an id, whatever their keys hold', () => {
    const ids = [
      GridFocus.cellId('grid', { row: 'a:b', column: 'c' }),
      GridFocus.cellId('grid', { row: 'a', column: 'b:c' }),
      GridFocus.cellId('grid', { row: 'a-b', column: 'c' }),
      GridFocus.cellId('grid', { row: 'a', column: 'b-c' }),
      GridFocus.cellId('grid:a', { row: 'b', column: 'c' }),
      GridFocus.cellId('grid', { row: 'a b', column: 'c' }),
      GridFocus.cellId('grid', { row: 'a%20b', column: 'c' }),
    ]
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).not.toMatch(/\s/)
  })
})

const Focus = GridFocus.make(columns)
const Placement = Bundle.declare(Focus.bundle, 'focus')
const Model = Schema.Struct({ ...Placement.fields })
const Message = defineMessageUnion({ ...Placement.cases })
const Page = Bundle.parent({ Model, Message })
const placed = Page.at(Placement)

const focus = (address: CellAddress<Id>) =>
  Placement.wrapper.make(Focus.Message.Focused({ address }))

describe('GridFocus placement', () => {
  const start = placed.init({
    focus: { current: Option.some(at('p:1', 'sku')), header: Option.some('price') },
  }).model

  test('starts with nothing focused', () => {
    expect(start.focus).toEqual({ current: Option.none(), header: Option.none() })
  })

  test('goes up to a header, keeps the cell, and comes back down to a cell', () => {
    const cell = Option.getOrThrow(placed.update(start, focus(at('p:1', 'price')))).model
    const up = Option.getOrThrow(
      placed.update(cell, Placement.wrapper.make(Focus.Message.HeaderFocused({ column: 'price' }))),
    ).model
    expect(up.focus).toEqual({
      current: Option.some(at('p:1', 'price')),
      header: Option.some('price'),
    })
    // Focusing the cell it left comes down, though the cell is the same.
    const down = Option.getOrThrow(placed.update(up, focus(at('p:1', 'price')))).model
    expect(down.focus).toEqual({ current: Option.some(at('p:1', 'price')), header: Option.none() })
    const again = Option.getOrThrow(
      placed.update(up, Placement.wrapper.make(Focus.Message.HeaderFocused({ column: 'price' }))),
    ).model
    expect(again).toBe(up)
  })

  test('remembers the focused cell', () => {
    const next = Option.getOrThrow(placed.update(start, focus(at('p:1', 'price')))).model
    expect(next.focus.current).toEqual(Option.some(at('p:1', 'price')))
    const moved = Option.getOrThrow(placed.update(next, focus(at('p:10', 'price')))).model
    expect(moved.focus.current).toEqual(Option.some(at('p:10', 'price')))
    const across = Option.getOrThrow(placed.update(moved, focus(at('p:10', 'name')))).model
    expect(across.focus.current).toEqual(Option.some(at('p:10', 'name')))
  })

  test('focusing the focused cell again changes nothing', () => {
    const next = Option.getOrThrow(placed.update(start, focus(at('p:1', 'price')))).model
    const again = Option.getOrThrow(placed.update(next, focus(at('p:1', 'price')))).model
    expect(again).toBe(next)
  })
})

describe('GridFocus Model', () => {
  const decode = Schema.decodeUnknownSync(Focus.Model)
  const encode = Schema.encodeSync(Focus.Model)

  test('stores no focus as null and a focus as its address', () => {
    expect(encode({ current: Option.none(), header: Option.none() })).toEqual({
      current: null,
      header: null,
    })
    expect(
      encode({ current: Option.some(at('p:1', 'price')), header: Option.some('sku') }),
    ).toEqual({
      current: { row: 'p:1', column: 'price' },
      header: 'sku',
    })
    expect(decode({ current: { row: 'p:1', column: 'price' }, header: null })).toEqual({
      current: Option.some(at('p:1', 'price')),
      header: Option.none(),
    })
  })

  test('refuses a stored focus on a column the grid does not define', () => {
    expect(() => decode({ current: { row: 'p:1', column: 'removed' }, header: null })).toThrow(
      /Expected "name" \| "sku" \| "price" \| "notes"\s+at \["current"\]\["column"\]/,
    )
  })
})
