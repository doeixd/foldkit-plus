import { Effect, Fiber, Layer, Schema, Stream } from 'effect'
import { TestClock } from 'effect/testing'
import { defineMessageUnion } from 'foldkit/message'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import {
  Entity,
  Remote,
  RemoteClient,
  RemotePolicy,
  deadlineOf,
  emptyStore,
  entityKey,
  markStale,
  tombstone,
  writeEntity,
  type RemoteMessage,
} from '../src/index.js'

const User = Entity.make('User', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Project = Entity.make(
  'Project',
  Schema.Struct({ id: Schema.String, name: Schema.String, owner: Entity.ref(User) }),
)

const Model = Schema.Struct({ route: Schema.String, remote: Remote.Model })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Remote.messages, Ping: {} })
const App = Surface.application({ Model, Message })
const Data = Remote.make({ model: App.model.remote, entities: [User, Project] })
const initial: Model = { route: '/', remote: Remote.initial }

const project = Data.get(Project.select({ name: true }), 'p1')
const Page = App.surface('FreshPage', { model: () => ({ project }) })
const request = { entity: 'Project', id: 'p1', fields: ['name'] }
const p1 = entityKey('Project', 'p1')

const knownAt = (updatedAt: number): Model => ({
  ...initial,
  remote: {
    ...initial.remote,
    entities: writeEntity(emptyStore, p1, { name: 'Apollo' }, updatedAt),
  },
})

const Client = Layer.succeed(RemoteClient, {
  read: batch =>
    Effect.succeed({
      settled: [],
      entities: batch.requests.map(request => ({
        entity: request.entity,
        id: request.id,
        values: { name: 'Apollo' },
      })),
    }),
  query: () => Effect.die('unused'),
  mutate: () => Effect.die('unused'),
  live: () => Stream.empty,
})

describe('deadlineOf', () => {
  const freshness = { now: 200, freshness: 1_000 }

  it('is when the earliest fresh value ages out, with what is due then', () => {
    const store = writeEntity(
      writeEntity(emptyStore, p1, { name: 'Apollo' }, 500),
      entityKey('Project', 'p2'),
      { name: 'Borealis' },
      100,
    )
    const p2 = { ...request, id: 'p2' }
    expect(deadlineOf(store, [request, p2], freshness)).toEqual({ at: 1_100, due: [p2] })
  })

  it('is nothing for what is missing, stale, tombstoned or already expired: those are planned', () => {
    expect(deadlineOf(emptyStore, [request], freshness)).toBeUndefined()
    expect(
      deadlineOf(markStale(knownAt(500).remote.entities, p1, ['name']), [request], freshness),
    ).toBeUndefined()
    expect(deadlineOf(tombstone(emptyStore, p1), [request], freshness)).toBeUndefined()
    expect(
      deadlineOf(knownAt(0).remote.entities, [request], { now: 5_000, freshness: 1_000 }),
    ).toBeUndefined()
  })

  it('follows a held relation into its target', () => {
    const store = writeEntity(
      writeEntity(emptyStore, p1, { name: 'Apollo', owner: 'User:u1' }, 900),
      entityKey('User', 'u1'),
      { name: 'Ada' },
      300,
    )
    const withOwner = {
      ...request,
      fields: ['name', 'owner'],
      relations: { owner: { entity: 'User', fields: ['name'] } },
    }
    expect(deadlineOf(store, [withOwner], freshness)).toEqual({
      at: 1_300,
      due: [{ entity: 'User', id: 'u1', fields: ['name'] }],
    })
  })
})

describe('a value ageing out under staleWhileRevalidate', () => {
  let clock = 200
  const entry = Data.subscriptions(
    { page: Page },
    { policy: RemotePolicy.staleWhileRevalidate({ maxAge: 1_000 }), now: () => clock },
  )['page.read']

  it('is a dependency of the read entry, and none under cacheFirst', () => {
    expect(entry.modelToDependencies(knownAt(0)).expires).toEqual({ at: 1_000, due: [request] })
    const cacheFirst = Data.subscriptions({ page: Page })['page.read']
    expect(cacheFirst.modelToDependencies(knownAt(0)).expires).toBeNull()
  })

  it('emits RefreshStarted when the clock reaches it, and nothing before', async () => {
    clock = 200
    const collected: RemoteMessage[] = []
    await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(
          Stream.runForEach(
            entry.dependenciesToStream(entry.modelToDependencies(knownAt(0))),
            message => Effect.sync(() => void collected.push(message)),
          ).pipe(Effect.provide(Client)),
        )
        yield* TestClock.adjust(799)
        expect(collected).toEqual([])
        yield* TestClock.adjust(1)
        yield* Fiber.join(fiber)
      }).pipe(Effect.provide(TestClock.layer())),
    )
    expect(collected).toEqual([{ _tag: 'RefreshStarted', requests: [request] }])

    // Reduced, the field is stale: the next plan fetches it, and the deadline
    // is gone until the read lands and dates the value anew.
    clock = 1_000
    const stale = collected.reduce(Data.reduce, knownAt(0))
    expect(project.read(stale)).toEqual({ _tag: 'Refreshing', value: { name: 'Apollo' } })
    const next = entry.modelToDependencies(stale)
    expect(next.requirements).toEqual([request])
    expect(next.expires).toBeNull()
    const landed = Data.reduce(stale, {
      _tag: 'ReadReceived',
      requests: [request],
      result: {
        settled: [],
        entities: [{ entity: 'Project', id: 'p1', values: { name: 'Apollo' } }],
      },
      now: 1_000,
    })
    expect(entry.modelToDependencies(landed)).toEqual({
      requirements: [],
      queries: [],
      refresh: 0,
      expires: { at: 2_000, due: [request] },
    })
  })

  it('moves when a write dates the value anew, so the wait restarts', () => {
    clock = 200
    const before = entry.modelToDependencies(knownAt(0))
    const after = entry.modelToDependencies(knownAt(150))
    expect(before.requirements).toEqual(after.requirements)
    expect(before).not.toEqual(after)
    expect(after.expires).toEqual({ at: 1_150, due: [request] })
  })
})
