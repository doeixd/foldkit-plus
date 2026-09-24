/**
 * `Loading` is the absent-value twin of `Refreshing`: both mean a read is in
 * flight, one over a value the store holds and one over a value it does not.
 * What separates `Loading` from `Initial` is whether anything is fetching, which
 * matters because nothing fetches a projection no active Surface observes — that
 * reads `Initial` forever, and rendering it as a spinner hides the mistake.
 */
import { Effect, Layer, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import {
  Entity,
  Remote,
  RemoteClient,
  RemotePolicy,
  Selection,
  emptyStore,
  entityKey,
  initialRemoteModel,
  tombstone,
  updateRemote,
  writeEntity,
  type RemoteMessage,
  type RemoteModel,
} from '../src/index.js'

const User = Entity.make('User', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Data = Remote.define({ entities: [User] })
const Model = Schema.Struct({ remote: Data.Model })
const Message = defineMessageUnion({ Ping: {} })
const App = Surface.application({ Model, Message })
const AppRemote = Remote.at(Data, App.model.remote)
const UserSummary = Selection.make(User, { id: true, name: true })

const requirement = { entity: 'User', id: 'u1', fields: ['id', 'name'] }
const read = (remote: RemoteModel) => Remote.select(AppRemote, UserSummary)('u1').read({ remote })
const received = (values: Record<string, unknown>): RemoteMessage => ({
  _tag: 'ReadReceived',
  requests: [requirement],
  result: { settled: [], entities: [{ entity: 'User', id: 'u1', values }] },
  now: 0,
})

describe('Loading', () => {
  it('reads Initial while nothing is fetching the value', () => {
    expect(read(initialRemoteModel)._tag).toBe('Initial')
  })

  it('reads Loading once a read announces the fields', () => {
    const model = updateRemote(initialRemoteModel, {
      _tag: 'ReadStarted',
      requests: [requirement],
    })
    expect(read(model)._tag).toBe('Loading')
  })

  it('a read of other fields leaves this one Initial', () => {
    const model = updateRemote(initialRemoteModel, {
      _tag: 'ReadStarted',
      requests: [{ entity: 'User', id: 'u2', fields: ['id', 'name'] }],
    })
    expect(read(model)._tag).toBe('Initial')
  })

  it('the value arriving clears the mark', () => {
    const started = updateRemote(initialRemoteModel, {
      _tag: 'ReadStarted',
      requests: [requirement],
    })
    const done = updateRemote(started, received({ id: 'u1', name: 'ada' }))
    expect(done.loading.size).toBe(0)
    expect(read(done)).toEqual({ _tag: 'Ready', value: { id: 'u1', name: 'ada' } })
  })

  it('a failed read reads Failed, rather than a spinner that never ends', () => {
    const started = updateRemote(initialRemoteModel, {
      _tag: 'ReadStarted',
      requests: [requirement],
    })
    expect(read(started)._tag).toBe('Loading')
    const failed = updateRemote(started, {
      _tag: 'ReadFailed',
      requests: [requirement],
      error: { _tag: 'RemoteReadError', message: 'boom' },
    })
    expect(read(failed)).toEqual({
      _tag: 'Failed',
      error: { _tag: 'RemoteReadError', message: 'boom' },
    })
  })

  it('a present value reads Refreshing, not Loading, while it is refetched', () => {
    const known: RemoteModel = {
      ...initialRemoteModel,
      entities: writeEntity(emptyStore, entityKey('User', 'u1'), { id: 'u1', name: 'ada' }, 0),
    }
    const refetching = [
      { _tag: 'ReadStarted', requests: [requirement] } as const,
      { _tag: 'RefreshStarted', requests: [requirement] } as const,
    ].reduce<RemoteModel>(updateRemote, known)
    expect(read(refetching)).toEqual({
      _tag: 'Refreshing',
      value: { id: 'u1', name: 'ada' },
    })
  })

  it('a tombstone reads NotFound even while a read is in flight', () => {
    const deleted: RemoteModel = {
      ...initialRemoteModel,
      entities: tombstone(emptyStore, entityKey('User', 'u1')),
    }
    const started = updateRemote(deleted, { _tag: 'ReadStarted', requests: [requirement] })
    expect(read(started)._tag).toBe('NotFound')
  })
})

describe('the read entry announces its read', () => {
  const FakeClient = Layer.succeed(RemoteClient, {
    read: batch =>
      Effect.succeed({
        settled: [],
        entities: batch.requests.map(request => ({
          entity: request.entity,
          id: request.id,
          values: { id: request.id, name: 'grace' },
        })),
      }),
    query: () => Effect.die('unused'),
    mutate: () => Effect.die('unused'),
    live: () => Stream.empty,
  })

  it('emits ReadStarted before the read, so the Surface reads Loading meanwhile', async () => {
    const entry = Remote.observe(
      AppRemote,
      Surface.make(App, 'UserPage', {
        Params: Schema.Struct({ userId: Schema.String }),
        model: ({ params }) => Remote.select(AppRemote, UserSummary)(params.userId),
        messages: [Message.Ping],
      }),
      { userId: 'u1' },
      (message: RemoteMessage) => message,
      { policy: RemotePolicy.cacheFirst },
    )
    const dependencies = entry.modelToDependencies({ remote: initialRemoteModel })
    const messages = await Effect.runPromise(
      Stream.runCollect(entry.dependenciesToStream(dependencies)).pipe(Effect.provide(FakeClient)),
    )
    const emitted = [...messages]
    expect(emitted.map(message => message._tag)).toEqual(['ReadStarted', 'ReadReceived'])

    const announced = updateRemote(initialRemoteModel, emitted[0]!)
    expect(read(announced)._tag).toBe('Loading')
  })
})
