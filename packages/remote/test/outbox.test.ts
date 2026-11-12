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
  RemoteForbidden,
  RemoteMutationError,
  RemotePrincipalChanged,
  RemoteUnauthenticated,
  RemoteUnreachable,
  terminal,
  type RemoteMessage,
} from '../src/index.js'
import { outbox, outboxStatus } from '../src/outbox.js'
import { mergeStored, storedChange } from '../src/outboxStore.js'
import { pageMessage } from '../src/domain.js'
import type { MadeAs } from '../src/queue.js'

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

const durable = outbox(Data, {
  key: model => `outbox:${model.actor}`,
  scope: model => model.actor,
  retry: { base: '1 millis', max: '2 millis' },
})
const entries = durable.subscriptions!

/**
 * Ada's page before anything is read back: i1 and i2 held at 1, read by an
 * answer that named `principal` (the wire's `null` a visitor), or no one.
 */
const page = (actor = 'ada', principal?: string | null): Model =>
  Data.reduce(
    { remote: Remote.initial, actor },
    {
      _tag: 'ReadReceived',
      requests: ['i1', 'i2'].map(id => ({ entity: 'Item', id, fields: ['id', 'count'] })),
      result: {
        settled: [],
        entities: ['i1', 'i2'].map(id => ({ entity: 'Item', id, values: { id, count: 1 } })),
        ...(principal === undefined ? {} : { principal }),
      },
      now: 0,
      generation: 0,
    },
  )

type Answer =
  | 'applied'
  | 'unreachable'
  | 'refused'
  | 'unanswered'
  | 'signedOut'
  | 'forbidden'
  | 'died'

/**
 * A server answering each send as scripted (applied once the script runs
 * out), and what reached it. Given `cookie`, it answers as whom the cookie
 * names now (`null` a visitor), as `RemoteServer.handlers` does: a write made
 * for anyone else is refused before it runs, and `ran` counts what ran.
 */
const server = (script: ReadonlyArray<Answer> = [], cookie?: { current: string | null }) => {
  const answers = [...script]
  const sent: Array<{
    readonly requestId: string
    readonly operation: string | undefined
    readonly input: unknown
    readonly now: number | undefined
    readonly principal?: string | null | undefined
  }> = []
  const ran: Array<string> = []
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
        ...(request.principal === undefined ? {} : { principal: request.principal }),
      })
      shown.push(request.shown)
      // As `RemoteServer.handlers` judges `principal`: `null` a visitor's write.
      if (cookie !== undefined && request.principal !== undefined) {
        if (request.principal !== null && cookie.current === null) {
          return Effect.fail(new RemoteUnauthenticated({ message: 'Sign in.' }))
        }
        if (cookie.current !== request.principal) {
          return Effect.fail(new RemotePrincipalChanged({ message: 'Someone else' }))
        }
      }
      const answer = answers.shift() ?? 'applied'
      if (answer === 'unanswered') return Effect.never
      if (answer === 'died') return Effect.die(new Error('mutate broke'))
      if (answer === 'unreachable')
        return Effect.fail(new RemoteUnreachable({ message: 'offline' }))
      if (answer === 'refused') {
        return Effect.fail(
          new RemoteMutationError({ message: 'no', refusal: { _tag: 'Conflict' } }),
        )
      }
      if (answer === 'signedOut') {
        return Effect.fail(new RemoteUnauthenticated({ message: 'Your session ended.' }))
      }
      if (answer === 'forbidden') return Effect.fail(new RemoteForbidden({ message: 'Not yours' }))
      const input = request.input as { readonly id: string; readonly count: number }
      ran.push(request.requestId)
      return Effect.succeed({
        output: {},
        entities: [{ entity: 'Item', id: input.id, values: { count: input.count } }],
        connections: [],
        deleted: [],
        ...(cookie === undefined ? {} : { principal: cookie.current }),
      })
    },
    live: () => Stream.empty,
  }
  return { sent, shown, ran, client }
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
const restored = (tab: Tab, model: Model = page(), wiring = durable) =>
  Effect.runPromise(
    wiring.restore(model).pipe(Effect.provideService(KeyValueStore.KeyValueStore, tab.kv)),
  )

/**
 * Runs the restore, save and send entries as the runtime does, each when its
 * dependencies change, until none does.
 */
const settle = async (
  tab: Tab,
  start: Model,
  running = entries,
  heard: Array<RemoteMessage> = [],
  order: ReadonlyArray<keyof typeof entries> = [
    'outbox.restore',
    'outbox.save',
    'outbox.send',
    'outbox.adopt',
    'outbox.hold',
  ],
): Promise<Model> => {
  let model = start
  const ran = new Map<string, string>()
  for (let pass = 0; pass < 30; pass++) {
    let changed = false
    for (const name of order) {
      const dependencies = JSON.stringify(running[name]!.modelToDependencies(model))
      if (ran.get(name) === dependencies) continue
      ran.set(name, dependencies)
      changed = true
      const messages = await step(tab, running[name]!, model)
      heard.push(...messages)
      model = messages.reduce(Data.reduce, model)
    }
    if (!changed) return model
  }
  throw new Error('the outbox did not settle')
}

