/**
 * data-query-DESIGN §29.1: a read explains itself.
 *
 * The section sketched a DevTools panel and listed eight things it would show.
 * Building it is the honest way to find out what those eight actually are —
 * §11's *expectation* was deferred for want of a consumer, and this was the
 * likeliest consumer there was going to be.
 *
 * So the tests below are about two things. What `explain` gathers, which is
 * everything that already existed and had never been put in one place. And what
 * it turns out not to want: the Surface, the executor and the expectation each
 * fail to arrive for a different reason, and the reasons are the finding.
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
    ownerId: Schema.String,
    archivedAt: Schema.NullOr(Schema.String),
  }),
)
const ProjectSummary = DomainEntity.select(Project, { id: true, name: true })

const ProjectsByOwner = Query.define('ProjectsByOwner', { ownerId: Schema.String }, ({ input }) =>
  Query.from(Project).pipe(
    Query.where(Expr.eq(Project.fields.ownerId, input.ownerId)),
    Query.where(Expr.isNull(Project.fields.archivedAt)),
    Query.orderBy(Order.desc(Project.fields.name)),
  ),
)

/** The same result, declared rather than meant: the server knows what it is. */
const ProjectsAnswered = Query.make('ProjectsAnswered', {
  Input: { ownerId: Schema.String },
  Result: Query.connection(Project),
})

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({
  model: App.model.remote,
  entities: [Project],
  queries: [ProjectsByOwner, ProjectsAnswered],
})

const initial: Model = { remote: Remote.initial }
const projects = Data.query(
  ProjectsByOwner,
  { ownerId: 'u1' },
  { select: ProjectSummary, first: 25 },
)

/** One page of one project, loaded the way the subscription would load it. */
const loaded = (): Model => {
  const merged = Data.reduce(initial, {
    _tag: 'ConnectionMerged',
    connection: projects.ref.identity,
    page: {
      edges: [{ key: 'Project:p1', ref: { entity: 'Project', id: 'p1' } }],
      start: { _tag: 'Terminal' },
      end: { _tag: 'Terminal' },
    },
  })
  return Data.reduce(merged, {
    _tag: 'ReadReceived',
    requests: [{ entity: 'Project', id: 'p1', fields: ['id', 'name'] }],
    result: {
      settled: [],
      entities: [{ entity: 'Project', id: 'p1', values: { id: 'p1', name: 'Apollo' } }],
    },
    now: 0,
  })
}

describe('A query read, explained', () => {
  const explained = Data.explain(initial, projects)

  it('names the domain that answers it, the definition and the input it was given', () => {
    expect(explained.domain).toBe('remote')
    expect(explained.query).toBe('ProjectsByOwner')
    expect(explained.input).toEqual({ ownerId: 'u1' })
  })

  it('gives the connection identity the rest of the Model is keyed on', () => {
    // Not a second naming of the read: the same string a requirement, a
    // connection and a retention root use, so a panel showing it can be
    // matched against any of them.
    expect(explained.identity).toBe(ProjectsByOwner.ref({ ownerId: 'u1' }).identity)
  })

  it('separates the window from the identity, as the read itself does', () => {
    expect(explained.window).toEqual({ first: 25 })
    expect(explained.identity).not.toContain('25')
  })

  it('shows the Selection as the slice asked of the server', () => {
    expect(explained.select).toEqual({ entity: 'Project', fields: ['id', 'name'] })
  })

  it('shows the body as text, in the IR terms rather than any backend dialect', () => {
    expect(explained.body).toBe(
      [
        'FROM Project',
        'WHERE Project.ownerId = $ownerId',
        '  AND Project.archivedAt is null',
        'ORDER BY Project.name DESC',
      ].join('\n'),
    )
  })

  it('says what the body reads and which operations it needs', () => {
    expect(explained.dependencies).toEqual({
      fields: [
        { entity: 'Project', key: 'ownerId' },
        { entity: 'Project', key: 'archivedAt' },
        { entity: 'Project', key: 'name' },
      ],
      inputs: ['ownerId'],
      operations: ['eq', 'isNull'],
    })
  })

  it('is serializable, because a panel and a log line want the same value', () => {
    expect(JSON.parse(JSON.stringify(explained))).toEqual(explained)
  })
})

describe('What it currently is, which is the half that needs the Model', () => {
  it('reads Initial before anything is fetched', () => {
    expect(Data.explain(initial, projects).state).toBe('Initial')
  })

  it('reads Ready once the page and the selected fields are there', () => {
    const model = loaded()

    expect(Data.explain(model, projects).state).toBe('Ready')
    // The same answer the view gets, from the same read — an explanation that
    // computed the state its own way could disagree with what is on screen.
    expect(Data.explain(model, projects).state).toBe(projects.read(model)._tag)
  })

  it('reads Refreshing while the connection is being refetched', () => {
    const stale = Data.reduce(loaded(), {
      _tag: 'ConnectionInvalidated',
      connection: projects.ref.identity,
    })

    expect(Data.explain(stale, projects).state).toBe('Refreshing')
  })
})

describe('What an explanation cannot say, and why each one is absent', () => {
  const explained = () => Data.explain(initial, projects)

  it('has no body for a query whose meaning lives on the server', () => {
    // `Query.make` says a name, an input and a result shape. What rows it is
    // about is whatever the server registered to answer it, and inventing a
    // rendering of that would be a fiction rather than a gap.
    const answered = Data.explain(
      initial,
      Data.query(ProjectsAnswered, { ownerId: 'u1' }, { select: ProjectSummary, first: 25 }),
    )

    expect(answered.body).toBeUndefined()
    expect(answered.dependencies).toBeUndefined()
    // Everything that does not come from the body is there as usual.
    expect(answered.query).toBe('ProjectsAnswered')
    expect(answered.select).toEqual({ entity: 'Project', fields: ['id', 'name'] })
  })

  it('names no Surface, because a projection is read by however many read it', () => {
    expect(explained()).not.toHaveProperty('surface')
  })

  it('names no executor, because what answers a query is a Layer and not a value', () => {
    // The same purity that lets this be replayed from a recorded Model is what
    // keeps `RemoteClient` out of reach of it.
    expect(explained()).not.toHaveProperty('executor')
  })

  it('has no expectation, because nothing turned out to want one', () => {
    // §11 deferred required-versus-optional for want of a consumer. This was
    // it, and it does not need one: the result is a connection, so the shape is
    // a Page — decided by the definition, not by the read.
    expect(explained()).not.toHaveProperty('expectation')
    expect(Object.keys(explained()).sort()).toEqual([
      'body',
      'dependencies',
      'domain',
      'identity',
      'input',
      'query',
      'select',
      'state',
      'window',
    ])
  })
})
