/** The kernel's arithmetic, `Expr.add` and `Expr.sub`: metakit's `num.add` and `num.sub`. */
import { Option, Schema } from 'effect'
import { Node, Num } from 'metakit'
import { Laws } from '../lawCore.js'
import { makeOperator, type Operator } from './operator.js'

/** A number, or a null, which a strict operator answers with null. */
const NullableNumber = Schema.NullOr(Schema.Number)

/** Each law of addition and subtraction holds over finite numbers; an infinity minus itself is NaN. */
const finiteDomain: Option.Option<Schema.Top> = Option.some(Schema.Finite)

type Arithmetic = Operator<
  readonly [typeof NullableNumber, typeof NullableNumber],
  typeof Schema.Number
>

/**
 * The sum of two numbers, as an expression a comparison, an order term or a
 * write's `compute` reads:
 *
 * ```ts
 * Expr.lte(Expr.add(row.withdrawnToday, input.amount), 500)
 * ```
 *
 * A primitive operator of the kernel (`number.add`, metakit's `num.add`), so
 * each reader runs it: `+` in memory, in SQLite and in Postgres. Each argument
 * is a number as stored (a text field is a type error where it is passed). A
 * null on either side gives null, as SQL's `+` does. A sum past the safe
 * integer range, or a NaN or infinity, is refused, since the databases part
 * there.
 */
export const add = makeOperator(
  'number.add',
  {
    input: [NullableNumber, NullableNumber],
    output: Schema.Number,
    description:
      'Addition over numbers, of two arguments: the first plus the second (left + right); null when either is null.',
    laws: [
      Laws.Commutative({ domain: finiteDomain }),
      Laws.Monotonic({ domain: finiteDomain, direction: 'increasing', position: 0 }),
      Laws.Monotonic({ domain: finiteDomain, direction: 'increasing', position: 1 }),
    ],
  },
  args => Node.Call({ op: Num.addOp, args }),
) as unknown as Arithmetic

/** The first number less the second (`number.subtract`, metakit's `num.sub`); see `Expr.add`. */
export const sub = makeOperator(
  'number.subtract',
  {
    input: [NullableNumber, NullableNumber],
    output: Schema.Number,
    description:
      'Subtraction over numbers, of two arguments: the first minus the second (left - right); null when either is null.',
    laws: [
      Laws.Monotonic({ domain: finiteDomain, direction: 'increasing', position: 0 }),
      Laws.Monotonic({ domain: finiteDomain, direction: 'decreasing', position: 1 }),
    ],
  },
  args => Node.Call({ op: Num.subOp, args }),
) as unknown as Arithmetic
