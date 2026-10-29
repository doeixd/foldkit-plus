/**
 * The durable outbox (operations-phase7-DESIGN): a write made with
 * `durable` is queued in the Model, stored, and sent from the store in
 * order, by its operation id and its `now`, again after a reload, after a
 * send nothing answered, and never before the store holds it. A refusal
 * settles it; a write this version cannot read is kept and skipped.
 *
 * Each tab here is a Model driven through the outbox's own Subscription
 * entries, over a store the test keeps.
 */
import { Effect, Option, Schema, Stream } from 'effect'
import { KeyValueStore } from 'effect/persistence'
import { defineMessageUnion } from 'foldkit/message'
import { Entity, Order, Write } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import {
  Mutation,
  Query,
  Remote,
  RemoteClient,
  RemoteMutationError,
  RemoteUnreachable,
  terminal,
  type RemoteMessage,
} from '../src/index.js'
import { mergeStored } from '../src/outbox.js'

const Item = Entity.define('Item', Schema.Struct({ id: Schema.String, count: Schema.Number }))
const SetCount = Mutation.write(
  'SetCount',
  Write.update(Entity.input(Item, Schema.Struct({ id: Schema.String, count: Schema.Number })), {
    id: 'id',
  }),
)
const All = Query.define('All', {}, () =>
  Query.from(Item).pipe(Query.orderBy(Order.asc(Item.fields.id))),
)

const Model = Schema.Struct({ remote: Remote.Model, actor: Schema.String })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({
  model: App.model.remote,
  entities: [Item],
  queries: [All],
  mutations: [SetCount],
})

const outbox = Data.outbox({
  key: model => `outbox:${model.actor}`,
  scope: model => model.actor,
  retry: { base: '1 millis', max: '2 millis' },
})
const entries = outbox.subscriptions!

/** Ada's page before anything is read back: i1 and i2 held at 1. */
const page = (actor = 'ada'): Model =>
  Data.reduce(
    { remote: Remote.initial, actor },
    {
      _tag: 'ReadReceived',
      requests: ['i1', 'i2'].map(id => ({ entity: 'Item', id, fields: ['id', 'count'] })),
      result: {
        settled: [],
        entities: ['i1', 'i2'].map(id => ({ entity: 'Item', id, values: { id, count: 1 } })),
      },
      now: 0,
    },
  )

type Answer = 'applied' | 'unreachable' | 'refused' | 'unanswered'

/** A server answering each send as scripted (applied once the script runs out), and what reached it. */
const server = (script: ReadonlyArray<Answer> = []) => {
  const answers = [...script]
  const sent: Array<{
    readonly requestId: string
    readonly operation: string | undefined
    readonly input: unknown
    readonly now: number | undefined
  }> = []
  /** What each send says the page shows. */
  const shown: Array<unknown> = []
  const client: RemoteClient['Service'] = {
    read: () => Effect.succeed({ settled: [], entities: [] }),
    query: () => Effect.succeed({ edges: [], start: terminal, end: terminal }),
    mutate: request => {
      sent.push({
        requestId: request.requestId,
        operation: request.operation,
        input: request.input,
        now: request.now,
      })
      shown.push(request.shown)
      const answer = answers.shift() ?? 'applied'
      if (answer === 'unanswered') return Effect.never
      if (answer === 'unreachable')
        return Effect.fail(new RemoteUnreachable({ message: 'offline' }))
      if (answer === 'refused') {
        return Effect.fail(
          new RemoteMutationError({ message: 'no', refusal: { _tag: 'Conflict' } }),
        )
      }
      const input = request.input as { readonly id: string; readonly count: number }
      return Effect.succeed({
        output: {},
        entities: [{ entity: 'Item', id: input.id, values: { count: input.count } }],
        connections: [],
        deleted: [],
      })
    },
    live: () => Stream.empty,
  }
  return { sent, shown, client }
}

const memory = () =>
  Effect.runSync(
    Effect.gen(function* () {
      return yield* KeyValueStore.KeyValueStore
    }).pipe(Effect.provide(KeyValueStore.layerMemory)),
  )

