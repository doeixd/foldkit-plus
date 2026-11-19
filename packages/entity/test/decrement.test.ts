/**
 * `Write.update`'s `decrement`: an increment the other way, bound as the
 * amount negated, so every writer adds it as it adds an increment's, and one
 * field moved by one amount.
 */
import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Entity, Expr, Operators, Write } from '../src/index.js'

const Account = Entity.define(
  'Account',
  Schema.Struct({
    id: Schema.String,
    balance: Schema.Number,
    withdrawnToday: Schema.Number,
    cents: Schema.Int,
    revision: Schema.Number,
  }),
)
const Withdraw = Entity.input(
  Account,
  Schema.Struct({
    id: Schema.String,
    revision: Schema.Number,
    amount: Schema.Number,
    whole: Schema.Int,
    note: Schema.String,
  }),
  { amount: Entity.unmapped, whole: Entity.unmapped, note: Entity.unmapped },
)
const withdraw = Write.update(Withdraw, {
  id: 'id',
  expect: 'revision',
  increment: { withdrawnToday: 'amount' },
  decrement: { balance: 'amount' },
})
const value = { id: 'a1', revision: 1, amount: 30, whole: 2, note: '' }

describe('A write that decrements a field', () => {
  it('declares each move with its direction, an increment and a decrement from one key', () => {
    expect(
      withdraw.increments.map(({ key, field, direction }) => ({
        key,
        field: field.key,
        direction,
      })),
    ).toEqual([
      { key: 'amount', field: 'withdrawnToday', direction: 'increment' },
      { key: 'amount', field: 'balance', direction: 'decrement' },
    ])
    expect(Write.writes(withdraw).map(field => field.key)).toEqual(['withdrawnToday', 'balance'])
  })

  it('binds the amount negated, a zero as zero', () => {
    expect(Write.bind(withdraw, value).increments).toEqual({ withdrawnToday: 30, balance: -30 })
    expect(Object.is(Write.bind(withdraw, { ...value, amount: 0 }).increments.balance, 0)).toBe(
      true,
    )
  })

  it('leaves the row the amount lower, as a client predicts it', () => {
    expect(
      Write.apply({ balance: 100, withdrawnToday: 0 }, Write.bind(withdraw, value), {
        operators: Operators.kernel,
      }).row,
    ).toEqual({ balance: 70, withdrawnToday: 30 })
  })

  it('takes a whole amount from an integer field', () => {
    const write = Write.update(Withdraw, { id: 'id', decrement: { cents: 'whole' } })
    expect(Write.bind(write, value).increments).toEqual({ cents: -2 })
  })

  it.each([
    [
      'a field it also increments',
      () =>
        Write.update(Withdraw, {
          id: 'id',
          increment: { balance: 'amount' },
          decrement: { balance: 'amount' },
        }),
      'decrements "balance", which it also increments; move a field by one amount',
    ],
    [
      'a field it also computes',
      () =>
        Write.update(Withdraw, {
          id: 'id',
          decrement: { balance: 'amount' },
          compute: { balance: ({ row }) => Expr.sub(row.balance, 1) },
        }),
      'computes "balance", which the write also sets',
    ],
    [
      'the revision it expects',
      () =>
        Write.update(Withdraw, { id: 'id', expect: 'revision', decrement: { revision: 'amount' } }),
      'decrements "revision", the revision it expects',
    ],
    [
      'a fractional amount from an integer field',
      () => Write.update(Withdraw, { id: 'id', decrement: { cents: 'amount' } }),
      '"amount" may not be an integer, but "cents" is one',
    ],
  ])('refuses %s, naming it', (_, declare, message) => {
    expect(declare).toThrow(message)
  })

  it('refuses a field a key also sets', () => {
    const SetsBalance = Entity.input(
      Account,
      Schema.Struct({ id: Schema.String, balance: Schema.Number, amount: Schema.Number }),
      { amount: Entity.unmapped },
    )
    expect(() => Write.update(SetsBalance, { id: 'id', decrement: { balance: 'amount' } })).toThrow(
      'decrements "balance", which a key also sets',
    )
  })

  it('refuses an amount that is no number, at the key and where it is declared', () => {
    expect(() =>
      // @ts-expect-error `note` holds text, and an amount is a number
      Write.update(Withdraw, { id: 'id', decrement: { balance: 'note' } }),
    ).toThrow('"note" is an amount, but not a number')
  })
})
