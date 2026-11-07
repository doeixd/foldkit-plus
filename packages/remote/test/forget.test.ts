import { Effect, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import {
  Entity,
  Mutation,
  Remote,
  RemoteClient,
  RemoteLiveError,
  type RemoteMessage,
} from '../src/index.js'
import { live } from '../src/live.js'

const User = Entity.make('User', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Rename = Mutation.make('Rename', {
  Input: { id: Schema.String, name: Schema.String },
  Output: { id: Schema.String },
})

const Model = Schema.Struct({ route: Schema.String, remote: Remote.Model })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Remote.messages, Ping: {} })
const App = Surface.application({ Model, Message })
const Data = Remote.make({ model: App.model.remote, entities: [User], mutations: [Rename] })
const initial: Model = { route: '/', remote: Remote.initial }

const summary = User.select({ name: true })
const user = Data.get(summary, 'u1')
const watched = live(Data, summary, 'u1')
const request = { entity: 'User', id: 'u1', fields: ['name'] }

/** The Model after the server answered: `u1` named, `gone` absent, `u2` still in flight. */
const known: Model = Data.reduce(
  Data.reduce(initial, {
    _tag: 'ReadReceived',
    requests: [request, { entity: 'User', id: 'gone', fields: ['name'] }],
    result: {
      entities: [{ entity: 'User', id: 'u1', values: { name: 'Ada' } }],
      settled: [{ entity: 'User', id: 'u1', fields: ['email'] }],
    },
    now: 0,
  }),
  { _tag: 'ReadStarted', requests: [{ entity: 'User', id: 'u2', fields: ['name'] }] },
)

