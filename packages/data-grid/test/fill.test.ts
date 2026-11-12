import { Option } from 'effect'
import { Columns, Fill, type FillLane, GridProjection, RowModel } from 'foldkit-data-grid'
import { describe, expect, test } from 'vitest'

interface Line {
  readonly id: string
  readonly count: string
  readonly name: string
}
// Keys out of key order, so a fill that walked keys rather than positions would land wrong.
const lines: ReadonlyArray<Line> = [
  { id: 'l:3', count: '1', name: 'a' },
  { id: 'l:1', count: '2', name: 'b' },
  { id: 'l:10', count: '9', name: 'c' },
  { id: 'l:2', count: '9', name: 'd' },
  { id: 'l:20', count: '9', name: 'e' },
]
const columns = Columns.define<Line>()({
  count: { header: 'Count', value: line => line.count, edit: {} },
  name: { header: 'Name', value: line => line.name, edit: {} },
  id: { header: 'Id', value: line => line.id },
})
type Id = 'count' | 'name' | 'id'
const projection = GridProjection.make({
  rows: RowModel.fromArray(lines, line => line.id),
  columns,
  layout: { start: [], center: ['count', 'name', 'id'], end: [], hidden: [] },
})
const at = (row: string, column: Id) => ({ row, column })
const byKey = new Map(lines.map(line => [line.id, line]))
const options = {
  editable: (column: Id) => column !== 'id',
  from: ({ row, column }: { readonly row: string; readonly column: Id }) =>
    String(byKey.get(row)![column]),
}
const planOf = (anchor: [string, Id], focus: [string, Id], to: [string, Id]) =>
  Fill.plan(projection, { source: { anchor: at(...anchor), focus: at(...focus) }, to: at(...to) })

describe('Fill.series', () => {
  test.each<[string, ReadonlyArray<string>, number, boolean, ReadonlyArray<string>]>([
    ['two numbers continue their step', ['1', '2'], 3, false, ['3', '4', '5']],
    ['a falling step falls on', ['-1', '-3'], 2, false, ['-5', '-7']],
    ['decimals keep the finest', ['1.5', '2'], 2, false, ['2.5', '3.0']],
    ['a step of a tenth adds up exactly', ['0.1', '0.2'], 2, false, ['0.3', '0.4']],
    ['spaces around a number are no matter', [' 2 ', '4'], 1, false, ['6']],
    ['one number repeats', ['5'], 2, false, ['5', '5']],
    ['an uneven step repeats', ['1', '2', '4'], 4, false, ['1', '2', '4', '1']],
    ['text repeats in order', ['a', 'b'], 3, false, ['a', 'b', 'a']],
    ['a number beside text repeats', ['1', 'b'], 2, false, ['1', 'b']],
    ['backward, a step runs back', ['3', '4'], 2, true, ['2', '1']],
    ['backward, a pattern runs back', ['a', 'b', 'c'], 4, true, ['c', 'b', 'a', 'c']],
    [
      'days a day apart continue by days',
      ['2026-01-05', '2026-01-06'],
      2,
      false,
      ['2026-01-07', '2026-01-08'],
    ],
    [
      'days cross a month end',
      ['2026-01-30', '2026-01-31'],
      2,
      false,
      ['2026-02-01', '2026-02-02'],
    ],
    [
      'days cross a leap day',
      ['2028-02-27', '2028-02-28'],
      3,
      false,
      ['2028-02-29', '2028-03-01', '2028-03-02'],
    ],
    ['a common year has no leap day', ['2027-02-27', '2027-02-28'], 1, false, ['2027-03-01']],
    [
      'days a week apart continue by weeks',
      ['2026-01-01', '2026-01-08'],
      2,
      false,
      ['2026-01-15', '2026-01-22'],
    ],
    ['falling days fall on', ['2026-01-10', '2026-01-08'], 2, false, ['2026-01-06', '2026-01-04']],
    [
      'backward, days run back across a year',
      ['2026-01-02', '2026-01-03'],
      3,
      true,
      ['2026-01-01', '2025-12-31', '2025-12-30'],
    ],
    [
      'months on one day continue by months',
      ['2026-01-15', '2026-02-15'],
      2,
      false,
      ['2026-03-15', '2026-04-15'],
    ],
    [
      'a month step crosses a year',
      ['2026-11-10', '2026-12-10'],
      2,
      false,
      ['2027-01-10', '2027-02-10'],
    ],
    [
      'a 31st clamps and comes back',
      ['2026-01-31', '2026-03-31'],
      3,
      false,
      ['2026-05-31', '2026-07-31', '2026-09-30'],
    ],
    [
      'a month step of one clamps from the source day',
      ['2026-12-31', '2027-01-31'],
      3,
      false,
      ['2027-02-28', '2027-03-31', '2027-04-30'],
    ],
    [
      'a clamped month step counts from the day, across a leap year',
      ['2027-12-31', '2028-01-31'],
      1,
      false,
      ['2028-02-29'],
    ],
    ['months run back', ['2026-03-15', '2026-04-15'], 2, true, ['2026-02-15', '2026-01-15']],
    ['a falling month step falls on', ['2026-04-15', '2026-02-15'], 1, false, ['2025-12-15']],
    ['both fit: month wins', ['2026-02-01', '2026-03-01'], 2, false, ['2026-04-01', '2026-05-01']],
    [
      'already clamped: the day step continues',
      ['2026-01-31', '2026-02-28'],
      2,
      false,
      ['2026-03-28', '2026-04-25'],
    ],
    [
      'an uneven day step repeats',
      ['2026-01-01', '2026-01-02', '2026-01-04'],
      2,
      false,
      ['2026-01-01', '2026-01-02'],
    ],
    ['one day repeats', ['2026-01-05'], 2, false, ['2026-01-05', '2026-01-05']],
    [
      'the same day twice repeats',
      ['2026-01-05', '2026-01-05'],
      2,
      false,
      ['2026-01-05', '2026-01-05'],
    ],
    [
      'a day that does not exist is not a day',
      ['2024-02-30', '2024-03-02'],
      2,
      false,
      ['2024-02-30', '2024-03-02'],
    ],
    ['a day beside text repeats', ['2026-01-05', 'x'], 2, false, ['2026-01-05', 'x']],
    [
      'a day with a time repeats',
      ['2026-01-05T00:00', '2026-01-06T00:00'],
      1,
      false,
      ['2026-01-05T00:00'],
    ],
  ])('%s', (_, source, count, backward, expected) => {
    expect(Fill.series(source, count, backward)).toEqual(expected)
  })
})

