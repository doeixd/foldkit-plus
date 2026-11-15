/**
 * `Law.check` leaves a server's `Invalid` to the server only where the client
 * could not judge the row's invariants: one it judged Valid, beside a `may`
 * it does not hold, is a disagreement. The case left to the server is the
 * writes example's sale (`examples/writes/test/law.test.ts`).
 */
import { Effect, Layer, Option, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Derived, Entity, Expr, Write } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Mutation, Remote, RemoteClient, RemoteMutationError } from '../src/index.js'
import { Law } from '../src/testing.js'

const Doc = Entity.define('Doc', Schema.Struct({ id: Schema.String, size: Schema.Number })).pipe(
  Entity.derived({
    // A supplied member that may forbid a write: Guard's `may`.
    gate: Derived.make(Schema.Struct({ locked: Schema.Boolean }), {
      forbids: () => Option.none(),
    }),
  }),
  Entity.invariant('small', ({ after }) => Expr.lte(after.size, 10), {
    message: 'It stays small',
    path: ['size'],
  }),
)
const Resize = Mutation.write(
  'Resize',
  Write.update(Entity.input(Doc, Schema.Struct({ id: Schema.String, size: Schema.Number })), {
    id: 'id',
  }),
)
const Model = Schema.Struct({ remote: Remote.Model })
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({ model: App.model.remote, entities: [Doc], mutations: [Resize] })

/**
 * A server that sends the doc without its `gate` (a Read rule withholds it)
 * and refuses every write as breaking `small`, whatever it is.
 */
const Server = Layer.succeed(RemoteClient, {
  read: batch =>
    Effect.succeed({
      entities: batch.requests.map(request => ({
        entity: 'Doc',
        id: request.id,
        values: { id: request.id, size: 5 },
      })),
      settled: batch.requests.map(request => ({
        entity: 'Doc',
        id: request.id,
        fields: ['gate'],
      })),
    }),
  query: () => Effect.die('no queries'),
  mutate: () =>
    Effect.fail(
      new RemoteMutationError({
        message: 'It stays small',
        refusal: {
          _tag: 'Invalid',
          entity: 'Doc',
          rule: 'small',
          message: 'It stays small',
          path: ['size'],
        },
      }),
    ),
  live: () => Stream.empty,
})

const checked = (input: unknown) =>
  Effect.runPromise(
    Law.check(Data, {
      model: { remote: Remote.initial },
      holds: [{ entity: Doc, ids: ['d1'] }],
      mutation: Resize,
      input,
      now: 0,
    }).pipe(Effect.provide(Server)),
  )

describe('Law.check over a server Invalid', () => {
  it('reports a row the client judged Valid as a disagreement, though it holds no may', async () => {
    const report = await checked({ id: 'd1', size: 8 })
    expect(report.unknown).toEqual([])
    expect(report.disagreed).toEqual([
      expect.objectContaining({ part: 'Resize', client: 'applied' }),
    ])
  })
})
