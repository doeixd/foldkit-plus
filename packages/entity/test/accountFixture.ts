/**
 * The bank account of #600, the domain `Laws.check` is measured on: an
 * account is open or closed, never overdrawn while open, within a daily
 * withdrawal limit while open, and a closed one stays closed. Its writes are
 * built by `writes`, so each test can weaken or strengthen one of them.
 */
import { Schema } from 'effect'
import { Entity, Expr, Operators, Write, type FieldExpr, type InputExpr } from '../src/index.js'

export const DAILY_LIMIT = 1000

const Fields = Entity.define(
  'Account',
  Schema.Struct({
    id: Schema.String,
    status: Schema.Literals(['open', 'closed']),
    balance: Schema.Number,
    withdrawnToday: Schema.Number,
  }),
)
export const neverOverdrawn = Entity.invariant<typeof Fields>(
  'neverOverdrawn',
  ({ after }) => Expr.or(Expr.not(Expr.eq(after.status, 'open')), Expr.gte(after.balance, 0)),
  { message: 'An open account is never overdrawn' },
)
export const withinDailyLimit = Entity.invariant<typeof Fields>(
  'withinDailyLimit',
  ({ after }) =>
    Expr.or(Expr.not(Expr.eq(after.status, 'open')), Expr.lte(after.withdrawnToday, DAILY_LIMIT)),
  { message: 'An open account withdraws no more than the daily limit' },
)
export const aClosedAccountStaysClosed = Entity.invariant<typeof Fields>(
  'aClosedAccountStaysClosed',
  ({ before, after }) =>
    Expr.or(Expr.not(Expr.eq(before.status, 'closed')), Expr.eq(after.status, 'closed')),
  { message: 'A closed account stays closed' },
)
export const Account = Fields.pipe(neverOverdrawn, withinDailyLimit, aClosedAccountStaysClosed)
export const Open = Entity.refine(Account, 'Open', { status: 'open' })
export const Closed = Entity.refine(Account, 'Closed', { status: 'closed' })

/** A subtraction the application names, declaring nothing of how it moves. */
export const opaqueMinus = Expr.operator('bank.opaqueMinus', {
  input: [Schema.Number, Schema.Number],
  output: Schema.Number,
})
/** The kernel's own arithmetic (`Expr.add`, `Expr.sub`), and the subtraction above. */
export const operators = Operators.merge(
  Operators.kernel,
  Operators.memory(Operators.implement(opaqueMinus, (left, right) => left - right)),
)

/** What a withdrawal requires of the row before and its amount. */
const conditions = {
  /** Within the balance: what keeps an account from being overdrawn. */
  withinBalance: (amount: InputExpr<number>) => Expr.gte(Account.fields.balance, amount),
  /** Within the balance and today's limit. */
  withinBalanceAndLimit: (amount: InputExpr<number>) =>
    Expr.and(
      Expr.gte(Account.fields.balance, amount),
      Expr.lte(Expr.add(Account.fields.withdrawnToday, amount), DAILY_LIMIT),
    ),
  /** The regression #600 names: an overdraft of up to the limit slips through. */
  withinBalancePlusLimit: (amount: InputExpr<number>) =>
    Expr.lte(amount, Expr.add(Account.fields.balance, DAILY_LIMIT)),
}

export const writes = (
  options: {
    /** Whether the amount is declared non-negative. */
    readonly nonNegative?: boolean
    readonly when?: keyof typeof conditions
    /** How a withdrawal lowers the balance: `Expr.sub` (the default), `decrement`, or an operator declaring no law. */
    readonly withdraw?: 'sub' | 'decrement' | 'opaqueMinus'
  } = {},
) => {
  const amount = options.nonNegative
    ? Schema.Number.check(Schema.isGreaterThanOrEqualTo(0))
    : Schema.Number
  const withdraw = options.withdraw ?? 'sub'
  const by = (balance: FieldExpr<number>, taken: InputExpr<number>) =>
    withdraw === 'opaqueMinus' ? opaqueMinus(balance, taken) : Expr.sub(balance, taken)
  const byAmount = Entity.input(Account, Schema.Struct({ id: Schema.String, amount }), {
    amount: Entity.unmapped,
  })
  const OpenAccount = {
    name: 'OpenAccount',
    write: Write.insert(
      Entity.input(
        Account,
        Schema.Struct({
          id: Schema.String,
          status: Schema.Literal('open'),
          balance: Schema.Literal(0),
          withdrawnToday: Schema.Literal(0),
        }),
      ),
      { id: 'id', becomes: Open },
    ),
  }
  const CloseAccount = {
    name: 'CloseAccount',
    write: Write.update(
      Entity.input(Account, Schema.Struct({ id: Schema.String, status: Schema.Literal('closed') })),
      { id: 'id', from: Open, becomes: Closed },
    ),
  }
  const DepositMoney = {
    name: 'DepositMoney',
    write: Write.update(byAmount, { id: 'id', from: Open, increment: { balance: 'amount' } }),
  }
  const chosen = options.when
  const decremented =
    chosen === undefined
      ? Write.update(byAmount, {
          id: 'id',
          from: Open,
          increment: { withdrawnToday: 'amount' },
          decrement: { balance: 'amount' },
        })
      : Write.update(byAmount, {
          id: 'id',
          from: Open,
          increment: { withdrawnToday: 'amount' },
          decrement: { balance: 'amount' },
          when: ({ input }) => conditions[chosen](input.amount),
        })
  const WithdrawMoney = {
    name: 'WithdrawMoney',
    write:
      withdraw === 'decrement'
        ? decremented
        : chosen === undefined
          ? Write.update(byAmount, {
              id: 'id',
              from: Open,
              increment: { withdrawnToday: 'amount' },
              compute: { balance: ({ row, input }) => by(row.balance, input.amount) },
            })
          : Write.update(byAmount, {
              id: 'id',
              from: Open,
              increment: { withdrawnToday: 'amount' },
              compute: { balance: ({ row, input }) => by(row.balance, input.amount) },
              when: ({ input }) => conditions[chosen](input.amount),
            }),
  }
  return [OpenAccount, CloseAccount, DepositMoney, WithdrawMoney] as const
}
