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
import { Query, Remote, type NormalizedPatch } from '../src/index.js'

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
  queries: [ByStatus, Named, Opaque, Owners, ServerOrdered, Sorted],
})

const active = Data.query(ByStatus, { status: 'active' }, { select: Summary, first: 25 })
const named = Data.query(Named, { name: 'Apo' }, { select: Summary, first: 25 })
const opaque = Data.query(Opaque, {}, { select: Summary, first: 25 })
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
  return Data.reduce(withByPrice, {
    _tag: 'ConnectionMerged',
    connection: owners.ref.identity,
    page: { edges: [], start: { _tag: 'Terminal' }, end: { _tag: 'Terminal' } },
  })
}

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
    const renamed = answered(loaded(), [patch('p1', { name: 'Apollo II' })])
    expect(stale(renamed, active.ref.identity)).toBe(false)
  })

  it('is kept when a held row changed a filtered field and still matches', () => {
    const renamed = answered(loaded(), [patch('p1', { name: 'Apollo II' })])
    expect(stale(renamed, named.ref.identity)).toBe(false)
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
  })

  it('is kept when the write was to another Entity', () => {
    const elsewhere = answered(loaded(), [patch('p1', { status: 'archived' })])
    expect(stale(elsewhere, owners.ref.identity)).toBe(false)
  })

  it('is kept on a deletion, which its tombstone already removes', () => {
    const removed = answered(loaded(), [], [{ entity: 'Project', id: 'p1' }])
    expect(stale(removed, active.ref.identity)).toBe(false)
    expect(
      Remote.visibleItems(removed.remote, active.ref.identity).map(edge => edge.ref.id),
    ).toEqual(['p2'])
  })
})

describe('A list the write may have changed', () => {
  it('is invalidated when a held row stops matching, by any filter', () => {
    const renamed = answered(loaded(), [patch('p1', { name: 'Voyager' })])
    expect(stale(renamed, named.ref.identity)).toBe(true)
  })

  it('is invalidated when a held row stops matching', () => {
    const archived = answered(loaded(), [patch('p1', { status: 'archived' })])
    expect(stale(archived, active.ref.identity)).toBe(true)
    // And the read entry plans it again: invalidating is how it is fetched.
    expect(Remote.planQueries(Data, archived, active).map(ref => ref.identity)).toEqual([
      active.ref.identity,
    ])
    expect(Remote.planQueries(Data, loaded(), active)).toEqual([])
  })

  it('is invalidated when a row it does not hold starts matching, since where it goes is the server’s', () => {
    const revived = answered(loaded(), [patch('p3', { status: 'active' })])
    expect(stale(revived, active.ref.identity)).toBe(true)
  })

  it('is invalidated when a held row changed a field it is ordered by', () => {
    const repriced = answered(loaded(), [patch('p1', { price: 50 })])
    expect(stale(repriced, active.ref.identity)).toBe(true)
  })

  it('is invalidated when the client cannot judge the row, for want of a field the body reads', () => {
    // `p9` arrives with its status and no price: the body orders by price, so
    // the store cannot say where, or even whether, it belongs.
    const partial = answered(loaded(), [patch('p9', { id: 'p9', status: 'active' })])
    expect(stale(partial, active.ref.identity)).toBe(true)
  })

  it('is invalidated when a held row changed at all, if its body leaves the order to the server', () => {
    // Its order may be by price, or by anything: the body does not say.
    const repriced = answered(loaded(), [patch('p1', { price: 50 })])
    expect(stale(repriced, serverOrdered.ref.identity)).toBe(true)
    // A row it does not hold, still not matching, changes nothing it shows.
    const elsewhere = answered(loaded(), [patch('p3', { price: 50 })])
    expect(stale(elsewhere, serverOrdered.ref.identity)).toBe(false)
  })

  it('is invalidated by a change to the field its input chose to order by, and only that one', () => {
    const repriced = answered(loaded(), [patch('p1', { price: 50 })])
    expect(stale(repriced, byPrice.ref.identity)).toBe(true)
    // Name is a field it could have chosen; this list did not.
    const renamed = answered(loaded(), [patch('p1', { name: 'Apollo II' })])
    expect(stale(renamed, byPrice.ref.identity)).toBe(false)
  })

  it('is invalidated, for any change of its Entity, when its query declares no body', () => {
    const renamed = answered(loaded(), [patch('p1', { name: 'Apollo II' })])
    expect(stale(renamed, opaque.ref.identity)).toBe(true)
  })

  it('restarts a read of it already in flight, which could answer with the rows before the write', () => {
    const before = loaded()
    const archived = answered(before, [patch('p1', { status: 'archived' })])
    expect(archived.remote.refresh.generation).toBe(before.remote.refresh.generation + 1)
    // A write no list depends on restarts nothing.
    const owner = answered(before, [{ entity: 'Owner', id: 'o1', values: { name: 'Ada' } }])
    expect(owner.remote.refresh.generation).toBe(before.remote.refresh.generation)
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
    expect(
      Remote.visibleItems(confirmed.remote, active.ref.identity).map(edge => edge.ref.id),
    ).toEqual(['p1', 'p2', 'p3'])
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
