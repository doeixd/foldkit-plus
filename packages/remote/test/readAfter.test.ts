/**
 * Read-after tokens on Remote's wire (#544): a write's answer holds the rows
 * it wrote to a token (`MutationResult.after`); a read of such a row carries
 * the token, writes nothing until the server reads at it, and ends the floor
 * once it does. The floor is in the Model, so a reload keeps asking.
 */
import { Effect, Layer, Option, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Entity, Mutation, Remote, RemoteClient, type RemoteMessage } from '../src/index.js'
import { live } from '../src/live.js'
import { RemotePersistence } from '../src/persistence.js'
import { why } from '../src/why.js'
import type { ReadBatch, ReadBatchResult } from '../src/wire.js'

const Product = Entity.make(
  'Product',
  Schema.Struct({ id: Schema.String, name: Schema.String, stock: Schema.Number }),
)
const Reserve = Mutation.make('Reserve', {
  Input: { id: Schema.String, stock: Schema.Number },
  Output: { id: Schema.String },
})
const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({ model: App.model.remote, entities: [Product], mutations: [Reserve] })
const selection = Product.select({ name: true, stock: true })
const product = Data.get(selection, 'p1')
const watched = live(Data, selection, 'p2')
const active = {
  product: Data.active('product', () => Option.some(product)),
  watched: Data.active('watched', () => Option.some(watched)),
}

const request = { entity: 'Product', id: 'p1', fields: ['name', 'stock'] }
const row = (stock: number, id = 'p1') => ({
  entity: 'Product',
  id,
  values: { name: 'Lamp', stock },
})
const token = 'Product/p1@2'

const held = Data.reduce(
  { remote: Remote.initial },
  {
    _tag: 'ReadReceived',
    requests: [request],
    result: { entities: [{ ...row(5), revision: 9 }], settled: [] },
    now: 0,
  },
)

/** A reservation to 3 answered with the reply's fields and a token for p1. */
const written = (from: Model = held, after: string = token): Model => {
  const started = Data.mutate(from, Reserve, { id: 'p1', stock: 3 }, { optimistic: [] })
  return Data.reduce(started.model, {
    _tag: 'MutationSucceeded',
    requestId: started.requestId,
    entities: [{ entity: 'Product', id: 'p1', values: { stock: 3 } }],
    after: { token: after, rows: [{ entity: 'Product', id: 'p1' }] },
    now: 5,
  })
}

const answer = (
  stock: number,
  options: {
    readonly after?: ReadonlyArray<{ entity: string; id: string; token: string }>
    readonly behind?: boolean
  } = {},
): RemoteMessage => ({
  _tag: 'ReadReceived',
  requests: [request],
  result: {
    entities: [row(stock)],
    settled: [],
    ...(options.behind === true ? { behind: [{ entity: 'Product', id: 'p1' }] } : {}),
  },
  now: 10,
  ...(options.after === undefined ? {} : { after: options.after }),
})

const stockOf = (model: Model): number | undefined => {
  const data = product.read(model)
  return data._tag === 'Ready' || data._tag === 'Refreshing' ? data.value.stock : undefined
}
const floorOf = (model: Model) => model.remote.entities['Product:p1']?.floor
const sent = [{ entity: 'Product', id: 'p1', token }]

/** The read entry of `active.product`, run against a client recording each batch. */
const readThrough = (
  model: Model,
  answers: (batch: typeof ReadBatch.Type) => typeof ReadBatchResult.Type,
) =>
  Effect.gen(function* () {
    const batches: Array<typeof ReadBatch.Type> = []
    const entry = Data.subscriptions({ product: active.product })['product.read']
    const dependencies = entry.modelToDependencies(model)
    const messages = yield* Stream.runCollect(entry.dependenciesToStream(dependencies)).pipe(
      Effect.provide(
        Layer.succeed(RemoteClient, {
          read: batch => Effect.sync(() => (batches.push(batch), answers(batch))),
          query: () => Effect.die('no query'),
          mutate: () => Effect.die('no mutate'),
          live: () => Stream.empty,
        }),
      ),
    )
    return {
      dependencies,
      batches,
      model: [...messages].reduce((current, message) => Data.reduce(current, message), model),
    }
  })

