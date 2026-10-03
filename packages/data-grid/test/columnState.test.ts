import { ColumnState, Columns, type Region } from 'foldkit-data-grid'
import { describe, expect, test } from 'vitest'

interface Order {
  readonly id: string
  readonly total: number
}

const columns = Columns.define<Order>()({
  id: {
    header: 'Id',
    value: order => order.id,
    pinned: 'start',
    hideable: false,
    resizable: false,
  },
  customer: { header: 'Customer', value: () => '', width: 200, minWidth: 100, maxWidth: 400 },
  total: { header: 'Total', value: order => order.total },
  notes: { header: 'Notes', value: () => '', hidden: true },
  status: { header: 'Status', value: () => '', pinned: 'end' },
})
type Id = keyof typeof columns.byId

const State = ColumnState.make(columns)
const start = State.initial()

describe('ColumnState', () => {
  test('starts as the columns declare, with nothing resized', () => {
    expect(start).toEqual({
      start: ['id'],
      center: ['customer', 'total', 'notes'],
      end: ['status'],
      hidden: ['notes'],
      widths: [],
    })
  })

  test('a column is as wide as its resize, else its spec, else the default', () => {
    const resized = State.resize(start, 'total', 90)
    const width = State.widthOf(resized)
    expect([width('customer'), width('total'), width('status')]).toEqual([
      200,
      90,
      Columns.defaultWidth,
    ])
  })

  test.each<{
    readonly name: string
    readonly column: Id
    readonly width: number
    readonly widths: ReadonlyArray<{ readonly column: Id; readonly width: number }>
  }>([
    {
      name: 'takes a width within the limits',
      column: 'customer',
      width: 250,
      widths: [{ column: 'customer', width: 250 }],
    },
    {
      name: 'stops at the column’s minimum',
      column: 'customer',
      width: 20,
      widths: [{ column: 'customer', width: 100 }],
    },
    {
      name: 'stops at the column’s maximum',
      column: 'customer',
      width: 900,
      widths: [{ column: 'customer', width: 400 }],
    },
    {
      name: 'stops at the default minimum',
      column: 'total',
      width: 1,
      widths: [{ column: 'total', width: Columns.minWidth }],
    },
    { name: 'leaves a column that does not resize', column: 'id', width: 300, widths: [] },
    { name: 'leaves a width that is not a number', column: 'total', width: Number.NaN, widths: [] },
  ])('resize $name', ({ column, width, widths }) => {
    expect(State.resize(start, column, width).widths).toEqual(widths)
  })

  test('a second resize of a column replaces the first', () => {
    const twice = State.resize(State.resize(start, 'total', 90), 'total', 140)
    expect(twice.widths).toEqual([{ column: 'total', width: 140 }])
  })

  test('a resize to the width it has changes nothing', () => {
    expect(State.resize(start, 'customer', 200)).toBe(start)
    const resized = State.resize(start, 'total', 90)
    expect(State.resize(resized, 'total', 90)).toBe(resized)
  })

  test('hides and shows a column, keeping its place', () => {
    const hidden = State.hide(start, 'total')
    expect(hidden.hidden).toEqual(['notes', 'total'])
    expect(hidden.center).toEqual(start.center)
    expect(State.show(hidden, 'total').hidden).toEqual(['notes'])
  })

  test.each<{ readonly name: string; readonly column: Id }>([
    { name: 'a column that does not hide', column: 'id' },
    { name: 'a column already hidden', column: 'notes' },
  ])('hide leaves $name', ({ column }) => {
    expect(State.hide(start, column)).toBe(start)
  })

  test('keeps the last column shown, so the grid has a cell to focus', () => {
    const Two = ColumnState.make(
      Columns.define<Order>()({
        a: { header: 'A', value: () => 1 },
        b: { header: 'B', value: () => 2 },
      }),
    )
    const one = Two.hide(Two.initial(), 'a')
    expect(one.hidden).toEqual(['a'])
    expect(Two.hide(one, 'b')).toBe(one)
  })

  test('showing a shown column changes nothing', () => {
    expect(State.show(start, 'total')).toBe(start)
  })

  test.each<{
    readonly name: string
    readonly column: Id
    readonly region: Region
    readonly index: number
    readonly start: ReadonlyArray<Id>
    readonly center: ReadonlyArray<Id>
    readonly end: ReadonlyArray<Id>
  }>([
    {
      name: 'reorders within the center',
      column: 'notes',
      region: 'center',
      index: 0,
      start: ['id'],
      center: ['notes', 'customer', 'total'],
      end: ['status'],
    },
    {
      name: 'moves later, counting the moved column out',
      column: 'customer',
      region: 'center',
      index: 1,
      start: ['id'],
      center: ['total', 'customer', 'notes'],
      end: ['status'],
    },
    {
      name: 'pins a column to the start after the pinned one',
      column: 'total',
      region: 'start',
      index: 1,
      start: ['id', 'total'],
      center: ['customer', 'notes'],
      end: ['status'],
    },
    {
      name: 'unpins a column into the center',
      column: 'status',
      region: 'center',
      index: 1,
      start: ['id'],
      center: ['customer', 'status', 'total', 'notes'],
      end: [],
    },
    {
      name: 'clamps an index past the end',
      column: 'customer',
      region: 'end',
      index: 99,
      start: ['id'],
      center: ['total', 'notes'],
      end: ['status', 'customer'],
    },
    {
      name: 'clamps a negative index',
      column: 'notes',
      region: 'center',
      index: -1,
      start: ['id'],
      center: ['notes', 'customer', 'total'],
      end: ['status'],
    },
  ])('move $name', ({ column, region, index, start: first, center, end }) => {
    expect(State.move(start, column, region, index)).toMatchObject({ start: first, center, end })
  })

  test('a move to where the column is changes nothing', () => {
    expect(State.move(start, 'total', 'center', 1)).toBe(start)
    // Past the end is the end, where the last center column already is.
    expect(State.move(start, 'notes', 'center', 99)).toBe(start)
  })
})

