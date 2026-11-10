/**
 * `writing`: what is being saved, read from the ledger and the outbox (#377).
 * A plain write is in the ledger; a durable one is in the outbox too, whose
 * states `outboxStatus` reports and `writing` is built from.
 */
import { Effect, Option, Schema } from 'effect'
import { KeyValueStore } from 'effect/persistence'
import { defineMessageUnion } from 'foldkit/message'
import { Entity, Write } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Mutation, Remote, writing, type Writing } from '../src/index.js'
import { outbox, outboxStatus } from '../src/outbox.js'
import { Queued, type OutboxState } from '../src/queue.js'

const Item = Entity.define('Item', Schema.Struct({ id: Schema.String, count: Schema.Number }))
const input = Entity.input(Item, Schema.Struct({ id: Schema.String, count: Schema.Number }))
const SetCount = Mutation.write('SetCount', Write.update(input, { id: 'id' }))
const Reset = Mutation.write('Reset', Write.update(input, { id: 'id' }))
const Remove = Mutation.write(
  'Remove',
  Write.delete(Entity.input(Item, Schema.Struct({ id: Schema.String })), { id: 'id' }),
)

const Model = Schema.Struct({ remote: Remote.Model, actor: Schema.String })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({
  model: App.model.remote,
  entities: [Item],
  mutations: [SetCount, Reset, Remove],
})
const durable = outbox(Data, { key: model => `outbox:${model.actor}`, scope: model => model.actor })

const read = (principal: string | null = null): Model =>
  Data.reduce(
    { remote: Remote.initial, actor: 'ada' },
    {
      _tag: 'ReadReceived',
      requests: ['i1', 'i2'].map(id => ({ entity: 'Item', id, fields: ['id', 'count'] })),
      result: {
        settled: [],
        entities: ['i1', 'i2'].map(id => ({ entity: 'Item', id, values: { id, count: 1 } })),
        principal,
      },
      now: 0,
      generation: 0,
    },
  )

const kvHolding = (entries: ReadonlyArray<unknown>) => {
  const kv = Effect.runSync(
    Effect.gen(function* () {
      return yield* KeyValueStore.KeyValueStore
    }).pipe(Effect.provide(KeyValueStore.layerMemory)),
  )
  Effect.runSync(
    kv.set('outbox:ada', JSON.stringify({ version: 1, scope: 'ada', entries, done: [] })),
  )
  return kv
}

const stored = (
  operation: string,
  state: unknown = { _tag: 'Waiting' },
  extra: Record<string, unknown> = {},
) => ({
  operation,
  mutation: 'SetCount',
  input: { id: 'i1', count: 5 },
  optimistic: [],
  shown: [],
  revision: 0,
  state,
  ...extra,
})

const refused = { _tag: 'MutationError', message: 'no' }
const unauthenticated = { _tag: 'Unauthenticated', message: 'Sign in.' }

/** The page after its restore found `entries` waiting in the store. */
const restoredFrom = (entries: ReadonlyArray<unknown>, page: Model = read()): Promise<Model> =>
  Effect.runPromise(
    durable
      .restore(page)
      .pipe(Effect.provideService(KeyValueStore.KeyValueStore, kvHolding(entries))),
  )

/** The model with every readable queued write sent `attempt` times, unanswered. */
const attempted = (
  model: Model,
  attempt: number,
  delayed: Option.Option<never> = Option.none(),
) => ({
  ...model,
  remote: {
    ...model.remote,
    outbox: {
      ...model.remote.outbox,
      queue: model.remote.outbox.queue.map(queued =>
        Queued.$match(queued, {
          Readable: readable => Queued.Readable({ ...readable, attempt, delayed }),
          Unreadable: () => queued,
        }),
      ),
    },
  },
})

const plainWrite = (model: Model, id = 'i1', count = 2) =>
  Data.mutate(model, SetCount, { id, count })

const failed = (model: Model, requestId: string): Model =>
  Data.reduce(model, {
    _tag: 'MutationFailed',
    requestId,
    operation: requestId,
    error: { _tag: 'Unreachable', message: 'offline' },
  })

const tagged = (saving: Writing) => saving._tag
const idsOf = (saving: Writing) => ('requestIds' in saving ? saving.requestIds : [])

