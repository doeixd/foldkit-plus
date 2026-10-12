/**
 * What a mutation's answer does to the lists the client holds.
 *
 * remote-improvement-plan §5.1. A list is kept only when its body proves the
 * write left its rows and their order as they were; every other list the write
 * could have touched is invalidated, so the read entry fetches it again.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity as DomainEntity, Expr, Order } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { ConnectionChange, Query, Remote, type NormalizedPatch } from '../src/index.js'

const Project = DomainEntity.define(
  'Project',
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    status: Schema.String,
    price: Schema.Number,
  }),
)
const Owner = DomainEntity.define(
  'Owner',
  Schema.Struct({ id: Schema.String, name: Schema.String }),
)
const Summary = DomainEntity.select(Project, { id: true, name: true })

/** Projects of one status, cheapest first. */
const ByStatus = Query.define('ByStatus', { status: Schema.String }, ({ input }) =>
  Query.from(Project).pipe(
    Query.where(Expr.eq(Project.fields.status, input.status)),
    Query.orderBy(Order.asc(Project.fields.price)),
  ),
)
/** Projects whose name contains what was typed. */
const Named = Query.define('Named', { name: Schema.String }, ({ input }) =>
  Query.from(Project).pipe(
    Query.where(Expr.contains(Project.fields.name, input.name)),
    Query.orderBy(Order.asc(Project.fields.id)),
  ),
)
/** Active projects whose name holds what was typed, by id: two filters. */
const ActiveNamed = Query.define('ActiveNamed', { name: Schema.String }, ({ input }) =>
  Query.from(Project).pipe(
    Query.where(Expr.eq(Project.fields.status, 'active')),
    Query.where(Expr.contains(Project.fields.name, input.name)),
    Query.orderBy(Order.asc(Project.fields.id)),
  ),
)
/** Projects of one status, in an order the server chooses and the body does not say. */
const ServerOrdered = Query.define('ServerOrdered', { status: Schema.String }, ({ input }) =>
  Query.from(Project).pipe(Query.where(Expr.eq(Project.fields.status, input.status))),
)
/** Projects, sorted by what the reader picked among price and name. */
const Sorted = Query.define(
  'Sorted',
  {
    sort: Schema.NullOr(
      Schema.Struct({
        by: Schema.Literals(['price', 'name']),
        direction: Schema.Literals(['asc', 'desc']),
      }),
    ),
  },
  ({ input }) =>
    Query.from(Project).pipe(
      Query.orderBy(
        Order.chosen(input.sort, { price: Project.fields.price, name: Project.fields.name }),
      ),
    ),
)
/** The same rows, by a query whose meaning only the server knows. */
const Opaque = Query.make('Opaque', { Input: {}, Result: Query.connection(Project) })
const Owners = Query.define('Owners', {}, () =>
  Query.from(Owner).pipe(Query.orderBy(Order.asc(Owner.fields.name))),
)

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({
  model: App.model.remote,
  entities: [Project, Owner],
  queries: [ByStatus, Named, Opaque, Owners, ServerOrdered, Sorted, ActiveNamed],
})

const active = Data.query(ByStatus, { status: 'active' }, { select: Summary, first: 25 })
const named = Data.query(Named, { name: 'Apo' }, { select: Summary, first: 25 })
const opaque = Data.query(Opaque, {}, { select: Summary, first: 25 })
const activeApollos = Data.query(ActiveNamed, { name: 'Apo' }, { select: Summary, first: 25 })
const byPrice = Data.query(
  Sorted,
  { sort: { by: 'price', direction: 'asc' } },
  { select: Summary, first: 25 },
)
const serverOrdered = Data.query(
  ServerOrdered,
  { status: 'active' },
  { select: Summary, first: 25 },
)
const owners = Data.query(
  Owners,
  {},
  { select: DomainEntity.select(Owner, { id: true }), first: 25 },
)

