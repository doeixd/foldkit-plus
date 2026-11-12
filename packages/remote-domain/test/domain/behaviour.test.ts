/**
 * Pins what `@alchemy.run/domain` does, not what this package does. Domain is
 * a beta that has moved two releases in two weeks, and the adapter built on it
 * relies on each row below; a release that changes one fails here first, with
 * the observed value in the diff, rather than as a wrong answer in the adapter.
 *
 * Each test says what it is relied on for:
 *
 *   P1  the receipt (`stream`, `version`) is what a write hands the adapter.
 *   P2  `atLeast` is how a read waits for a write; only the server can compare.
 *   P3  the Api's client cannot bound that wait, so the adapter cannot either.
 *   P4  a read without `atLeast` may be older than the write that came before.
 *   P5  the View cursor does not move when state changes with no output event,
 *       so it cannot order two snapshots (a row revision does).
 *   P6  a snapshot carries no stream version, so a client cannot compare it
 *       with a receipt.
 *   P7  a resent `commandId` is how a retry is safe.
 *   P8  but a reused `commandId` with other input answers the first receipt,
 *       so the adapter derives the id from the input.
 *   P9  and one from another principal does too, so the adapter derives it
 *       from the principal and refuses a request made for another.
 *   P10 a Rejection arrives as its class, so `Refusal` can be built from it;
 *       a middleware error is a separate channel.
 *   P11 `predict` runs `decide` synchronously, so a prediction can be made.
 *   P12 a Story runs over the same model, so one scenario can run on Domain.
 */
import { Story } from '@alchemy.run/domain/Story'
import { Context, DateTime, Effect, Fiber, Layer, Schema, Stream } from 'effect'
import { describe, expect, it } from 'vitest'
import { Receipt } from '../../src/index.js'
import {
  as,
  CurrentActor,
  decided,
  host,
  Invalid,
  Product,
  ProductApi,
  ProductRow,
  Seeded,
  ReserveStock,
  Shop,
  StockReserved,
  Touch,
  Touched,
  Unauthorized,
} from './fixture.js'

const ref = Product.ref('p1')

/** Runs a body against a fresh in-memory host, with the Api's in-process client. */
const run = <A, E>(
  body: (world: {
    readonly client: Effect.Success<typeof ProductApi.clientInProcess>
    readonly control: ReturnType<typeof host>['control']
  }) => Effect.Effect<A, E, Layer.Success<ReturnType<typeof host>['layer']>>,
) => {
  const { layer, control } = host()
  decided.count = 0
  return Effect.runPromise(
    Effect.gen(function* () {
      const client = yield* ProductApi.clientInProcess
      return yield* body({ client, control })
    }).pipe(Effect.scoped, Effect.provide(layer)),
  )
}

