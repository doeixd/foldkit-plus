/**
 * What an entity read shows after its read failed, and what asks again.
 *
 * The same stall as a failed query, one level down. `ReadFailed` put a field
 * back to `Initial` — "nobody asked" — and nothing asked again, because the
 * read entry's plan had not changed. A value on screen whose refresh failed
 * read `Ready`, as if the refresh had never been asked for.
 *
 * A failure is kept per field until the field is written again, a refresh
 * asks for it, or retention drops the entity. It is not retried on its own, for the
 * same reason as a query: a persistent error would be retried on every
 * unrelated restart of the entry. `Remote.refresh` retries it.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity as DomainEntity, Order, Relation } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Query, Remote, RemoteData, entityKey, type RemoteError } from '../src/index.js'

const User = DomainEntity.define('User', Schema.Struct({ id: Schema.String, name: Schema.String }))
const ProjectBase = DomainEntity.define(
  'Project',
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    status: Schema.String,
    ownerId: Schema.String,
  }),
)
const Blog = DomainEntity.relate(
  { User, Project: ProjectBase },
  { Project: { owner: Relation.one(User) } },
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

const named = Data.get(DomainEntity.select(Project, { name: true }), 'p1')
const status = Data.get(DomainEntity.select(Project, { status: true }), 'p1')
const withOwner = Data.get(
  DomainEntity.select(Project, {
    name: true,
    owner: DomainEntity.select(Blog.User, { name: true }),
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
const nameOf = (id: string) => ({ entity: 'Project', id, fields: ['name'] })

const failedRead = (model: Model, requests = [nameOf('p1')]): Model =>
  Data.reduce(model, { _tag: 'ReadFailed', requests, error: down })

const received = (
  model: Model,
  entity: string,
  id: string,
  values: Readonly<Record<string, unknown>>,
): Model =>
  Data.reduce(model, {
    _tag: 'ReadReceived',
    requests: [{ entity, id, fields: Object.keys(values) }],
    result: { entities: [{ entity, id, values }] },
    now: 0,
  })

/** `p1` with its name held: `named` reads `Ready`. */
const held = () => received(initial, 'Project', 'p1', { name: 'One' })

/** The list holding `p1` and `p2`, both names held. */
const listed = () =>
  received(
    received(
      Data.reduce(initial, {
        _tag: 'ConnectionMerged',
        connection: list.ref.identity,
        page: {
          edges: ['p1', 'p2'].map(id => ({
            key: entityKey('Project', id),
            ref: { entity: 'Project', id },
          })),
          start: { _tag: 'Terminal' },
          end: { _tag: 'Terminal' },
        },
        refreshes: true,
      }),
      'Project',
      'p1',
      { name: 'One' },
    ),
    'Project',
    'p2',
    { name: 'Two' },
  )

describe('A read that failed before the value arrived', () => {
  it('reads Failed with the error, not Initial', () => {
    expect(named.read(initial)._tag).toBe('Initial')
    expect(named.read(failedRead(initial))).toEqual({ _tag: 'Failed', error: down })
  })

  it('is not asked for again on its own', () => {
    expect(Remote.plan(Data, initial, named)).toEqual([nameOf('p1')])
    expect(Remote.plan(Data, failedRead(initial), named)).toEqual([])
  })

  it('leaves the entity’s other fields to be asked for', () => {
    const model = failedRead(initial)

    expect(status.read(model)._tag).toBe('Initial')
    expect(Remote.plan(Data, model, status)).toEqual([
      { entity: 'Project', id: 'p1', fields: ['status'] },
    ])
  })

  it('reads Loading, not the failure, while a read of it is in flight', () => {
    const started = Data.reduce(failedRead(initial), {
      _tag: 'ReadStarted',
      requests: [nameOf('p1')],
    })

    expect(named.read(started)._tag).toBe('Loading')
  })

  it('shows in the inspection a DevTools panel reads', () => {
    expect(Object.values(Remote.inspect(failedRead(initial).remote).failures.fields)).toEqual([
      down,
    ])
  })
})

describe('A refresh that failed with the value on screen', () => {
  it('reads Failed with the value it had as previous', () => {
    expect(named.read(failedRead(held()))).toEqual({
      _tag: 'Failed',
      error: down,
      previous: { name: 'One' },
    })
  })

  it('renders as the value, marked stale with the error', () => {
    const shown = RemoteData.render(named.read(failedRead(held())), {
      loading: () => 'loading',
      notFound: () => 'not found',
      failed: () => 'failed',
      data: (value, freshness) =>
        `${value.name} ${freshness._tag} ${freshness._tag === 'Stale' ? freshness.error.message : ''}`,
    })

    expect(shown).toBe('One Stale down')
  })
})

