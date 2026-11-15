/**
 * Compile-time: a sortable column's key is the literal it was written as, so `onSort` receives
 * `'name' | 'price'` whether the columns are written in the call, hoisted with
 * `Table.defineColumns`, or hoisted `as const`; and a handler that takes only those keys is fine
 * where one taking any string was. Type-checked, not executed.
 */
import { Option } from 'effect'
import { Table } from '../src/index.js'
import { h, message, type TestMessage } from './fixture.js'

interface Fruit {
  readonly name: string
  readonly price: number
}
type Key = 'name' | 'price'
const rows: ReadonlyArray<Fruit> = []
const onlyKeys = (column: Key): TestMessage => message(column === 'name' ? 'Clicked' : 'Other')

export const inline = Table.view(
  {
    columns: [
      { header: 'Name', sortKey: 'name', value: (fruit: Fruit) => fruit.name },
      { header: 'Price', sortKey: 'price', value: (fruit: Fruit) => String(fruit.price) },
    ],
    rows,
    sort: { by: Option.none(), onSort: onlyKeys },
  },
  h,
)

const defined = Table.defineColumns<Fruit>()([
  { header: 'Name', sortKey: 'name', value: fruit => fruit.name },
  { header: 'Price', sortKey: 'price', value: fruit => String(fruit.price) },
])
export const hoisted = Table.view(
  { columns: defined, rows, sort: { by: Option.none(), onSort: onlyKeys } },
  h,
)

export const alsoInline = Table.view(
  {
    columns: Table.defineColumns<Fruit>()([
      { header: 'Name', sortKey: 'name', value: fruit => fruit.name },
      { header: 'Price', sortKey: 'price', value: fruit => String(fruit.price) },
    ]),
    rows,
    sort: { by: Option.none(), onSort: onlyKeys },
  },
  h,
)

const asConst = [
  { header: 'Name', sortKey: 'name', value: (fruit: Fruit) => fruit.name },
  { header: 'Price', sortKey: 'price', value: (fruit: Fruit) => String(fruit.price) },
] as const
export const constant = Table.view(
  { columns: asConst, rows, sort: { by: Option.none(), onSort: onlyKeys } },
  h,
)

export const received = Table.view(
  {
    columns: defined,
    rows,
    sort: {
      by: Option.none(),
      onSort: column => {
        const known: Key = column
        return message(known === 'name' ? 'Clicked' : 'Other')
      },
    },
  },
  h,
)

export const next: Option.Option<Table.TableSort<Key>> = Table.nextSort(
  Option.none<Table.TableSort<Key>>(),
  'name',
)

// A heading that is not a column's key is refused.
export const unknownKey = Table.view(
  {
    // @ts-expect-error 'weight' is no column's sortKey
    columns: defined,
    rows,
    sort: {
      by: Option.none(),
      onSort: (column: 'weight') => message(column === 'weight' ? 'Other' : 'Clicked'),
    },
  },
  h,
)

// Columns with no literal keys, as before, send a string.
const plain = [{ header: 'Name', sortKey: 'name', value: (fruit: Fruit) => fruit.name }]
export const stringKeys = Table.view(
  {
    columns: plain,
    rows,
    sort: {
      by: Option.none(),
      onSort: (column: string) => message(column === '' ? 'Other' : 'Clicked'),
    },
  },
  h,
)