interface Tab {
  readonly kv: KeyValueStore.KeyValueStore
  readonly client: RemoteClient['Service']
}

type Entry = (typeof entries)[keyof typeof entries]

/** What one entry's stream sends for the Model's dependencies, collected. */
const step = (tab: Tab, entry: Entry, model: Model): Promise<ReadonlyArray<RemoteMessage>> => {
  const dependencies = entry.modelToDependencies(model)
  return Effect.runPromise(
    Stream.runCollect(
      entry.dependenciesToStream(dependencies as never, () => dependencies as never),
    ).pipe(
      Effect.provideService(KeyValueStore.KeyValueStore, tab.kv),
      Effect.provideService(RemoteClient, tab.client),
    ),
  ).then(collected => [...collected] as ReadonlyArray<RemoteMessage>)
}

/** The page with its restore run, as a runtime's flags would. */
const restored = (tab: Tab, model: Model = page(), wiring = outbox) =>
  Effect.runPromise(
    wiring.restore(model).pipe(Effect.provideService(KeyValueStore.KeyValueStore, tab.kv)),
  )

/**
 * Runs the restore, save and send entries as the runtime does, each when its
 * dependencies change, until none does.
 */
const settle = async (tab: Tab, start: Model, running = entries): Promise<Model> => {
  let model = start
  const ran = new Map<string, string>()
  for (let pass = 0; pass < 30; pass++) {
    let changed = false
    for (const name of ['outbox.restore', 'outbox.save', 'outbox.send'] as const) {
      const dependencies = JSON.stringify(running[name]!.modelToDependencies(model))
      if (ran.get(name) === dependencies) continue
      ran.set(name, dependencies)
      changed = true
      model = (await step(tab, running[name]!, model)).reduce(Data.reduce, model)
    }
    if (!changed) return model
  }
  throw new Error('the outbox did not settle')
}

/** The entries the store holds now, by operation. */
const storedOperations = (kv: KeyValueStore.KeyValueStore): ReadonlyArray<string> => {
  const text = Effect.runSync(kv.get('outbox:ada'))
  return text === undefined
    ? []
    : (JSON.parse(text) as { entries: ReadonlyArray<{ operation: string }> }).entries.map(
        entry => entry.operation,
      )
}

const Counted = Entity.select(Item, { count: true })
const count = (model: Model, id: string) => {
  const read = Data.get(Counted, id).read(model)
  return read._tag === 'Ready' || read._tag === 'Refreshing' ? read.value.count : read._tag
}

const setCount = (model: Model, id: string, value: number, now = 1000) =>
  Data.mutate(model, SetCount, { id, count: value }, { durable: true, now })

