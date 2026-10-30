/**
 * A list ages under `staleWhileRevalidate` as a row does (#234): drawn from
 * the store while it is younger than `maxAge`, asked for again whole once it
 * is older, reading `Refreshing` with its rows meanwhile. A list left keeps
 * its age when every call reading it ages it, so going back inside the window
 * sends nothing; under `cacheFirst` a list left is held stale, as before.
 */
import { Effect, Fiber, Option, Schema, Stream } from 'effect'
import { TestClock } from 'effect/testing'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type * as Update from 'foldkit/update'
import { Entity as DomainEntity, Expr, Order } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import {
  Query,
  Remote,
  RemoteClient,
  RemotePolicy,
  isRemoteMessage,
  updateRemote,
  type RemoteMessage,
} from '../src/index.js'
import { Respond, Trace } from '../src/testing.js'

const Project = DomainEntity.define(
  'Project',
  Schema.Struct({ id: Schema.String, name: Schema.String, ownerId: Schema.String }),
)
const Summary = DomainEntity.select(Project, { id: true, name: true })

const ByOwner = Query.define('ByOwner', { ownerId: Schema.String }, ({ input }) =>
  Query.from(Project).pipe(
    Query.where(Expr.eq(Project.fields.ownerId, input.ownerId)),
    Query.orderBy(Order.asc(Project.fields.id)),
  ),
)

const Model = Schema.Struct({ remote: Remote.Model, owners: Schema.Array(Schema.String) })
type Model = typeof Model.Type
const own = { Showed: { owners: Schema.Array(Schema.String) } }
const Message = defineMessageUnion({ ...Remote.messages, ...own })
type Message = typeof Message.Type
const App = Surface.application({ Model, Message })

/**
 * A domain of its own per use: a domain remembers every call's readers and
 * whether each ages them, so calls under other policies would leak between tests.
 */
const domain = () =>
  Remote.make({
    model: App.model.remote,
    entities: [Project],
    queries: [ByOwner],
    verifyPredictions: true,
  })
const Data = domain()

const projects = Data.query(ByOwner, { ownerId: 'u1' }, { select: Summary, first: 25 })
const identity = projects.ref.identity
const start: Model = { remote: Remote.initial, owners: ['u1'] }

const terminal = { _tag: 'Terminal' } as const
/** What a page selects of each row: the Summary, and what the body reads to place one. */
const fields = ['id', 'name', 'ownerId']
const valuesOf = (id: string) => ({ id, name: `Project ${id}`, ownerId: 'u1' })
const edge = (id: string) => ({ key: `Project:${id}`, ref: { entity: 'Project', id } })

/** The list's page answering it whole at `now`, its rows' fields riding on it. */
const page = (ids: ReadonlyArray<string>, now: number): RemoteMessage => ({
  _tag: 'ConnectionMerged',
  connection: identity,
  page: { edges: ids.map(edge), start: terminal, end: terminal },
  refreshes: true,
  select: { entity: 'Project', fields },
  entities: ids.map(id => ({ entity: 'Project', id, values: valuesOf(id) })),
  now,
})

const loadedAt = (now: number): Model => Data.reduce(start, page(['p1', 'p2'], now))

const Shown = App.surface('Shown', { model: () => ({ projects }) })
const ageing = RemotePolicy.staleWhileRevalidate({ maxAge: 1_000 })

/** The read entry of a call under `policy`, reading the clock `at` gives. */
const readEntry = (policy: RemotePolicy, at: () => number) =>
  domain().subscriptions({ page: Shown }, { policy, now: at })['page.read']

const rows = ['p1', 'p2'].map(id => ({ entity: 'Project', id, fields }))

const server: RemoteClient['Service'] = {
  read: () => Effect.die('every row arrives with its page'),
  query: () =>
    Effect.succeed({
      edges: ['p1', 'p2'].map(id => ({ entity: 'Project', id, key: `Project:${id}` })),
      start: terminal,
      end: terminal,
      entities: ['p1', 'p2'].map(id => ({ entity: 'Project', id, values: valuesOf(id) })),
    }),
  mutate: () => Effect.die('unused'),
  live: () => Stream.empty,
}

