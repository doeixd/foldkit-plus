/**
 * data-query-DESIGN §21: what query-driven loading already does, and the one
 * thing it does not.
 *
 * §21 asks that the planner reason about a query's predicate, ordering,
 * Selection, window and the cache's current coverage. Four of those five are
 * how Remote already plans. The fifth — knowing that one predicate's rows are a
 * subset of a loaded connection's, so the narrower query need not be run — is
 * predicate containment, and it is not built.
 *
 * These tests pin that limit as behaviour rather than prose, so whoever builds
 * containment has a red test telling them what changes. They also settle the
 * question of *why* it is not built, which turned out not to be the reason the
 * plan assumed: the body is reachable from the planner. What is missing is the
 * reasoning, not the data.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity as DomainEntity, Expr, Order, Query as Relational } from 'foldkit-entity'
import type { AnyQuery } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Query, Remote, entityKey, readField } from '../src/index.js'

const Project = DomainEntity.define(
  'Project',
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    status: Schema.String,
    ownerId: Schema.String,
  }),
)
const ProjectSummary = DomainEntity.select(Project, { id: true, name: true })

/** The wider population: every active project. */
const ActiveProjects = Query.define('ActiveProjects', {}, () =>
  Relational.from(Project).pipe(
    Relational.where(Expr.eq(Project.fields.status, 'active')),
    Relational.orderBy(Order.asc(Project.fields.id)),
  ),
)

/** Strictly narrower: the same predicate, and one more. */
const ActiveProjectsOfOwner = Query.define(
  'ActiveProjectsOfOwner',
  { ownerId: Schema.String },
  ({ input }) =>
    Relational.from(Project).pipe(
      Relational.where(Expr.eq(Project.fields.status, 'active')),
      Relational.where(Expr.eq(Project.fields.ownerId, input.ownerId)),
      Relational.orderBy(Order.asc(Project.fields.id)),
    ),
)

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({
  model: App.model.remote,
  entities: [Project],
  queries: [ActiveProjects, ActiveProjectsOfOwner],
})

const wider = Data.query(ActiveProjects, {}, { select: ProjectSummary, first: 25 })
const narrower = Data.query(
  ActiveProjectsOfOwner,
  { ownerId: 'u1' },
  { select: ProjectSummary, first: 25 },
)

const rows = [
  { id: 'p1', name: 'Apollo', status: 'active', ownerId: 'u1' },
  { id: 'p2', name: 'Borealis', status: 'active', ownerId: 'u2' },
]

/** The wider connection loaded, with every selected field of every row. */
const loadedWider = (): Model => {
  const merged = Data.reduce(
    { remote: Remote.initial },
    {
      _tag: 'ConnectionMerged',
      connection: wider.ref.identity,
      page: {
        edges: rows.map(row => ({
          key: `Project:${row.id}`,
          ref: { entity: 'Project', id: row.id },
        })),
        start: { _tag: 'Terminal' },
        end: { _tag: 'Terminal' },
      },
    },
  )
  return Data.reduce(merged, {
    _tag: 'ReadReceived',
    requests: rows.map(row => ({
      entity: 'Project',
      id: row.id,
      fields: ['id', 'name', 'status', 'ownerId'],
    })),
    result: {
      settled: [],
      entities: rows.map(row => ({ entity: 'Project', id: row.id, values: row })),
    },
    now: 0,
  })
}

describe('What the planner already does with a loaded connection', () => {
  it('runs a connection it has never seen', () => {
    const queries = Remote.planQueries(Data, { remote: Remote.initial }, wider)

    expect(queries.map(ref => ref.query)).toEqual(['ActiveProjects'])
  })

  it('runs nothing for one it holds fresh, and asks for no fields either', () => {
    const model = loadedWider()

    expect(Remote.planQueries(Data, model, wider)).toEqual([])
    expect(Remote.plan(Data, model, wider)).toEqual([])
  })

  it('reads it as Ready, which is the point of holding it', () => {
    expect(wider.read(loadedWider())._tag).toBe('Ready')
  })
})

describe('What §21 asks for and this does not do', () => {
  it('runs the narrower query although every row it can return is already here', () => {
    // `status = active AND ownerId = u1` cannot match a row that
    // `status = active` does not, and the one row it matches is in the store
    // with all of its selected fields. The page is fetched anyway.
    const model = loadedWider()

    expect(readField(Remote.storeOf(Data, model), entityKey('Project', 'p1'), 'name')._tag).toBe(
      'Some',
    )
    expect(Remote.planQueries(Data, model, narrower).map(ref => ref.query)).toEqual([
      'ActiveProjectsOfOwner',
    ])
  })

  it('reads the narrower connection as Initial until that page comes back', () => {
    // Not a cache miss on the *rows* — those are here. A connection is an
    // ordered, paginated answer, and Remote has no answer for this one yet.
    expect(narrower.read(loadedWider())._tag).toBe('Initial')
  })

  it('treats the two as unrelated connections, because identity is by name and input', () => {
    // Which is what makes the exact-match case work and the subset case not:
    // identity answers "is this the same question", never "is this a narrower
    // one".
    expect(narrower.ref.identity).not.toBe(wider.ref.identity)
  })
})

describe('Why it is not built, which is not what it looked like', () => {
  it('reaches the body from a bound domain, wherever a plan is made', () => {
    // The plan assumed the body never reaches the client. It does: a bound
    // domain holds the registry, every planner entry point takes one, and
    // `explain` reaches a body through exactly that route without being handed
    // the descriptor. So §21 is not blocked on plumbing.
    const explained = Data.explain(loadedWider(), narrower)

    expect(explained.body).toContain('Project.ownerId = $ownerId')
    expect(Data.explain(loadedWider(), wider).body).toContain('Project.status = "active"')
  })

  it('makes the cheap containment check look right, which is the trap', () => {
    // Every predicate of the wider body appears in the narrower one, so a
    // subset test over the `where` lists would answer "contained" here — and
    // would be correct here.
    const shown = (body: AnyQuery) => body.where.map(predicate => Expr.show(predicate))
    const contained = shown(ActiveProjects.body!).every(one =>
      shown(ActiveProjectsOfOwner.body!).includes(one),
    )

    expect(contained).toBe(true)
    // It is one syntactic case of containment, not containment: sound only
    // because both bodies are conjunctions of equalities over one Entity and
    // the shared predicate holds no input. It says nothing about a `contains`
    // against an input, a null comparison, or two predicates that differ in
    // spelling and agree in meaning.
    expect(Relational.dependencies(ActiveProjects.body!)).toMatchObject({
      operations: ['eq'],
      inputs: [],
    })
  })

  it('leaves the rest of the answer unbuilt even where containment is settled', () => {
    // Knowing the rows are a subset does not give the connection. A connection
    // is an ordered, windowed answer with cursors at its ends, and deriving one
    // from another needs the order to agree and the window to be re-cut —
    // neither of which containment says anything about.
    expect(ActiveProjects.body!.orderBy).toEqual(ActiveProjectsOfOwner.body!.orderBy)
    expect(wider.ref.window).toEqual(narrower.ref.window)
    // Even with both agreeing, the narrower connection has no segments at all.
    expect(narrower.read(loadedWider())).toEqual({ _tag: 'Initial' })
  })
})