describe('A failure reached through a relation or a list', () => {
  it('a related entity’s failed field fails the read that reaches it', () => {
    const owned = received(initial, 'Project', 'p1', { name: 'One', owner: 'User:u1' })
    expect(withOwner.read(owned)._tag).toBe('Initial')

    const failed = failedRead(owned, [{ entity: 'User', id: 'u1', fields: ['name'] }])

    expect(withOwner.read(failed)).toEqual({ _tag: 'Failed', error: down })
    expect(Remote.plan(Data, failed, withOwner)).toEqual([])
  })

  it('a row that never arrived fails the list, rather than leaving it waiting', () => {
    const missing = received(
      Data.reduce(initial, {
        _tag: 'ConnectionMerged',
        connection: list.ref.identity,
        page: {
          edges: [{ key: entityKey('Project', 'p1'), ref: { entity: 'Project', id: 'p1' } }],
          start: { _tag: 'Terminal' },
          end: { _tag: 'Terminal' },
        },
        refreshes: true,
      }),
      'User',
      'u0',
      { name: 'unrelated' },
    )
    expect(list.read(missing)._tag).toBe('Initial')

    expect(list.read(failedRead(missing))).toEqual({ _tag: 'Failed', error: down })
  })

  it('a row whose refresh failed fails the list, keeping every row', () => {
    const before = list.read(listed())
    expect(before._tag).toBe('Ready')

    expect(list.read(failedRead(listed(), [nameOf('p2')]))).toEqual({
      _tag: 'Failed',
      error: down,
      previous: (before as { readonly value: unknown }).value,
    })
  })
})

describe('What settles a failed field', () => {
  it('the field arriving', () => {
    const recovered = received(failedRead(initial), 'Project', 'p1', { name: 'One' })

    expect(named.read(recovered)).toEqual({ _tag: 'Ready', value: { name: 'One' } })
    expect(recovered.remote.failures.fields).toEqual({})
  })

  it('Remote.refresh, which asks again even for a value that never arrived', () => {
    const retried = Data.refresh(failedRead(initial), named)

    expect(retried.remote.failures.fields).toEqual({})
    expect(Remote.plan(Data, retried, named)).toEqual([nameOf('p1')])
  })

  it('a live patch carrying the field', () => {
    const patched = Data.reduce(failedRead(initial), {
      _tag: 'LiveReceived',
      stream: 's',
      event: {
        _tag: 'EntityPatched',
        ref: { entity: 'Project', id: 'p1' },
        values: { name: 'One' },
        changed: ['name'],
        cursor: 1,
      },
      now: 0,
    })

    expect(named.read(patched)).toEqual({ _tag: 'Ready', value: { name: 'One' } })
  })

  it('but not a live patch carrying another field', () => {
    const patched = Data.reduce(failedRead(initial), {
      _tag: 'LiveReceived',
      stream: 's',
      event: {
        _tag: 'EntityPatched',
        ref: { entity: 'Project', id: 'p1' },
        values: { status: 'active' },
        changed: ['status'],
        cursor: 1,
      },
      now: 0,
    })

    expect(named.read(patched)).toEqual({ _tag: 'Failed', error: down })
  })

  it('a live delete, which answers NotFound', () => {
    const deleted = Data.reduce(failedRead(held()), {
      _tag: 'LiveReceived',
      stream: 's',
      event: { _tag: 'EntityDeleted', ref: { entity: 'Project', id: 'p1' }, cursor: 1 },
      now: 0,
    })

    expect(named.read(deleted)._tag).toBe('NotFound')
    expect(deleted.remote.failures.fields).toEqual({})
  })

  it('a mutation writing the field', () => {
    const written = Data.reduce(failedRead(initial), {
      _tag: 'MutationSucceeded',
      requestId: 'r1',
      entities: [{ entity: 'Project', id: 'p1', values: { name: 'One' } }],
    })

    expect(named.read(written)).toEqual({ _tag: 'Ready', value: { name: 'One' } })
  })

  it('retention dropping the entity, so asking for it later asks the server', () => {
    const released = Data.reduce(failedRead(initial), {
      _tag: 'RetentionChanged',
      roots: { requirements: [], connections: [] },
    })

    expect(released.remote.failures.fields).toEqual({})
    expect(Remote.plan(Data, released, named)).toEqual([nameOf('p1')])
  })

  it('but not retention that still asks for it by id', () => {
    const kept = Data.reduce(failedRead(initial), {
      _tag: 'RetentionChanged',
      roots: { requirements: [nameOf('p1')], connections: [] },
    })

    expect(named.read(kept)).toEqual({ _tag: 'Failed', error: down })
  })
})