describe('A list under staleWhileRevalidate', () => {
  it('is drawn from the store inside its window, waiting on the moment it ages out', () => {
    const deps = readEntry(ageing, () => 999).modelToDependencies(loadedAt(0))
    expect(deps.queries).toEqual([])
    expect(deps.refreshing).toEqual([])
    expect(deps.expires).toEqual({ at: 1_000, due: rows, connections: [identity] })
  })

  it('is still drawn at the very moment it ages out, and waited on', () => {
    const deps = readEntry(ageing, () => 1_000).modelToDependencies(loadedAt(0))
    expect(deps.queries).toEqual([])
    expect(deps.expires).toMatchObject({ at: 1_000, connections: [identity] })
  })

  it('is waited on alone when its rows were read since, and age later', () => {
    const reread = Data.reduce(loadedAt(0), {
      _tag: 'ReadReceived',
      requests: rows,
      result: {
        settled: [],
        entities: ['p1', 'p2'].map(id => ({ entity: 'Project', id, values: valuesOf(id) })),
      },
      now: 500,
    })
    const deps = readEntry(ageing, () => 999).modelToDependencies(reread)
    expect(deps.expires).toEqual({ at: 1_000, due: [], connections: [identity] })
  })

  it('is asked for again whole once older than maxAge, and named as refreshing', () => {
    const deps = readEntry(ageing, () => 1_001).modelToDependencies(loadedAt(0))
    expect(deps.queries.map(query => query.identity)).toEqual([identity])
    expect(deps.refreshing).toEqual([identity])
  })

  it('reads Refreshing with its rows while it is, and the page answering it replaces them', async () => {
    const entry = readEntry(ageing, () => 1_001)
    const deps = entry.modelToDependencies(loadedAt(0))
    const messages = await Effect.runPromise(
      Stream.runCollect(Stream.take(entry.dependenciesToStream(deps), 2)).pipe(
        Effect.provideService(RemoteClient, server),
      ),
    )
    expect(messages).toEqual([
      { _tag: 'RefreshStarted', requests: [], connections: [identity] },
      { _tag: 'QueryStarted', connections: [identity] },
    ])

    const refreshing = messages.reduce(Data.reduce, loadedAt(0))
    expect(projects.read(refreshing)).toMatchObject({
      _tag: 'Refreshing',
      value: { items: [{ id: 'p1' }, { id: 'p2' }] },
    })
    // Marking it stale does not change the plan, so the entry is not restarted.
    expect(entry.modelToDependencies(refreshing)).toEqual(deps)

    const answered = Data.reduce(refreshing, page(['p2'], 1_001))
    expect(projects.read(answered)).toMatchObject({
      _tag: 'Ready',
      value: { items: [{ id: 'p2' }] },
    })
    expect(answered.remote.connections[identity]?.receivedAt).toBe(1_001)
  })

  it('is marked stale when the clock reaches its age, and nothing before', async () => {
    const entry = readEntry(ageing, () => 0)
    const collected: RemoteMessage[] = []
    await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(
          Stream.runForEach(
            entry.dependenciesToStream(entry.modelToDependencies(loadedAt(0))),
            message => Effect.sync(() => void collected.push(message)),
          ).pipe(Effect.provideService(RemoteClient, server)),
        )
        yield* TestClock.adjust(999)
        expect(collected).toEqual([])
        yield* TestClock.adjust(1)
        yield* Fiber.join(fiber)
      }).pipe(Effect.provide(TestClock.layer())),
    )
    expect(collected).toEqual([{ _tag: 'RefreshStarted', requests: rows, connections: [identity] }])
    expect(projects.read(collected.reduce(Data.reduce, loadedAt(0)))._tag).toBe('Refreshing')
  })

  it('is not dated by a later page, whose rows before it are as old as they were', () => {
    const more = Data.reduce(loadedAt(0), {
      _tag: 'ConnectionMerged',
      connection: identity,
      page: { edges: [edge('p3')], start: { _tag: 'Cursor', cursor: 'p2' }, end: terminal },
      refreshes: true,
      now: 900,
    })
    expect(more.remote.connections[identity]?.receivedAt).toBe(0)
  })

  it('sets no clock while its query failed, since nothing asks it again on its own', () => {
    const failed = Data.reduce(loadedAt(0), {
      _tag: 'QueryFailed',
      connection: identity,
      error: { _tag: 'RemoteQueryError', message: 'down' },
    })
    expect(readEntry(ageing, () => 500).modelToDependencies(failed).expires).toMatchObject({
      connections: [],
    })
    expect(readEntry(ageing, () => 5_000).modelToDependencies(failed).queries).toEqual([])
  })
})

