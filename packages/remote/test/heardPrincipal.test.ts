/**
 * Whom an answer was for, heard through each way a request goes (#405): a
 * read, a list, a write and `Remote.mutateInto` each carry the generation
 * they were sent under, so an answer to a request sent before `forget` is
 * not heard by the page that forgot.
 */
import { Effect, Layer, Option, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity, Order, Write } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Mutation, Query, Remote, RemoteClient, terminal } from '../src/index.js'
import type { RemoteMessage } from '../src/index.js'

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

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({
  model: App.model.remote,
  entities: [Item],
  queries: [All],
  mutations: [SetCount],
})
const initial: Model = { remote: Remote.initial }

/** A server answering every call as Ada. */
const asAda = Layer.succeed(RemoteClient, {
  read: batch =>
    Effect.succeed({
      settled: [],
      entities: batch.requests.map(request => ({
        entity: request.entity,
        id: request.id,
        values: { id: request.id, count: 1 },
      })),
      principal: 'User:ada',
    }),
  query: () => Effect.succeed({ edges: [], start: terminal, end: terminal, principal: 'User:ada' }),
  mutate: () =>
    Effect.succeed({
      output: {},
      entities: [{ entity: 'Item', id: 'i1', values: { count: 2 } }],
      principal: 'User:ada',
    }),
  live: () => Stream.empty,
})

const heard = (model: Model) => Data.store.get(model).outbox.principal
const ada = Option.some({ _tag: 'Signed', key: 'User:ada' })

const counted = Entity.select(Item, { count: true })
const Page = App.surface('Page', {
  model: () => ({
    item: Data.get(counted, 'i1'),
    all: Data.query(All, {}, { select: counted, first: 2 }),
  }),
})
const entry = Data.subscriptions({ page: Page })['page.read']

/** What the read entry sends for `model`'s plan, reduced into `into`. */
const answered = async (model: Model, into: Model, keep: (message: RemoteMessage) => boolean) => {
  const dependencies = entry.modelToDependencies(model)
  const messages = await Effect.runPromise(
    Stream.runCollect(entry.dependenciesToStream(dependencies)).pipe(Effect.provide(asAda)),
  )
  return [...messages].filter(keep).reduce(Data.reduce, into)
}

describe('whom an answer was for', () => {
  it.each([
    ['a read', 'ReadReceived'],
    ['a list', 'ConnectionMerged'],
  ] as const)('is heard from %s', async (_, tag) => {
    expect(heard(await answered(initial, initial, message => message._tag === tag))).toEqual(ada)
  })

  it.each([
    ['a read', 'ReadReceived'],
    ['a list', 'ConnectionMerged'],
  ] as const)('is not heard from %s sent before forget', async (_, tag) => {
    const forgotten = Data.forget(initial)
    expect(heard(await answered(initial, forgotten, message => message._tag === tag))).toEqual(
      Option.none(),
    )
  })

  it('is heard from a write, and not from one sent before forget', async () => {
    const started = Data.mutate(initial, SetCount, { id: 'i1', count: 2 })
    const message = await Effect.runPromise(started.command.effect.pipe(Effect.provide(asAda)))
    expect(heard(Data.reduce(started.model, message))).toEqual(ada)
    expect(heard(Data.reduce(Data.forget(started.model), message))).toEqual(Option.none())
  })

  it('is heard from Remote.mutateInto', async () => {
    const { model } = await Effect.runPromise(
      Remote.mutateInto(Data, initial, SetCount, { id: 'i1', count: 2 }, 'r1').pipe(
        Effect.provide(asAda),
      ),
    )
    expect(heard(model)).toEqual(ada)
  })
})
