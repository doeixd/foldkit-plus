/**
 * Read-after tokens on Remote's wire (#544): a write's answer holds the rows
 * it wrote to a token (`MutationResult.after`); a read of such a row carries
 * the token, writes nothing until the server reads at it, and ends the floor
 * once it does. The floor is in the Model, so a reload keeps asking.
 */
import { Deferred, Effect, Fiber, Layer, Option, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Surface } from 'foldkit-surface'
import { TestClock } from 'effect/testing'
import { describe, expect, it } from 'vitest'
import {
  Entity,
  Mutation,
  Remote,
  RemoteClient,
  type LiveEvent,
  type RemoteMessage,
} from '../src/index.js'
import { live } from '../src/live.js'
import { RemotePersistence } from '../src/persistence.js'
import { why } from '../src/why.js'
import { coalesceReads, type BatchRead } from '../src/coalesce.js'
import { withTokens } from '../src/plan.js'
import { behindDelay } from '../src/store.js'
import {
  MAX_READ_AFTER,
  REMOTE_PROTOCOL_VERSION,
  type ReadBatch,
  type ReadBatchResult,
} from '../src/wire.js'

const emptyEntryOf = () => ({
  values: {},
  present: new Set<string>(),
  stale: new Set<string>(),
  unavailable: new Set<string>(),
  tombstone: false,
  updatedAt: 0,
  oldestAt: 0,
  windows: {},
})

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

  it('asked without the token, at a newer revision than held: writes the row and ends the floor', () => {
    const newer: RemoteMessage = {
      _tag: 'ReadReceived',
      requests: [request],
      result: { entities: [{ ...row(4), revision: 10 }], settled: [] },
      now: 10,
    }
    const model = Data.reduce(written(), newer)
    expect(stockOf(model)).toBe(4)
    expect(floorOf(model)).toBeUndefined()
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

/**
 * The read entry run as Foldkit runs it, over a server whose View is behind
 * the write for its first `behindFor` reads (past `confirmWithin`, so each
 * answer names the row `behind`). Foldkit restarts an entry after the
 * Messages already queued (#399): every Message the running stream sent is
 * reduced before the dependencies are compared, never between. The clock is
 * the Effect clock, moved half a second at a time.
 */
const driveBehind = (start: Model, behindFor: number, until: number) =>
  Effect.gen(function* () {
    let clock = 0
    const entry = Data.subscriptions({ product: active.product }, { now: () => clock })[
      'product.read'
    ]
    const batches: Array<typeof ReadBatch.Type> = []
    const client: RemoteClient['Service'] = {
      read: batch =>
        Effect.sync(() => {
          batches.push(batch)
          return batches.length <= behindFor
            ? { entities: [row(5)], settled: [], behind: [{ entity: 'Product', id: 'p1' }] }
            : { entities: [row(3)], settled: [] }
        }),
      query: () => Effect.die('no query'),
      mutate: () => Effect.die('no mutate'),
      live: () => Stream.empty,
    }
    const queued: Array<RemoteMessage> = []
    const run = (dependencies: ReturnType<typeof entry.modelToDependencies>) =>
      Effect.forkChild(
        Stream.runForEach(entry.dependenciesToStream(dependencies), message =>
          Effect.sync(() => void queued.push(message)),
        ).pipe(Effect.provide(Layer.succeed(RemoteClient, client))),
      )
    const same = Schema.toEquivalence(entry.dependenciesSchema)
    let model = start
    let dependencies = entry.modelToDependencies(model)
    let fiber = yield* run(dependencies)
    while (clock <= until) {
      for (let turn = 0; turn < 100; turn++) yield* Effect.yieldNow
      model = queued.splice(0).reduce((current, message) => Data.reduce(current, message), model)
      const next = entry.modelToDependencies(model)
      if (!same(dependencies, next)) {
        yield* Fiber.interrupt(fiber)
        dependencies = next
        fiber = yield* run(dependencies)
        for (let turn = 0; turn < 100; turn++) yield* Effect.yieldNow
      }
      clock += 500
      yield* TestClock.adjust('500 millis')
    }
    yield* Fiber.interrupt(fiber)
    return { model, batches }
  })

describe('A floored row the server is behind on', () => {
  it('is asked again with its token until a read at it answers, waiting longer each time', async () => {
    const { model, batches } = await Effect.runPromise(
      driveBehind(written(), 3, 20_000).pipe(Effect.provide(TestClock.layer())),
    )
    expect(batches.map(batch => batch.after)).toEqual([sent, sent, sent, sent])
    expect(floorOf(model)).toBeUndefined()
    expect(stockOf(model)).toBe(3)
  })

  it('shows the reply, and keeps its floor, while it waits', async () => {
    const { model, batches } = await Effect.runPromise(
      driveBehind(written(), Infinity, 2_000).pipe(Effect.provide(TestClock.layer())),
    )
    // Asked at once, then a second later; the next is due two seconds after that.
    expect(batches).toHaveLength(2)
    expect(floorOf(model)).toBe(token)
    expect(stockOf(model)).toBe(3)
    expect(model.remote.entities['Product:p1']?.behind?.tries).toBe(2)
  })

  it('waits a second after its first answer behind, doubling, at most thirty', () => {
    expect([1, 2, 3, 5, 6, 20].map(behindDelay)).toEqual([1000, 2000, 4000, 16_000, 30_000, 30_000])
  })

  it('is asked at once for a newer write, however long the last one waited', () => {
    const waited = Data.reduce(written(), answer(5, { after: sent, behind: true }))
    expect(waited.remote.entities['Product:p1']?.behind?.tries).toBe(1)
    // An answer naming no row of its own, only the token.
    const started = Data.mutate(waited, Reserve, { id: 'p1', stock: 2 }, { optimistic: [] })
    const again = Data.reduce(started.model, {
      _tag: 'MutationSucceeded',
      requestId: started.requestId,
      entities: [],
      after: { token: 'Product/p1@3', rows: [{ entity: 'Product', id: 'p1' }] },
      now: 6,
    })
    expect(floorOf(again)).toBe('Product/p1@3')
    expect(again.remote.entities['Product:p1']?.behind).toBeUndefined()
  })
})

describe('Reads outside the read entry', () => {
  const through = <A>(effect: Effect.Effect<A, unknown, RemoteClient>) => {
    const batches: Array<typeof ReadBatch.Type> = []
    return Effect.runPromise(
      effect.pipe(
        Effect.provide(
          Layer.succeed(RemoteClient, {
            read: batch =>
              Effect.sync(() => (batches.push(batch), { entities: [row(4)], settled: [] })),
            query: () => Effect.die('no query'),
            mutate: () => Effect.die('no mutate'),
            live: () => Stream.empty,
          }),
        ),
        Effect.map(model => ({ model, batches })),
      ),
    )
  }

  it.each([
    ['Data.prefetch', (model: Model) => Data.prefetch(model, product)],
    ['Data.satisfy', (model: Model) => Data.satisfy(model, { product: active.product })],
  ] as const)('%s carries the token and ends the floor', async (_, read) => {
    const { model, batches } = await through(read(written()))
    expect(batches.map(batch => batch.after)).toEqual([sent])
    expect(stockOf(model as Model)).toBe(4)
    expect(floorOf(model as Model)).toBeUndefined()
  })
})

describe('Remote.prefetch, the kernel read', () => {
  it('carries the token and ends the floor', async () => {
    const batches: Array<typeof ReadBatch.Type> = []
    const store = await Effect.runPromise(
      Remote.prefetch(Data, written(), product).pipe(
        Effect.provide(
          Layer.succeed(RemoteClient, {
            read: batch =>
              Effect.sync(() => (batches.push(batch), { entities: [row(4)], settled: [] })),
            query: () => Effect.die('no query'),
            mutate: () => Effect.die('no mutate'),
            live: () => Stream.empty,
          }),
        ),
      ),
    )
    expect(batches.map(batch => batch.after)).toEqual([sent])
    expect(store['Product:p1']?.floor).toBeUndefined()
    expect(store['Product:p1']?.values['stock']).toBe(4)
  })
})

describe('A list page over a floored row', () => {
  it('writes nothing of the row: a page is read with no token', () => {
    const model = Data.reduce(written(), {
      _tag: 'ConnectionMerged',
      connection: 'products',
      page: {
        edges: [{ key: 'Product:p1', ref: { entity: 'Product', id: 'p1' } }],
        start: { _tag: 'Terminal' },
        end: { _tag: 'Terminal' },
      },
      select: { entity: 'Product', fields: ['name', 'stock'] },
      entities: [row(9)],
      settled: [],
      now: 10,
    })
    expect(stockOf(model)).toBe(3)
    expect(floorOf(model)).toBe(token)
  })
})

describe('A row named behind with no floor', () => {
  it('is not taken as deleted', () => {
    const model = Data.reduce(held, {
      _tag: 'ReadReceived',
      requests: [request],
      result: { entities: [], settled: [], behind: [{ entity: 'Product', id: 'p1' }] },
      now: 10,
    })
    expect(stockOf(model)).toBe(5)
  })

  it('is not taken as deleted where nothing writes, and no read carries a token', () => {
    const Reads = Remote.make({ model: App.model.remote, entities: [Product] })
    const shown = Reads.reduce(
      { remote: Remote.initial },
      {
        _tag: 'ReadReceived',
        requests: [request],
        result: { entities: [row(5)], settled: [] },
        now: 0,
      },
    )
    const answered = Reads.reduce(shown, {
      _tag: 'ReadReceived',
      requests: [request],
      result: { entities: [], settled: [], behind: [{ entity: 'Product', id: 'p1' }] },
      now: 10,
    })
    expect(Reads.get(selection, 'p1').read(answered)._tag).toBe('Ready')
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

  it('is refused, with the whole snapshot, where the wire could not carry its token', () => {
    const saved = Data.reduce(written(held, `Product/${'p'.repeat(512)}@2`), {
      _tag: 'RetentionChanged',
      roots: { requirements: [request], connections: [] },
    })
    const text = RemotePersistence.dehydrate(RemotePersistence.snapshotOf(saved.remote))
    expect(Option.isNone(RemotePersistence.hydrate(text))).toBe(true)
  })
})

describe('A live stream over a floored row', () => {
  const floored = () => {
    const started = Data.mutate(held, Reserve, { id: 'p2', stock: 1 }, { optimistic: [] })
    return Data.reduce(started.model, {
      _tag: 'MutationSucceeded',
      requestId: started.requestId,
      // No row in the answer, so no echo of it is awaited on the stream.
      entities: [],
      after: { token: 'Product/p2@7', rows: [{ entity: 'Product', id: 'p2' }] },
      now: 5,
    })
  }
  const p2 = 'Product:p2'

  /** The live entry over `model`, with a server that sends `events`, and the Messages it sent. */
  const watch = (model: Model, events: ReadonlyArray<LiveEvent>) =>
    Effect.gen(function* () {
      const entry = Data.subscriptions({ watched: active.watched })['watched.live']
      const floors: unknown[] = []
      const messages = yield* Stream.runCollect(
        entry.dependenciesToStream(entry.modelToDependencies(model)),
      ).pipe(
        Effect.provide(
          Layer.succeed(RemoteClient, {
            read: () => Effect.die('no read'),
            query: () => Effect.die('no query'),
            mutate: () => Effect.die('no mutate'),
            live: request => (floors.push(request.floors), Stream.fromIterable(events)),
          }),
        ),
      )
      return { floors, messages: [...messages] }
    })
  const patch = (cursor: number, stock: number): LiveEvent => ({
    _tag: 'EntityPatched',
    cursor,
    ref: { entity: 'Product', id: 'p2' },
    values: { stock },
    changed: ['stock'],
  })

  it('subscribes with the token as its floor', async () => {
    const { floors } = await Effect.runPromise(watch(floored(), []))
    expect(floors).toEqual([[{ entity: 'Product', id: 'p2', token: 'Product/p2@7' }]])
  })

  it('writes a patch of the row, sent on the stream opened at its token, and ends the floor', async () => {
    const model = floored()
    const { messages } = await Effect.runPromise(watch(model, [patch(1, 4)]))
    const after = messages.reduce((current, message) => Data.reduce(current, message), model)
    expect(after.remote.entities[p2]?.values).toMatchObject({ stock: 4 })
    expect(after.remote.entities[p2]?.floor).toBeUndefined()
  })

  it('writes a patch of a newer revision than held from any stream, and ends the floor', () => {
    const patchOf = (revision: number): RemoteMessage => ({
      _tag: 'LiveReceived',
      stream: 's',
      event: {
        _tag: 'EntityPatched',
        cursor: 1,
        ref: { entity: 'Product', id: 'p1' },
        values: { name: 'Desk' },
        changed: ['name'],
        revision,
      },
      now: 10,
    })
    const nameOf = (model: Model) => model.remote.entities['Product:p1']?.values['name']
    // p1 is held at revision 9: one of 9 may be from before the write, one of 10 is past it.
    expect(floorOf(Data.reduce(written(), patchOf(9)))).toBe(token)
    expect(nameOf(Data.reduce(written(), patchOf(9)))).toBe('Lamp')
    expect(floorOf(Data.reduce(written(), patchOf(10)))).toBeUndefined()
    expect(nameOf(Data.reduce(written(), patchOf(10)))).toBe('Desk')
  })

  it('writes nothing of a patch sent on a stream opened before the write', () => {
    const model = floored()
    const after = Data.reduce(model, {
      _tag: 'LiveReceived',
      stream: 's',
      event: patch(1, 9),
      now: 10,
    })
    expect(after.remote.entities[p2]?.values).toEqual({})
    expect(after.remote.entities[p2]?.floor).toBe('Product/p2@7')
  })
})

describe('What a floor tells', () => {
  it('Data.inspect lists it, and why names the wait', () => {
    const model = written()
    expect(Data.inspect(model).floors).toEqual([{ key: 'Product:p1', token }])
    expect(why(Data, model, product).because.map(reason => reason._tag)).toContain('ReadAfter')
  })
})

describe('Coalesced reads at a token', () => {
  const req = (id: string, fields = ['name']) => ({ entity: 'Product', id, fields })
  const recording = (
    behind: (
      batch: typeof ReadBatch.Type,
    ) => ReadonlyArray<{ entity: string; id: string }> = () => [],
  ) => {
    const batches: Array<typeof ReadBatch.Type> = []
    const read: BatchRead = batch =>
      Effect.sync(() => {
        batches.push(batch)
        const late = behind(batch)
        return {
          entities: batch.requests.map(request => row(1, request.id)),
          settled: [],
          ...(late.length === 0 ? {} : { behind: [...late] }),
        }
      })
    return { batches, read }
  }
  const tokenOf = (id: string) => ({ entity: 'Product', id, token: `t:${id}` })

  it('send each row its token in the batch they share, and say what the server left behind', async () => {
    const raw = recording(batch => (batch.after ?? []).map(({ entity, id }) => ({ entity, id })))
    const [floored, plain] = await Effect.runPromise(
      Effect.gen(function* () {
        const read = yield* coalesceReads(raw.read)
        return yield* Effect.all(
          [
            read({ version: REMOTE_PROTOCOL_VERSION, requests: [req('a')], after: [tokenOf('a')] }),
            read({ version: REMOTE_PROTOCOL_VERSION, requests: [req('b')] }),
          ],
          { concurrency: 'unbounded' },
        )
      }),
    )
    expect(raw.batches.map(batch => batch.after)).toEqual([[tokenOf('a')]])
    expect(floored!.behind).toEqual([{ entity: 'Product', id: 'a' }])
    expect(plain!.behind).toEqual([{ entity: 'Product', id: 'a' }])
  })

  it('do not join a read in flight at another token', async () => {
    const batches: Array<typeof ReadBatch.Type> = []
    const tokens = await Effect.runPromise(
      Effect.gen(function* () {
        const gate = yield* Deferred.make<void>()
        const read = yield* coalesceReads(batch =>
          Effect.gen(function* () {
            batches.push(batch)
            if (batches.length === 1) yield* Deferred.await(gate)
            return { entities: [row(1, 'a')], settled: [] }
          }),
        )
        const first = yield* Effect.forkChild(
          read({ version: REMOTE_PROTOCOL_VERSION, requests: [req('a')], after: [tokenOf('a')] }),
        )
        for (let turn = 0; turn < 100 && batches.length === 0; turn++) yield* Effect.yieldNow
        const second = yield* Effect.forkChild(
          read({
            version: REMOTE_PROTOCOL_VERSION,
            requests: [req('a')],
            after: [{ ...tokenOf('a'), token: 'newer' }],
          }),
        )
        for (let turn = 0; turn < 100 && batches.length < 2; turn++) yield* Effect.yieldNow
        yield* Deferred.succeed(gate, undefined)
        yield* Fiber.join(first)
        yield* Fiber.join(second)
        return batches.map(batch => batch.after?.map(each => each.token))
      }),
    )
    expect(tokens).toEqual([['t:a'], ['newer']])
  })

  it('read a row asked at two tokens in one batch once at each', async () => {
    const raw = recording()
    await Effect.runPromise(
      Effect.gen(function* () {
        const read = yield* coalesceReads(raw.read)
        yield* Effect.all(
          [
            read({ version: REMOTE_PROTOCOL_VERSION, requests: [req('a')], after: [tokenOf('a')] }),
            read({
              version: REMOTE_PROTOCOL_VERSION,
              requests: [req('a', ['stock'])],
              after: [{ ...tokenOf('a'), token: 'newer' }],
            }),
          ],
          { concurrency: 'unbounded' },
        )
      }),
    )
    expect(raw.batches.map(batch => batch.after?.map(row => row.token))).toEqual([
      ['t:a'],
      ['newer'],
    ])
  })

  it('cut a batch so no read carries more tokens than the wire takes', async () => {
    const raw = recording()
    const ids = Array.from({ length: MAX_READ_AFTER + 1 }, (_, at) => `r${at}`)
    await Effect.runPromise(
      Effect.gen(function* () {
        const read = yield* coalesceReads(raw.read)
        yield* read({
          version: REMOTE_PROTOCOL_VERSION,
          requests: ids.map(id => req(id)),
          after: ids.map(tokenOf),
        })
      }),
    )
    expect(raw.batches.map(batch => batch.after?.length)).toEqual([MAX_READ_AFTER, 1])
  })
})

describe('A plan with more floored rows than a read carries', () => {
  it('sends the first MAX_READ_AFTER with their tokens and leaves the rest for the next plan', () => {
    const ids = Array.from({ length: MAX_READ_AFTER + 2 }, (_, at) => `r${at}`)
    const store = Object.fromEntries(
      ids.map(id => [`Product:${id}`, { ...emptyEntryOf(), floor: `t:${id}` }]),
    )
    const planned = ids.map(id => ({ entity: 'Product', id, fields: ['name'] }))
    const { requirements, after } = withTokens(store, planned)
    expect(after).toHaveLength(MAX_READ_AFTER)
    expect(requirements).toHaveLength(MAX_READ_AFTER)
  })
})
