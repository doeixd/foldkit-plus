import { Option, Schema } from 'effect'
import { Crud, Display } from 'foldkit-crud'
import { ColumnLayout, GridProjection, RowCount, RowStatus } from 'foldkit-data-grid'
import { GridCrud } from 'foldkit-data-grid/crud'
import { Entity } from 'foldkit-entity'
import { type Page, Query, type RemoteData } from 'foldkit-remote'
import { describe, expect, test } from 'vitest'

const Post = Entity.define(
  'Post',
  Schema.Struct({
    id: Schema.String,
    title: Schema.String.annotate({ title: 'Title' }),
    cents: Schema.Number.annotate({ title: 'Price' }),
  }),
)
const Shown = Post.pipe(
  Entity.annotateMembers({
    id: Display.of(Display.hidden()),
    cents: Display.of(Display.number(cents => `$${(cents / 100).toFixed(2)}`)),
  }),
)
const PostRow = Entity.select(Shown, { id: true, title: true, cents: true })
const Posts = Crud.list('Posts', {
  query: Query.make('Posts', { Input: {}, Result: Query.connection(Shown) }),
  selection: PostRow,
})
type Row = typeof PostRow.schema.Type

const items: ReadonlyArray<Row> = [
  { id: 'p1', title: 'Engines', cents: 1250 },
  { id: 'p2', title: 'Compilers', cents: 900 },
]
const postKey = (row: Row) => row.id
const page = (hasNext: boolean): Page<Row> => ({ items, hasNext, hasPrevious: false })
const ready = (hasNext = false): RemoteData<Page<Row>> => ({ _tag: 'Ready', value: page(hasNext) })
const offline = { _tag: 'RemoteQueryError', message: 'offline' } as const

describe('GridCrud.columns', () => {
  const columns = GridCrud.columns(Posts)

  test('one column per listed member, headed by its label, in the list’s order', () => {
    expect(columns.ids).toEqual(['id', 'title', 'cents'])
    expect(columns.byId.title.header).toBe('Title')
    expect(columns.byId.cents.header).toBe('Price')
  })

  test('a value is the member’s text as its Display says it', () => {
    expect(columns.byId.cents.value(items[0]!)).toBe('$12.50')
    expect(columns.byId.title.value(items[1]!)).toBe('Compilers')
  })

  test('a hidden Display starts hidden: read, and not drawn', () => {
    expect(ColumnLayout.initial(columns).hidden).toEqual(['id'])
    const projection = GridProjection.make({
      rows: GridCrud.rows(ready(), postKey),
      columns,
      layout: ColumnLayout.initial(columns),
    })
    expect(projection.columns).toEqual(['title', 'cents'])
  })
})

describe('GridCrud.columns with the grid’s own options', () => {
  const columns = GridCrud.columns(Posts, {
    columns: {
      id: { hidden: false, pinned: 'start', width: 60 },
      cents: {
        header: 'Cost',
        edit: { draft: row => (row.cents / 100).toFixed(2) },
      },
    },
  })

  test('adds pinning, widths and editing, and wins over what the list says', () => {
    expect(ColumnLayout.initial(columns)).toMatchObject({
      start: ['id'],
      center: ['title', 'cents'],
      hidden: [],
    })
    expect(columns.byId.id.width).toBe(60)
    expect(columns.byId.cents.header).toBe('Cost')
    expect(columns.byId.cents.edit?.draft?.(items[0]!)).toBe('12.50')
    // The value is still the list's Display.
    expect(columns.byId.cents.value(items[0]!)).toBe('$12.50')
    expect(columns.byId.title.edit).toBeUndefined()
  })

  test('refuses options for a member the list does not have, and a value of their own', () => {
    // @ts-expect-error -- `author` is not listed.
    GridCrud.columns(Posts, { columns: { author: { width: 10 } } })
    // @ts-expect-error -- the value is the list's Display, not the grid's to replace.
    GridCrud.columns(Posts, { columns: { title: { value: () => 'x' } } })
  })
})

describe('GridCrud.rows', () => {
  test('a page with nothing after it is every row there is', () => {
    const rows = GridCrud.rows(ready(), postKey)
    expect(rows.count).toEqual(RowCount.Known({ total: 2 }))
    expect(rows.keyAt(1)).toEqual(Option.some('p2'))
  })

  test('a page with more after it counts at least its rows', () => {
    expect(GridCrud.rows(ready(true), postKey).count).toEqual(RowCount.Unknown({ atLeast: 2 }))
  })

  test('a failed read keeps the rows it had, and no answer yet is no rows', () => {
    const failed: RemoteData<Page<Row>> = { _tag: 'Failed', error: offline, previous: page(false) }
    expect(GridCrud.rows(failed, postKey).keyAt(0)).toEqual(Option.some('p1'))
    const lost: RemoteData<Page<Row>> = { _tag: 'Failed', error: offline }
    expect(GridCrud.rows(lost, postKey).count).toEqual(RowCount.Known({ total: 0 }))
    expect(GridCrud.rows({ _tag: 'Loading' }, postKey).count).toEqual(RowCount.Known({ total: 0 }))
  })

  test('the same page gives the same row model, so what is built from it is kept', () => {
    const value = page(true)
    const once = GridCrud.rows({ _tag: 'Ready', value }, postKey)
    expect(GridCrud.rows({ _tag: 'Refreshing', value }, postKey)).toBe(once)
    expect(GridCrud.rows({ _tag: 'Ready', value: page(true) }, postKey)).not.toBe(once)
  })
})

describe('GridCrud.status', () => {
  test.each<[string, RemoteData<Page<Row>>, RowStatus]>([
    ['no answer yet is loading', { _tag: 'Initial' }, RowStatus.Loading()],
    ['a read on its way is loading', { _tag: 'Loading' }, RowStatus.Loading()],
    ['an answer is ready', ready(), RowStatus.Ready()],
    [
      'a newer answer on its way is refreshing',
      { _tag: 'Refreshing', value: page(false) },
      RowStatus.Refreshing(),
    ],
    ['nothing found is ready, and empty', { _tag: 'NotFound' }, RowStatus.Ready()],
    [
      'a failure says why',
      { _tag: 'Failed', error: offline },
      RowStatus.Failed({ message: 'offline' }),
    ],
  ])('%s', (_, data, status) => {
    expect(GridCrud.status(data)).toEqual(status)
  })
})
