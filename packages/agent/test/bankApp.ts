import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Eq, Expr, Num, Transition } from '@doeixd/metakit'
import { Money } from '@doeixd/metakit/domain'
import * as Machine from '@doeixd/metakit/machine'

/**
 * An account whose rules are a metakit Machine, and an application whose
 * `update` applies them: the fixture for `foldkit-agent/metakit`.
 */
export const Usd = Money.make('USD')

export const Account = Schema.Struct({ balance: Usd, status: Schema.Literals(['open', 'frozen']) })
export type Account = typeof Account.Type

const WithdrawInput = Schema.Struct({
  amount: Usd.pipe(Expr.refine($ => Num.gt($, 0))),
  memo: Schema.optional(Schema.String),
}).pipe(Expr.refine($ => Num.lte($.amount, 100_000)))

/** Read by the opaque guard below, which no static check can see into. */
export const auditWindow = { open: false }

export const AccountMachine = Machine.make({
  state: Account,
  transitions: {
    Withdraw: Transition.make({
      state: Account,
      input: WithdrawInput,
      when: ({ state, input }) =>
        Expr.all(Eq.is(state.status, 'open'), Num.lte(input.amount, state.balance)),
      apply: ({ state, input }) => [
        Transition.set(state.balance, Money.sub(state.balance, input.amount)),
      ],
    }),
    Freeze: Transition.make({
      state: Account,
      input: Schema.Struct({}),
      when: ({ state }) => Eq.is(state.status, 'open'),
      apply: ({ state }) => [Transition.set(state.status, 'frozen')],
    }),
    Audit: Transition.make({
      state: Account,
      input: Schema.Struct({}),
      when: () => Expr.opaque({ name: 'auditWindow' }, () => auditWindow.open),
      apply: () => [],
    }),
  },
})

export const Model = Schema.Struct({ account: Account })
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  Withdraw: { amount: Usd, memo: Schema.optional(Schema.String) },
  Paid: { amount: Usd, source: Schema.Literal('Agent') },
  Freeze: {},
  Audit: {},
})
export type Message = typeof Message.Type

export interface Caller {
  readonly canPay: boolean
}

/** Every Message applies its transition through the machine. */
export const update = (model: Model, message: Message): Model => {
  const [account] = Message.match(message, {
    Withdraw: ({ amount }) =>
      AccountMachine.update(model.account, { _tag: 'Withdraw', input: { amount } }),
    Paid: ({ amount }) =>
      AccountMachine.update(model.account, { _tag: 'Withdraw', input: { amount } }),
    Freeze: () => AccountMachine.update(model.account, { _tag: 'Freeze', input: {} }),
    Audit: () => AccountMachine.update(model.account, { _tag: 'Audit', input: {} }),
  })
  return account === model.account ? model : { account }
}