describe('Data.forget', () => {
  const forgotten = Data.forget(known)

  it('forgets values, tombstones and unavailable fields: every read is Initial and planned again', () => {
    expect(user.read(forgotten)).toEqual({ _tag: 'Initial' })
    expect(Data.get(summary, 'gone').read(forgotten)).toEqual({ _tag: 'Initial' })
    expect(Data.get(summary, 'u2').read(forgotten)).toEqual({ _tag: 'Initial' })
    expect(Data.plan(forgotten, Data.get(summary, 'gone'))).toEqual([
      { entity: 'User', id: 'gone', fields: ['name'] },
    ])
    expect(Data.inspect(forgotten).entities).toEqual([])
    expect(Data.inspect(forgotten).loading).toEqual([])
  })

  it('restarts a read entry whose plan did not change, so a read sent before cannot land after', () => {
    const Page = App.surface('ForgetPage', { model: () => ({ user }) })
    const entry = Data.subscriptions({ page: Page })['page.read']
    // Nothing is known of u1 in either Model, so the plan is the same; the floor is not.
    const empty = initial
    expect(entry.modelToDependencies(Data.forget(empty)).requirements).toEqual(
      entry.modelToDependencies(empty).requirements,
    )
    expect(entry.modelToDependencies(Data.forget(empty))).not.toEqual(
      entry.modelToDependencies(empty),
    )
  })

  it('restarts a live entry at cursor zero, even one that never advanced', () => {
    const Page = App.surface('ForgetLive', { model: () => ({ watched }) })
    const entry = Data.subscriptions({ page: Page })['page.live']
    const advanced = Data.reduce(known, {
      _tag: 'LiveReceived',
      stream: 'User:u1:name',
      event: {
        _tag: 'EntityPatched',
        cursor: 1,
        ref: { entity: 'User', id: 'u1' },
        values: { name: 'Ada!' },
        changed: ['name'],
      },
      now: 1,
    })
    expect(entry.modelToDependencies(advanced).cursor).toBe(1)
    expect(entry.modelToDependencies(Data.forget(advanced)).cursor).toBe(0)
    expect(entry.modelToDependencies(Data.forget(initial))).not.toEqual(
      entry.modelToDependencies(initial),
    )
  })

  it('keeps the mutation sequence, so the next request id is still new', () => {
    const before = Data.mutate(known, Rename, { id: 'u1', name: 'Grace' })
    const after = Data.mutate(Data.forget(before.model), Rename, { id: 'u1', name: 'Grace' })
    expect(after.requestId).not.toBe(before.requestId)
  })

  it('treats a mutation in flight as applied: its answer writes nothing', () => {
    const started = Data.mutate(
      known,
      Rename,
      { id: 'u1', name: 'Grace' },
      {
        optimistic: [User.patch('u1', { name: 'Grace' })],
      },
    )
    expect(user.read(started.model)).toEqual({ _tag: 'Ready', value: { name: 'Grace' } })
    const forgotten = Data.forget(started.model)
    expect(user.read(forgotten)).toEqual({ _tag: 'Initial' })
    expect(Data.mutation(forgotten, started.requestId)._tag).toBe('Applied')
    const settled = Data.reduce(forgotten, {
      _tag: 'MutationSucceeded',
      now: 0,
      requestId: started.requestId,
      entities: [{ entity: 'User', id: 'u1', values: { name: 'Grace' } }],
    })
    expect(user.read(settled)).toEqual({ _tag: 'Initial' })
    expect(settled.remote.optimistic.layers).toEqual([])
  })

  describe("an answer asked for before it is the previous principal's (#484)", () => {
    const forgotten = Data.forget(known)
    const floor = forgotten.remote.refresh.floor
    const answers = (generation: number): ReadonlyArray<RemoteMessage> => [
      {
        _tag: 'ReadReceived',
        requests: [request],
        result: { entities: [{ entity: 'User', id: 'u1', values: { name: 'Eve' } }], settled: [] },
        now: 3,
        generation,
      },
      {
        _tag: 'ReadFailed',
        requests: [request],
        error: { _tag: 'RemoteReadError', message: 'down' },
        generation,
      },
      {
        _tag: 'LiveReceived',
        stream: 'User:u1:name',
        event: {
          _tag: 'EntityPatched',
          cursor: 1,
          ref: { entity: 'User', id: 'u1' },
          values: { name: 'Eve' },
          changed: ['name'],
        },
        now: 3,
        generation,
      },
      {
        _tag: 'ConnectionMerged',
        connection: 'Feed',
        page: { edges: [], start: { _tag: 'Terminal' }, end: { _tag: 'Terminal' } },
        now: 3,
        generation,
      },
      {
        _tag: 'QueryFailed',
        connection: 'Feed',
        error: { _tag: 'RemoteQueryError', message: 'down' },
        generation,
      },
    ]

    it.each(answers(floor - 1))('writes nothing: $_tag', answer => {
      expect(Data.reduce(forgotten, answer)).toBe(forgotten)
    })
    it.each(answers(floor))('is applied when asked since: $_tag', answer => {
      expect(Data.reduce(forgotten, answer)).not.toBe(forgotten)
    })
  })

  describe('stamps a live stream with the floor it was opened under', () => {
    const Page = App.surface('ForgetStamp', { model: () => ({ watched }) })
    const entry = Data.subscriptions({ page: Page })['page.live']
    const forgotten = Data.forget(known)
    const floor = forgotten.remote.refresh.floor
    const event = {
      _tag: 'EntityPatched' as const,
      cursor: 1,
      ref: { entity: 'User', id: 'u1' },
      values: { name: 'Eve' },
      changed: ['name'],
    }
    const messagesOf = (live: RemoteClient['Service']['live']) =>
      Effect.runPromise(
        Stream.runCollect(entry.dependenciesToStream(entry.modelToDependencies(forgotten))).pipe(
          Effect.provideService(RemoteClient, {
            read: () => Effect.die('unused'),
            query: () => Effect.die('unused'),
            mutate: () => Effect.die('unused'),
            live,
          }),
        ),
      )

    it('an event', async () => {
      expect([...(await messagesOf(() => Stream.make(event)))]).toMatchObject([
        { _tag: 'LiveReceived', generation: floor },
      ])
    })
    it('a break', async () => {
      const broken = await messagesOf(() => Stream.fail(new RemoteLiveError({ message: 'lost' })))
      expect([...broken]).toMatchObject([{ _tag: 'ReadFailed', generation: floor }])
    })
  })

  it('is a refresh generation of its own, above which a later refresh moves', () => {
    const forgotten = Data.forget(known)
    expect(forgotten.remote.refresh.floor).toBe(known.remote.refresh.generation + 1)
    expect(forgotten.remote.refresh.generation).toBe(forgotten.remote.refresh.floor)
    const reloaded = Data.reduce(forgotten, {
      _tag: 'ReadReceived',
      requests: [request],
      result: { entities: [{ entity: 'User', id: 'u1', values: { name: 'Ada' } }], settled: [] },
      now: 2,
    })
    const refreshed = Data.refresh(reloaded, user)
    expect(refreshed.remote.refresh.generation).toBe(forgotten.remote.refresh.floor + 1)
    expect(refreshed.remote.refresh.floor).toBe(forgotten.remote.refresh.floor)
  })
})