/** The entries the store holds now, by operation. */
const storedOperations = (
  kv: KeyValueStore.KeyValueStore,
  key = 'outbox:ada',
): ReadonlyArray<string> => {
  const text = Effect.runSync(kv.get(key))
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
    expect(outboxStatus(Data, started.model)).toMatchObject({ waiting: 1, failed: 0 })
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
    expect(outboxStatus(Data, settled)).toEqual({
      waiting: 0,
      failed: 0,
      waitingForSignIn: 0,
      items: [],
    })
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
    expect(outboxStatus(Data, reloaded).items).toMatchObject([
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
    expect(outboxStatus(Data, settled).items).toEqual([])
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
    expect(outboxStatus(Data, delayed).items[0]?.state).toMatchObject({
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
    expect(outboxStatus(Data, settled)).toMatchObject({ waiting: 0, failed: 1 })
    expect(await Effect.runPromise(tab.kv.get('outbox:ada'))).toContain('"Failed"')

    const retried = Option.getOrThrow(Data.retry(settled, first.requestId))
    expect(count(retried.model, 'i1')).toBe(2)
    expect(outboxStatus(Data, retried.model)).toMatchObject({ waiting: 1, failed: 0 })
    const again = await settle(tab, retried.model)
    expect(tab.sent.map(each => each.requestId)).toEqual([
      first.requestId,
      second.requestId,
      first.requestId,
    ])
    expect(outboxStatus(Data, again).items).toEqual([])

    const refusedAgain = { kv: memory(), ...server(['refused']) }
    const failed = await settle(refusedAgain, setCount(await restored(refusedAgain), 'i1', 2).model)
    const [item] = outboxStatus(Data, failed).items
    const dismissed = await settle(refusedAgain, Data.dismiss(failed, item!.requestId))
    expect(outboxStatus(Data, dismissed).items).toEqual([])
    expect(Data.failedWrites(dismissed)).toEqual([])
    expect(storedOperations(refusedAgain.kv)).toEqual([])
  })

  it('whose send dies, settles failed rather than waiting for good', async () => {
    const tab = { kv: memory(), ...server(['died']) }
    const first = setCount(await restored(tab), 'i1', 2)
    const settled = await settle(tab, first.model)
    expect(Data.failedWrites(settled).map(write => write.requestId)).toEqual([first.requestId])
    expect(outboxStatus(Data, settled)).toMatchObject({ waiting: 0, failed: 1 })
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
    expect(outboxStatus(Data, model)).toMatchObject({ waiting: 0, failed: 1 })
    await settle(reloaded, model)
    expect(reloaded.sent).toEqual([])
  })

  it('a waiting write cannot be dismissed: it may be on its way', async () => {
    const tab = { kv: memory(), ...server() }
    const started = setCount(await restored(tab), 'i1', 2)
    expect(Data.dismiss(started.model, started.requestId)).toBe(started.model)
  })
})

/**
 * #403: a write the server answers `Unauthenticated` (no one signed in, a
 * session that ended) waits for a sign-in, and holds the writes after it;
 * one it answers `Forbidden` (someone refused) settles failed.
 */
describe('a durable write no one is signed in to send', () => {
  /** Ada's three writes, the session ending under the second: i1 to 2, then i2 to 3 and 4. */
  const expired = async () => {
    const tab = { kv: memory(), ...server(['applied', 'signedOut']) }
    const first = setCount(await restored(tab), 'i1', 2)
    const second = setCount(first.model, 'i2', 3)
    const third = setCount(second.model, 'i2', 4)
    const waiting = await settle(tab, third.model)
    return { tab, waiting, ids: [first, second, third].map(started => started.requestId) }
  }

  it('waits for a sign-in, shown and pending, and holds the writes after it in order', async () => {
    const { tab, waiting, ids } = await expired()
    expect(tab.sent.map(each => each.requestId)).toEqual([ids[0], ids[1]])
    expect(outboxStatus(Data, waiting)).toMatchObject({
      waiting: 1,
      failed: 0,
      waitingForSignIn: 1,
      items: [
        {
          requestId: ids[1],
          state: { _tag: 'WaitingForSignIn', error: { _tag: 'Unauthenticated' } },
        },
        { requestId: ids[2], state: { _tag: 'Waiting' } },
      ],
    })
    // Both layers still shown, the later one over the earlier.
    expect(count(waiting, 'i2')).toBe(4)
    expect(Data.mutation(waiting, ids[1]!)).toEqual({ _tag: 'Pending' })
    expect(Data.failedWrites(waiting)).toEqual([])
    expect(await Effect.runPromise(tab.kv.get('outbox:ada'))).toContain('"WaitingForSignIn"')
    // It is not the reader's to drop: it waits for them to sign in.
    expect(Data.dismiss(waiting, ids[1]!)).toBe(waiting)
    // Nothing else sends it.
    await settle(tab, waiting)
    expect(tab.sent).toHaveLength(2)
  })

  it('a sign-in sends it again as itself, then those held behind it, in order', async () => {
    const { tab, waiting, ids } = await expired()
    const resumed = await settle(tab, Data.signedIn(waiting))
    expect(tab.sent.map(each => each.requestId)).toEqual([ids[0], ids[1], ids[1], ids[2]])
    expect(tab.sent[2]).toEqual(tab.sent[1])
    expect(outboxStatus(Data, resumed).items).toEqual([])
    expect(count(resumed, 'i2')).toBe(4)
    expect(storedOperations(tab.kv)).toEqual([])
    // With nothing waiting for one, a sign-in changes nothing.
    expect(Data.signedIn(resumed)).toBe(resumed)
  })

  it('a reload keeps it waiting, and sends it only once a sign-in is reported', async () => {
    const { tab, ids } = await expired()
    const after = { kv: tab.kv, ...server() }
    const reloaded = await settle(after, await restored(after))
    expect(after.sent).toEqual([])
    expect(outboxStatus(Data, reloaded)).toMatchObject({ waiting: 1, waitingForSignIn: 1 })
    expect(count(reloaded, 'i2')).toBe(4)
    await settle(after, Data.signedIn(reloaded))
    expect(after.sent.map(each => each.requestId)).toEqual([ids[1], ids[2]])
  })

  it('Forbidden still settles it failed, and holds nothing back', async () => {
    const tab = { kv: memory(), ...server(['forbidden']) }
    const first = setCount(await restored(tab), 'i1', 2)
    const second = setCount(first.model, 'i2', 3)
    const settled = await settle(tab, second.model)
    expect(tab.sent.map(each => each.requestId)).toEqual([first.requestId, second.requestId])
    expect(outboxStatus(Data, settled)).toMatchObject({
      waiting: 0,
      failed: 1,
      waitingForSignIn: 0,
      items: [
        { requestId: first.requestId, state: { _tag: 'Failed', error: { _tag: 'Forbidden' } } },
      ],
    })
    expect(count(settled, 'i1')).toBe(1)
    // A sign-in does not send a refused write again.
    await settle(tab, Data.signedIn(settled))
    expect(tab.sent).toHaveLength(2)
  })

  it('another principal never sends it, signed in or not; its own sends it once signed in', async () => {
    const { tab, waiting, ids } = await expired()
    // Grace signs in on the same page: her queue is read, and Ada's is not sent.
    const grace = await settle(tab, Data.signedIn({ ...waiting, actor: 'grace' }))
    expect(tab.sent).toHaveLength(2)
    expect(outboxStatus(Data, grace).items).toEqual([])
    // On a page of her own too.
    const reloaded = { kv: tab.kv, ...server() }
    await settle(reloaded, Data.signedIn(await restored(reloaded, page('grace'))))
    expect(reloaded.sent).toEqual([])
    // Ada, signed in again, sends hers.
    await settle(reloaded, Data.signedIn(await restored(reloaded, page('ada'))))
    expect(reloaded.sent.map(each => each.requestId)).toEqual([ids[1], ids[2]])
  })
})

/**
 * #405: a durable write carries whom the server last said it answered as,
 * and the server refuses it as anyone else: the outbox keeps it waiting for
 * them. A visitor's moves to whoever signs in first.
 */
describe('a durable write made for someone', () => {
  /** Each stored entry's operation and who it was made for. */
  const stamped = (kv: KeyValueStore.KeyValueStore, key: string) =>
    (
      JSON.parse(Effect.runSync(kv.get(key)) ?? '{"entries":[]}') as {
        entries: ReadonlyArray<{ operation: string; madeAs?: unknown }>
      }
    ).entries.map(({ operation, madeAs }) => ({ operation, madeAs }))

  /** `model` having heard an answer for `principal`. */
  const answeredAs = (
    model: Model,
    principal: string | null,
    generation = model.remote.refresh.floor,
  ): Model =>
    Data.reduce(model, {
      _tag: 'ReadReceived',
      requests: [],
      result: { entities: [], settled: [], principal },
      now: 0,
      generation,
    })

  const moves = (heard: ReadonlyArray<RemoteMessage>) =>
    heard.filter(message => message._tag === 'OutboxMoved')

  it('is sent naming them, and runs when they ask', async () => {
    const cookie = { current: 'User:ada' }
    const tab = { kv: memory(), ...server([], cookie) }
    const started = setCount(await restored(tab, page('ada', 'User:ada')), 'i1', 2)
    const settled = await settle(tab, started.model)
    expect(tab.sent.map(each => each.principal)).toEqual(['User:ada'])
    expect(tab.ran).toEqual([started.requestId])
    expect(count(settled, 'i1')).toBe(2)
  })

  it('is refused under a stale scope and another cookie, runs nothing, and waits for them', async () => {
    // The page still holds Ada's scope; the cookie is Grace's now.
    const cookie = { current: 'User:ada' }
    const tab = { kv: memory(), ...server([], cookie) }
    const started = setCount(await restored(tab, page('ada', 'User:ada')), 'i1', 2)
    cookie.current = 'User:grace'
    const waiting = await settle(tab, started.model)
    expect(tab.sent.map(each => each.principal)).toEqual(['User:ada'])
    expect(tab.ran).toEqual([])
    expect(outboxStatus(Data, waiting)).toMatchObject({
      waiting: 0,
      waitingForSignIn: 1,
      items: [
        {
          requestId: started.requestId,
          state: { _tag: 'WaitingForSignIn', error: { _tag: 'PrincipalChanged' } },
        },
      ],
    })
    expect(count(waiting, 'i1')).toBe(2)
    expect(Data.mutation(waiting, started.requestId)).toEqual({ _tag: 'Pending' })
    // A sign-in reported while Grace is still signed in is refused again.
    const again = await settle(tab, Data.signedIn(waiting))
    expect(tab.sent).toHaveLength(2)
    expect(tab.ran).toEqual([])
    expect(outboxStatus(Data, again).waitingForSignIn).toBe(1)
    // Ada back: sent as her, and run.
    cookie.current = 'User:ada'
    const resumed = await settle(tab, Data.signedIn(again))
    expect(tab.ran).toEqual([started.requestId])
    expect(outboxStatus(Data, resumed).items).toEqual([])
  })

  it('keeps who it was made for through a refusal and a retry', async () => {
    const cookie = { current: 'User:ada' }
    const tab = { kv: memory(), ...server(['refused'], cookie) }
    const started = setCount(await restored(tab, page('ada', 'User:ada')), 'i1', 2)
    const failed = await settle(tab, started.model)
    // An answer for Grace lands before the retry: the retry is still Ada's,
    // held while Grace is who the page heard, and sent as Ada once she is again.
    const retried = Option.getOrThrow(
      Data.retry(answeredAs(failed, 'User:grace'), started.requestId),
    )
    const held = await settle(tab, retried.model)
    expect(tab.sent.map(each => each.principal)).toEqual(['User:ada'])
    await settle(tab, answeredAs(held, 'User:ada'))
    expect(tab.sent.map(each => each.principal)).toEqual(['User:ada', 'User:ada'])
  })

  it('carries no one when no answer said who, and runs as whoever asks', async () => {
    const cookie = { current: 'User:grace' }
    const tab = { kv: memory(), ...server([], cookie) }
    const started = setCount(await restored(tab, page('ada')), 'i1', 2)
    await settle(tab, started.model)
    expect(tab.sent.map(each => each.principal)).toEqual([undefined])
    expect(tab.ran).toEqual([started.requestId])
  })

  it('is made for whom the latest answer named: a read, a list', async () => {
    const tab = { kv: memory(), ...server() }
    // A visitor's page, then answers for Ada, Grace and Ada again.
    const visitor = await restored(tab, page('ada', null))
    const ada = setCount(answeredAs(visitor, 'User:ada'), 'i1', 2)
    const grace = setCount(answeredAs(ada.model, 'User:grace'), 'i1', 3)
    const listed = setCount(
      Data.reduce(
        grace.model,
        pageMessage(
          'All',
          { edges: [], start: terminal, end: terminal, principal: 'User:ada' },
          false,
          {},
          undefined,
          undefined,
          grace.model.remote.refresh.floor,
        ),
      ),
      'i1',
      4,
    )
    await settle(tab, listed.model)
    // Ada's first is sent; Grace's is held while Ada is who the page heard, and Ada's last behind it.
    expect(tab.sent.map(each => each.principal)).toEqual(['User:ada'])
    expect(stamped(tab.kv, 'outbox:ada').map(({ madeAs }) => madeAs)).toEqual([
      { _tag: 'Signed', key: 'User:grace' },
      { _tag: 'Signed', key: 'User:ada' },
    ])
  })

  it("learns who from a write's answer; forgotten, takes whom its queue last heard", async () => {
    const cookie = { current: 'User:ada' }
    const tab = { kv: memory(), ...server([], cookie) }
    const first = setCount(await restored(tab, page('ada')), 'i1', 2)
    const answered = await settle(tab, first.model)
    const second = setCount(answered, 'i1', 3)
    const settled = await settle(tab, second.model)
    const third = setCount(Data.forget(settled), 'i2', 4)
    await settle(tab, third.model)
    expect(tab.sent.map(each => each.principal)).toEqual([undefined, 'User:ada', 'User:ada'])
  })

  it('after a reload, is made for whom its queue last heard, before any answer', async () => {
    const cookie = { current: 'User:ada' }
    const tab = { kv: memory(), ...server([], cookie) }
    await settle(tab, setCount(await restored(tab, page('ada', 'User:ada')), 'i1', 2).model)
    const reloaded = { kv: tab.kv, ...server([], cookie) }
    const started = setCount(await restored(reloaded, page('ada')), 'i1', 3)
    await settle(reloaded, started.model)
    expect(reloaded.sent.map(each => each.principal)).toEqual(['User:ada'])
    // And so, the cookie Grace's by then, it is held for Ada rather than run as Grace.
    cookie.current = 'User:grace'
    const later = { kv: tab.kv, ...server([], cookie) }
    const held = setCount(await restored(later, page('ada')), 'i1', 4)
    await settle(later, held.model)
    expect(later.ran).toEqual([])
    expect(later.sent.map(each => each.principal)).toEqual(['User:ada'])
  })

  it('takes its queue’s owner from a read of the store that brings nothing else', async () => {
    const tab = { kv: memory(), ...server() }
    const held = await restored(tab, page('ada'))
    const read = Data.reduce(held, {
      _tag: 'OutboxRead',
      key: 'outbox:ada',
      scope: 'ada',
      entries: [],
      done: [],
      owner: { _tag: 'Signed', key: 'User:ada' },
    })
    await settle(tab, setCount(read, 'i1', 2).model)
    expect(tab.sent.map(each => each.principal)).toEqual(['User:ada'])
  })

  it('never hears whom an answer was for from a request sent before forget', async () => {
    // Ada's page; a read sent as her is answered after the page forgot her for Grace.
    const cookie = { current: 'User:grace' }
    const tab = { kv: memory(), ...server([], cookie) }
    const ada = await restored(tab, page('ada', 'User:ada'))
    const grace = { ...Data.forget(ada), actor: 'grace' }
    const late = answeredAs(grace, 'User:ada', ada.remote.refresh.floor)
    const started = setCount(await restored(tab, late), 'i1', 2)
    const settled = await settle(tab, started.model)
    // Not stamped as Ada, so not refused and stuck waiting for her: run as Grace.
    expect(tab.sent.map(each => each.principal)).toEqual([undefined])
    expect(tab.ran).toEqual([started.requestId])
    expect(outboxStatus(Data, settled).items).toEqual([])
  })

  it('holds a queue made for someone when an answer names another under the same scope, said once', async () => {
    const cookie = { current: 'User:grace' }
    const tab = { kv: memory(), ...server([], cookie) }
    const started = setCount(await restored(tab, page('ada', 'User:ada')), 'i1', 2)
    const second = setCount(started.model, 'i2', 3)
    const heard: Array<RemoteMessage> = []
    const held = await settle(tab, answeredAs(second.model, 'User:grace'), entries, heard)
    expect(tab.sent).toEqual([])
    expect(heard.filter(message => message._tag === 'OutboxHeld')).toEqual([
      {
        _tag: 'OutboxHeld',
        requestIds: [started.requestId, second.requestId],
        scope: 'ada',
      },
    ])
    expect(outboxStatus(Data, held)).toMatchObject({
      waiting: 0,
      waitingForSignIn: 2,
      items: [
        { state: { _tag: 'WaitingForSignIn', error: { _tag: 'PrincipalChanged' } } },
        { state: { _tag: 'WaitingForSignIn', error: { _tag: 'PrincipalChanged' } } },
      ],
    })
    // Ada heard again: both sent as her, in order.
    cookie.current = 'User:ada'
    await settle(tab, answeredAs(held, 'User:ada'))
    expect(tab.ran).toEqual([started.requestId, second.requestId])
  })

  it('claims a write made before any answer for whom the first names, said once, before sending it', async () => {
    const cookie = { current: 'User:grace' }
    const tab = { kv: memory(), ...server([], cookie) }
    const started = setCount(await restored(tab, page('ada')), 'i1', 2)
    const heard: Array<RemoteMessage> = []
    await settle(tab, answeredAs(started.model, 'User:grace'), entries, heard)
    expect(moves(heard)).toEqual([
      { _tag: 'OutboxMoved', requestIds: [started.requestId], from: 'ada', to: 'ada' },
    ])
    expect(tab.sent.map(each => each.principal)).toEqual(['User:grace'])
  })

  it('claims a write only once the store holds it, whichever entry runs first', async () => {
    const cookie = { current: 'User:grace' }
    const tab = { kv: memory(), ...server([], cookie) }
    const started = setCount(await restored(tab, page('ada')), 'i1', 2)
    const adoptFirst = [
      'outbox.adopt',
      'outbox.restore',
      'outbox.save',
      'outbox.send',
      'outbox.hold',
    ] as const
    await settle(tab, answeredAs(started.model, 'User:grace'), entries, [], adoptFirst)
    expect(tab.sent.map(each => each.principal)).toEqual(['User:grace'])
  })

  it('hears no one from an answer that does not say when it was asked', async () => {
    const tab = { kv: memory(), ...server() }
    const ready = Data.reduce(await restored(tab, page('ada')), {
      _tag: 'ReadReceived',
      requests: [],
      result: { entities: [], settled: [], principal: 'User:ada' },
      now: 0,
    })
    await settle(tab, setCount(ready, 'i1', 2).model)
    expect(tab.sent.map(each => each.principal)).toEqual([undefined])
  })

  /**
   * How a page moves to Ada's scope on her sign-in: forgetting what it held
   * (once, or twice), or not.
   */
  const signIns: ReadonlyArray<readonly [string, (model: Model) => Model]> = [
    ['forgetting what it held', model => ({ ...Data.forget(model), actor: 'ada' })],
    ['forgetting twice', model => ({ ...Data.forget(Data.forget(model)), actor: 'ada' })],
    ['keeping what it held', model => ({ ...model, actor: 'ada' })],
  ]

  /** A visitor's write, refused for want of a sign-in, then Ada signing in on the same page. */
  const visitorThenAda = async (signIn = signIns[0]![1]) => {
    const cookie: { current: string | null } = { current: null }
    const tab = { kv: memory(), ...server(['signedOut'], cookie) }
    const started = setCount(await restored(tab, page('visitor', null)), 'i1', 2)
    const waiting = await settle(tab, started.model)
    expect(stamped(tab.kv, 'outbox:visitor')).toEqual([
      { operation: started.requestId, madeAs: { _tag: 'Visitor' } },
    ])
    cookie.current = 'User:ada'
    return { tab, cookie, started, waiting, ada: signIn(waiting) }
  }

  it.each(signIns)(
    'moves to the queue of the first person who signs in, said once, and is sent as them, %s',
    async (_, signIn) => {
      const { tab, started, ada } = await visitorThenAda(signIn)
      const heard: Array<RemoteMessage> = []
      const signedIn = Data.signedIn(answeredAs(ada, 'User:ada'))
      const settled = await settle(tab, signedIn, entries, heard)
      expect(moves(heard)).toEqual([
        { _tag: 'OutboxMoved', requestIds: [started.requestId], from: 'visitor', to: 'ada' },
      ])
      expect(storedOperations(tab.kv, 'outbox:visitor')).toEqual([])
      expect(tab.sent.map(each => each.principal)).toEqual([null, 'User:ada'])
      expect(tab.ran).toEqual([started.requestId])
      expect(outboxStatus(Data, settled).items).toEqual([])
      // Another page of hers finds nothing left to move, and says nothing.
      const later: Array<RemoteMessage> = []
      await settle(tab, await restored(tab, signedIn), entries, later)
      expect(moves(later)).toEqual([])
    },
  )

  it("claims a visitor's write in place when an answer names someone and the scope stays, said once", async () => {
    // Forgotten, but the page's scope is still the visitor's when Ada's answer lands.
    const { tab, started, waiting } = await visitorThenAda()
    const heard: Array<RemoteMessage> = []
    await settle(tab, answeredAs(Data.forget(waiting), 'User:ada'), entries, heard)
    expect(moves(heard)).toEqual([
      { _tag: 'OutboxMoved', requestIds: [started.requestId], from: 'visitor', to: 'visitor' },
    ])
    // Sent once, as Ada, and only after the report: never unstamped as her.
    expect(tab.sent.map(each => each.principal)).toEqual([null, 'User:ada'])
    expect(tab.ran).toEqual([started.requestId])
  })

  it("leaves a visitor's refused write where it was", async () => {
    const tab = { kv: memory(), ...server(['refused']) }
    const started = setCount(await restored(tab, page('visitor', null)), 'i1', 2)
    const failed = await settle(tab, started.model)
    const heard: Array<RemoteMessage> = []
    const ada = answeredAs({ ...Data.forget(failed), actor: 'ada' }, 'User:ada')
    await settle(tab, ada, entries, heard)
    expect(moves(heard)).toEqual([])
    expect(storedOperations(tab.kv, 'outbox:visitor')).toEqual([started.requestId])
  })

  it('moves only once an answer names who signed in, stamped as them', async () => {
    const { tab, cookie, started, ada } = await visitorThenAda()
    // Ada's page before any answer: nothing moves.
    const unknown = await settle(tab, Data.signedIn(ada))
    expect(storedOperations(tab.kv, 'outbox:visitor')).toEqual([started.requestId])
    expect(storedOperations(tab.kv, 'outbox:ada')).toEqual([])
    // Once one does, it moves stamped as her, so it never runs as anyone else.
    cookie.current = 'User:grace'
    await settle(tab, answeredAs(unknown, 'User:ada'))
    expect(stamped(tab.kv, 'outbox:ada')).toEqual([
      { operation: started.requestId, madeAs: { _tag: 'Signed', key: 'User:ada' } },
    ])
    expect(tab.ran).toEqual([])
  })

  it("keeps Ada's writes Ada's when her cookie drops in her own scope, and never runs them as Grace", async () => {
    // Ada signed in under `ada`; her cookie drops, and a read answers no one.
    const cookie: { current: string | null } = { current: 'User:ada' }
    const tab = { kv: memory(), ...server([], cookie) }
    const ada = await restored(tab, page('ada', 'User:ada'))
    const first = setCount(ada, 'i1', 2)
    cookie.current = null
    const second = setCount(answeredAs(first.model, null), 'i2', 3)
    const dropped = await settle(tab, second.model)
    // She kept writing: the second is still hers, not a visitor's.
    expect(stamped(tab.kv, 'outbox:ada')).toEqual([
      { operation: first.requestId, madeAs: { _tag: 'Signed', key: 'User:ada' } },
      { operation: second.requestId, madeAs: { _tag: 'Signed', key: 'User:ada' } },
    ])
    // Grace signs in on the device.
    cookie.current = 'User:grace'
    const grace = answeredAs({ ...Data.forget(dropped), actor: 'grace' }, 'User:grace')
    const heard: Array<RemoteMessage> = []
    await settle(tab, Data.signedIn(grace), entries, heard)
    expect(moves(heard)).toEqual([])
    expect(tab.ran).toEqual([])
    expect(storedOperations(tab.kv, 'outbox:ada')).toEqual([first.requestId, second.requestId])
    expect(storedOperations(tab.kv, 'outbox:grace')).toEqual([])
  })

  it("holds, never claims, an unstamped write in Ada's queue when Grace is heard under it", async () => {
    // Ada's queue, owned by her, holds a write queued before any answer on a reloaded page.
    const kv = memory()
    Effect.runSync(
      kv.set(
        'outbox:ada',
        JSON.stringify({
          version: 1,
          scope: 'ada',
          entries: [storedWrite('w-1', 'SetCount', { id: 'i1', count: 2 })],
          done: [],
          owner: { _tag: 'Signed', key: 'User:ada' },
        }),
      ),
    )
    const cookie: { current: string | null } = { current: 'User:grace' }
    const tab = { kv, ...server([], cookie) }
    const heard: Array<RemoteMessage> = []
    const held = await settle(tab, answeredAs(await restored(tab), 'User:grace'), entries, heard)
    expect(moves(heard)).toEqual([])
    expect(heard.filter(message => message._tag === 'OutboxHeld')).toEqual([
      { _tag: 'OutboxHeld', requestIds: ['w-1'], scope: 'ada' },
    ])
    expect(outboxStatus(Data, held).waitingForSignIn).toBe(1)
    expect(tab.sent).toEqual([])
    // Ada heard again: claimed for her, said once, and run as her.
    cookie.current = 'User:ada'
    await settle(tab, answeredAs(held, 'User:ada'), entries, heard)
    expect(tab.ran).toEqual(['w-1'])
    expect(tab.sent.map(each => each.principal)).toEqual(['User:ada'])
  })

  it('takes the owner of the queue it moves to, not of the one it left', async () => {
    const tab = { kv: memory(), ...server() }
    const ada = await restored(tab, page('ada', 'User:ada'))
    // The scope moves to Grace's without a forget, and a read answers no one.
    const grace = answeredAs(await restored(tab, { ...ada, actor: 'grace' }), null)
    await settle(tab, setCount(grace, 'i1', 2).model)
    expect(tab.sent.map(each => each.principal)).toEqual([null])
  })

  it('keeps the outbox as it was for a second answer naming no one', async () => {
    const tab = { kv: memory(), ...server() }
    const visitor = answeredAs(await restored(tab, page('visitor', null)), null)
    expect(answeredAs(visitor, null).remote.outbox).toBe(visitor.remote.outbox)
  })

  it("holds Ada's writes when, her cookie dropped, an answer names Grace under her scope", async () => {
    const cookie: { current: string | null } = { current: 'User:ada' }
    const tab = { kv: memory(), ...server([], cookie) }
    const ada = await restored(tab, page('ada', 'User:ada'))
    cookie.current = null
    const started = setCount(answeredAs(ada, null), 'i1', 2)
    // Grace's cookie now, and the scope still Ada's.
    cookie.current = 'User:grace'
    const heard: Array<RemoteMessage> = []
    await settle(tab, answeredAs(started.model, 'User:grace'), entries, heard)
    expect(heard.filter(message => message._tag === 'OutboxHeld')).toEqual([
      { _tag: 'OutboxHeld', requestIds: [started.requestId], scope: 'ada' },
    ])
    expect(tab.sent).toEqual([])
  })

  it('never moves a write queued before any answer out of a queue no one owns', async () => {
    // The visitor's queue, owned by no one, holds a write made before any answer said who.
    const kv = memory()
    Effect.runSync(
      kv.set(
        'outbox:visitor',
        JSON.stringify({
          version: 1,
          scope: 'visitor',
          entries: [storedWrite('w-1', 'SetCount', { id: 'i1', count: 2 })],
          done: [],
        }),
      ),
    )
    const cookie: { current: string | null } = { current: 'User:ada' }
    const tab = { kv, ...server([], cookie) }
    const held = Data.reduce(await restored(tab, page('visitor')), {
      _tag: 'OutboxRead',
      key: 'outbox:visitor',
      scope: 'visitor',
      entries: [],
      done: [],
    })
    const ada = answeredAs({ ...Data.forget(held), actor: 'ada' }, 'User:ada')
    const heard: Array<RemoteMessage> = []
    await settle(tab, ada, entries, heard)
    expect(moves(heard)).toEqual([])
    expect(storedOperations(tab.kv, 'outbox:visitor')).toEqual(['w-1'])
  })

  it("never moves a visitor's write out of a queue someone signed in owns", async () => {
    // A write stored as a visitor's under Ada's queue, which Ada owns.
    const kv = memory()
    const write = {
      ...storedWrite('w-1', 'SetCount', { id: 'i1', count: 2 }),
      madeAs: { _tag: 'Visitor' },
    }
    Effect.runSync(
      kv.set(
        'outbox:ada',
        JSON.stringify({
          version: 1,
          scope: 'ada',
          entries: [write],
          done: [],
          owner: { _tag: 'Signed', key: 'User:ada' },
        }),
      ),
    )
    const cookie: { current: string | null } = { current: 'User:grace' }
    const tab = { kv, ...server([], cookie) }
    const ada = await restored(tab, page('ada', 'User:ada'))
    const grace = answeredAs({ ...Data.forget(ada), actor: 'grace' }, 'User:grace')
    const heard: Array<RemoteMessage> = []
    await settle(tab, Data.signedIn(grace), entries, heard)
    expect(moves(heard)).toEqual([])
    expect(tab.ran).toEqual([])
    expect(storedOperations(tab.kv, 'outbox:ada')).toEqual(['w-1'])
  })

  it("sends a visitor's write refused for a sign-in as a visitor's, so it never runs unstamped as who signed in", async () => {
    // A visitor's write, refused for want of a sign-in.
    const cookie: { current: string | null } = { current: null }
    const tab = { kv: memory(), ...server(['signedOut'], cookie) }
    const started = setCount(await restored(tab, page('visitor', null)), 'i1', 2)
    const waiting = await settle(tab, started.model)
    // Ada signs in: the same scope, no forget, and the sign-in reported before any answer names her.
    cookie.current = 'User:ada'
    const heard: Array<RemoteMessage> = []
    const resent = await settle(tab, Data.signedIn(waiting), entries, heard)
    expect(tab.sent.map(each => each.principal)).toEqual([null, null])
    expect(tab.ran).toEqual([])
    expect(outboxStatus(Data, resent).items).toMatchObject([
      { state: { _tag: 'WaitingForSignIn', error: { _tag: 'PrincipalChanged' } } },
    ])
    // An answer names her: claimed, said once, and sent once as her.
    await settle(tab, answeredAs(resent, 'User:ada'), entries, heard)
    expect(moves(heard)).toEqual([
      { _tag: 'OutboxMoved', requestIds: [started.requestId], from: 'visitor', to: 'visitor' },
    ])
    expect(tab.sent.map(each => each.principal)).toEqual([null, null, 'User:ada'])
    expect(tab.ran).toEqual([started.requestId])
  })

  it("never moves anyone's but a visitor's", async () => {
    // Ada's write, waiting for her session, then Grace signing in on the page.
    const cookie: { current: string | null } = { current: 'User:ada' }
    const tab = { kv: memory(), ...server(['signedOut'], cookie) }
    const started = setCount(await restored(tab, page('ada', 'User:ada')), 'i1', 2)
    const waiting = await settle(tab, started.model)
    cookie.current = 'User:grace'
    const grace = answeredAs({ ...Data.forget(waiting), actor: 'grace' }, 'User:grace')
    const heard: Array<RemoteMessage> = []
    await settle(tab, Data.signedIn(grace), entries, heard)
    expect(moves(heard)).toEqual([])
    expect(storedOperations(tab.kv, 'outbox:ada')).toEqual([started.requestId])
    expect(storedOperations(tab.kv, 'outbox:grace')).toEqual([])
    expect(tab.ran).toEqual([])
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
    expect(outboxStatus(Data, model).items).toMatchObject([
      { requestId: 'old-1', state: { _tag: 'Unreadable' } },
      { requestId: 'old-2', state: { _tag: 'Waiting' } },
    ])
    expect(count(model, 'i2')).toBe(1)
    expect(Data.inspect(model).diagnostics).toMatchObject([
      { _tag: 'OutboxUnreadable', requestId: 'old-1' },
    ])
    const settled = await settle(tab, model)
    expect(tab.sent.map(each => each.requestId)).toEqual(['old-2'])
    expect(outboxStatus(Data, settled).items).toMatchObject([{ requestId: 'old-1' }])
    expect(Data.inspect(settled).diagnostics).toHaveLength(1)
    expect(storedOperations(kv)).toEqual(['old-1'])

    const dismissed = await settle(tab, Data.dismiss(settled, 'old-1'))
    expect(outboxStatus(Data, dismissed).items).toEqual([])
    expect(storedOperations(kv)).toEqual([])
  })

  it('drops an entry that is not an operation at all', async () => {
    const tab = { kv: storeHolding([{ nothing: true }]), ...server() }
    expect(outboxStatus(Data, await restored(tab)).items).toEqual([])
  })
})

describe('the store between tabs', () => {
  it('keeps the first owner signed in over another, a visitor, or none (#405)', () => {
    const ada = { _tag: 'Signed', key: 'User:ada' } as const
    const grace = { _tag: 'Signed', key: 'User:grace' } as const
    const visitor = { _tag: 'Visitor' } as const
    const owned = (owner: MadeAs) => ({ ...storedChange([], []), owner: Option.some(owner) })
    const none = storedChange([], [])
    expect(mergeStored(owned(ada), owned(grace)).owner).toEqual(Option.some(ada))
    expect(mergeStored(owned(visitor), owned(grace)).owner).toEqual(Option.some(grace))
    expect(mergeStored(owned(ada), owned(visitor)).owner).toEqual(Option.some(ada))
    expect(mergeStored(none, owned(visitor)).owner).toEqual(Option.some(visitor))
    expect(mergeStored(owned(ada), none).owner).toEqual(Option.some(ada))
  })

  it('merges two copies saved at once: both writes kept, the higher revision of each, none settled', () => {
    const a = storedWrite('a-1', 'SetCount', { id: 'i1', count: 2 })
    const b = storedWrite('b-1', 'SetCount', { id: 'i2', count: 3 })
    const failedA = {
      ...a,
      revision: 1,
      state: { _tag: 'Failed', error: { _tag: 'X', message: 'no' } },
    }
    expect(mergeStored(storedChange([a], []), storedChange([b], []))).toEqual({
      entries: [a, b],
      done: [],
      owner: Option.none(),
    })
    expect(mergeStored(storedChange([failedA, b], []), storedChange([a], [])).entries).toEqual([
      failedA,
      b,
    ])
    expect(mergeStored(storedChange([a, b], ['b-1']), storedChange([a], [])).entries).toEqual([a])
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
    expect(outboxStatus(Data, heard).items).toEqual([])
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
    expect(outboxStatus(Data, await restored({ kv, ...server() })).items).toEqual([])
  })

  it('forget empties the queue and keeps the session', async () => {
    const tab = { kv: memory(), ...server() }
    const started = setCount(await restored(tab), 'i1', 2)
    const forgotten = Data.forget(started.model)
    expect(outboxStatus(Data, forgotten).items).toEqual([])
    expect(forgotten.remote.outbox.session).toEqual(started.model.remote.outbox.session)
    expect(forgotten.remote.outbox.key).toEqual(Option.none())
  })
})

/**
 * #284: a write is made as someone, and is never sent as anyone else. Here
 * the key is one for every principal, so only the scope tells whose it is.
 */
describe('a change of principal in the same page', () => {
  const shared = outbox(Data, {
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
    expect(outboxStatus(Data, grace).items).toEqual([])
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
