/**
 * The edges of failure bookkeeping that a review found wrong, each pinned.
 *
 * Three left a read stuck: a related entity's failure that the read which
 * answered it did not settle, a stale list whose failure a refresh could not
 * reach, and a failure hidden because two relations reached one entity. Two
 * more read less honestly than they could: a list whose rows were being read
 * said `Initial`, and retention forgot a failure a parent still showed. The
 * last two tests cover paths nothing exercised.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity as DomainEntity, Order, Relation } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Query, Remote, entityKey, type RemoteError, type Requirement } from '../src/index.js'

const User = DomainEntity.define(
  'User',
  Schema.Struct({ id: Schema.String, name: Schema.String, email: Schema.String }),
)
const ProjectBase = DomainEntity.define(
  'Project',
  Schema.Struct({ id: Schema.String, name: Schema.String }),
)
const Blog = DomainEntity.relate(
  { User, Project: ProjectBase },
  { Project: { owner: Relation.one(User), reviewer: Relation.one(User) } },
)
const Project = Blog.Project

const All = Query.define('All', {}, () =>
  Query.from(Project).pipe(Query.orderBy(Order.asc(Project.fields.id))),
)

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({
  model: App.model.remote,
  entities: [Blog.Project, Blog.User],
  queries: [All],
})

const withOwner = Data.get(
  DomainEntity.select(Project, {
    name: true,
    owner: DomainEntity.select(Blog.User, { name: true }),
  }),
  'p1',
)
const both = Data.get(
  DomainEntity.select(Project, {
    name: true,
    owner: DomainEntity.select(Blog.User, { name: true }),
    reviewer: DomainEntity.select(Blog.User, { email: true }),
  }),
  'p1',
)
const list = Data.query(
  All,
  {},
  { select: DomainEntity.select(Project, { name: true }), first: 25 },
)

const initial: Model = { remote: Remote.initial }
const down: RemoteError = { _tag: 'RemoteReadError', message: 'down' }

const received = (
  model: Model,
  requests: ReadonlyArray<Requirement>,
  entities: ReadonlyArray<{
    readonly entity: string
    readonly id: string
    readonly values: Readonly<Record<string, unknown>>
  }>,
): Model => Data.reduce(model, { _tag: 'ReadReceived', requests, result: { entities }, now: 0 })

const failed = (model: Model, requests: ReadonlyArray<Requirement>): Model =>
  Data.reduce(model, { _tag: 'ReadFailed', requests, error: down })

/** `p1` held with its owner `u1` referred to but never read. */
const owned = () =>
  received(
    initial,
    [{ entity: 'Project', id: 'p1', fields: ['name', 'owner'] }],
    [{ entity: 'Project', id: 'p1', values: { name: 'One', owner: 'User:u1' } }],
  )

const ownerFailed = () => failed(owned(), [{ entity: 'User', id: 'u1', fields: ['name'] }])

describe('A related entity whose read failed', () => {
  it('is settled by a read that brings it back along a relation', () => {
    expect(withOwner.read(ownerFailed())._tag).toBe('Failed')
    const retried = Data.refresh(ownerFailed(), withOwner)

    // A refresh asks for the parent with the relation riding on it, so the
    // target comes back in a read that never named it.
    const answered = received(retried, Remote.plan(Data, retried, withOwner), [
      { entity: 'Project', id: 'p1', values: { name: 'One', owner: 'User:u1' } },
      { entity: 'User', id: 'u1', values: { name: 'Ann' } },
    ])

    expect(withOwner.read(answered)).toEqual({
      _tag: 'Ready',
      value: { name: 'One', owner: { name: 'Ann' } },
    })
  })

  it('fails the read when a second relation reaches the same entity for another field', () => {
    const shown = received(
      initial,
      [{ entity: 'Project', id: 'p1', fields: ['name', 'owner', 'reviewer'] }],
      [
        {
          entity: 'Project',
          id: 'p1',
          values: { name: 'One', owner: 'User:u1', reviewer: 'User:u1' },
        },
        { entity: 'User', id: 'u1', values: { name: 'Ann' } },
      ],
    )

    const emailFailed = failed(shown, [{ entity: 'User', id: 'u1', fields: ['email'] }])

    expect(both.read(emailFailed)).toEqual({ _tag: 'Failed', error: down })
  })

  it('keeps its failure through retention while the parent that shows it is kept', () => {
    const kept = Data.reduce(ownerFailed(), {
      _tag: 'RetentionChanged',
      roots: {
        requirements: [
          {
            entity: 'Project',
            id: 'p1',
            fields: ['name', 'owner'],
            relations: { owner: { entity: 'User', fields: ['name'] } },
          },
        ],
        connections: [],
      },
    })

    expect(withOwner.read(kept)._tag).toBe('Failed')
    expect(Remote.plan(Data, kept, withOwner)).toEqual([])
  })
})

describe('A stale list whose query failed', () => {
  it('is still retried by a refresh', () => {
    const offline = Data.reduce(initial, {
      _tag: 'QueryFailed',
      connection: list.ref.identity,
      error: down,
    })
    // A snapshot restored after the failure brings the list back stale.
    const restored = Data.reduce(offline, {
      _tag: 'Hydrated',
      connections: {
        [list.ref.identity]: [
          [{ key: entityKey('Project', 'p1'), ref: { entity: 'Project', id: 'p1' } }],
        ],
      },
      entities: {},
      merge: 'preserve-existing',
    })
    expect(restored.remote.connections[list.ref.identity]?.stale).toBe(true)

    const retried = Data.refresh(restored, list)

    expect(retried.remote.failures.connections).toEqual({})
    expect(Remote.planQueries(Data, retried, list)).toHaveLength(1)
  })
})

describe('A list whose page landed and whose rows are being read', () => {
  it('reads Loading, not Initial', () => {
    const merged = Data.reduce(
      Data.reduce(initial, { _tag: 'QueryStarted', connections: [list.ref.identity] }),
      {
        _tag: 'ConnectionMerged',
        connection: list.ref.identity,
        page: {
          edges: [{ key: entityKey('Project', 'p1'), ref: { entity: 'Project', id: 'p1' } }],
          start: { _tag: 'Terminal' },
          end: { _tag: 'Terminal' },
        },
        refreshes: true,
      },
    )
    expect(list.read(merged)._tag).toBe('Initial')

    const reading = Data.reduce(merged, {
      _tag: 'ReadStarted',
      requests: Remote.plan(Data, merged, list),
    })

    expect(list.read(reading)._tag).toBe('Loading')
  })
})

describe('Paths nothing else exercises', () => {
  it('a mutation that deletes an entity settles its failures', () => {
    const shown = received(
      initial,
      [{ entity: 'Project', id: 'p1', fields: ['name'] }],
      [{ entity: 'Project', id: 'p1', values: { name: 'One' } }],
    )
    const deleted = Data.reduce(
      failed(shown, [{ entity: 'Project', id: 'p1', fields: ['name'] }]),
      {
        _tag: 'MutationSucceeded',
        requestId: 'r1',
        entities: [],
        deleted: [{ entity: 'Project', id: 'p1' }],
      },
    )

    expect(deleted.remote.failures.fields).toEqual({})
  })

  it('a failed field leaves the plan with the relation that rode on it', () => {
    // `owner` failed before p1 arrived; `name` is still asked for, alone.
    const ownerRefFailed = failed(initial, [{ entity: 'Project', id: 'p1', fields: ['owner'] }])

    expect(Remote.plan(Data, ownerRefFailed, withOwner)).toEqual([
      { entity: 'Project', id: 'p1', fields: ['name'] },
    ])
  })
})