// Customer is 200 wide (middle 100), Total 120 (middle 260); Notes is hidden.
describe('ColumnState.dropAt', () => {
  const resized = State.resize(start, 'customer', 300)
  const between = State.move(start, 'notes', 'center', 1)
  test.each<{
    readonly name: string
    readonly state: typeof start
    readonly column: Id
    readonly delta: number
    readonly center: ReadonlyArray<Id>
  }>([
    {
      name: 'stays short of a neighbour’s middle',
      state: start,
      column: 'customer',
      delta: 159,
      center: ['customer', 'total', 'notes'],
    },
    {
      name: 'passes a neighbour’s middle, the hidden column staying last',
      state: start,
      column: 'customer',
      delta: 161,
      center: ['total', 'customer', 'notes'],
    },
    {
      name: 'moves back past a neighbour',
      state: start,
      column: 'total',
      delta: -161,
      center: ['total', 'customer', 'notes'],
    },
    {
      name: 'measures with resized widths',
      state: resized,
      column: 'customer',
      delta: 205,
      center: ['customer', 'total', 'notes'],
    },
    {
      name: 'keeps a hidden column ahead of the one it was ahead of',
      state: between,
      column: 'customer',
      delta: 161,
      center: ['notes', 'total', 'customer'],
    },
    {
      name: 'crossing no neighbour, stays on its side of a hidden column',
      state: between,
      column: 'customer',
      delta: 20,
      center: ['customer', 'notes', 'total'],
    },
    {
      name: 'leaves a hidden column where it is',
      state: start,
      column: 'notes',
      delta: -500,
      center: ['customer', 'total', 'notes'],
    },
    {
      name: 'leaves a column where it is for a delta that is not a number',
      state: start,
      column: 'customer',
      delta: Number.NaN,
      center: ['customer', 'total', 'notes'],
    },
  ])('$name', ({ state, column, delta, center }) => {
    const region = State.regionOf(state, column)
    expect(State.move(state, column, region, State.dropAt(state, column, delta)).center).toEqual(
      center,
    )
  })

  test('a column alone in its region stays', () => {
    expect(State.dropAt(start, 'status', 900)).toBe(0)
  })
})

describe('ColumnState.restore', () => {
  test('reads a saved state back as it was', () => {
    const saved = State.move(
      State.resize(State.hide(start, 'total'), 'customer', 300),
      'status',
      'start',
      0,
    )
    expect(State.restore(JSON.parse(JSON.stringify(saved)))).toEqual({ state: saved, dropped: [] })
  })

  test('drops an id the columns no longer define, or one named twice, and says which', () => {
    const restored = State.restore({
      start: ['id', 'gone'],
      center: ['total', 'customer', 'total', 'notes'],
      end: ['status', 'constructor'],
      hidden: ['gone'],
      widths: [{ column: 'gone', width: 90 }],
    })
    expect(restored.dropped).toEqual(['gone', 'total', 'constructor'])
    expect(restored.state).toEqual({
      start: ['id'],
      center: ['total', 'customer', 'notes'],
      end: ['status'],
      hidden: [],
      widths: [],
    })
  })

  test('gives a column the save predates its declared place and visibility', () => {
    const restored = State.restore({
      start: ['id'],
      center: ['total'],
      end: [],
      hidden: [],
      widths: [],
    })
    expect(restored.dropped).toEqual([])
    expect(restored.state).toMatchObject({
      start: ['id'],
      center: ['total', 'customer', 'notes'],
      end: ['status'],
      hidden: ['notes'],
    })
  })

  test('keeps a saved width within the column’s limits', () => {
    const restored = State.restore({
      ...start,
      widths: [
        { column: 'customer', width: 9000 },
        { column: 'total', width: Number.NaN },
      ],
    })
    expect(restored.state.widths).toEqual([{ column: 'customer', width: 400 }])
  })

  test.each([null, 'layout', 42, { start: 'id' }])('reads %j as the initial state', saved => {
    expect(State.restore(saved)).toEqual({ state: start, dropped: [] })
  })
})
