/**
 * Filtering a loaded list without asking the server.
 *
 * local-execution-DESIGN phase 7. The payoff of everything before it: the
 * client holds rows, a body says which rows a query is about, and until now
 * nothing put the two together.
 *
 * **It filters a list; it does not run a query.** That is the distinction the
 * whole phase turns on. "Which rows match" would require knowing that this list
 * holds every row the body could match — predicate containment, which §21
 * deliberately refuses. "Which rows *of this list* match" is decidable from
 * what is already here, and is what a search box over a loaded page wants.
 *
 * So the answer is `Matched<Value>`, never a `Page`: a `Page` carries
 * `hasNext`/`hasPrevious`, which are facts the *server* stated about rows it
 * did not send. A local answer has none, and says instead whether it was about
 * the whole list.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity as DomainEntity, Expr, Order } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Query, Remote } from '../src/index.js'

const Project = DomainEntity.define(
  'Project',
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    status: Schema.String,
    ownerId: Schema.String,
  }),
)
const Summary = DomainEntity.select(Project, { id: true, name: true })

/** The list: everything of one owner. */
const ProjectsByOwner = Query.define('ProjectsByOwner', { ownerId: Schema.String }, ({ input }) =>
  Query.from(Project).pipe(
    Query.where(Expr.eq(Project.fields.ownerId, input.ownerId)),
    Query.orderBy(Order.asc(Project.fields.id)),
  ),
)

/** The filter: a narrowing of it, by a field the list already fetched. */
const Active = Query.define('Active', {}, () =>
  Query.from(Project).pipe(
    Query.where(Expr.eq(Project.fields.status, 'active')),
    Query.orderBy(Order.asc(Project.fields.id)),
  ),
)

/** A filter over a field the list's Selection does not read. */
const Named = Query.define('Named', { name: Schema.String }, ({ input }) =>
  Query.from(Project).pipe(
    Query.where(Expr.contains(Project.fields.name, input.name)),
    Query.orderBy(Order.asc(Project.fields.id)),
  ),
)

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({
  model: App.model.remote,
  entities: [Project],
  queries: [ProjectsByOwner, Active, Named],
})

const projects = Data.query(ProjectsByOwner, { ownerId: 'u1' }, { select: Summary, first: 25 })

const rows = [
  { id: 'p1', name: 'Apollo', status: 'active', ownerId: 'u1' },
  { id: 'p2', name: 'Borealis', status: 'archived', ownerId: 'u1' },
  { id: 'p3', name: 'Apollo II', status: 'active', ownerId: 'u1' },
]

/** A loaded list. `wholly` decides whether the connection knows it is all there. */
const loaded = (wholly = true, fields = ['id', 'name', 'status']): Model => {
  const merged = Data.reduce(
    { remote: Remote.initial },
    {
      _tag: 'ConnectionMerged',
      connection: projects.ref.identity,
      page: {
        edges: rows.map(r => ({ key: `Project:${r.id}`, ref: { entity: 'Project', id: r.id } })),
        start: { _tag: 'Terminal' },
        end: wholly ? { _tag: 'Terminal' } : { _tag: 'Cursor', cursor: 'c3' },
      },
    },
  )
  return Data.reduce(merged, {
    _tag: 'ReadReceived',
    requests: rows.map(r => ({ entity: 'Project', id: r.id, fields })),
    result: {
      entities: rows.map(r => ({
        entity: 'Project',
        id: r.id,
        values: Object.fromEntries(fields.map(f => [f, (r as Record<string, unknown>)[f]])),
      })),
    },
    now: 0,
  })
}

describe('A filter over rows already held', () => {
  it('answers from the Model, asking nothing', () => {
    const found = Data.filtered(loaded(), projects, Active, {})

    expect(found.items).toEqual([
      { id: 'p1', name: 'Apollo' },
      { id: 'p3', name: 'Apollo II' },
    ])
  })

  it('decodes each match exactly as the list decodes it', () => {
    // The Selection is the list's, so a filtered item and a listed item are the
    // same shape — a view can render either with one function.
    const page = projects.read(loaded())
    const found = Data.filtered(loaded(), projects, Active, {})

    expect(page._tag).toBe('Ready')
    if (page._tag === 'Ready') {
      expect(
        found.items.every(item => page.value.items.some(listed => listed.id === item.id)),
      ).toBe(true)
    }
  })

  it('keeps the body’s order, not the list’s', () => {
    const Reversed = Query.define('ReversedActive', {}, () =>
      Query.from(Project).pipe(
        Query.where(Expr.eq(Project.fields.status, 'active')),
        Query.orderBy(Order.desc(Project.fields.id)),
      ),
    )
    const Domain = Remote.make({
      model: App.model.remote,
      entities: [Project],
      queries: [ProjectsByOwner, Reversed],
    })
    const list = Domain.query(ProjectsByOwner, { ownerId: 'u1' }, { select: Summary, first: 25 })

    expect(Domain.filtered(loaded(), list, Reversed, {}).items.map(i => i.id)).toEqual(['p3', 'p1'])
  })

  it('filters on a field the list fetched but does not show', () => {
    // `status` is in the store because the read asked for it; the Selection
    // does not render it. A filter reads the store, not the Selection.
    expect(Data.filtered(loaded(), projects, Active, {}).items).toHaveLength(2)
  })
})