describe('A write answer with a read-after token', () => {
  it('holds each row it names to the token, and shows the reply', () => {
    const model = written()
    expect(floorOf(model)).toBe(token)
    expect(stockOf(model)).toBe(3)
  })

  it('makes the read entry ask again for a held row, carrying the token', async () => {
    const run = await Effect.runPromise(
      readThrough(written(), () => ({ entities: [row(3)], settled: [] })),
    )
    expect(run.dependencies.requirements).toEqual([request])
    expect(run.batches.map(batch => batch.after)).toEqual([sent])
    expect(floorOf(run.model)).toBeUndefined()
  })

  it('asks for nothing for a row with no floor whose fields are held', () => {
    const entry = Data.subscriptions({ product: active.product })['product.read']
    expect(entry.modelToDependencies(held)).toMatchObject({ requirements: [], after: [] })
  })
})

describe('An answer to a read of a floored row', () => {
  it('read at the token: writes the row and ends the floor', () => {
    const model = Data.reduce(written(), answer(4, { after: sent }))
    expect(stockOf(model)).toBe(4)
    expect(floorOf(model)).toBeUndefined()
  })

  it('named in behind: keeps the held value and the floor', () => {
    const model = Data.reduce(written(), answer(5, { after: sent, behind: true }))
    expect(stockOf(model)).toBe(3)
    expect(floorOf(model)).toBe(token)
  })

  it('asked without the token: writes nothing and keeps the floor', () => {
    const model = Data.reduce(written(), answer(5))
    expect(stockOf(model)).toBe(3)
    expect(floorOf(model)).toBe(token)
  })

  it('asked at an older token: writes nothing and keeps the newer floor', () => {
    const model = Data.reduce(written(written(), 'Product/p1@3'), answer(5, { after: sent }))
    expect(stockOf(model)).toBe(3)
    expect(floorOf(model)).toBe('Product/p1@3')
  })

  it('missing from an answer named behind: is not taken as deleted', () => {
    const model = Data.reduce(written(), {
      _tag: 'ReadReceived',
      requests: [request],
      result: { entities: [], settled: [], behind: [{ entity: 'Product', id: 'p1' }] },
      now: 10,
      after: sent,
    })
    expect(product.read(model)._tag).not.toBe('NotFound')
  })
})

describe('A floor across a reload', () => {
  it('survives a persisted snapshot and is asked again with its token', async () => {
    const saved = Data.reduce(written(), {
      _tag: 'RetentionChanged',
      roots: { requirements: [request], connections: [] },
    })
    const text = RemotePersistence.dehydrate(RemotePersistence.snapshotOf(saved.remote))
    const snapshot = Option.getOrThrow(RemotePersistence.hydrate(text))
    const restored = Data.reduce(
      { remote: Remote.initial },
      RemotePersistence.hydrated(snapshot, { merge: 'replace' }),
    )
    expect(floorOf(restored)).toBe(token)
    expect(restored.remote.entities['Product:p1']?.revision).toBe(9)
    const run = await Effect.runPromise(
      readThrough(restored, () => ({ entities: [row(3)], settled: [] })),
    )
    expect(run.batches.map(batch => batch.after)).toEqual([sent])
  })
})

describe('A live stream over a floored row', () => {
  it('subscribes with the token as its floor', async () => {
    const started = Data.mutate(held, Reserve, { id: 'p2', stock: 1 }, { optimistic: [] })
    const model = Data.reduce(started.model, {
      _tag: 'MutationSucceeded',
      requestId: started.requestId,
      entities: [],
      after: { token: 'Product/p2@7', rows: [{ entity: 'Product', id: 'p2' }] },
      now: 5,
    })
    const entry = Data.subscriptions({ watched: active.watched })['watched.live']
    const floors: unknown[] = []
    const dependencies = entry.modelToDependencies(model)
    await Effect.runPromise(
      Stream.runDrain(entry.dependenciesToStream(dependencies)).pipe(
        Effect.provide(
          Layer.succeed(RemoteClient, {
            read: () => Effect.die('no read'),
            query: () => Effect.die('no query'),
            mutate: () => Effect.die('no mutate'),
            live: request => (floors.push(request.floors), Stream.empty),
          }),
        ),
      ),
    )
    expect(floors).toEqual([[{ entity: 'Product', id: 'p2', token: 'Product/p2@7' }]])
  })
})

describe('What a floor tells', () => {
  it('Data.inspect lists it, and why names the wait', () => {
    const model = written()
    expect(Data.inspect(model).floors).toEqual([{ key: 'Product:p1', token }])
    expect(why(Data, model, product).because.map(reason => reason._tag)).toContain('ReadAfter')
  })
})
