/** A rule per case of a variant Entity (#357), as the types see it. */
import { Schema } from 'effect'
import { Entity, Expr } from 'foldkit-entity'
import { Guards } from '../src/index.js'

const Domain = Entity.defineVariants('Domain', {
  Available: { id: Schema.String, price: Schema.Finite },
  Unconfirmed: { id: Schema.String },
})

Guards.declare(
  'Domains',
  Schema.Struct({ id: Schema.String, budget: Schema.Finite }),
  guard => ({
    affordable: guard.row(Domain, p =>
      Expr.is(Domain, 'Available', ({ price }) => Expr.lte(price, p.budget)),
    ),
    unpriced: guard.row(Domain, p =>
      Expr.is(
        Domain,
        'Unconfirmed',
        // @ts-expect-error an Unconfirmed has no price to read
        ({ price }) => Expr.lte(price, p.budget),
      ),
    ),
  }),
  { key: buyer => buyer.id, unguarded: 'deny' },
)