describe('a durable write', () => {
  it('needs the outbox restore first, and says so', () => {
    expect(() => setCount(page(), 'i1', 2)).toThrow(/outbox's restore/)
  })

  it('is queued, not sent: its id is its operation, its layer shows, and its Command sends nothing', async () => {
    const tab = { kv: memory(), ...server() }
    const started = setCount(await restored(tab), 'i1', 2)
    expect(started.requestId).toMatch(/^.+-\d+$/)
    expect(count(started.model, 'i1')).toBe(2)
    expect(Data.mutation(started.model, started.requestId)).toEqual({ _tag: 'Pending' })
    expect(
      await Effect.runPromise(
        started.command.effect.pipe(Effect.provideService(RemoteClient, tab.client)),
      ),
    ).toEqual({ _tag: 'MutationQueued', requestId: started.requestId })
    expect(tab.sent).toEqual([])
    expect(Data.outboxStatus(started.model)).toMatchObject({ waiting: 1, failed: 0 })
  })

  it('is sent only once the store holds it', async () => {
    const tab = { kv: memory(), ...server() }
    const started = setCount(await restored(tab), 'i1', 2)
    expect(await step(tab, entries['outbox.send']!, started.model)).toEqual([])
    const saved = (await step(tab, entries['outbox.save']!, started.model)).reduce(
      Data.reduce,
      started.model,
    )
    expect(await Effect.runPromise(tab.kv.get('outbox:ada'))).toContain(started.requestId)
    expect(await step(tab, entries['outbox.send']!, saved)).toMatchObject([
      { _tag: 'MutationSucceeded', requestId: started.requestId },
    ])
  })

  it('is sent with its operation id and its now, and settles from the store and the page', async () => {
    const tab = { kv: memory(), ...server() }
    const started = setCount(await restored(tab), 'i1', 2, 1234)
    const settled = await settle(tab, started.model)
    expect(tab.sent).toEqual([
      {
        requestId: started.requestId,
        operation: started.requestId,
        input: { id: 'i1', count: 2 },
        now: 1234,
      },
    ])
    // What its layer showed, though no Surface reads it, for the answer to read back (#265).
    expect(tab.shown).toEqual([[{ entity: 'Item', fields: ['count'] }]])
    expect(count(settled, 'i1')).toBe(2)
    expect(Data.mutation(settled, started.requestId)).toEqual({ _tag: 'Applied' })
    expect(Data.outboxStatus(settled)).toEqual({ waiting: 0, failed: 0, items: [] })
    expect(storedOperations(tab.kv)).toEqual([])
  })

  it('survives a reload: a new page shows it and sends it with the same operation and now', async () => {
    const kv = memory()
    const before = { kv, ...server(['unanswered']) }
    const started = setCount(await restored(before), 'i1', 2, 1234)
    // Stored and sent, and the page goes before the answer.
    const saved = (await step(before, entries['outbox.save']!, started.model)).reduce(
      Data.reduce,
      started.model,
    )
    const dependencies = entries['outbox.send']!.modelToDependencies(saved)
    await Effect.runPromise(
      Stream.runCollect(
        entries['outbox.send']!.dependenciesToStream(dependencies, () => dependencies),
      ).pipe(
        Effect.timeoutOption('20 millis'),
        Effect.provideService(KeyValueStore.KeyValueStore, kv),
        Effect.provideService(RemoteClient, before.client),
      ),
    )
    expect(before.sent).toHaveLength(1)

    const after = { kv, ...server() }
    const reloaded = await restored(after)
    expect(count(reloaded, 'i1')).toBe(2)
    expect(Data.outboxStatus(reloaded).items).toMatchObject([
      { requestId: started.requestId, mutation: Option.some('SetCount') },
    ])
    expect(reloaded.remote.outbox.session).not.toEqual(started.model.remote.outbox.session)
    const settled = await settle(after, reloaded)
    expect(after.sent).toEqual([
      {
        requestId: started.requestId,
        operation: started.requestId,
        input: { id: 'i1', count: 2 },
        now: 1234,
      },
    ])
    expect(count(settled, 'i1')).toBe(2)
    expect(Data.outboxStatus(settled).items).toEqual([])
  })

  it('is sent again after a send nothing answered, and those after it wait their turn', async () => {
    const tab = { kv: memory(), ...server(['unreachable', 'unreachable']) }
    const first = setCount(await restored(tab), 'i1', 2)
    const second = setCount(first.model, 'i2', 3)
    const saved = (await step(tab, entries['outbox.save']!, second.model)).reduce(
      Data.reduce,
      second.model,
    )
    const messages = await step(tab, entries['outbox.send']!, saved)
    expect(messages.map(message => message._tag)).toEqual([
      'OutboxDelayed',
      'OutboxDelayed',
      'MutationSucceeded',
    ])
    const delayed = messages.slice(0, 1).reduce(Data.reduce, saved)
    expect(Data.outboxStatus(delayed).items[0]?.state).toMatchObject({
      _tag: 'Waiting',
      attempt: 1,
    })
    expect(tab.sent.map(each => each.requestId)).toEqual([
      first.requestId,
      first.requestId,
      first.requestId,
    ])
    await settle(tab, messages.reduce(Data.reduce, saved))
    expect(tab.sent.map(each => each.requestId)).toEqual([
      first.requestId,
      first.requestId,
      first.requestId,
      second.requestId,
    ])
  })

  it('refused, settles failed: listed, retried as itself, dismissed from the store', async () => {
    const tab = { kv: memory(), ...server(['refused']) }
    const first = setCount(await restored(tab), 'i1', 2)
    const second = setCount(first.model, 'i2', 3)
    const settled = await settle(tab, second.model)
    // The refusal held nothing back.
    expect(tab.sent.map(each => each.requestId)).toEqual([first.requestId, second.requestId])
    expect(count(settled, 'i1')).toBe(1)
    expect(Data.failedWrites(settled).map(write => write.requestId)).toEqual([first.requestId])
    expect(Data.outboxStatus(settled)).toMatchObject({ waiting: 0, failed: 1 })
    expect(await Effect.runPromise(tab.kv.get('outbox:ada'))).toContain('"Failed"')

    const retried = Option.getOrThrow(Data.retry(settled, first.requestId))
    expect(count(retried.model, 'i1')).toBe(2)
    expect(Data.outboxStatus(retried.model)).toMatchObject({ waiting: 1, failed: 0 })
    const again = await settle(tab, retried.model)
    expect(tab.sent.map(each => each.requestId)).toEqual([
      first.requestId,
      second.requestId,
      first.requestId,
    ])
    expect(Data.outboxStatus(again).items).toEqual([])

    const refusedAgain = { kv: memory(), ...server(['refused']) }
    const failed = await settle(refusedAgain, setCount(await restored(refusedAgain), 'i1', 2).model)
    const [item] = Data.outboxStatus(failed).items
    const dismissed = await settle(refusedAgain, Data.dismiss(failed, item!.requestId))
    expect(Data.outboxStatus(dismissed).items).toEqual([])
    expect(Data.failedWrites(dismissed)).toEqual([])
    expect(storedOperations(refusedAgain.kv)).toEqual([])
  })

  it('refused where the sender could not write it, is written by the page, so a reload does not send it', async () => {
    const kv = memory()
    let sets = 0
    // The sender's write of the refusal is the second write to the store, and fails.
    const flaky: KeyValueStore.KeyValueStore = {
      ...kv,
      set: (key, value) =>
        ++sets === 2
          ? Effect.fail(
              new KeyValueStore.KeyValueStoreError({ message: 'busy', method: 'set', key }),
            )
          : kv.set(key, value),
    }
    const tab = { kv: flaky, ...server(['refused']) }
    await settle(tab, setCount(await restored(tab), 'i1', 2).model)
    const reloaded = { kv, ...server() }
    const model = await restored(reloaded)
    expect(Data.outboxStatus(model)).toMatchObject({ waiting: 0, failed: 1 })
    await settle(reloaded, model)
    expect(reloaded.sent).toEqual([])
  })

  it('a waiting write cannot be dismissed: it may be on its way', async () => {
    const tab = { kv: memory(), ...server() }
    const started = setCount(await restored(tab), 'i1', 2)
    expect(Data.dismiss(started.model, started.requestId)).toBe(started.model)
  })
})

/** A store holding `entries` for ada, as an earlier version left it. */
const storeHolding = (entries: ReadonlyArray<unknown>) => {
  const kv = memory()
  Effect.runSync(
    kv.set('outbox:ada', JSON.stringify({ version: 1, scope: 'ada', entries, done: [] })),
  )
  return kv
}

const storedWrite = (operation: string, mutation: string, input: unknown) => ({
  operation,
  mutation,
  input,
  optimistic: [],
  shown: [],
  revision: 0,
  state: { _tag: 'Waiting' },
})

describe('a stored write this version cannot read', () => {
  it.each([
    ['names a Mutation it does not register', storedWrite('old-1', 'Retired', {})],
    ['holds an input that no longer decodes', storedWrite('old-1', 'SetCount', { id: 'i1' })],
    ['is in a shape it cannot read', { operation: 'old-1', revision: 0, mutation: 7 }],
  ])('%s: kept, reported once, never sent, and the rest are', async (_, unreadable) => {
    const kv = storeHolding([unreadable, storedWrite('old-2', 'SetCount', { id: 'i2', count: 5 })])
    const tab = { kv, ...server() }
    const model = await restored(tab)
    expect(Data.outboxStatus(model).items).toMatchObject([
      { requestId: 'old-1', state: { _tag: 'Unreadable' } },
      { requestId: 'old-2', state: { _tag: 'Waiting' } },
    ])
    expect(count(model, 'i2')).toBe(1)
    expect(Data.inspect(model).diagnostics).toMatchObject([
      { _tag: 'OutboxUnreadable', requestId: 'old-1' },
    ])
    const settled = await settle(tab, model)
    expect(tab.sent.map(each => each.requestId)).toEqual(['old-2'])
    expect(Data.outboxStatus(settled).items).toMatchObject([{ requestId: 'old-1' }])
    expect(Data.inspect(settled).diagnostics).toHaveLength(1)
    expect(storedOperations(kv)).toEqual(['old-1'])

    const dismissed = await settle(tab, Data.dismiss(settled, 'old-1'))
    expect(Data.outboxStatus(dismissed).items).toEqual([])
    expect(storedOperations(kv)).toEqual([])
  })

  it('drops an entry that is not an operation at all', async () => {
    const tab = { kv: storeHolding([{ nothing: true }]), ...server() }
    expect(Data.outboxStatus(await restored(tab)).items).toEqual([])
  })
})

describe('the store between tabs', () => {
  it('merges two copies saved at once: both writes kept, the higher revision of each, none settled', () => {
    const a = storedWrite('a-1', 'SetCount', { id: 'i1', count: 2 })
    const b = storedWrite('b-1', 'SetCount', { id: 'i2', count: 3 })
    const failedA = {
      ...a,
      revision: 1,
      state: { _tag: 'Failed', error: { _tag: 'X', message: 'no' } },
    }
    expect(mergeStored({ entries: [a], done: [] }, { entries: [b], done: [] })).toEqual({
      entries: [a, b],
      done: [],
    })
    expect(
      mergeStored({ entries: [failedA, b], done: [] }, { entries: [a], done: [] }).entries,
    ).toEqual([failedA, b])
    expect(
      mergeStored({ entries: [a, b], done: ['b-1'] }, { entries: [a], done: [] }).entries,
    ).toEqual([a])
  })

  it('shows a write another tab queued, as its own', async () => {
    const kv = storeHolding([
      {
        ...storedWrite('other-1', 'SetCount', { id: 'i2', count: 7 }),
        optimistic: [{ entity: 'Item', id: 'i2', values: { count: 7 } }],
      },
    ])
    const model = await restored({ kv, ...server() })
    expect(count(model, 'i2')).toBe(7)
    expect(Data.mutation(model, 'other-1')).toEqual({ _tag: 'Pending' })
  })

  it('a write another tab settled goes, and what it showed is asked for again', async () => {
    const kv = memory()
    const tab = { kv, ...server() }
    const started = setCount(await restored(tab), 'i1', 2)
    const saved = (await step(tab, entries['outbox.save']!, started.model)).reduce(
      Data.reduce,
      started.model,
    )
    // Another tab sent it and wrote the outcome; this page missed the answer.
    const heard = Data.reduce(saved, {
      _tag: 'OutboxRead',
      key: 'outbox:ada',
      scope: 'ada',
      entries: [],
      done: [started.requestId],
    })
    expect(Data.outboxStatus(heard).items).toEqual([])
    expect(count(heard, 'i1')).toBe(1)
    expect(Data.get(Counted, 'i1').read(heard)._tag).toBe('Refreshing')
  })

  it('a sender that finds the write settled by another tab sends nothing', async () => {
    const kv = memory()
    const tab = { kv, ...server() }
    const started = setCount(await restored(tab), 'i1', 2)
    const saved = (await step(tab, entries['outbox.save']!, started.model)).reduce(
      Data.reduce,
      started.model,
    )
    Effect.runSync(
      kv.set(
        'outbox:ada',
        JSON.stringify({ version: 1, scope: 'ada', entries: [], done: [started.requestId] }),
      ),
    )
    const messages = await step(tab, entries['outbox.send']!, saved)
    expect(tab.sent).toEqual([])
    expect(messages).toMatchObject([{ _tag: 'OutboxRead', done: [started.requestId] }])
  })

  it('reads another scope’s queue as empty', async () => {
    const kv = memory()
    Effect.runSync(
      kv.set(
        'outbox:ada',
        JSON.stringify({
          version: 1,
          scope: 'grace',
          entries: [storedWrite('g-1', 'SetCount', { id: 'i1', count: 9 })],
          done: [],
        }),
      ),
    )
    expect(Data.outboxStatus(await restored({ kv, ...server() })).items).toEqual([])
  })

  it('forget empties the queue and keeps the session', async () => {
    const tab = { kv: memory(), ...server() }
    const started = setCount(await restored(tab), 'i1', 2)
    const forgotten = Data.forget(started.model)
    expect(Data.outboxStatus(forgotten).items).toEqual([])
    expect(forgotten.remote.outbox.session).toEqual(started.model.remote.outbox.session)
    expect(forgotten.remote.outbox.key).toEqual(Option.none())
  })
})

/**
 * #284: a write is made as someone, and is never sent as anyone else. Here
 * the key is one for every principal, so only the scope tells whose it is.
 */
describe('a change of principal in the same page', () => {
  const shared = Data.outbox({
    key: () => 'outbox:shared',
    scope: model => model.actor,
    retry: { base: '1 millis', max: '2 millis' },
  })
  const running = shared.subscriptions!
  const waiting = (kv: KeyValueStore.KeyValueStore) =>
    JSON.parse(Effect.runSync(kv.get('outbox:shared'))!) as {
      readonly scope: string
      readonly entries: ReadonlyArray<{ readonly operation: string }>
    }

  /** Ada's write, stored and not yet sent, in a page that then becomes Grace's. */
  const adaWaiting = async (tab: Tab) => {
    const started = setCount(await restored(tab, page('ada'), shared), 'i1', 2)
    const saved = (await step(tab, running['outbox.save']!, started.model)).reduce(
      Data.reduce,
      started.model,
    )
    return { saved, operation: started.requestId }
  }

  it.each([
    ['as it is', (model: Model) => ({ ...model, actor: 'grace' })],
    ['forgotten', (model: Model) => Data.forget({ ...model, actor: 'grace' })],
  ])('sends none of the old queue %s, and keeps it in the store for its own', async (_, become) => {
    const tab = { kv: memory(), ...server() }
    const { saved, operation } = await adaWaiting(tab)
    const grace = await settle(tab, become(saved), running)
    expect(tab.sent).toEqual([])
    expect(Data.outboxStatus(grace).items).toEqual([])
    expect(waiting(tab.kv)).toMatchObject({ scope: 'ada', entries: [{ operation }] })
    // Writing Grace's queue over it would lose Ada's write: the save says so instead.
    expect(Data.inspect(grace).diagnostics).toMatchObject([{ _tag: 'OutboxUnsaved' }])
    // Ada back, on a page of her own, sends it as herself.
    const back = { kv: tab.kv, ...server() }
    await settle(back, await restored(back, page('ada'), shared), running)
    expect(back.sent.map(write => write.operation)).toEqual([operation])
  })
})

describe('a store that cannot be written', () => {
  it('still sends, and says a reload would lose the write', async () => {
    const kv = memory()
    const full: KeyValueStore.KeyValueStore = {
      ...kv,
      set: key =>
        Effect.fail(new KeyValueStore.KeyValueStoreError({ message: 'full', method: 'set', key })),
    }
    const tab = { kv: full, ...server() }
    const started = setCount(await restored(tab), 'i1', 2)
    const settled = await settle(tab, started.model)
    expect(tab.sent.map(each => each.requestId)).toEqual([started.requestId])
    expect(Data.inspect(settled).diagnostics).toMatchObject([
      { _tag: 'OutboxUnsaved', key: 'outbox:ada', reason: 'full' },
    ])
  })
})