describe('Whether the answer is about the whole list', () => {
  it('is complete when every edge was judged and the list is all there', () => {
    expect(Data.filtered(loaded(), projects, Active, {}).complete).toBe(true)
  })

  it('is incomplete when the list has more pages the client never fetched', () => {
    // The rows here still match; what is unknown is the ones beyond the cursor.
    const found = Data.filtered(loaded(false), projects, Active, {})

    expect(found.items).toHaveLength(2)
    expect(found.complete).toBe(false)
  })

  it('is incomplete when a row could not be judged for want of a field', () => {
    // The list never fetched `name`, so `contains(name, …)` cannot be decided
    // about any row — and saying "no matches" would be a lie.
    const found = Data.filtered(loaded(true, ['id', 'status']), projects, Named, { name: 'Apollo' })

    expect(found.items).toEqual([])
    expect(found.complete).toBe(false)
  })

  it('is incomplete when a match cannot be shown for want of a selected field', () => {
    // Judgeable by `status`, but `name` is what the Selection renders and it is
    // not here. The row matched and is not in `items`, so the answer is partial.
    const found = Data.filtered(loaded(true, ['id', 'status']), projects, Active, {})

    expect(found.items).toEqual([])
    expect(found.complete).toBe(false)
  })

  it('is complete and empty when the list is whole and nothing matches', () => {
    const None = Query.define('NoneMatch', {}, () =>
      Query.from(Project).pipe(
        Query.where(Expr.eq(Project.fields.status, 'nonesuch')),
        Query.orderBy(Order.asc(Project.fields.id)),
      ),
    )
    const Domain = Remote.make({
      model: App.model.remote,
      entities: [Project],
      queries: [ProjectsByOwner, None],
    })
    const list = Domain.query(ProjectsByOwner, { ownerId: 'u1' }, { select: Summary, first: 25 })
    const found = Domain.filtered(loaded(), list, None, {})

    // Empty-and-complete and empty-and-partial are different answers, which is
    // the whole reason the flag exists.
    expect(found.items).toEqual([])
    expect(found.complete).toBe(true)
  })

  it('is incomplete when the list was never loaded at all', () => {
    const found = Data.filtered({ remote: Remote.initial }, projects, Active, {})

    expect(found.items).toEqual([])
    expect(found.complete).toBe(false)
  })
})

describe('What it does not do', () => {
  it('creates no connection, so there is nothing new to retain or fetch', () => {
    // The filter is a registered query with an identity of its own. Filtering
    // by it must not bring that connection into being — otherwise retention
    // would have a root nothing fetches and the planner a query nothing asked
    // for.
    const model = loaded()
    Data.filtered(model, projects, Active, {})

    expect(Object.keys(model.remote.connections)).toEqual([projects.ref.identity])
    expect(model.remote.connections[Active.ref({}).identity]).toBeUndefined()
    expect(Remote.planQueries(Data, model, projects)).toEqual([])
  })

  it('judges only the list, never every row of the Entity the store holds', () => {
    // A project of another owner is in the store and matches the filter. It is
    // not in this list, so it is not in the answer — "which rows of this list".
    const model = Data.reduce(loaded(), {
      _tag: 'ReadReceived',
      requests: [{ entity: 'Project', id: 'p9', fields: ['id', 'name', 'status'] }],
      result: {
        entities: [
          {
            entity: 'Project',
            id: 'p9',
            values: { id: 'p9', name: 'Elsewhere', status: 'active' },
          },
        ],
      },
      now: 0,
    })

    expect(Data.filtered(model, projects, Active, {}).items.map(i => i.id)).toEqual(['p1', 'p3'])
  })

  it('refuses a query the domain never registered', () => {
    const Stray = Query.define('Stray', {}, () =>
      Query.from(Project).pipe(Query.orderBy(Order.asc(Project.fields.id))),
    )

    expect(() => Data.filtered(loaded(), projects, Stray as unknown as typeof Active, {})).toThrow(
      'Query "Stray" is not registered',
    )
  })
})