describe('writing: plain writes', () => {
  it('is None with nothing written', () => {
    expect(writing(Data, read())).toEqual({ _tag: 'None' })
  })

  it('is Sending from the write until its answer, and None after it', () => {
    const started = plainWrite(read())
    expect(writing(Data, started.model)).toEqual({
      _tag: 'Sending',
      requestIds: [started.requestId],
    })
    const settled = Data.reduce(started.model, {
      _tag: 'MutationSucceeded',
      now: 1,
      requestId: started.requestId,
      entities: [],
    })
    expect(writing(Data, settled)).toEqual({ _tag: 'None' })
  })

  it('is Failed once refused, until dismissed, and Sending again while a retry is in flight', () => {
    const started = plainWrite(read())
    const refusedModel = failed(started.model, started.requestId)
    expect(writing(Data, refusedModel)).toEqual({ _tag: 'Failed', requestIds: [started.requestId] })
    expect(writing(Data, Data.dismiss(refusedModel, started.requestId))).toEqual({ _tag: 'None' })
    const retried = Option.getOrThrow(Data.retry(refusedModel, started.requestId))
    expect(writing(Data, retried.model)).toEqual({
      _tag: 'Sending',
      requestIds: [started.requestId],
    })
  })

  it('lists the requests of the leading state, in the order they started', () => {
    const first = plainWrite(read(), 'i1', 2)
    const second = plainWrite(first.model, 'i2', 3)
    const third = plainWrite(second.model, 'i1', 4)
    const oneFailed = failed(third.model, second.requestId)
    expect(writing(Data, third.model)).toEqual({
      _tag: 'Sending',
      requestIds: [first.requestId, second.requestId, third.requestId],
    })
    expect(writing(Data, oneFailed)).toEqual({ _tag: 'Failed', requestIds: [second.requestId] })
  })
})

describe('writing: durable writes, one outbox state each', () => {
  it.each([
    ['a write not yet sent', stored('d1'), 0, 'Sending'],
    ['a write sent and unanswered', stored('d1'), 1, 'Unanswered'],
    ['a write the server refused', stored('d1', { _tag: 'Failed', error: refused }), 0, 'Failed'],
    [
      'a write waiting for a sign-in',
      stored('d1', { _tag: 'WaitingForSignIn', error: unauthenticated }),
      0,
      'WaitingForSignIn',
    ],
    [
      'a write this version cannot read',
      { operation: 'd1', revision: 0, mutation: 'Retired', input: {}, optimistic: [], shown: [] },
      0,
      'Unreadable',
    ],
  ])('%s is %s', async (_, entry, attempt, expected) => {
    const model = attempted(await restoredFrom([entry]), attempt)
    const saying = writing(Data, model)
    expect([saying._tag, idsOf(saying)]).toEqual([expected, ['d1']])
    // The ledger holds a durable write too; it is listed once.
    expect(outboxStatus(Data, model).items).toHaveLength(1)
  })

  it('is Unanswered with the error of the last send', async () => {
    const error = { _tag: 'Unreachable', message: 'offline' }
    const model = attempted(await restoredFrom([stored('d1')]), 2, Option.some(error as never))
    expect(writing(Data, model)).toEqual({
      _tag: 'Unanswered',
      requestIds: ['d1'],
      error: Option.some(error),
    })
  })

  it('is WaitingForSignIn for a write made for someone other than who is signed in now', async () => {
    const model = await restoredFrom(
      [stored('d1', { _tag: 'Waiting' }, { madeAs: { _tag: 'Signed', key: 'User:grace' } })],
      read('User:ada'),
    )
    expect(outboxStatus(Data, model).items[0]?.state._tag).toBe('WaitingForSignIn')
    expect(writing(Data, model)).toMatchObject({ _tag: 'WaitingForSignIn', requestIds: ['d1'] })
  })

  it("is read from the outbox, so a write another tab left is the page's too", async () => {
    const model = await restoredFrom([
      stored('d1'),
      stored('d2', { _tag: 'Failed', error: refused }),
    ])
    expect(writing(Data, model)).toEqual({ _tag: 'Failed', requestIds: ['d2'] })
  })
})

