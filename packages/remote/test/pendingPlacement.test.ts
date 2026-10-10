/**
 * Rows placed in the lists that hold them by what changed them. A pending
 * edit is placed in what a read shows, the server's pages untouched, until it
 * settles; a read or a live patch is placed in the pages themselves.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity as DomainEntity, Expr, Order } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { ConnectionChange, Query, Remote, RemoteData, type NormalizedPatch } from '../src/index.js'

const Project = DomainEntity.define(
  'Project',
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    status: Schema.String,
    price: Schema.Number,
  }),
)
const Summary = DomainEntity.select(Project, { id: true, name: true })

/** Projects of one status, cheapest first. */
const ByStatus = Query.define('ByStatus', { status: Schema.String }, ({ input }) =>
  Query.from(Project).pipe(
    Query.where(Expr.eq(Project.fields.status, input.status)),
    Query.orderBy(Order.asc(Project.fields.price)),
  ),
)
/** Projects by name, which declares no collation and so cannot be placed. */
const ByName = Query.define('ByName', {}, () =>
  Query.from(Project).pipe(Query.orderBy(Order.asc(Project.fields.name))),
)

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({
  model: App.model.remote,
  entities: [Project],
  queries: [ByStatus, ByName],
})

const active = Data.query(ByStatus, { status: 'active' }, { select: Summary, first: 25 })
const archived = Data.query(ByStatus, { status: 'archived' }, { select: Summary, first: 25 })
const byName = Data.query(ByName, {}, { select: Summary, first: 25 })

const rows = [
  { id: 'p1', name: 'Apollo', status: 'active', price: 10 },
  { id: 'p2', name: 'Borealis', status: 'active', price: 20 },
  { id: 'p3', name: 'Cassini', status: 'active', price: 30 },
  { id: 'p4', name: 'Dawn', status: 'archived', price: 5 },
]

const holding = (model: Model, identity: string, held: ReadonlyArray<string>): Model =>
  Data.reduce(model, {
    _tag: 'ConnectionMerged',
    connection: identity,
    page: {
      edges: held.map(id => ({ key: `Project:${id}`, ref: { entity: 'Project', id } })),
      start: { _tag: 'Terminal' },
      end: { _tag: 'Terminal' },
    },
  })

const stored = (): Model =>
  Data.reduce(
    { remote: Remote.initial },
    {
      _tag: 'ReadReceived',
      requests: rows.map(row => ({ entity: 'Project', id: row.id, fields: Object.keys(row) })),
      result: {
        settled: [],
        entities: rows.map(row => ({ entity: 'Project', id: row.id, values: row })),
      },
      now: 0,
    },
  )

const loaded = (): Model => {
  const withActive = holding(stored(), active.ref.identity, ['p1', 'p2', 'p3'])
  const withArchived = holding(withActive, archived.ref.identity, ['p4'])
  return holding(withArchived, byName.ref.identity, ['p1', 'p2', 'p3', 'p4'])
}

/** The ids a read shows, or the state it is in when it shows none. */
const ids = (read: typeof active | typeof byName, model: Model) =>
  RemoteData.match<{ readonly items: ReadonlyArray<{ readonly id: string }> }, unknown>(
    read.read(model),
    {
      Initial: () => 'Initial',
      Loading: () => 'Loading',
      Ready: page => page.items.map(item => item.id),
      Refreshing: page => page.items.map(item => item.id),
      Failed: error => error,
      NotFound: () => 'NotFound',
    },
  )

const patch = (id: string, values: Record<string, unknown>): NormalizedPatch => ({
  entity: 'Project',
  id,
  values,
})

const repriced = (model: Model, id: string, price: number) =>
  Data.overlay(model, 'edit', [patch(id, { price })])

