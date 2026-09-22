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
import { Query, Remote, type Matched } from '../src/index.js'

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
    // same value — a view renders either with one function. Compared whole
    // rather than by id, or a decode that dropped or reshaped fields would pass.
    const page = projects.read(loaded())
    if (page._tag !== 'Ready') throw new Error(`expected Ready, got ${page._tag}`)
    const found = Data.filtered(loaded(), projects, Active, {})

    expect(found.items).toEqual(page.value.items.filter(item => item.id !== 'p2'))
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
    // does not render it. Two rows differ *only* in that field, so an
    // implementation reading the Selection rather than the store cannot tell
    // them apart and fails here.
    expect(Data.filtered(loaded(), projects, Active, {}).items.map(item => item.id)).toEqual([
      'p1',
      'p3',
    ])
    expect(Object.keys(Data.filtered(loaded(), projects, Active, {}).items[0]!)).toEqual([
      'id',
      'name',
    ])
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

describe('Gaps, which the outer boundaries do not show', () => {
  it('is incomplete when the list was paged from both ends and has a hole', () => {
    // A connection paged from both ends is `Terminal` at both — `hasNext` and
    // `hasPrevious` are false — and is still missing its middle. Only
    // `isGapped` sees that, and a filter that ignored it would report a partial
    // answer as whole.
    const head = Data.reduce(
      { remote: Remote.initial },
      {
        _tag: 'ConnectionMerged',
        connection: projects.ref.identity,
        page: {
          edges: [{ key: 'Project:p1', ref: { entity: 'Project', id: 'p1' } }],
          start: { _tag: 'Terminal' },
          end: { _tag: 'Cursor', cursor: 'c1' },
        },
      },
    )
    const bothEnds = Data.reduce(head, {
      _tag: 'ConnectionMerged',
      connection: projects.ref.identity,
      page: {
        edges: [{ key: 'Project:p3', ref: { entity: 'Project', id: 'p3' } }],
        start: { _tag: 'Cursor', cursor: 'c9' },
        end: { _tag: 'Terminal' },
      },
    })
    const model = Data.reduce(bothEnds, {
      _tag: 'ReadReceived',
      requests: rows.map(r => ({ entity: 'Project', id: r.id, fields: ['id', 'name', 'status'] })),
      result: { entities: rows.map(r => ({ entity: 'Project', id: r.id, values: r })) },
      now: 0,
    })

    const connection = model.remote.connections[projects.ref.identity]!
    expect(connection.segments.length).toBe(2)

    const found = Data.filtered(model, projects, Active, {})

    expect(found.items.map(item => item.id)).toEqual(['p1', 'p3'])
    expect(found.complete).toBe(false)
  })
})

describe('What it does not do', () => {
  it('returns an answer rather than a Model, so nothing can be created', () => {
    // The original of this test asserted that the *input* model was unchanged,
    // which a function returning `Matched` cannot change however broken it is.
    // What is actually worth pinning is the signature: there is no Model in the
    // result, so no connection, retention root or plan can come out of it.
    const found: Matched<{ readonly id: string; readonly name: string }> = Data.filtered(
      loaded(),
      projects,
      Active,
      {},
    )

    expect(Object.keys(found).sort()).toEqual(['complete', 'items'])
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

  it('refuses a filter over a different Entity, rather than finding nothing', () => {
    // Every candidate is of the wrong Entity, so an unguarded implementation
    // matches none of them and reports `complete: true` — "I checked the whole
    // list and found nothing", about a question that was never applicable.
    const Other = DomainEntity.define('Other', Schema.Struct({ id: Schema.String }))
    const OtherQuery = Query.define('OtherQuery', {}, () =>
      Query.from(Other).pipe(Query.orderBy(Order.asc(Other.fields.id))),
    )
    const Domain = Remote.make({
      model: App.model.remote,
      entities: [Project, Other],
      queries: [ProjectsByOwner, OtherQuery],
    })
    const list = Domain.query(ProjectsByOwner, { ownerId: 'u1' }, { select: Summary, first: 25 })

    expect(() => Domain.filtered(loaded(), list, OtherQuery, {})).toThrow(
      'query "OtherQuery" is over "Other", but the list is of "Project"',
    )
  })

  it('counts an edge whose row is absent as unjudged, not as no match', () => {
    // An optimistic insert can put an edge in a connection with no entity entry
    // behind it. Dropping it silently would let `complete` claim the whole list
    // was considered when one of its rows never was.
    const withGhost = Data.overlay(loaded(), 'pending', [
      {
        _tag: 'Insert',
        connection: projects.ref.identity,
        edge: { key: 'Project:p9', ref: { entity: 'Project', id: 'p9' } },
        position: 'prepend',
      },
    ])
    const found = Data.filtered(withGhost, projects, Active, {})

    expect(found.items.map(item => item.id)).toEqual(['p1', 'p3'])
    expect(found.complete).toBe(false)
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