describe('A list under cacheFirst', () => {
  it('is never asked for again by its age', () => {
    const deps = readEntry(RemotePolicy.cacheFirst, () => 1e9).modelToDependencies(loadedAt(0))
    expect(deps.queries).toEqual([])
    expect(deps.expires).toBeNull()
  })
})

describe('A list under networkOnly', () => {
  it('reads Refreshing while every plan asks for it again', () => {
    const deps = readEntry(RemotePolicy.networkOnly, () => 0).modelToDependencies(loadedAt(0))
    expect(deps.refreshing).toEqual([identity])
    const marked = Data.reduce(loadedAt(0), {
      _tag: 'RefreshStarted',
      requests: [],
      connections: deps.refreshing,
    })
    expect(projects.read(marked)._tag).toBe('Refreshing')
  })
})

describe('RefreshStarted naming a list', () => {
  it('changes nothing for a list the Model does not hold', () => {
    const model = loadedAt(0)
    const other = Data.query(ByOwner, { ownerId: 'u2' }, { select: Summary, first: 25 })
    expect(
      updateRemote(model.remote, {
        _tag: 'RefreshStarted',
        requests: [],
        connections: [other.ref.identity],
      }),
    ).toBe(model.remote)
  })
})

const Own = defineMessageUnion(own)
const update = (model: Model, message: Message): Update.Return<Model, Message> => {
  if (isRemoteMessage(message)) return { model: Data.reduce(model, message) }
  return Own.match(message, {
    Showed: ({ owners }) => ({ model: modifyFields(model, { owners: () => owners }) }),
  })
}

const active = {
  owner: Data.active('u1', (model: Model) =>
    model.owners.includes('u1') ? Option.some(projects) : Option.none(),
  ),
}

/** The list loaded and shown, its Surface left, then gone back to, under `policy`. */
const back = (policy: RemotePolicy) =>
  Trace.run(domain(), {
    start,
    update,
    active,
    options: { policy },
    client: server,
    steps: [Respond.all, Message.Showed({ owners: [] }), Message.Showed({ owners: ['u1'] })],
  })

describe('A list left and gone back to', () => {
  it('inside its window is drawn from the store, with no query', async () => {
    const trace = await back(ageing)

    expect(Trace.tags(trace, projects)).toEqual(['Initial', 'Loading', 'Ready'])
    expect(trace.pending).toEqual([])
  })

  it('under cacheFirst is held stale, so going back refetches it', async () => {
    const trace = await back(RemotePolicy.cacheFirst)

    expect(Trace.tags(trace, projects)).toEqual(['Initial', 'Loading', 'Ready', 'Refreshing'])
    expect(trace.pending).toEqual(['query ByOwner {"ownerId":"u1"}'])
  })
})

describe("A list's retention root", () => {
  const roots = (calls: ReadonlyArray<RemotePolicy>) => {
    const Domain = domain()
    const entries = calls.map(policy => Domain.subscriptions(active, { policy }))
    return entries[0]!.retain.modelToDependencies(start).connections
  }

  it('ages when every call reading it ages it', () => {
    expect(roots([ageing])).toMatchObject([{ identity, ages: true }])
  })

  it('does not when one call reading it does not', () => {
    expect(roots([ageing, RemotePolicy.cacheFirst])[0]).not.toHaveProperty('ages')
    expect(roots([RemotePolicy.cacheFirst, ageing])[0]).not.toHaveProperty('ages')
  })
})
