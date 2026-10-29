/**
 * A write a supplied member's held value forbids (Guard's `may`) is refused
 * where it is made, as the server would refuse it (operations-phase7-DESIGN
 * §11): nothing shown, nothing sent, and `Forbidden` with the member's words,
 * before any invariant is judged. A member not held refuses nothing.
 */
import { Effect, Option, Schema, Stream } from 'effect'
import { KeyValueStore } from 'effect/persistence'
import { defineMessageUnion } from 'foldkit/message'
import { Derived, Entity, Expr, Write, type WriteSurface } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Mutation, Remote, RemoteClient, RemoteData } from '../src/index.js'

/** What the gate was asked last, so a test can see the surface a write was judged by. */
const asked: Array<WriteSurface> = []
const Doc = Entity.define(
  'Doc',
  Schema.Struct({ id: Schema.String, title: Schema.String, size: Schema.Number }),
).pipe(
  Entity.derived({
    gate: Derived.make(Schema.Struct({ locked: Schema.Boolean }), {
      forbids: (value, surface) => {
        asked.push(surface)
        // Locked unless it says open: only a value held says either.
        return Schema.is(Schema.Struct({ locked: Schema.Literal(false) }))(value)
          ? Option.none()
          : Option.some({ reason: Option.some('It is locked.') })
      },
    }),
  }),
  Entity.invariant('small', ({ after }) => Expr.lte(after.size, 10), {
    message: 'It stays small',
    path: ['size'],
  }),
)
const Retitle = Mutation.write(
  'Retitle',
  Write.update(
    Entity.input(
      Doc,
      Schema.Struct({ id: Schema.String, title: Schema.String, size: Schema.Number }),
    ),
    { id: 'id' },
  ),
)
const Drop = Mutation.write(
  'Drop',
  Write.delete(Entity.input(Doc, Schema.Struct({ id: Schema.String })), { id: 'id' }),
)

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({ model: App.model.remote, entities: [Doc], mutations: [Retitle, Drop] })

/** d1 held locked, d2 held open, d3 held without its gate. */
const held: Model = Data.reduce(
  { remote: Remote.initial },
  {
    _tag: 'ReadReceived',
    requests: [
      { entity: 'Doc', id: 'd1', fields: ['id', 'title', 'size', 'gate'] },
      { entity: 'Doc', id: 'd2', fields: ['id', 'title', 'size', 'gate'] },
      { entity: 'Doc', id: 'd3', fields: ['id', 'title', 'size'] },
    ],
    result: {
      settled: [],
      entities: [
        {
          entity: 'Doc',
          id: 'd1',
          values: { id: 'd1', title: 'A', size: 1, gate: { locked: true } },
        },
        {
          entity: 'Doc',
          id: 'd2',
          values: { id: 'd2', title: 'B', size: 1, gate: { locked: false } },
        },
        { entity: 'Doc', id: 'd3', values: { id: 'd3', title: 'C', size: 1 } },
      ],
    },
    now: 0,
  },
)

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

const title = (model: Model, id: string) => Data.storeOf(model)[`Doc:${id}`]?.values.title

describe('a write its held gate forbids', () => {
  it('is refused where it is made: nothing shown, nothing sent, Forbidden with its words', async () => {
    const { sent, client } = counting()
    asked.length = 0
    const started = Data.mutate(held, Retitle, { id: 'd1', title: 'Mine', size: 1 })
    expect(title(started.model, 'd1')).toBe('A')
    const answer = await run(started, client)
    expect(sent).toEqual([])
    const failed = Data.reduce(started.model, answer)
    const status = Data.mutation(failed, started.requestId)
    expect(status).toMatchObject({
      _tag: 'Failed',
      error: { _tag: 'Forbidden', reason: 'It is locked.' },
    })
    expect(
      status._tag === 'Failed'
        ? Option.map(RemoteData.denied(status.error), denied => denied._tag)
        : Option.none(),
    ).toEqual(Option.some('Forbidden'))
    expect(asked).toEqual([{ kind: 'Update', members: ['title', 'size'], relations: [] }])
  })

  it('is refused before an invariant it also breaks, as the server refuses it', async () => {
    const answer = await run(
      Data.mutate(held, Retitle, { id: 'd1', title: 'Mine', size: 99 }),
      counting().client,
    )
    expect(answer).toMatchObject({ _tag: 'MutationFailed', error: { _tag: 'Forbidden' } })
  })

  it('asks a delete as a delete', () => {
    asked.length = 0
    Data.mutate(held, Drop, { id: 'd2' })
    expect(asked).toEqual([{ kind: 'Delete', members: [], relations: [] }])
  })

  it('durable, is refused and not queued', async () => {
    const opened = await Effect.runPromise(
      Data.outbox({ key: () => 'outbox', scope: () => 'me' })
        .restore(held)
        .pipe(Effect.provide(KeyValueStore.layerMemory)),
    )
    const started = Data.mutate(
      opened,
      Retitle,
      { id: 'd1', title: 'Mine', size: 1 },
      { durable: true },
    )
    expect(Data.outboxStatus(started.model).items).toEqual([])
    expect(await run(started, counting().client)).toMatchObject({ _tag: 'MutationFailed' })
  })
})

describe('a write its gate does not forbid', () => {
  it.each([
    ['one over a row whose gate is open', 'd2'],
    ['one over a row held without its gate', 'd3'],
    ['one over a row not held', 'd9'],
  ])('is shown and sent: %s', async (_, id) => {
    const { sent, client } = counting()
    const started = Data.mutate(held, Retitle, { id, title: 'New', size: 1 })
    expect(title(started.model, id)).toBe('New')
    await run(started, client)
    expect(sent).toEqual(['Retitle'])
  })

  it('is sent when the caller gives what it shows', async () => {
    const { sent, client } = counting()
    await run(
      Data.mutate(held, Retitle, { id: 'd1', title: 'Mine', size: 1 }, { optimistic: [] }),
      client,
    )
    expect(sent).toEqual(['Retitle'])
  })
})