describe('A pending edit to an ordering field', () => {
  it('moves its row where the order puts it, and back when lifted', () => {
    const base = loaded()
    const moved = repriced(base, 'p1', 25)
    expect(ids(active, moved)).toEqual(['p2', 'p1', 'p3'])
    // The server's pages are as they were: only the read places the edit.
    expect(moved.remote.connections).toBe(base.remote.connections)
    expect(ids(active, Data.lift(moved, 'edit'))).toEqual(['p1', 'p2', 'p3'])
  })

  it('moves it to the end of a list that ends', () => {
    expect(ids(active, repriced(loaded(), 'p1', 99))).toEqual(['p2', 'p3', 'p1'])
  })

  it('takes it out of a list that has more past it, for the next page', () => {
    // The first two of the active list, with more to read past them.
    const base = Data.reduce(stored(), {
      _tag: 'ConnectionMerged',
      connection: active.ref.identity,
      page: {
        edges: ['p1', 'p2'].map(id => ({ key: `Project:${id}`, ref: { entity: 'Project', id } })),
        start: { _tag: 'Terminal' },
        end: { _tag: 'Cursor', cursor: 'c2' },
      },
    })
    expect(ids(active, repriced(base, 'p1', 99))).toEqual(['p2'])
  })

  it('places two pending edits together, a later one over an earlier', () => {
    const first = repriced(loaded(), 'p1', 25)
    const second = Data.overlay(first, 'again', [patch('p3', { price: 1 })])
    expect(ids(active, second)).toEqual(['p3', 'p2', 'p1'])
    const over = Data.overlay(second, 'over', [patch('p1', { price: 15 })])
    expect(ids(active, over)).toEqual(['p3', 'p1', 'p2'])
  })

  it('leaves its row where the server put it when the order cannot be placed', () => {
    const renamed = Data.overlay(loaded(), 'edit', [patch('p1', { name: 'Zond' })])
    expect(ids(byName, renamed)).toEqual(['p1', 'p2', 'p3', 'p4'])
  })
})

describe('A pending edit to a filtered field', () => {
  it('takes its row out of a list it no longer matches', () => {
    const archiving = Data.overlay(loaded(), 'edit', [patch('p2', { status: 'archived' })])
    expect(ids(active, archiving)).toEqual(['p1', 'p3'])
  })

  it('does not bring it into a list it now matches, which waits for the server', () => {
    const archiving = Data.overlay(loaded(), 'edit', [patch('p2', { status: 'archived' })])
    // Read after the list it left, from the same Model: each list is placed apart.
    expect(ids(active, archiving)).toEqual(['p1', 'p3'])
    expect(ids(archived, archiving)).toEqual(['p4'])
  })

  it('is what filtering the list judges too', () => {
    const archiving = Data.overlay(loaded(), 'edit', [patch('p2', { status: 'archived' })])
    const all = Data.filtered(archiving, active, ByName, {})
    expect(all.items.map(item => item.id)).toEqual(['p1', 'p3'])
  })
})

/** The server's word on a row, as a read brings it. */
const read = (model: Model, id: string, values: Record<string, unknown>) =>
  Data.reduce(model, {
    _tag: 'ReadReceived',
    requests: [{ entity: 'Project', id, fields: Object.keys(values) }],
    result: { settled: [], entities: [{ entity: 'Project', id, values }] },
    now: 1,
  })

describe('What the server says of a row a list holds', () => {
  it('moves it in the list’s pages when a read brings a new price', () => {
    const base = loaded()
    const moved = read(base, 'p1', { price: 25 })
    expect(ids(active, moved)).toEqual(['p2', 'p1', 'p3'])
    // The pages themselves: the server's word, placed, and nothing fetched.
    expect(moved.remote.connections[active.ref.identity]!.stale).toBe(false)
    expect(moved.remote.connections[byName.ref.identity]).toBe(
      base.remote.connections[byName.ref.identity],
    )
  })

  it('moves it when a live patch brings one', () => {
    const moved = Data.reduce(loaded(), {
      _tag: 'LiveReceived',
      stream: 's',
      event: {
        _tag: 'EntityPatched',
        cursor: 1,
        ref: { entity: 'Project', id: 'p3' },
        values: { price: 1 },
        changed: ['price'],
      },
      now: 1,
    })
    expect(ids(active, moved)).toEqual(['p3', 'p1', 'p2'])
  })

  it('takes it out of a list it no longer matches, and brings it into none', () => {
    const moved = read(loaded(), 'p2', { status: 'archived' })
    expect(ids(active, moved)).toEqual(['p1', 'p3'])
    expect(ids(archived, moved)).toEqual(['p4'])
  })

  it('keeps the pages a read repeats', () => {
    const base = loaded()
    const repeated = read(base, 'p1', rows[0]!)
    expect(repeated.remote.connections).toBe(base.remote.connections)
  })
})