describe('writing: the worst state wins', () => {
  const entries = {
    Sending: stored('Sending'),
    Unanswered: stored('Unanswered'),
    WaitingForSignIn: stored('WaitingForSignIn', {
      _tag: 'WaitingForSignIn',
      error: unauthenticated,
    }),
    Unreadable: { operation: 'Unreadable', revision: 0, mutation: 'Retired' },
    Failed: stored('Failed', { _tag: 'Failed', error: refused }),
  }
  const order = ['Failed', 'Unreadable', 'WaitingForSignIn', 'Unanswered', 'Sending'] as const

  // Unanswered is a queued write with a send behind it: patch only that one.
  const world = async (names: ReadonlyArray<keyof typeof entries>) => {
    const model = await restoredFrom(names.map(name => entries[name]))
    const queue = model.remote.outbox.queue.map(queued =>
      Queued.$match(queued, {
        Readable: readable =>
          readable.write.operation === 'Unanswered'
            ? Queued.Readable({ ...readable, attempt: 1 })
            : queued,
        Unreadable: () => queued,
      }),
    )
    return { ...model, remote: { ...model.remote, outbox: { ...model.remote.outbox, queue } } }
  }

  it.each(
    order.flatMap((worse, at) =>
      order.slice(at + 1).flatMap(better => [
        [worse, better, [worse, better]],
        [worse, better, [better, worse]],
      ]),
    ),
  )('%s over %s, in either order', async (worse, _better, names) => {
    expect(
      await world(names as ReadonlyArray<keyof typeof entries>).then(m => writing(Data, m)),
    ).toMatchObject({
      _tag: worse,
      requestIds: [worse],
    })
  })

  it('lists every write in the leading state and no other', async () => {
    const model = await world(['Sending', 'Failed', 'Unanswered', 'Failed'])
    const both = await restoredFrom([
      stored('a', { _tag: 'Failed', error: refused }),
      stored('b'),
      stored('c', { _tag: 'Failed', error: refused }),
    ])
    expect(idsOf(writing(Data, both))).toEqual(['a', 'c'])
    expect(tagged(writing(Data, model))).toBe('Failed')
  })

  it('ranks a plain failed write with the durable ones', async () => {
    const waiting = await restoredFrom([
      stored('d1', { _tag: 'WaitingForSignIn', error: unauthenticated }),
    ])
    const started = plainWrite(waiting)
    expect(tagged(writing(Data, started.model))).toBe('WaitingForSignIn')
    const refusedModel = failed(started.model, started.requestId)
    expect(writing(Data, refusedModel)).toEqual({ _tag: 'Failed', requestIds: [started.requestId] })
  })
})

describe('writing: the filter', () => {
  const mixed = async () => {
    const model = await restoredFrom([
      stored('d1', { _tag: 'Failed', error: refused }),
      { ...stored('d2'), mutation: 'Reset' },
      {
        operation: 'old-1',
        revision: 0,
        mutation: 'Retired',
        input: {},
        optimistic: [],
        shown: [],
      },
      { operation: 'old-2', revision: 0, mutation: 7 },
    ])
    return model
  }

  it('reads one Mutation by the Mutation, not by every write of the domain', async () => {
    const model = await mixed()
    expect(writing(Data, model, { mutation: SetCount })).toEqual({
      _tag: 'Failed',
      requestIds: ['d1'],
    })
    expect(writing(Data, model, { mutation: Reset })).toEqual({
      _tag: 'Sending',
      requestIds: ['d2'],
    })
  })

  it('reads a plain write of the Mutation, and none of another', () => {
    const started = plainWrite(read())
    expect(writing(Data, started.model, { mutation: SetCount })).toEqual({
      _tag: 'Sending',
      requestIds: [started.requestId],
    })
    expect(writing(Data, started.model, { mutation: Reset })).toEqual({ _tag: 'None' })
  })

  it('reads an unreadable write by the Mutation its entry names, and a nameless one by none', async () => {
    const model = await restoredFrom([
      { operation: 'old-1', revision: 0, mutation: 'Reset', input: {} },
      { operation: 'old-2', revision: 0, mutation: 7 },
    ])
    expect(writing(Data, model, { mutation: Reset })).toEqual({
      _tag: 'Unreadable',
      requestIds: ['old-1'],
    })
    expect(writing(Data, model, { mutation: SetCount })).toEqual({ _tag: 'None' })
    expect(idsOf(writing(Data, model))).toEqual(['old-1', 'old-2'])
  })

  it('refuses a Mutation the domain does not register', () => {
    const Other = Mutation.write('Other', Write.update(input, { id: 'id' }))
    // @ts-expect-error the domain registers no Mutation named Other
    expect(() => writing(Data, read(), { mutation: Other })).toThrow(/Mutation "Other"/)
  })

  it('reads the writes whose layer patches or deletes a row', async () => {
    const one = plainWrite(read(), 'i1', 2)
    const two = Data.mutate(one.model, Reset, { id: 'i2', count: 3 })
    expect(writing(Data, two.model, { row: Remote.ref(Item, 'i1') })).toEqual({
      _tag: 'Sending',
      requestIds: [one.requestId],
    })
    expect(writing(Data, two.model, { row: Remote.ref(Item, 'i3') })).toEqual({ _tag: 'None' })
    expect(writing(Data, two.model, { row: Remote.ref(Item, 'i2'), mutation: Reset })).toEqual({
      _tag: 'Sending',
      requestIds: [two.requestId],
    })
    expect(writing(Data, two.model, { row: Remote.ref(Item, 'i1'), mutation: Reset })).toEqual({
      _tag: 'None',
    })
    expect(
      writing(Data, two.model, { row: Remote.ref(Item, 'i1'), mutation: SetCount }),
    ).toMatchObject({ _tag: 'Sending' })
    // A delete is a layer of its own kind, of the row it deletes.
    const removed = Data.mutate(two.model, Remove, { id: 'i2' })
    expect(writing(Data, removed.model, { row: Remote.ref(Item, 'i2') })).toEqual({
      _tag: 'Sending',
      requestIds: [two.requestId, removed.requestId],
    })
    expect(writing(Data, removed.model, { row: Remote.ref(Item, 'i2'), mutation: Remove })).toEqual(
      { _tag: 'Sending', requestIds: [removed.requestId] },
    )
    expect(writing(Data, removed.model, { row: Remote.ref(Item, 'i1'), mutation: Remove })).toEqual(
      { _tag: 'None' },
    )
    // A refused write shows no layer, so no row is saving by it.
    const refusedModel = failed(two.model, one.requestId)
    expect(writing(Data, refusedModel, { row: Remote.ref(Item, 'i1') })).toEqual({ _tag: 'None' })
    expect(tagged(writing(Data, refusedModel))).toBe('Failed')
  })
})

