/**
 * `Remote.fold`: a bound domain under one wrapper variant of the application's
 * union, so `update` matches that union exhaustively and every Message Remote
 * produces, from a fetch, a mutation, or a Subscription entry, arrives wrapped.
 */
import { Effect, Layer, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Entity, Mutation, Remote, RemoteClient } from '../src/index.js'

const User = Entity.make('User', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Rename = Mutation.make('Rename', {
  Input: Schema.Struct({ id: Schema.String, name: Schema.String }),
  Output: Schema.Struct({ id: Schema.String }),
})

const Model = Schema.Struct({ route: Schema.String, remote: Remote.Model })
type Model = typeof Model.Type

// The application's own union: Remote's Messages arrive inside one variant.
const Message = defineMessageUnion({
  GotRemoteMessage: { message: Remote.Message },
  Ping: {},
})
type Message = typeof Message.Type
type Return = Update.Return<Model, Message, RemoteClient>

const App = Surface.application({ Model, Message })
const Data = Remote.make({ model: App.model.remote, entities: [User], mutations: [Rename] })
const initial: Model = { route: 'u1', remote: Remote.initial }

const summary = User.select({ name: true })
const Home = App.surface('Home', { model: () => ({ user: Data.get(summary, 'u1') }) })

const foldData = Remote.fold(Data, message => Message.GotRemoteMessage({ message }))

// Exhaustive: TypeScript would reject a missing variant here.
const update = (model: Model, message: Message): Return =>
  Message.match(message, {
    GotRemoteMessage: ({ message }) => foldData(model, message),
    Ping: () => ({ model }),
  })

const FakeClient = Layer.succeed(RemoteClient, {
  read: batch =>
    Effect.succeed({
      settled: [],
      entities: batch.requests.map(request => ({
        entity: request.entity,
        id: request.id,
        values: { id: request.id, name: 'ada' },
      })),
    }),
  query: () => Effect.die('unused'),
  mutate: request =>
    Effect.succeed({
      output: { id: 'u1' },
      entities: [
        { entity: 'User', id: 'u1', values: { name: (request.input as { name: string }).name } },
      ],
    }),
  live: () => Stream.empty,
})

const wrapped = (message: unknown): message is { readonly _tag: 'GotRemoteMessage' } =>
  typeof message === 'object' &&
  message !== null &&
  (message as { _tag?: unknown })._tag === 'GotRemoteMessage'

describe('Remote.fold', () => {
  it('reduces a wrapped Remote Message exactly as Data.reduce does', () => {
    const received = Message.GotRemoteMessage({
      message: {
        _tag: 'ReadReceived',
        requests: [{ entity: 'User', id: 'u1', fields: ['name'] }],
        result: {
          settled: [],
          entities: [{ entity: 'User', id: 'u1', values: { id: 'u1', name: 'ada' } }],
        },
        now: 1,
      },
    })
    const { model } = update(initial, received)
    expect(model).toEqual(Data.reduce(initial, received.message))
    expect(Surface.read(Home, model)).toMatchObject({
      user: { _tag: 'Ready', value: { name: 'ada' } },
    })
  })

  it('mutate starts the same mutation, with its Command yielding the wrapper', async () => {
    const started = foldData.mutate(
      initial,
      Rename,
      { id: 'u1', name: 'grace' },
      { requestId: 'r1' },
    )
    const plain = Data.mutate(initial, Rename, { id: 'u1', name: 'grace' }, { requestId: 'r1' })
    expect(started.model).toEqual(plain.model)
    expect(started.command.name).toBe(plain.command.name)
    const answer = await Effect.runPromise(started.command.effect.pipe(Effect.provide(FakeClient)))
    expect(wrapped(answer)).toBe(true)
    expect(answer).toMatchObject({
      _tag: 'GotRemoteMessage',
      message: { _tag: 'MutationSucceeded', requestId: 'r1' },
    })
  })

  it('subscriptions keep their keys and every entry emits the wrapper', async () => {
    const lifted = foldData.subscriptions({ home: Home })
    expect(Object.keys(lifted).sort()).toEqual(
      Object.keys(Data.subscriptions({ home: Home })).sort(),
    )
    const read = lifted['home.read']!
    const emitted = await Effect.runPromise(
      Stream.runCollect(read.dependenciesToStream(read.modelToDependencies(initial))).pipe(
        Effect.provide(FakeClient),
      ),
    )
    const messages = Array.from(emitted)
    expect(messages.length).toBeGreaterThan(0)
    expect(messages.every(wrapped)).toBe(true)
    // What arrives reduces through the fold like any other wrapped Message.
    const settled = messages.reduce(
      (model, message) => update(model, message as Message).model,
      initial,
    )
    expect(Surface.read(Home, settled)).toMatchObject({
      user: { _tag: 'Ready', value: { name: 'ada' } },
    })
  })
})
