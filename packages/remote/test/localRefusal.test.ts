/**
 * A declared write the client can tell breaks an invariant is refused where
 * it is made (operations-phase6-DESIGN §4): nothing is shown, nothing is
 * sent, and the request fails with the `Invalid` refusal the server would
 * answer, through `MutationFailed` as any refusal. An invariant the client
 * cannot decide refuses nothing.
 */
import { Effect, Option, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity, Expr, Write } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Mutation, Refusal, Remote, RemoteClient } from '../src/index.js'

const Item = Entity.define(
  'Item',
  Schema.Struct({ id: Schema.String, count: Schema.Number, cap: Schema.Number }),
).pipe(
  Entity.invariant('withinCap', ({ after }) => Expr.lte(after.count, after.cap), {
    message: 'The count stays within the cap',
    path: ['count'],
  }),
)
const SetCount = Mutation.write(
  'SetCount',
  Write.update(Entity.input(Item, Schema.Struct({ id: Schema.String, count: Schema.Number })), {
    id: 'id',
  }),
)
const AddItem = Mutation.write(
  'AddItem',
  Write.insert(
    Entity.input(
      Item,
      Schema.Struct({ id: Schema.String, count: Schema.Number, cap: Schema.Number }),
    ),
    { id: 'id' },
  ),
)

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({
  model: App.model.remote,
  entities: [Item],
  mutations: [SetCount, AddItem],
})

/** i1 held with a cap of 5; i2 held without its cap. */
const held: Model = Data.reduce(
  { remote: Remote.initial },
  {
    _tag: 'ReadReceived',
    requests: [
      { entity: 'Item', id: 'i1', fields: ['id', 'count', 'cap'] },
      { entity: 'Item', id: 'i2', fields: ['id', 'count'] },
    ],
    result: {
      settled: [],
      entities: [
        { entity: 'Item', id: 'i1', values: { id: 'i1', count: 1, cap: 5 } },
        { entity: 'Item', id: 'i2', values: { id: 'i2', count: 1 } },
      ],
    },
    now: 0,
  },
)

/** A server that answers every write, and counts what reached it. */
const counting = () => {
  const sent: Array<string> = []
  const client: RemoteClient['Service'] = {
    read: () => Effect.succeed({ settled: [], entities: [] }),
    query: () =>
      Effect.succeed({ edges: [], start: { _tag: 'Terminal' }, end: { _tag: 'Terminal' } }),
    mutate: request => {
      sent.push(request.mutation)
      return Effect.succeed({ output: {}, entities: [], connections: [], deleted: [] })
    },
    live: () => Stream.empty,
  }
  return { sent, client }
}

const run = (started: ReturnType<typeof Data.mutate>, client: RemoteClient['Service']) =>
  Effect.runPromise(started.command.effect.pipe(Effect.provideService(RemoteClient, client)))

const count = (model: Model, id: string) => Data.storeOf(model)[`Item:${id}`]?.values.count

describe('a write the client can tell breaks an invariant', () => {
  it('is refused where it is made: nothing shown, nothing sent, the server’s refusal', async () => {
    const { sent, client } = counting()
    const started = Data.mutate(held, SetCount, { id: 'i1', count: 9 })
    expect(count(started.model, 'i1')).toBe(1)
    const answer = await run(started, client)
    expect(sent).toEqual([])
    expect(answer).toMatchObject({ _tag: 'MutationFailed', requestId: started.requestId })
    const failed = Data.reduce(started.model, answer)
    const refusal = Data.refusal(failed, started.requestId, SetCount)
    expect(Option.map(refusal, Refusal.isInvalid)).toEqual(Option.some(true))
    expect(refusal).toEqual(
      Option.some({
        _tag: 'Invalid',
        entity: Option.some('Item'),
        rule: Option.some('withinCap'),
        message: 'The count stays within the cap',
        path: ['count'],
      }),
    )
    expect(Data.failedWrites(failed, SetCount).map(write => write.input)).toEqual([
      { id: 'i1', count: 9 },
    ])
  })

  it('is refused for a new row it describes whole', async () => {
    const { sent, client } = counting()
    const answer = await run(Data.mutate(held, AddItem, { id: 'i3', count: 7, cap: 2 }), client)
    expect(sent).toEqual([])
    expect(answer._tag).toBe('MutationFailed')
  })
})

describe('a write the client cannot refuse', () => {
  it.each([
    ['one that keeps the invariant', { id: 'i1', count: 4 }, 4],
    ['one over a row held without a field the invariant reads', { id: 'i2', count: 9 }, 9],
    ['one over a row not held', { id: 'i7', count: 9 }, 9],
  ])('is shown and sent: %s', async (_, input, shown) => {
    const { sent, client } = counting()
    const started = Data.mutate(held, SetCount, input)
    expect(count(started.model, input.id)).toBe(shown)
    await run(started, client)
    expect(sent).toEqual(['SetCount'])
  })

  it('is sent when the caller gives what it shows', async () => {
    const { sent, client } = counting()
    await run(Data.mutate(held, SetCount, { id: 'i1', count: 9 }, { optimistic: [] }), client)
    expect(sent).toEqual(['SetCount'])
  })
})
