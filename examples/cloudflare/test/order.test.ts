// @vitest-environment node
/**
 * The drawn order. A prepended row belongs between its neighbours, equal
 * titles follow id, and a character past U+FFFF sorts by code point: JS `<`
 * would put it first.
 */
import { Option } from 'effect'
import { RemoteData, type Page } from 'foldkit-remote'
import { describe, expect, it } from 'vitest'
import { orderedPage, orderItems } from '../src/order.js'

interface Row {
  readonly id: string
  readonly title: string
}

const page = (items: ReadonlyArray<Row>): Page<Row> => ({
  items,
  hasNext: true,
  hasPrevious: false,
})

const idsOf = (data: RemoteData<Page<Row>>): ReadonlyArray<string> =>
  RemoteData.match(data, {
    Initial: () => [],
    Loading: () => [],
    NotFound: () => [],
    Ready: value => value.items.map(row => row.id),
    Refreshing: value => value.items.map(row => row.id),
    Failed: (_error, previous) =>
      Option.match(previous, {
        onNone: () => [],
        onSome: value => value.items.map(row => row.id),
      }),
  })

describe('orderItems', () => {
  const cases: ReadonlyArray<{
    readonly name: string
    readonly items: ReadonlyArray<Row>
    readonly ids: ReadonlyArray<string>
  }> = [
    {
      name: 'a prepended title lands between its neighbours',
      items: [
        { id: 'm', title: 'mmm' },
        { id: 'z', title: 'asdf' },
        { id: 'a', title: 'sdfg' },
      ],
      ids: ['z', 'm', 'a'],
    },
    {
      name: 'a title sorts before one it prefixes',
      items: [
        { id: 'long', title: 'ab' },
        { id: 'short', title: 'a' },
      ],
      ids: ['short', 'long'],
    },
    {
      name: 'equal titles follow id',
      items: [
        { id: 'b', title: 'Same' },
        { id: 'a', title: 'Same' },
      ],
      ids: ['a', 'b'],
    },
    {
      name: 'uppercase sorts before lowercase',
      items: [
        { id: 'lower', title: 'b' },
        { id: 'upper', title: 'A' },
      ],
      ids: ['upper', 'lower'],
    },
    {
      name: 'a character past U+FFFF sorts by code point',
      items: [
        { id: 'emoji', title: '😀' },
        { id: 'private', title: '\uE000' },
      ],
      ids: ['private', 'emoji'],
    },
  ]

  it.each(cases)('$name', ({ items, ids }) => {
    expect(orderItems(items).map(row => row.id)).toEqual(ids)
  })
})

describe('orderedPage', () => {
  const items: ReadonlyArray<Row> = [
    { id: 'b', title: 'Same' },
    { id: 'a', title: 'Same' },
  ]
  const value = page(items)
  const error = { _tag: 'QueryFailed', message: 'no' }

  const showing: ReadonlyArray<{
    readonly name: string
    readonly data: RemoteData<Page<Row>>
  }> = [
    { name: 'Ready', data: { _tag: 'Ready', value } },
    { name: 'Refreshing', data: { _tag: 'Refreshing', value } },
    { name: 'Failed', data: { _tag: 'Failed', error, previous: value } },
  ]

  it.each(showing)('sorts a $name page and keeps its bounds', ({ data }) => {
    const ordered = orderedPage(data)
    expect(idsOf(ordered)).toEqual(['a', 'b'])
    const bounds = RemoteData.match(ordered, {
      Initial: () => undefined,
      Loading: () => undefined,
      NotFound: () => undefined,
      Ready: page => page.hasNext,
      Refreshing: page => page.hasNext,
      Failed: (_error, previous) =>
        Option.match(previous, { onNone: () => undefined, onSome: page => page.hasNext }),
    })
    expect(bounds).toBe(true)
  })

  it('leaves a failure with no rows as it was', () => {
    const failed: RemoteData<Page<Row>> = { _tag: 'Failed', error }
    expect(orderedPage(failed)).toBe(failed)
  })
})
