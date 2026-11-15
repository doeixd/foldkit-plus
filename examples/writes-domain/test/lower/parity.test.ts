// @vitest-environment node
/**
 * One table of reservations over the same seeded rows, principal, input and
 * clock, decided by both authorities: SQLite's guarded writer and the Domain
 * aggregate `ReserveStock` was lowered into. Each must accept the same and
 * refuse the same, and leave the same row.
 */
import { Effect, Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { Product } from '../../src/model.js'
import { domain, reserve, sqlite, type Ask, type Outcome } from './worlds.js'

const cases: ReadonlyArray<{
  readonly what: string
  readonly ask: Omit<Ask, 'operation'>
  readonly outcome: Outcome
}> = [
  {
    what: 'the owner reserves at the revision read',
    ask: { as: 'ada', id: 'p1', revision: 1, quantity: 3 },
    outcome: { _tag: 'Accepted', reserved: 5, revision: 2 },
  },
  {
    what: 'a stale revision is a conflict',
    ask: { as: 'ada', id: 'p1', revision: 0, quantity: 3 },
    outcome: { _tag: 'Refused', refusal: 'Conflict', rule: Option.none() },
  },
  {
    what: 'anyone but the owner is forbidden',
    ask: { as: 'grace', id: 'p1', revision: 1, quantity: 3 },
    outcome: { _tag: 'Forbidden' },
  },
  {
    what: 'a draft is unmet',
    ask: { as: 'ada', id: 'p2', revision: 1, quantity: 1 },
    outcome: { _tag: 'Refused', refusal: 'Unmet', rule: Option.none() },
  },
  {
    what: 'more than the stock is invalid, naming reservedWithinStock',
    ask: { as: 'ada', id: 'p1', revision: 1, quantity: 9 },
    outcome: { _tag: 'Refused', refusal: 'Invalid', rule: Option.some('reservedWithinStock') },
  },
  {
    what: 'up to the stock exactly is accepted',
    ask: { as: 'ada', id: 'p1', revision: 1, quantity: 8 },
    outcome: { _tag: 'Accepted', reserved: 10, revision: 2 },
  },
]

describe('both authorities decide ReserveStock alike', () => {
  it.each(cases)('$what', async ({ ask, outcome }) => {
    const db = sqlite()
    const bySqlite = await db.ask({ ...ask, operation: 'op-1' })
    const byDomain = await domain(client =>
      Effect.gen(function* () {
        const answered = yield* reserve(client, ask)
        const products = yield* Product
        return { answered, row: (yield* products.get(ask.id)).row }
      }),
    )
    expect(bySqlite).toEqual(outcome)
    expect(byDomain.answered).toEqual(outcome)
    expect(byDomain.row).toEqual(Option.some(db.row(ask.id)))
  })
})