/** A row the client creates, shown at the front of `list` until it settles. */
const created = (
  model: Model,
  values: Record<string, unknown>,
  list: typeof active | typeof byName = active,
) =>
  Data.overlay(model, 'create', [
    patch('p5', { id: 'p5', ...values }),
    ConnectionChange.prepend(list.ref, { entity: 'Project', id: 'p5' }),
  ])

/** A live insert of `id` at the front of `list`, as a server that knows no place sends it. */
const inserted = (model: Model, id: string, list = active) =>
  Data.reduce(model, {
    _tag: 'LiveReceived',
    stream: 's',
    event: {
      _tag: 'ConnectionInsert',
      cursor: 1,
      connection: list.ref.identity,
      edge: { key: `Project:${id}`, ref: { entity: 'Project', id } },
      position: 'prepend',
    },
    now: 1,
  })

describe('A row an insert shows', () => {
  it('is drawn where the order puts it, though its overlay prepends it', () => {
    const shown = created(loaded(), { name: 'Europa', status: 'active', price: 15 })
    expect(ids(active, shown)).toEqual(['p1', 'p5', 'p2', 'p3'])
    // Its overlay is lifted with it.
    expect(ids(active, Data.lift(shown, 'create'))).toEqual(['p1', 'p2', 'p3'])
    // Past every row of a list loaded whole: its end.
    const dearest = created(loaded(), { name: 'Europa', status: 'active', price: 99 })
    expect(ids(active, dearest)).toEqual(['p1', 'p2', 'p3', 'p5'])
  })

  it('is drawn in order when a live insert brings a row the client holds', () => {
    const joined = inserted(read(loaded(), 'p4', { status: 'active' }), 'p4')
    expect(ids(active, joined)).toEqual(['p4', 'p1', 'p2', 'p3'])
    const later = inserted(read(loaded(), 'p4', { status: 'active', price: 25 }), 'p4')
    expect(ids(active, later)).toEqual(['p1', 'p2', 'p4', 'p3'])
  })

  it('is left out when it sorts past what is loaded', () => {
    const partial = Data.reduce(stored(), {
      _tag: 'ConnectionMerged',
      connection: active.ref.identity,
      page: {
        edges: ['p1', 'p2'].map(id => ({ key: `Project:${id}`, ref: { entity: 'Project', id } })),
        start: { _tag: 'Terminal' },
        end: { _tag: 'Cursor', cursor: 'c2' },
      },
    })
    const shown = created(partial, { name: 'Europa', status: 'active', price: 99 })
    expect(ids(active, shown)).toEqual(['p1', 'p2'])
  })

  it('stays at the front when the client cannot place it', () => {
    // No price, which the order reads.
    const unpriced = created(loaded(), { name: 'Europa', status: 'active' })
    expect(ids(active, unpriced)).toEqual(['p5', 'p1', 'p2', 'p3'])
    // A list ordered by text with no declared collation.
    const named = created(loaded(), { name: 'Europa', status: 'active', price: 15 }, byName)
    expect(ids(byName, named)).toEqual(['p5', 'p1', 'p2', 'p3', 'p4'])
  })

  it('shows again, placed, when an insert follows a remove', () => {
    const removed = Data.overlay(loaded(), 'hide', [
      ConnectionChange.remove(active.ref, { entity: 'Project', id: 'p1' }),
    ])
    expect(ids(active, removed)).toEqual(['p2', 'p3'])
    // The pages hold p1, so the later insert is no join: it only unhides.
    const back = inserted(removed, 'p1')
    expect(ids(active, back)).toEqual(['p1', 'p2', 'p3'])
  })
})
