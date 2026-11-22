/**
 * What `Expr.add`, `Expr.sub` and `Expr.implies` accept and refuse: numbers on
 * either side of a sum, predicates on either side of an implication.
 */
import { Schema } from 'effect'
import { expectTypeOf } from 'vitest'
import { Entity, Expr, type Expr as ExprOf, type Predicate, type Reads } from '../src/index.js'

const Account = Entity.define(
  'Account',
  Schema.Struct({
    id: Schema.String,
    status: Schema.Literals(['open', 'closed']),
    balance: Schema.Number,
    overdraft: Schema.NullOr(Schema.Number),
  }),
)
const { status, balance, overdraft } = Account.fields
const amount = Expr.input('amount', Schema.Number)
const label = Expr.input('label', Schema.String)

// A number field, a nullable one, an input and a literal, on either side.
expectTypeOf(Expr.add(balance, amount)).toEqualTypeOf<ExprOf<number> & Reads<'Account'>>()
expectTypeOf(Expr.add(amount, balance)).toEqualTypeOf<ExprOf<number> & Reads<'Account'>>()
expectTypeOf(Expr.sub(1, overdraft)).toEqualTypeOf<ExprOf<number> & Reads<'Account'>>()
expectTypeOf(Expr.sub(Expr.add(balance, 1), amount)).toEqualTypeOf<
  ExprOf<number> & Reads<'Account'>
>()

// A sum compares as a number, on either side of the comparison.
Expr.gte(Expr.add(balance, amount), 0)
Expr.lte(amount, Expr.sub(Expr.field(balance), 1))

// @ts-expect-error a text field is no operand of a sum, on the left
Expr.add(status, 1)
// @ts-expect-error a text field is no operand of a sum, on the right
Expr.sub(1, status)
// @ts-expect-error a text input is no operand of a sum
Expr.add(balance, label)
// @ts-expect-error a text literal is no operand of a sum
Expr.sub(balance, 'one')
// @ts-expect-error a sum compares with numbers, not text
Expr.eq(Expr.add(balance, 1), 'one')

const open = Expr.eq(status, 'open')
const covered = Expr.gte(balance, 0)
expectTypeOf(Expr.implies(open, covered)).toEqualTypeOf<Predicate & Reads<'Account'>>()
// @ts-expect-error the condition is a predicate, not a value
Expr.implies(balance, covered)
// @ts-expect-error the consequence is a predicate, not a value
Expr.implies(open, amount)
