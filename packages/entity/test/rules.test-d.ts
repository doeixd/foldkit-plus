/** `in` takes a state of the rule's own Entity; `Entity.transition` takes what `invariant` does. */
import { Schema } from 'effect'
import { Entity, Expr } from '../src/index.js'

const Account = Entity.define(
  'Account',
  Schema.Struct({ id: Schema.String, status: Schema.String, balance: Schema.Number }),
)
const Ledger = Entity.define('Ledger', Schema.Struct({ id: Schema.String, status: Schema.String }))
const Open = Entity.refine(Account, 'Open', { status: 'open' })
const LedgerOpen = Entity.refine(Ledger, 'Open', { status: 'open' })

Entity.invariant<typeof Account>('covered', ({ after }) => Expr.gte(after.balance, 0), {
  message: 'm',
  in: Open,
})
Entity.transition<typeof Account>(
  'neverFalls',
  ({ before, after }) => Expr.gte(after.balance, before.balance),
  { message: 'm', in: Open },
)
Entity.invariant<typeof Account>('covered', ({ after }) => Expr.gte(after.balance, 0), {
  message: 'm',
  // @ts-expect-error a state of another Entity
  in: LedgerOpen,
})
