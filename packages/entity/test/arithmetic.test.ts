/**
 * `Expr.implies`, `Expr.add` and `Expr.sub`: an implication is the `or` of a
 * negation, three-valued as its parts, and the sum and difference are the
 * kernel's own operators, read by every reader as any primitive call is.
 */
import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  Computation,
  Entity,
  Expr,
  Operators,
  Query,
  Write,
  dependenciesOf,
  evaluate,
  truthOver,
  type Predicate,
} from '../src/index.js'
import { Conformance } from '../src/conformance/index.js'

const Account = Entity.define(
  'Account',
  Schema.Struct({
    id: Schema.String,
    status: Schema.Literals(['open', 'closed']),
    balance: Schema.NullOr(Schema.Number),
    withdrawnToday: Schema.Number,
    cents: Schema.Int,
  }),
)

const { status, balance, withdrawnToday } = Account.fields
const open = Expr.eq(status, 'open')
const covered = Expr.gte(balance, 0)

describe('Expr.implies', () => {
  it('is the or of the condition negated and the consequence, as nodes', () => {
    expect(Expr.implies(open, covered)).toEqual(Expr.or(Expr.not(open), covered))
  })

  // The condition: open is true, false, or unknown for a null status; the
  // consequence: covered is true, false, or unknown for a null balance.
  const truths = [
    { condition: 'open', consequence: 5, truth: true },
    { condition: 'open', consequence: -1, truth: false },
    { condition: 'open', consequence: null, truth: 'unknown' },
    { condition: 'closed', consequence: 5, truth: true },
    { condition: 'closed', consequence: -1, truth: true },
    { condition: 'closed', consequence: null, truth: true },
    { condition: null, consequence: 5, truth: true },
    { condition: null, consequence: -1, truth: 'unknown' },
    { condition: null, consequence: null, truth: 'unknown' },
  ] as const
  it.each(truths)(
    'answers $truth where the condition reads $condition and the balance $consequence',
    ({ condition, consequence, truth }) => {
      const row = { id: 'a', status: condition, balance: consequence, withdrawnToday: 0, cents: 0 }
      expect(truthOver(Expr.implies(open, covered), row)).toBe(truth)
    },
  )
})

const sum = Expr.add(balance, Expr.input('amount', Schema.Number))
const difference = Expr.sub(withdrawnToday, balance)

describe('Expr.add and Expr.sub', () => {
  it('read both operands', () => {
    const read = dependenciesOf(Expr.lte(sum, difference))
    expect(read.fields.map(field => field.key)).toEqual(['balance', 'withdrawnToday'])
    expect(read.inputs).toEqual(['amount'])
    expect(read.operators.map(operator => operator.id)).toEqual(['number.add', 'number.subtract'])
  })

  it('print infix, each call in its parentheses', () => {
    expect(Expr.show(Expr.gte(Expr.sub(sum, 3), Expr.field(withdrawnToday)))).toBe(
      '((Account.balance + $amount) - 3) >= Account.withdrawnToday',
    )
  })

  it('say what they are to a reader of the data: name, arity, kind and laws', () => {
    const described = [Expr.add, Expr.sub].map(Operators.describe)
    expect(
      described.map(({ name, input, description }) => ({ name, input: input.length, description })),
    ).toEqual([
      {
        name: 'number.add',
        input: 2,
        description:
          'Addition over numbers, of two arguments: the first plus the second (left + right); null when either is null.',
      },
      {
        name: 'number.subtract',
        input: 2,
        description:
          'Subtraction over numbers, of two arguments: the first minus the second (left - right); null when either is null.',
      },
    ])
    expect(described.map(({ laws }) => laws.map(law => law.kind))).toEqual([
      ['commutative', 'monotonic', 'monotonic'],
      ['monotonic', 'monotonic'],
    ])
  })

  it.each([
    ['Expr.add', Expr.add],
    ['Expr.sub', Expr.sub],
  ] as const)('%s keeps the laws it declares in memory', (_, op) => {
    expect(Conformance.laws(op, Operators.kernel)._tag).toBe('Holds')
  })

  const rows = [
    { id: 'a', status: 'open', balance: 10, withdrawnToday: 4, cents: 0 },
    { id: 'b', status: 'open', balance: 2, withdrawnToday: 0, cents: 0 },
    { id: 'c', status: 'open', balance: null, withdrawnToday: 1, cents: 0 },
  ]
  const ids = (where: Predicate, input = {}) =>
    evaluate(Query.from(Account).pipe(Query.where(where)), input, rows).map(row => row.id)

  it('add and subtract, a null on either side unknown', () => {
    expect(ids(Expr.gte(sum, 7), { amount: 3 })).toEqual(['a'])
    expect(ids(Expr.lt(difference, 0))).toEqual(['a', 'b'])
    expect(ids(Expr.not(Expr.lt(difference, 0)))).toEqual([])
    expect(ids(Expr.eq(Expr.sub(Expr.add(withdrawnToday, 2), 1), 5))).toEqual(['a'])
  })

  it('subtract the second from the first, not the reverse', () => {
    expect(ids(Expr.eq(Expr.sub(balance, withdrawnToday), 6))).toEqual(['a'])
  })

  it('refuse a text field at the argument', () => {
    expect(() =>
      // @ts-expect-error status is text, and an operand of a sum is a number
      Expr.add(status, 1),
    ).toThrow('number.add: argument 1 is stored as text, but the operator takes number')
  })
})

const Withdraw = Entity.input(
  Account,
  Schema.Struct({ id: Schema.String, amount: Schema.Int, fraction: Schema.Number }),
  { amount: Entity.unmapped, fraction: Entity.unmapped },
)

describe('A computed assignment over arithmetic', () => {
  it('is an integer where both operands are, and so may compute an integer field', () => {
    const write = Write.update(Withdraw, {
      id: 'id',
      compute: { cents: ({ row, input }) => Expr.sub(row.cents, input.amount) },
    })
    expect(write.assignments.map(each => each.integer)).toEqual([true])
    expect(Write.bind(write, { id: 'a', amount: 3, fraction: 0 }).assignments).toEqual({
      cents: Computation.Call({
        operator: 'number.subtract',
        args: [Computation.Field({ key: 'cents' }), Computation.Value({ value: 3 })],
      }),
    })
    expect(
      Write.apply({ cents: 10 }, Write.bind(write, { id: 'a', amount: 3, fraction: 0 }), {
        operators: Operators.kernel,
      }).row,
    ).toEqual({ cents: 7 })
  })

  it('is refused for an integer field where an operand may be a fraction', () => {
    expect(() =>
      Write.update(Withdraw, {
        id: 'id',
        compute: { cents: ({ row, input }) => Expr.add(row.cents, input.fraction) },
      }),
    ).toThrow('computes "cents" as a number that may not be an integer')
  })
})
