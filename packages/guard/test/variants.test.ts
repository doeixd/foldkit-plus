/**
 * A guard over a variant Entity (#357): a rule per case is a row guard over
 * `Expr.is`, false on a row of another case, and judged in memory as in SQL.
 */
import { Effect, Option, Schema } from 'effect'
import { Entity, Expr } from 'foldkit-entity'
import { describe, expect, it } from 'vitest'
import { Guards } from '../src/index.js'

const Domain = Entity.defineVariants('Domain', {
  Available: { id: Schema.String, name: Schema.String, price: Schema.Finite },
  Unconfirmed: { id: Schema.String, name: Schema.String },
})
const Buyer = Schema.Struct({ id: Schema.String, budget: Schema.Finite })

const G = Guards.declare(
  'Domains',
  Buyer,
  guard => ({
    // Who may buy: an Available within the buyer's budget.
    affordable: guard.row(Domain, p =>
      Expr.is(Domain, 'Available', ({ price }) => Expr.lte(price, p.budget)),
    ),
    // Who may ask about one: anything not yet confirmed.
    unconfirmed: guard.row(Domain, () => Expr.is(Domain, 'Unconfirmed')),
  }),
  { key: buyer => buyer.id, unguarded: 'deny' },
)
const Policy = G.implement({})

const rows = {
  cheap: { _tag: 'Available', id: 'a', name: 'a.dev', price: 10 },
  dear: { _tag: 'Available', id: 'b', name: 'b.dev', price: 900 },
  open: { _tag: 'Unconfirmed', id: 'c', name: 'c.dev', price: null },
} as const
const buyer = Option.some({ id: 'ada', budget: 100 })
const decide = (
  guard: typeof G.affordable | typeof G.unconfirmed,
  row: Readonly<Record<string, unknown>>,
) => Effect.runSync(Policy.decide(guard, { principal: buyer, interaction: 'Read', row }))

describe('a rule per case of a variant Entity', () => {
  it('holds of the rows of its case that meet it', () => {
    expect(decide(G.affordable, rows.cheap)).toBe(true)
    expect(decide(G.affordable, rows.dear)).toBe(false)
  })

  it('is false, not a refusal by unknown, on a row of another case', () => {
    expect(decide(G.affordable, rows.open)).toBe(false)
    expect(decide(G.unconfirmed, rows.open)).toBe(true)
    expect(decide(G.unconfirmed, rows.cheap)).toBe(false)
  })

  it('is refused on another Entity, where it is declared', () => {
    const Order = Entity.define('Order', Schema.Struct({ id: Schema.String }))
    expect(() =>
      Guards.declare(
        'Orders',
        Buyer,
        guard => ({
          // @ts-expect-error a rule over Order reads Domain: refused at run time too, for an untyped caller
          misplaced: guard.row(Order, () => Expr.is(Domain, 'Unconfirmed')),
        }),
        { key: buyer => buyer.id, unguarded: 'deny' },
      ),
    ).toThrow()
  })

  it('reads the stored row: _tag and the case’s fields', () => {
    expect(
      Guards.guardFields(Domain.pipe(Guards.attach(G, { row: { Read: [G.affordable] } })), 'Read'),
    ).toEqual(['_tag', 'price'])
  })
})
