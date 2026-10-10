/**
 * `Data.persistence`: the cache kept across a reload as a wiring. Its restore
 * runs whenever the storage key changes; its save writes only once that key's
 * own snapshot is in, so a save at startup never writes the empty store over
 * the snapshot it has not read yet.
 */
import { Effect, Option, Schema, Stream } from 'effect'
import { KeyValueStore } from 'effect/persistence'
import { defineMessageUnion } from 'foldkit/message'
import { Entity as DomainEntity } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Remote, RemotePersistence, type RemoteMessage } from '../src/index.js'

const Project = DomainEntity.define(
  'Project',
  Schema.Struct({ id: Schema.String, name: Schema.String }),
)
const Summary = DomainEntity.select(Project, { id: true, name: true })

const Model = Schema.Struct({ remote: Remote.Model, actor: Schema.String })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({ model: App.model.remote, entities: [Project] })

const persistence = Data.persistence({
  key: model => `cache:${model.actor}`,
  scope: model => model.actor,
  debounce: 0,
})
const entries = persistence.subscriptions!
const restore = entries['persistence.restore']!
const save = entries['persistence.save']!

const fresh = (actor: string): Model => ({ remote: Remote.initial, actor })
const held = (model: Model, name: string): Model =>
  Data.reduce(model, {
    _tag: 'ReadReceived',
    requests: [{ entity: 'Project', id: 'p1', fields: ['id', 'name'] }],
    result: {
      settled: [],
      entities: [{ entity: 'Project', id: 'p1', values: { id: 'p1', name } }],
    },
    now: 0,
  })
const shown = (model: Model) => {
  const read = Data.get(Summary, 'p1').read(model)
  return read._tag === 'Ready' ? read.value.name : read._tag
}

/** A store holding `actor`'s snapshot of a model that shows `name`. */
const storeWith = (actor: string, name: string) =>
  Effect.runSync(
    Effect.gen(function* () {
      yield* RemotePersistence.save(RemotePersistence.snapshotOf(held(fresh(actor), name).remote), {
        key: `cache:${actor}`,
        scope: actor,
      })
      return yield* KeyValueStore.KeyValueStore
    }).pipe(Effect.provide(KeyValueStore.layerMemory)),
  )

/** What a Subscription entry does: its stream for the Model's dependencies, collected. */
const step = <D>(
  kv: KeyValueStore.KeyValueStore,
  entry: {
    readonly modelToDependencies: (model: Model) => D
    readonly dependenciesToStream: (
      dependencies: D,
      readDependencies: () => D,
    ) => Stream.Stream<RemoteMessage, never, KeyValueStore.KeyValueStore>
  },
  model: Model,
): Promise<ReadonlyArray<RemoteMessage>> => {
  const dependencies = entry.modelToDependencies(model)
  return Effect.runPromise(
    Stream.runCollect(entry.dependenciesToStream(dependencies, () => dependencies)).pipe(
      Effect.provideService(KeyValueStore.KeyValueStore, kv),
    ),
  ).then(collected => [...collected])
}

describe('Data.persistence', () => {
  it('restores the snapshot stored under the key, keeping what the store already holds', async () => {
    const kv = storeWith('ada', 'Apollo')
    const messages = await step(kv, restore, fresh('ada'))
    expect(messages).toMatchObject([
      { _tag: 'Hydrated', merge: 'preserve-existing', from: 'cache:ada' },
    ])
    const restored = messages.reduce(Data.reduce, fresh('ada'))
    expect(shown(restored)).toBe('Apollo')
    expect(restored.remote.restoredFrom).toEqual(Option.some('cache:ada'))
  })

  it('keeps a fact the store already holds over the snapshot’s older one, as a resumed page’s', async () => {
    const kv = storeWith('ada', 'Old')
    const resumed = held(fresh('ada'), 'Fresh')
    const messages = await step(kv, restore, resumed)
    expect(shown(messages.reduce(Data.reduce, resumed))).toBe('Fresh')
  })

  it('saves nothing before its own snapshot is in, so startup cannot write over it', async () => {
    const kv = storeWith('ada', 'Apollo')
    await step(kv, save, fresh('ada'))
    expect(await Effect.runPromise(kv.get('cache:ada'))).toContain('Apollo')
  })

  it('saves the cache once restored, under its key', async () => {
    const kv = storeWith('ada', 'Apollo')
    const messages = await step(kv, restore, fresh('ada'))
    const restored = held(messages.reduce(Data.reduce, fresh('ada')), 'Apollo II')
    await step(kv, save, restored)
    expect(await Effect.runPromise(kv.get('cache:ada'))).toContain('Apollo II')
  })

  it('saves nothing for another principal until that principal’s snapshot is in', async () => {
    const kv = storeWith('grace', 'Gemini')
    const messages = await step(kv, restore, fresh('ada'))
    // Ada's cache is in; the actor changes to Grace, whose snapshot is not read yet.
    const switched = { ...messages.reduce(Data.reduce, fresh('ada')), actor: 'grace' }
    await step(kv, save, switched)
    expect(await Effect.runPromise(kv.get('cache:grace'))).toContain('Gemini')
  })

  it('removes a snapshot grown past maxBytes, so no older one outlives it', async () => {
    const small = Data.persistence({
      key: model => `cache:${model.actor}`,
      scope: model => model.actor,
      maxBytes: 16,
      debounce: 0,
    }).subscriptions!['persistence.save']!
    const kv = storeWith('ada', 'Apollo')
    const messages = await step(kv, restore, fresh('ada'))
    await step(kv, small, held(messages.reduce(Data.reduce, fresh('ada')), 'Apollo II'))
    expect(await Effect.runPromise(kv.get('cache:ada'))).toBeUndefined()
  })

  it('restores nothing from a store it cannot read, and so saves nothing over it', async () => {
    const unreadable = KeyValueStore.makeStringOnly({
      get: key =>
        Effect.fail(
          new KeyValueStore.KeyValueStoreError({ message: 'locked', method: 'get', key }),
        ),
      set: () => Effect.void,
      remove: () => Effect.void,
      clear: Effect.void,
      size: Effect.succeed(0),
    })
    expect(await step(unreadable, restore, fresh('ada'))).toEqual([])
  })
})
