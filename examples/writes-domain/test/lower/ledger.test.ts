// @vitest-environment node
/**
 * What a reused operation does, by authority: SQLite's ledgered writer,
 * Domain sent the same `commandId` directly, and Domain through the adapter,
 * whose `commandId` digests who asks and what, over the lowered aggregate,
 * which refuses an operation reused with another request (`Reused`).
 *
 * The middle column is upstream's (P7 to P9): Domain answers a `commandId` it
 * has seen from its record without calling `decide`, so no lowering reaches
 * it. The third column is why the adapter never reuses a `commandId` for
 * another request.
 */
import { Effect, Option, Ref } from 'effect'
import { describe, expect, it } from 'vitest'
import { Product } from '../../src/model.js'
import { adapted, domain, mutate, reserve, sqlite } from './worlds.js'

const first = { as: 'ada', id: 'p1', revision: 1, quantity: 3, operation: 'op-1' } as const
const landed = { _tag: 'Accepted', reserved: 5, revision: 2 } as const
const commandId = 'raw-1'

/** The row's reserved stock after the steps: whether a second write landed. */
const reservedNow = Effect.gen(function* () {
  const products = yield* Product
  return Option.map((yield* products.get('p1')).row, ({ reserved }) => reserved)
})

describe('the same operation, the same request, the same principal', () => {
  it('SQLite answers from its record', async () => {
    const db = sqlite()
    expect(await db.ask(first)).toEqual(landed)
    expect(await db.ask(first)).toEqual(landed)
    expect(db.row('p1')).toMatchObject({ reserved: 5, revision: 2 })
  })

  it('Domain answers the first receipt', async () => {
    const seen = await domain(client =>
      Effect.gen(function* () {
        const one = yield* reserve(client, first, commandId)
        const two = yield* reserve(client, first, commandId)
        return { one, two, reserved: yield* reservedNow }
      }),
    )
    expect(seen).toEqual({ one: landed, two: landed, reserved: Option.some(5) })
  })

  it('the lowered aggregate through the adapter answers the first receipt', async () => {
    const seen = await adapted(() =>
      Effect.gen(function* () {
        const one = yield* mutate(first)
        const two = yield* mutate(first)
        return { one, two, reserved: yield* reservedNow }
      }),
    )
    expect(seen).toEqual({ one: landed, two: landed, reserved: Option.some(5) })
  })
})

describe('the same operation with another input', () => {
  const other = { ...first, revision: 2, quantity: 1 }

  it('SQLite refuses it as recorded for another request', async () => {
    const db = sqlite()
    await db.ask(first)
    const answer = await db.ask(other)
    expect(answer._tag).toBe('Refused')
    expect(answer).toMatchObject({ refusal: expect.stringContaining('another request') })
    expect(db.row('p1')).toMatchObject({ reserved: 5, revision: 2 })
  })

  it('Domain answers the first receipt, silently', async () => {
    const seen = await domain(client =>
      Effect.gen(function* () {
        yield* reserve(client, first, commandId)
        const two = yield* reserve(client, other, commandId)
        return { two, reserved: yield* reservedNow }
      }),
    )
    expect(seen).toEqual({ two: landed, reserved: Option.some(5) })
  })

  it('the lowered aggregate through the adapter refuses it as Reused', async () => {
    const seen = await adapted(() =>
      Effect.gen(function* () {
        yield* mutate(first)
        const two = yield* mutate(other)
        return { two, reserved: yield* reservedNow }
      }),
    )
    expect(seen.two).toMatchObject({
      _tag: 'Refused',
      refusal: expect.stringContaining('another request'),
    })
    expect(seen.reserved).toEqual(Option.some(5))
  })
})

describe('the same operation from another principal', () => {
  const grace = { ...first, as: 'grace' }

  it('SQLite decides it afresh, in grace’s scope: forbidden', async () => {
    const db = sqlite()
    await db.ask(first)
    expect(await db.ask(grace)).toEqual({ _tag: 'Forbidden' })
  })

  it('Domain answers grace the first receipt: ada’s reply', async () => {
    const seen = await domain(client =>
      Effect.gen(function* () {
        yield* reserve(client, first, commandId)
        return yield* reserve(client, grace, commandId)
      }),
    )
    expect(seen).toEqual(landed)
  })

  it('the lowered aggregate through the adapter decides it afresh: forbidden, not Reused', async () => {
    const seen = await adapted(as =>
      Effect.gen(function* () {
        yield* mutate(first)
        yield* Ref.set(as, 'grace')
        return { two: yield* mutate(grace), reserved: yield* reservedNow }
      }),
    )
    expect(seen).toEqual({ two: { _tag: 'Forbidden' }, reserved: Option.some(5) })
  })
})

describe('the same operation from a visitor', () => {
  const asked = (digest: string) => `ReserveStock:${first.operation}:${digest.repeat(32)}`

  it('the lowered aggregate tells a visitor to sign in, not that the operation was used', async () => {
    const seen = await domain(client =>
      Effect.gen(function* () {
        yield* reserve(client, first, asked('a'))
        // No `x-user` header: the session middleware provides nobody.
        const two = yield* client
          .ReserveStock(first.id, { revision: 2, quantity: 1 }, { commandId: asked('b') })
          .pipe(
            Effect.map(() => 'Accepted'),
            Effect.catch(rejection => Effect.succeed(rejection._tag)),
          )
        return { two, reserved: yield* reservedNow }
      }),
    )
    expect(seen).toEqual({ two: 'Unauthenticated', reserved: Option.some(5) })
  })
})