describe('upstream behaviour the adapter relies on', () => {
  it('P1: a command answers { reply, stream, version }, version counting the stream', async () => {
    const answers = await run(({ client }) =>
      Effect.gen(function* () {
        const seeded = yield* client.Seed('p1', { ownerId: 'ada', stock: 5 })
        const reserved = yield* client.ReserveStock('p1', { quantity: 1 }, { headers: as('ada') })
        return { seeded, reserved }
      }),
    )
    expect(answers.seeded).toEqual({ reply: undefined, stream: 'Product/p1', version: 1 })
    expect(answers.reserved).toEqual({ reply: { reserved: 1 }, stream: 'Product/p1', version: 2 })
    expect(Schema.decodeUnknownSync(Receipt)({ stream: 'Product/p1', version: 2 })).toEqual({
      stream: 'Product/p1',
      version: 2,
    })
  })

  it('P2: snapshot atLeast waits for the View, and times out when delivery is held', async () => {
    const outcome = await run(({ client, control }) =>
      Effect.gen(function* () {
        const row = yield* ProductRow
        const { stream, version } = yield* client.Seed('p1', { ownerId: 'ada', stock: 5 })
        const waiting = yield* row
          .snapshot(ref, { atLeast: { stream, version }, timeout: '100 millis' })
          .pipe(Effect.flip)
        yield* control.drain
        const caught = yield* row.snapshot(ref, { atLeast: { stream, version } })
        return { waiting, caught }
      }),
    )
    expect(outcome.waiting._tag).toBe('ConsistencyTimeout')
    expect(outcome.waiting).toMatchObject({
      view: 'ProductRow',
      stream: 'Product/p1',
      version: 1,
    })
    expect(outcome.caught.state).toEqual({ stock: 5, reserved: 0, note: '' })
  })

  it('P3: the Api client takes no timeout on get or snapshot', async () => {
    await run(({ client }) =>
      Effect.gen(function* () {
        // @ts-expect-error `snapshot`'s options have `atLeast` and `where`, and no `timeout`
        const bounded = client.ProductRow.snapshot('p1', { timeout: '1 second' })
        // @ts-expect-error `get`'s options have `atLeast` and `where`, and no `timeout`
        const alsoBounded = client.ProductRow.get('p1', { timeout: '1 second' })
        expect(Effect.isEffect(bounded)).toBe(true)
        expect(Effect.isEffect(alsoBounded)).toBe(true)
      }),
    )
  })

  it('P4: a plain snapshot after a commit answers the state from before it', async () => {
    const before = await run(({ client, control }) =>
      Effect.gen(function* () {
        yield* client.Seed('p1', { ownerId: 'ada', stock: 10 })
        yield* client.ReserveStock('p1', { quantity: 2 }, { headers: as('ada') })
        yield* control.drain
        yield* client.ReserveStock('p1', { quantity: 3 }, { headers: as('ada') })
        return yield* client.ProductRow.snapshot('p1')
      }),
    )
    expect(before.state?.reserved).toBe(2)
  })

  it('P5: a state change with no output event moves the watch state but not its cursor', async () => {
    const frames = await run(({ client, control }) =>
      Effect.gen(function* () {
        yield* client.Seed('p1', { ownerId: 'ada', stock: 10 })
        yield* client.ReserveStock('p1', { quantity: 2 }, { headers: as('ada') })
        yield* control.drain
        const watching = yield* client.ProductRow.watch('p1').pipe(
          Stream.take(2),
          Stream.runCollect,
          Effect.forkChild,
        )
        yield* Effect.sleep('50 millis')
        yield* client.Touch('p1', { note: 'hello' })
        yield* control.drain
        return yield* Fiber.join(watching)
      }),
    )
    expect(frames).toEqual([
      { state: { stock: 10, reserved: 2, note: '' }, cursor: 1 },
      { state: { stock: 10, reserved: 2, note: 'hello' }, cursor: 1 },
    ])
  })

  it('P6: a snapshot holds a state and a cursor, and no stream version', async () => {
    const snapshot = await run(({ client, control }) =>
      Effect.gen(function* () {
        yield* client.Seed('p1', { ownerId: 'ada', stock: 10 })
        yield* control.drain
        return yield* client.ProductRow.snapshot('p1')
      }),
    )
    expect(Object.keys(snapshot).sort()).toEqual(['cursor', 'state'])
  })

  it('P7: a resent commandId answers the first receipt and does not decide again', async () => {
    const sent = await run(({ client }) =>
      Effect.gen(function* () {
        yield* client.Seed('p1', { ownerId: 'ada', stock: 10 })
        const options = { commandId: 'c1', headers: as('ada') }
        const first = yield* client.ReserveStock('p1', { quantity: 2 }, options)
        const second = yield* client.ReserveStock('p1', { quantity: 2 }, options)
        return { first, second, decided: decided.count }
      }),
    )
    expect(sent.second).toEqual(sent.first)
    expect(sent.first).toEqual({ reply: { reserved: 2 }, stream: 'Product/p1', version: 2 })
    expect(sent.decided).toBe(1)
  })

  it('P8: the same commandId with other input answers the first receipt, silently', async () => {
    const sent = await run(({ client }) =>
      Effect.gen(function* () {
        yield* client.Seed('p1', { ownerId: 'ada', stock: 10 })
        const options = { commandId: 'c1', headers: as('ada') }
        yield* client.ReserveStock('p1', { quantity: 5 }, options)
        const other = yield* client.ReserveStock('p1', { quantity: 1 }, options)
        return { other, decided: decided.count }
      }),
    )
    expect(sent.other.reply).toEqual({ reserved: 5 })
    expect(sent.decided).toBe(1)
  })

  it('P9: the same commandId from another principal answers the first receipt', async () => {
    const sent = await run(({ client }) =>
      Effect.gen(function* () {
        yield* client.Seed('p1', { ownerId: 'ada', stock: 10 })
        yield* client.ReserveStock('p1', { quantity: 5 }, { commandId: 'c1', headers: as('ada') })
        const grace = yield* client.ReserveStock(
          'p1',
          { quantity: 5 },
          { commandId: 'c1', headers: as('grace') },
        )
        const elsewhere = yield* client
          .ReserveStock('p1', { quantity: 5 }, { commandId: 'c2', headers: as('grace') })
          .pipe(Effect.flip)
        return { grace, elsewhere, decided: decided.count }
      }),
    )
    expect(sent.grace.reply).toEqual({ reserved: 5 })
    expect(sent.elsewhere._tag).toBe('NotOwner')
    expect(sent.decided).toBe(2)
  })

  it('P10: a Rejection reaches the client as its class, a middleware error as its own', async () => {
    const failures = await run(({ client }) =>
      Effect.gen(function* () {
        yield* client.Seed('p1', { ownerId: 'ada', stock: 1 })
        const rejected = yield* client
          .ReserveStock('p1', { quantity: 2 }, { headers: as('ada') })
          .pipe(Effect.flip)
        const unauthorized = yield* client
          .ReserveStock('p1', { quantity: 1 }, { headers: {} })
          .pipe(Effect.flip)
        return { rejected, unauthorized }
      }),
    )
    expect(failures.rejected).toBeInstanceOf(Invalid)
    expect(failures.rejected).toMatchObject({ _tag: 'Invalid', rule: 'reservedWithinStock' })
    expect(failures.unauthorized).toBeInstanceOf(Unauthorized)
  })

  it('P11: predict runs an Effect.fn decide that reads a RequestContext, synchronously', () => {
    const state = { ownerId: 'ada', stock: 5, reserved: 0, note: '' }
    const prediction = Product.predict(state, new ReserveStock({ quantity: 2 }), {
      id: 'p1',
      now: DateTime.makeUnsafe(0),
      context: Context.make(CurrentActor, { id: 'ada' }),
    })
    expect(prediction._tag).toBe('Accepted')
    if (prediction._tag !== 'Accepted') return
    expect(prediction.events).toEqual([new StockReserved({ quantity: 2, reservedAfter: 2 })])
    expect(prediction.state).toEqual({ ownerId: 'ada', stock: 5, reserved: 2, note: '' })
  })

  it('P12: a Story runs given, when, then, replied, rejected and view over the model', async () => {
    const story = Story.make(Shop, {})
    await Effect.runPromise(
      story(
        Story.given(ref, new Seeded({ ownerId: 'ada', stock: 5 })),
        Story.provide(CurrentActor, { id: 'ada' }),
        Story.when(ref, new ReserveStock({ quantity: 2 })),
        Story.then(ref, new StockReserved({ quantity: 2, reservedAfter: 2 })),
        Story.replied({ reserved: 2 }),
        Story.view(ProductRow, ref, { reserved: 2 }),
        Story.when(ref, new ReserveStock({ quantity: 9 })),
        Story.rejected(new Invalid({ rule: 'reservedWithinStock' })),
        Story.when(ref, new Touch({ note: 'x' })),
        Story.then(ref, new Touched({ note: 'x' })),
      ),
    )
  })
})
