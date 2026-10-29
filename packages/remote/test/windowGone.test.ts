/**
 * Every window of one query shares its connection, and a window that has no
 * row to show yet reads `Refreshing` with no rows only when a row it would
 * show was deleted (#263). A delete outside the window is not its own (#287).
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity as DomainEntity, Order } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { ConnectionChange, Query, Remote, terminal, type RemoteMessage } from '../src/index.js'

const Project = DomainEntity.define(
  'Project',
  Schema.Struct({ id: Schema.String, name: Schema.String }),
)
const All = Query.define('All', {}, () =>
  Query.from(Project).pipe(Query.orderBy(Order.asc(Project.fields.id))),
)

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({ model: App.model.remote, entities: [Project], queries: [All] })
const Named = DomainEntity.select(Project, { name: true })
const initial: Model = { remote: Remote.initial }

const ids = ['p1', 'p2', 'p3'] as const
const window = (size: number) => Data.query(All, {}, { select: Named, first: size })
const last = (size: number) => Data.query(All, {}, { select: Named, last: size })

/** The three rows listed, none of their names read yet. */
const listed = (identity: string): RemoteMessage => ({
  _tag: 'ConnectionMerged',
  connection: identity,
  page: {
    edges: ids.map(id => ({ key: `Project:${id}`, ref: { entity: 'Project', id } })),
    start: terminal,
    end: terminal,
  },
})
const deleted = (id: string): RemoteMessage => ({
  _tag: 'MutationSucceeded',
  requestId: 'delete',
  entities: [],
  deleted: [{ entity: 'Project', id }],
  now: 1,
})
const reading = (id: string): RemoteMessage => ({
  _tag: 'ReadStarted',
  requests: [{ entity: 'Project', id, fields: ['name'] }],
})

/** A window of `read` over the three rows, `gone` deleted, and `asked` being read. */
const after = (
  read: ReturnType<typeof window>,
  gone: string,
  asked: string,
): ReturnType<typeof read.read> =>
  read.read([listed(read.ref.identity), deleted(gone), reading(asked)].reduce(Data.reduce, initial))

describe('A window with no row to show yet', () => {
  it.each([
    ['the first one, p3 deleted past it', window(1), 'p3', 'p1'],
    ['the first two, p3 deleted past them', window(2), 'p3', 'p1'],
    ['the last one, p1 deleted before it', last(1), 'p1', 'p3'],
  ] as const)('is loading: %s', (_, read, gone, asked) => {
    expect(after(read, gone, asked)).toEqual({ _tag: 'Loading' })
  })

  it.each([
    ['every row, p3 among them', window(25), 'p3', 'p1'],
    ['the first one, p1 itself', window(1), 'p1', 'p2'],
    ['the last one, p3 itself', last(1), 'p3', 'p2'],
  ] as const)('lost a row it showed to a delete: %s', (_, read, gone, asked) => {
    expect(after(read, gone, asked)).toMatchObject({ _tag: 'Refreshing', value: { items: [] } })
  })

  it('counts only the rows it shows toward its size', () => {
    const read = window(1)
    const removed: RemoteMessage = {
      _tag: 'MutationStarted',
      requestId: 'remove',
      optimistic: [ConnectionChange.remove(read.ref, { entity: 'Project', id: 'p1' })],
    }
    const model = [listed(read.ref.identity), removed, deleted('p2'), reading('p3')].reduce(
      Data.reduce,
      initial,
    )
    // p1 is hidden, not shown, so p2 was the row this window showed.
    expect(read.read(model)).toMatchObject({ _tag: 'Refreshing', value: { items: [] } })
  })
})
