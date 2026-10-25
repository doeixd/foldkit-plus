/**
 * An invariant's refusal, from a writer to the client: `RemoteInvalid` becomes
 * the mutation's `Invalid` refusal, and a writer that does not judge
 * invariants is refused for an Entity that has them.
 */
import { Effect, Option, Schema } from 'effect'
import { Entity, Expr, Write } from 'foldkit-entity'
import { Mutation, Refusal } from 'foldkit-remote'
import { describe, expect, it } from 'vitest'
import { RemoteServer, type EntityWriter } from '../src/index.js'

const StockFields = Entity.define(
  'Stock',
  Schema.Struct({ id: Schema.String, quantity: Schema.Number, reserved: Schema.Number }),
)
const Stock = StockFields.pipe(
  Entity.invariant(
    'reservedWithinQuantity',
    ({ after }) => Expr.lte(after.reserved, after.quantity),
    {
      message: 'Reserved stock cannot exceed the quantity',
      path: ['reserved'],
    },
  ),
)
const SetQuantity = Mutation.write(
  'SetQuantity',
  Write.update(Entity.input(Stock, Schema.Struct({ id: Schema.String, quantity: Schema.Number })), {
    id: 'id',
  }),
)

/** A writer that refuses every update as `refusal` says. */
const refusing = (refusal: ReturnType<typeof RemoteServer.invalid>): EntityWriter<unknown> => ({
  entity: 'Stock',
  invariants: true,
  update: () => Effect.fail(refusal),
  insert: () => Effect.die('no inserts'),
  delete: () => Effect.die('no deletes'),
})

const send = (writer: EntityWriter<unknown>) =>
  Effect.runPromise(
    RemoteServer.handlers(
      RemoteServer.make({ entities: [], mutations: [RemoteServer.write(SetQuantity, writer)] }),
      undefined,
    )
      .FoldkitRemoteMutate({
        requestId: 'r',
        mutation: 'SetQuantity',
        input: { id: 's1', quantity: 3 },
      })
      .pipe(Effect.result),
  )

describe('An invalid row', () => {
  it('is refused as Invalid, naming the invariant and its path for the client to decode', async () => {
    const failed = await send(
      refusing(
        RemoteServer.invalid(
          'Reserved stock cannot exceed the quantity',
          Option.some('reservedWithinQuantity'),
          ['reserved'],
        ),
      ),
    )
    const encoded = {
      _tag: 'Invalid',
      rule: 'reservedWithinQuantity',
      message: 'Reserved stock cannot exceed the quantity',
      path: ['reserved'],
    }
    expect(failed).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'RemoteMutationError', refusal: encoded },
    })
    // As the client's `Data.refusal` reads it, by the mutation's own codec.
    const refusal = Schema.decodeUnknownSync(SetQuantity.Refusal)(encoded)
    expect(refusal).toEqual({ ...encoded, rule: Option.some('reservedWithinQuantity') })
    expect(Refusal.isInvalid(refusal)).toBe(true)
  })

  it('names nothing when the writer may not say which invariant', async () => {
    const failed = await send(refusing(RemoteServer.invalid('The row would be invalid')))
    expect(failed).toMatchObject({
      failure: {
        refusal: { _tag: 'Invalid', rule: null, message: 'The row would be invalid', path: [] },
      },
    })
  })

  it('is refused where it is served, over a writer that does not judge invariants', () => {
    const { invariants: _, ...blind } = refusing(RemoteServer.invalid('x'))
    expect(() => RemoteServer.write(SetQuantity, blind)).toThrow('does not judge them (invariants)')
    // An Entity with no invariants needs no such writer.
    const Plain = Mutation.write(
      'Plain',
      Write.update(
        Entity.input(StockFields, Schema.Struct({ id: Schema.String, quantity: Schema.Number })),
        {
          id: 'id',
        },
      ),
    )
    expect(() => RemoteServer.write(Plain, blind)).not.toThrow()
  })

  it("is refused where it is served for an update the Entity's transitions judge, and not for an insert", () => {
    const { invariants: _, ...blind } = refusing(RemoteServer.invalid('x'))
    const Moving = StockFields.pipe(
      Entity.invariant(
        'neverFalls',
        ({ before, after }) => Expr.gte(after.quantity, Expr.field(before.quantity)),
        {
          message: 'x',
        },
      ),
    )
    const input = Entity.input(
      Moving,
      Schema.Struct({ id: Schema.String, quantity: Schema.Number }),
    )
    const Update = Mutation.write('Update', Write.update(input, { id: 'id' }))
    const Insert = Mutation.write('Insert', Write.insert(input, { id: 'id' }))
    expect(() => RemoteServer.write(Update, blind)).toThrow('does not judge them (invariants)')
    expect(() => RemoteServer.write(Insert, blind)).not.toThrow()
  })
})