describe('Fill.cells with a column’s own series', () => {
  const lane = (column: Id) => planOf(['l:3', column], ['l:1', column], ['l:20', column])
  const custom = (give: (lane: FillLane) => Option.Option<ReadonlyArray<string>>) => ({
    ...options,
    custom: (column: Id, lane: FillLane) => (column === 'name' ? give(lane) : Option.none()),
  })
  const names = (texts: ReadonlyArray<string>) => Option.some(texts)

  test('its texts land next to the source, and the lane is the source top to bottom', () => {
    const seen: Array<FillLane> = []
    const cells = Fill.cells(
      projection,
      Option.getOrThrow(lane('name')),
      custom(given => {
        seen.push(given)
        return names(['x', 'y', 'z'])
      }),
    )
    expect(seen).toEqual([{ source: ['a', 'b'], count: 3, toward: 'down' }])
    expect(cells.map(cell => [cell.row, cell.text])).toEqual([
      ['l:10', 'x'],
      ['l:2', 'y'],
      ['l:20', 'z'],
    ])
  })

  test('up, the first text is next to the source and the lane reads top to bottom', () => {
    const seen: Array<FillLane> = []
    const plan = Option.getOrThrow(planOf(['l:10', 'name'], ['l:2', 'name'], ['l:3', 'name']))
    const cells = Fill.cells(
      projection,
      plan,
      custom(given => {
        seen.push(given)
        return names(['x', 'y'])
      }),
    )
    expect(seen).toEqual([{ source: ['c', 'd'], count: 2, toward: 'up' }])
    expect(cells.map(cell => [cell.row, cell.text])).toEqual([
      ['l:1', 'x'],
      ['l:3', 'y'],
    ])
  })

  test('none defers to the default series, per column', () => {
    const cells = Fill.cells(
      projection,
      Option.getOrThrow(planOf(['l:3', 'count'], ['l:1', 'name'], ['l:10', 'name'])),
      custom(() => Option.none()),
    )
    expect(cells.map(cell => cell.text)).toEqual(['3', 'a'])
  })

  test('a longer answer is cut to the cells asked for', () => {
    const cells = Fill.cells(
      projection,
      Option.getOrThrow(lane('name')),
      custom(() => names(['1', '2', '3', '4', '5'])),
    )
    expect(cells.map(cell => cell.text)).toEqual(['1', '2', '3'])
  })

  test('a shorter answer leaves the cells past its end refused, not padded', () => {
    const cells = Fill.cells(
      projection,
      Option.getOrThrow(lane('name')),
      custom(() => names(['x'])),
    )
    expect(cells).toEqual([
      { row: 'l:10', column: 'name', text: 'x', from: 'c' },
      {
        row: 'l:2',
        column: 'name',
        text: '',
        from: 'd',
        refusal: 'The column’s series gave no text here',
      },
      {
        row: 'l:20',
        column: 'name',
        text: '',
        from: 'e',
        refusal: 'The column’s series gave no text here',
      },
    ])
  })

  test('a fill across columns keeps the default series', () => {
    const plan = Option.getOrThrow(planOf(['l:3', 'count'], ['l:1', 'count'], ['l:1', 'name']))
    const cells = Fill.cells(
      projection,
      plan,
      custom(() => names(['never'])),
    )
    expect(cells.map(cell => cell.text)).toEqual(['1', '2'])
  })
})