describe('writing agrees with outboxStatus', () => {
  const kinds = ['Sending', 'Unanswered', 'WaitingForSignIn', 'Unreadable', 'Failed'] as const
  const entry = (kind: (typeof kinds)[number], at: number) => {
    const operation = `${kind}-${at}`
    if (kind === 'Failed') return stored(operation, { _tag: 'Failed', error: refused })
    if (kind === 'WaitingForSignIn') {
      return stored(operation, { _tag: 'WaitingForSignIn', error: unauthenticated })
    }
    if (kind === 'Unreadable') return { operation, revision: 0, mutation: 'Retired' }
    return stored(operation)
  }

  const queues: ReadonlyArray<ReadonlyArray<(typeof kinds)[number]>> = [
    [],
    ...kinds.map(kind => [kind]),
    ...kinds.flatMap(a => kinds.map(b => [a, b])),
    ...kinds.flatMap(a => kinds.flatMap(b => kinds.map(c => [a, b, c]))),
  ]

  // What `outboxStatus` says of each item, worst first.
  const worstByStatus = (model: Model): Writing => {
    const items = outboxStatus(Data, model).items.map(item => ({
      id: item.requestId,
      kind:
        item.state._tag === 'Waiting'
          ? item.state.attempt > 0
            ? 'Unanswered'
            : 'Sending'
          : item.state._tag,
    }))
    const kind = (
      ['Failed', 'Unreadable', 'WaitingForSignIn', 'Unanswered', 'Sending'] as const
    ).find(each => items.some(item => item.kind === each))
    return kind === undefined
      ? { _tag: 'None' }
      : ({
          _tag: kind,
          requestIds: items.filter(item => item.kind === kind).map(item => item.id),
          ...(kind === 'Unanswered' ? { error: Option.none() } : {}),
        } as Writing)
  }

  it('says what the status says, for every queue of up to three writes', async () => {
    for (const queue of queues) {
      const entries = queue.map((kind, at) => entry(kind, at))
      const restored = await restoredFrom(entries)
      const model = {
        ...restored,
        remote: {
          ...restored.remote,
          outbox: {
            ...restored.remote.outbox,
            queue: restored.remote.outbox.queue.map(queued =>
              Queued.$match(queued, {
                Readable: readable =>
                  readable.write.operation.startsWith('Unanswered')
                    ? Queued.Readable({ ...readable, attempt: 1 })
                    : queued,
                Unreadable: () => queued,
              }),
            ),
          } satisfies OutboxState,
        },
      }
      expect(writing(Data, model), queue.join(',')).toEqual(worstByStatus(model))
    }
  })
})
