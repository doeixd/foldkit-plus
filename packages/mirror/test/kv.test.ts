/** The key-value store: one scoped, versioned JSON document per mirror. */
import { Effect, Schema, Stream } from 'effect'
import { KeyValueStore } from 'effect/unstable/persistence'
import { defineMessageUnion } from 'foldkit/message'
import { Projection, Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Mirror, MirrorStore } from '../src/index.js'

const Model = Schema.Struct({ sidebar: Schema.Literals(['open', 'closed']), draft: Schema.String })
type Model = typeof Model.Type
const initial: Model = { sidebar: 'open', draft: '' }
const App = Surface.application({
  Model,
  Message: defineMessageUnion({ ...Mirror.messages }),
  initial,
  update: model => ({ model }),
})
const Prefs = Mirror.kv(App, {
  key: 'todo/prefs',
  scope: 'u1',
  fields: Projection.pick(App.model.sidebar, App.model.draft),
  throttle: 0,
})
const entry = Prefs.subscriptions['todo/prefs.mirror']!
const write = (model: Model) =>
  Stream.runDrain(entry.dependenciesToStream(entry.modelToDependencies(model)))

describe('MirrorStore.kv', () => {
  it('writes the changed slice as one document and restores it', async () => {
    const restored = await Effect.runPromise(
      Effect.gen(function* () {
        yield* write({ sidebar: 'closed', draft: 'hello' })
        const kv = yield* KeyValueStore.KeyValueStore
        const raw = yield* kv.get('todo/prefs')
        expect(JSON.parse(raw!)).toEqual({
          version: 1,
          scope: 'u1',
          keys: { sidebar: 'closed', draft: 'hello' },
        })
        const message = yield* Prefs.restore.effect
        return Prefs.reduce(initial, message)
      }).pipe(Effect.provide(KeyValueStore.layerMemory)),
    )
    expect(restored).toEqual({ sidebar: 'closed', draft: 'hello' })
  })

  it('a slice back at its defaults removes the document', async () => {
    const raw = await Effect.runPromise(
      Effect.gen(function* () {
        yield* write({ sidebar: 'closed', draft: '' })
        yield* write(initial)
        const kv = yield* KeyValueStore.KeyValueStore
        return yield* kv.get('todo/prefs')
      }).pipe(Effect.provide(KeyValueStore.layerMemory)),
    )
    expect(raw).toBeUndefined()
  })

  it('another scope, another version, or a malformed document is discarded and removed', async () => {
    const outcome = (text: string) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const kv = yield* KeyValueStore.KeyValueStore
          yield* kv.set('todo/prefs', text)
          const message = yield* Prefs.restore.effect
          return { keys: message.keys, left: yield* kv.get('todo/prefs') }
        }).pipe(Effect.provide(KeyValueStore.layerMemory)),
      )
    expect(
      await outcome(JSON.stringify({ version: 1, scope: 'u2', keys: { draft: 'x' } })),
    ).toEqual({ keys: {}, left: undefined })
    expect(
      await outcome(JSON.stringify({ version: 2, scope: 'u1', keys: { draft: 'x' } })),
    ).toEqual({ keys: {}, left: undefined })
    expect(await outcome('{not json')).toEqual({ keys: {}, left: undefined })
    expect(
      await outcome(JSON.stringify({ version: 1, scope: 'u1', keys: { draft: 'x' } })),
    ).toEqual({
      keys: { draft: 'x' },
      left: JSON.stringify({ version: 1, scope: 'u1', keys: { draft: 'x' } }),
    })
  })

  it('a store failure is absorbed: the mirror is disposable state', async () => {
    const failing = KeyValueStore.make({
      get: () =>
        Effect.fail(
          new KeyValueStore.KeyValueStoreError({ message: 'down', method: 'get' } as never),
        ),
      set: () =>
        Effect.fail(
          new KeyValueStore.KeyValueStoreError({ message: 'down', method: 'set' } as never),
        ),
      remove: () =>
        Effect.fail(
          new KeyValueStore.KeyValueStoreError({ message: 'down', method: 'remove' } as never),
        ),
      clear: Effect.void,
      size: Effect.succeed(0),
    } as never)
    const message = await Effect.runPromise(
      Effect.gen(function* () {
        yield* write({ sidebar: 'closed', draft: '' })
        return yield* Prefs.restore.effect
      }).pipe(Effect.provideService(KeyValueStore.KeyValueStore, failing)),
    )
    expect(message.keys).toEqual({})
    expect(Prefs.reduce(initial, message)).toEqual(initial)
  })

  it('the memory store records writes for tests', async () => {
    const store = MirrorStore.memory({ a: '1' })
    await Effect.runPromise(store.write({ set: { b: '2' }, remove: ['a'], intent: 'replace' }))
    expect(store.current()).toEqual({ b: '2' })
    expect(store.writes).toHaveLength(1)
  })
})
