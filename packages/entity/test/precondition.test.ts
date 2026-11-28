/**
 * A write's `when` over the row before it and the input: `row` as `compute`
 * reads it, beside the input's placeholders, and the forms before it still
 * stand.
 */
import { Option, Schema } from 'effect'
import { Node } from '@doeixd/metakit'
import { describe, expect, it } from 'vitest'
import { Entity, Expr, Query, Write, truthOver } from '../src/index.js'

const LIMIT = 500

const Account = Entity.define(
  'Account',
  Schema.Struct({ id: Schema.String, balance: Schema.Number, withdrawnToday: Schema.Number }),
)
const Withdraw = Entity.input(
  Account,
  Schema.Struct({ id: Schema.String, amount: Schema.Number }),
  { amount: Entity.unmapped },
)
/** Declared in each test, so a write refused where it is declared fails that test alone. */
const withdrawal = () =>
  Write.update(Withdraw, {
    id: 'id',
    decrement: { balance: 'amount' },
    increment: { withdrawnToday: 'amount' },
    when: ({ row, input }) =>
      Expr.and(
        Expr.lte(input.amount, row.balance),
        Expr.lte(Expr.add(row.withdrawnToday, input.amount), LIMIT),
      ),
  })
const met = (balance: number, withdrawnToday: number, amount: number) =>
  truthOver(withdrawal().when.value.where[0]!, { balance, withdrawnToday }, { amount })

describe('A precondition over the row and the input', () => {
  it('reads the fields `row` names and the input it is given', () => {
    const withdraw = withdrawal()
    expect(
      Write.reads(withdraw)
        .map(field => field.key)
        .sort(),
    ).toEqual(['balance', 'withdrawnToday'])
    expect(Query.dependencies(withdraw.when.value).inputs).toEqual(['amount'])
    expect(Expr.show(withdraw.when.value.where[0]!)).toBe(
      '$amount <= Account.balance and (Account.withdrawnToday + $amount) <= 500',
    )
  })

  it.each([
    ['within the balance and the limit', 100, 0, 30, true],
    ['the whole balance', 30, 0, 30, true],
    ['more than the balance', 20, 0, 30, false],
    ['past the daily limit', 1000, 480, 30, false],
    ['up to the daily limit', 1000, 470, 30, true],
  ])('holds of a withdrawal %s, or not', (_, balance, withdrawnToday, amount, holds) => {
    expect(met(balance, withdrawnToday, amount)).toBe(holds)
  })

  it('is the same as the form over the Entity’s own fields', () => {
    const over = Write.update(Withdraw, {
      id: 'id',
      decrement: { balance: 'amount' },
      when: ({ input }) => Expr.lte(input.amount, Expr.field(Account.fields.balance)),
    })
    const byRow = Write.update(Withdraw, {
      id: 'id',
      decrement: { balance: 'amount' },
      when: ({ row, input }) => Expr.lte(input.amount, row.balance),
    })
    const conditions = (write: typeof over) =>
      Option.map(write.when, query => query.where.map(each => Node.key(each.node)))
    expect(conditions(byRow)).toEqual(conditions(over))
  })

  it('still takes no argument at all', () => {
    const write = Write.update(Withdraw, {
      id: 'id',
      decrement: { balance: 'amount' },
      when: () => Expr.gt(Account.fields.balance, 0),
    })
    expect(Write.reads(write).map(field => field.key)).toEqual(['balance'])
  })

  it('refuses one reading who asks, as it did', () => {
    expect(() =>
      Write.update(Withdraw, {
        id: 'id',
        decrement: { balance: 'amount' },
        when: ({ row }) => Expr.lte(row.balance, Expr.now),
      }),
    ).toThrow('its `when` reads Expr.now')
  })
})
