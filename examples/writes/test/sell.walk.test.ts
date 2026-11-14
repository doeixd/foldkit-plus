/**
 * `Sell` and `Restock`, walked through the example's server over SQLite: from each start, seeded random
 * sequences of sales and restocks, each sent as a client would send it.
 * Whatever the writer answers, the product keeps `reservedWithinStock`; a sale
 * it refuses as `Invalid becomes:InStock` is a legitimate answer, and leaves the
 * row as it was.
 */
import { Option } from 'effect'
import { Laws } from 'foldkit-entity'
import { Evidence } from 'foldkit-metadata'
import { Walk } from 'foldkit-remote/testing'
import { describe, expect, it } from 'vitest'
import { Restock, Sell } from '../src/domain.js'
import { RestockMessage, SellMessage, broken, checks, law, start, step, walk } from './walks.js'

describe('Sell and Restock through the server', () => {
  it('keep reservedWithinStock, with a Walked record for each', async () => {
    const result = await Walk.run({ ...walk, violations: broken, laws: [law] })
    expect(result.failures).toEqual([])
    expect(result.evidence.map(record => ({ ...record }))).toEqual(
      [Sell, Restock].map(write => ({
        ...Evidence.Walked({
          transition: Laws.transition(write),
          law: 'Product.reservedWithinStock',
          seeds: 12,
          steps: 15,
          starts: ['stocked', 'all reserved', 'empty'],
        }),
      })),
    )
    expect(result.evidence.map(Evidence.issuedBy)).toEqual(
      result.evidence.map(() => Option.some('foldkit-remote/walk')),
    )
  }, 60_000)

  it('answer as the writer may, and a refused sale leaves the row as it was', async () => {
    const result = await Walk.run({
      ...walk,
      violations: checks,
      laws: ['refusal', 'a refusal writes nothing', 'becomes:InStock'],
    })
    expect(result.failures).toEqual([])
  }, 60_000)

  it('refuses a sale that leaves no stock free as Invalid becomes:InStock, and a restock past the reserved as Invalid reservedWithinStock', async () => {
    const sold = await step(start('', 10, 2).start(), SellMessage.make({ quantity: -8 }))
    expect(sold.answer).toContain('"rule":"becomes:InStock"')
    const restocked = await step(
      start('', 10, 2).start(),
      RestockMessage.make({ revision: 1, quantity: -9 }),
    )
    expect(restocked.answer).toContain('"rule":"reservedWithinStock"')
  })
})