const rows = [
  { id: 'p1', name: 'Apollo', status: 'active', price: 10 },
  { id: 'p2', name: 'Borealis', status: 'active', price: 20 },
  { id: 'p3', name: 'Cassini', status: 'archived', price: 30 },
]

/** One connection holding the rows `held` names, with every row in the store. */
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

const loaded = (): Model => {
  const stored = Data.reduce(
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
  const withActive = holding(stored, active.ref.identity, ['p1', 'p2'])
  const withNamed = holding(withActive, named.ref.identity, ['p1'])
  const withOpaque = holding(withNamed, opaque.ref.identity, ['p1', 'p2', 'p3'])
  const withServerOrdered = holding(withOpaque, serverOrdered.ref.identity, ['p1', 'p2'])
  const withByPrice = holding(withServerOrdered, byPrice.ref.identity, ['p1', 'p2', 'p3'])
  const withApollos = holding(withByPrice, activeApollos.ref.identity, ['p1'])
  return Data.reduce(withApollos, {
    _tag: 'ConnectionMerged',
    connection: owners.ref.identity,
    page: { edges: [], start: { _tag: 'Terminal' }, end: { _tag: 'Terminal' } },
  })
}

/** Rows the client read, without any list. */
const stored = (model: Model, entities: ReadonlyArray<NormalizedPatch>): Model =>
  Data.reduce(model, {
    _tag: 'ReadReceived',
    requests: entities.map(row => ({
      entity: row.entity,
      id: row.id,
      fields: Object.keys(row.values),
    })),
    result: { settled: [], entities: [...entities] },
    now: 0,
  })

let sequence = 0
/** A mutation's answer arriving, with these patches and deletions. */
const answered = (
  model: Model,
  entities: ReadonlyArray<NormalizedPatch>,
  deleted: ReadonlyArray<{ readonly entity: string; readonly id: string }> = [],
  requestId = `m${++sequence}`,
): Model =>
  Data.reduce(model, {
    _tag: 'MutationSucceeded',
    requestId,
    entities: [...entities],
    deleted,
    now: 1,
  })

const stale = (model: Model, identity: string): boolean =>
  model.remote.connections[identity]?.stale === true

const patch = (id: string, values: Record<string, unknown>): NormalizedPatch => ({
  entity: 'Project',
  id,
  values,
})

describe('A list whose body proves the write left it as it was', () => {
  it('is kept when no field it filters or orders on changed', () => {
    const base = loaded()
    const renamed = answered(base, [patch('p1', { name: 'Apollo II' })])
    expect(stale(renamed, active.ref.identity)).toBe(false)
    expect(renamed.remote.connections[active.ref.identity]).toBe(
      base.remote.connections[active.ref.identity],
    )
  })

  it('is kept, its pages untouched, when a held row changed a filtered field and still matches', () => {
    const base = loaded()
    const renamed = answered(base, [patch('p1', { name: 'Apollo II' })])
    expect(stale(renamed, named.ref.identity)).toBe(false)
    expect(renamed.remote.connections[named.ref.identity]).toBe(
      base.remote.connections[named.ref.identity],
    )
  })

  it('is kept when the answer repeats values the client held, as a whole row does', () => {
    // Every field is returned and none is new, the ordering field included.
    const repeated = answered(loaded(), [patch('p1', rows[0]!)])
    expect(stale(repeated, active.ref.identity)).toBe(false)
    expect(stale(repeated, opaque.ref.identity)).toBe(false)
  })

  it('is kept when a row it does not hold changed only an ordering field', () => {
    const repriced = answered(loaded(), [patch('p3', { price: 5 })])
    expect(stale(repriced, active.ref.identity)).toBe(false)
    // Loaded whole, it holds every row that matches, so it is not judged:
    // `p8`, whose status the client lacks, would otherwise be past judging.
    const known = stored(loaded(), [patch('p8', { price: 40 })])
    const unjudged = answered(known, [patch('p8', { price: 5 })])
    expect(stale(unjudged, active.ref.identity)).toBe(false)
  })

  it('is kept when the write was to another Entity', () => {
    const elsewhere = answered(loaded(), [patch('p1', { status: 'archived' })])
    expect(stale(elsewhere, owners.ref.identity)).toBe(false)
  })

  it('is kept on a deletion, which its tombstone already removes', () => {
    const removed = answered(loaded(), [], [{ entity: 'Project', id: 'p1' }])
    expect(stale(removed, active.ref.identity)).toBe(false)
    expect(Data.visibleItems(removed.remote, active.ref.identity).map(edge => edge.ref.id)).toEqual(
      ['p2'],
    )
  })
})

describe('A list the client places the change in, fetching nothing', () => {
  /** The ids a list shows, in its order, and whether it is due for a fetch. */
  const shown = (model: Model, identity: string) => ({
    ids: Data.visibleItems(model.remote, identity).map(edge => edge.ref.id),
    stale: stale(model, identity),
  })

  it('loses a held row that stops matching, by any filter', () => {
    const renamed = answered(loaded(), [patch('p1', { name: 'Voyager' })])
    expect(shown(renamed, named.ref.identity)).toEqual({ ids: [], stale: false })
  })

  it('loses a held row that stops matching, and plans no fetch of the list', () => {
    const archived = answered(loaded(), [patch('p1', { status: 'archived' })])
    expect(shown(archived, active.ref.identity)).toEqual({ ids: ['p2'], stale: false })
    expect(Remote.planQueries(Data, archived, active)).toEqual([])
  })

  it('gains a row that starts matching, where its order puts it', () => {
    const revived = answered(loaded(), [patch('p3', { status: 'active' })])
    expect(shown(revived, active.ref.identity)).toEqual({ ids: ['p1', 'p2', 'p3'], stale: false })
    const between = answered(loaded(), [patch('p3', { status: 'active', price: 15 })])
    expect(shown(between, active.ref.identity)).toEqual({ ids: ['p1', 'p3', 'p2'], stale: false })
  })

  it('moves a held row whose ordering field changed', () => {
    const repriced = answered(loaded(), [patch('p1', { price: 50 })])
    expect(shown(repriced, active.ref.identity)).toEqual({ ids: ['p2', 'p1'], stale: false })
  })

  it('keeps the very list when a held row’s order changed but its place did not', () => {
    const before = loaded()
    // p1 is cheaper than p2 still, so it stands where it stood.
    const nudged = answered(before, [patch('p1', { price: 11 })])
    expect(nudged.remote.connections[active.ref.identity]).toBe(
      before.remote.connections[active.ref.identity],
    )
  })

  it('leaves out a row that joins past what it has loaded, and fetches nothing', () => {
    // The same rows in the store; the list loaded up to p2, with more after it.
    const rows = loaded().remote
    const partial = Data.reduce(
      { remote: { ...rows, connections: {} } },
      {
        _tag: 'ConnectionMerged',
        connection: active.ref.identity,
        page: {
          edges: ['p1', 'p2'].map(id => ({ key: `Project:${id}`, ref: { entity: 'Project', id } })),
          start: { _tag: 'Terminal' },
          end: { _tag: 'Cursor', cursor: 'after-p2' },
        },
      },
    )
    // p3 joins at 30, past p2 and so past what is loaded.
    const revived = answered(partial, [patch('p3', { status: 'active' })])
    expect(shown(revived, active.ref.identity)).toEqual({ ids: ['p1', 'p2'], stale: false })
  })

  it('loses a held row that moves past what it has loaded', () => {
    const rows = loaded().remote
    const partial = Data.reduce(
      { remote: { ...rows, connections: {} } },
      {
        _tag: 'ConnectionMerged',
        connection: active.ref.identity,
        page: {
          edges: ['p1', 'p2'].map(id => ({ key: `Project:${id}`, ref: { entity: 'Project', id } })),
          start: { _tag: 'Terminal' },
          end: { _tag: 'Cursor', cursor: 'after-p2' },
        },
      },
    )
    const repriced = answered(partial, [patch('p1', { price: 50 })])
    expect(shown(repriced, active.ref.identity)).toEqual({ ids: ['p2'], stale: false })
  })

  it('gains a row new to the client, though it filters on nothing', () => {
    const created = answered(loaded(), [
      patch('p5', { id: 'p5', name: 'Dawn', status: 'active', price: 15 }),
    ])
    expect(shown(created, byPrice.ref.identity)).toEqual({
      ids: ['p1', 'p5', 'p2', 'p3'],
      stale: false,
    })
  })

  it('gains a row it does not hold whose order moves it in from past what it has loaded', () => {
    const rows = loaded().remote
    const partial = Data.reduce(
      { remote: { ...rows, connections: {} } },
      {
        _tag: 'ConnectionMerged',
        connection: byPrice.ref.identity,
        page: {
          edges: ['p1', 'p2'].map(id => ({ key: `Project:${id}`, ref: { entity: 'Project', id } })),
          start: { _tag: 'Terminal' },
          end: { _tag: 'Cursor', cursor: 'after-p2' },
        },
      },
    )
    const cheaper = answered(partial, [patch('p3', { price: 15 })])
    expect(shown(cheaper, byPrice.ref.identity)).toEqual({ ids: ['p1', 'p3', 'p2'], stale: false })
  })

  it('does not gain a row that moves in from past what it has loaded but does not match', () => {
    const rows = loaded().remote
    const partial = Data.reduce(
      { remote: { ...rows, connections: {} } },
      {
        _tag: 'ConnectionMerged',
        connection: active.ref.identity,
        page: {
          edges: ['p1', 'p2'].map(id => ({ key: `Project:${id}`, ref: { entity: 'Project', id } })),
          start: { _tag: 'Terminal' },
          end: { _tag: 'Cursor', cursor: 'after-p2' },
        },
      },
    )
    // p3 is archived: cheaper now, and still not an active project.
    const cheaper = answered(partial, [patch('p3', { price: 15 })])
    expect(shown(cheaper, active.ref.identity)).toEqual({ ids: ['p1', 'p2'], stale: false })
  })

  it('places each change of one answer against the list the last one left', () => {
    const both = answered(loaded(), [
      patch('p1', { price: 50 }),
      patch('p3', { status: 'active', price: 1 }),
    ])
    expect(shown(both, active.ref.identity)).toEqual({ ids: ['p3', 'p2', 'p1'], stale: false })
  })
})

describe('A list the write may have changed', () => {
  it('is invalidated when the client cannot judge the row, for want of a field the body reads', () => {
    // `p9` arrives with its status and no price: the body orders by price, so
    // the store cannot say where, or even whether, it belongs.
    const partial = answered(loaded(), [patch('p9', { id: 'p9', status: 'active' })])
    expect(stale(partial, active.ref.identity)).toBe(true)
  })

  it('is invalidated, not placed, when a row it could place lacks a field it filters on', () => {
    // `p9` has the id the list orders by and a matching name, but no status:
    // whether it belongs is not the client's to say, so neither is where.
    const partial = answered(loaded(), [patch('p9', { id: 'p9', name: 'Apollo 9' })])
    expect(stale(partial, activeApollos.ref.identity)).toBe(true)
  })

  it('is invalidated when a row joins and the client cannot place it', () => {
    // Its order is the server's: where p3 goes is not the client's to say.
    const revived = answered(loaded(), [patch('p3', { status: 'active' })])
    expect(stale(revived, serverOrdered.ref.identity)).toBe(true)
  })

  it('is invalidated when a held row changed at all, if its body leaves the order to the server', () => {
    // Its order may be by price, or by anything: the body does not say.
    const repriced = answered(loaded(), [patch('p1', { price: 50 })])
    expect(stale(repriced, serverOrdered.ref.identity)).toBe(true)
    // A row it does not hold, still not matching, changes nothing it shows.
    const elsewhere = answered(loaded(), [patch('p3', { price: 50 })])
    expect(stale(elsewhere, serverOrdered.ref.identity)).toBe(false)
  })

  it('moves a row by the field its input chose to order by, and not by another', () => {
    const repriced = answered(loaded(), [patch('p1', { price: 50 })])
    expect(
      Data.visibleItems(repriced.remote, byPrice.ref.identity).map(edge => edge.ref.id),
    ).toEqual(['p2', 'p3', 'p1'])
    expect(stale(repriced, byPrice.ref.identity)).toBe(false)
    // Name is a field it could have chosen; this list did not, so it stays.
    const base = loaded()
    const renamed = answered(base, [patch('p1', { name: 'Apollo II' })])
    expect(renamed.remote.connections[byPrice.ref.identity]).toBe(
      base.remote.connections[byPrice.ref.identity],
    )
  })

  it('is invalidated when a row it would place is shown only by an overlay', () => {
    const optimistic = Data.overlay(loaded(), 'preview', [
      ConnectionChange.append(active.ref, Remote.ref(Project, 'p3')),
    ])
    const repriced = answered(optimistic, [patch('p3', { price: 1 })])
    expect(stale(repriced, active.ref.identity)).toBe(true)
  })

  it('is invalidated, for any change of its Entity, when its query declares no body', () => {
    const renamed = answered(loaded(), [patch('p1', { name: 'Apollo II' })])
    expect(stale(renamed, opaque.ref.identity)).toBe(true)
  })

  it('restarts a read of it already in flight, which could answer with the rows before the write', () => {
    const before = loaded()
    const archived = answered(before, [patch('p1', { status: 'archived' })])
    expect(archived.remote.refresh.generation).toBe(before.remote.refresh.generation + 1)
    // A write no list depends on restarts nothing: an owner the client holds,
    // and no list shows, renamed in a list loaded whole.
    const known = stored(before, [{ entity: 'Owner', id: 'o1', values: { name: 'Ada' } }])
    const owner = answered(known, [{ entity: 'Owner', id: 'o1', values: { name: 'Grace' } }])
    expect(owner.remote.refresh.generation).toBe(known.remote.refresh.generation)
  })
})

describe('A list the answer itself names', () => {
  it('is as the server says, so the change it confirms does not invalidate it', () => {
    // The server inserted `p3` into the active list and said so: that is the
    // list's new state, not a guess to be checked by fetching it.
    const confirmed = Data.reduce(loaded(), {
      _tag: 'MutationSucceeded',
      requestId: 'named',
      // Judged alone, a held row with a new price would invalidate the list.
      entities: [patch('p3', { status: 'active', price: 15 })],
      connections: [
        {
          _tag: 'Insert',
          connection: active.ref.identity,
          position: 'append',
          edge: { key: 'Project:p3', ref: { entity: 'Project', id: 'p3' } },
        },
      ],
      now: 1,
    })
    expect(stale(confirmed, active.ref.identity)).toBe(false)
    // Appended on the wire, and drawn where its price of 15 puts it.
    expect(
      Data.visibleItems(confirmed.remote, active.ref.identity).map(edge => edge.ref.id),
    ).toEqual(['p1', 'p3', 'p2'])
  })
})

describe('An answer that arrives twice', () => {
  it('invalidates once: the repeat changes nothing', () => {
    const first = answered(loaded(), [patch('p1', { status: 'archived' })], [], 'twice')
    // The list is fetched again and answers; the same answer then repeats.
    const fetched = Data.reduce(first, {
      _tag: 'ConnectionRefreshed',
      connection: active.ref.identity,
    })
    expect(stale(fetched, active.ref.identity)).toBe(false)
    const repeated = answered(fetched, [patch('p1', { status: 'archived' })], [], 'twice')
    expect(stale(repeated, active.ref.identity)).toBe(false)
  })
})