describe('Fill.plan', () => {
  test.each<
    [string, [string, Id], [string, Id], [string, Id], string, ReadonlyArray<Id>, number, number]
  >([
    ['down', ['l:3', 'count'], ['l:1', 'name'], ['l:2', 'count'], 'down', ['count', 'name'], 2, 4],
    ['up', ['l:10', 'count'], ['l:2', 'count'], ['l:3', 'count'], 'up', ['count'], 0, 2],
    ['right', ['l:3', 'count'], ['l:3', 'count'], ['l:3', 'id'], 'right', ['name', 'id'], 0, 1],
    ['left', ['l:1', 'id'], ['l:1', 'id'], ['l:1', 'count'], 'left', ['count', 'name'], 1, 2],
    // As far down as right: rows win, as a drag down a diagonal fills down.
    [
      'a diagonal, down',
      ['l:3', 'count'],
      ['l:3', 'count'],
      ['l:1', 'name'],
      'down',
      ['count'],
      1,
      2,
    ],
  ])('%s', (_, anchor, focus, to, toward, targetColumns, start, end) => {
    expect(planOf(anchor, focus, to)).toEqual(
      Option.some(
        expect.objectContaining({
          toward,
          target: { rows: { start, end }, columns: targetColumns },
        }),
      ),
    )
  })

  test('a cell inside the source fills nothing', () => {
    expect(planOf(['l:3', 'count'], ['l:1', 'name'], ['l:1', 'count'])).toEqual(Option.none())
  })
})

describe('Fill.cells', () => {
  test('down: each column carries on its own, and a column that does not edit is left', () => {
    const plan = Option.getOrThrow(planOf(['l:3', 'count'], ['l:1', 'id'], ['l:20', 'count']))
    expect(Fill.cells(projection, plan, options)).toEqual([
      { row: 'l:10', column: 'count', text: '3', from: '9' },
      { row: 'l:2', column: 'count', text: '4', from: '9' },
      { row: 'l:20', column: 'count', text: '5', from: '9' },
      { row: 'l:10', column: 'name', text: 'a', from: 'c' },
      { row: 'l:2', column: 'name', text: 'b', from: 'd' },
      { row: 'l:20', column: 'name', text: 'a', from: 'e' },
    ])
  })

  test('up: the series runs back from the source’s first row', () => {
    const plan = Option.getOrThrow(planOf(['l:1', 'count'], ['l:10', 'count'], ['l:3', 'count']))
    // 2 then 9 is a step of 7, so the row above them holds 2 - 7.
    expect(Fill.cells(projection, plan, options)).toEqual([
      { row: 'l:3', column: 'count', text: '-5', from: '1' },
    ])
  })

  test('up over two rows: the pattern runs back from the source, nearest first', () => {
    const plan = Option.getOrThrow(planOf(['l:10', 'name'], ['l:2', 'name'], ['l:3', 'name']))
    expect(Fill.cells(projection, plan, options)).toEqual([
      { row: 'l:1', column: 'name', text: 'd', from: 'b' },
      { row: 'l:3', column: 'name', text: 'c', from: 'a' },
    ])
  })

  test('right and left: each row carries on its own', () => {
    const right = Option.getOrThrow(planOf(['l:3', 'count'], ['l:1', 'count'], ['l:1', 'name']))
    expect(Fill.cells(projection, right, options)).toEqual([
      { row: 'l:3', column: 'name', text: '1', from: 'a' },
      { row: 'l:1', column: 'name', text: '2', from: 'b' },
    ])
    const left = Option.getOrThrow(planOf(['l:3', 'name'], ['l:3', 'name'], ['l:3', 'count']))
    expect(Fill.cells(projection, left, options)).toEqual([
      { row: 'l:3', column: 'count', text: 'a', from: '1' },
    ])
  })
})
