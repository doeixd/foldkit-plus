import { Schema } from 'effect'
import { expectTypeOf } from 'vitest'
import { Path, type Expr } from '../src/index.js'
import * as Operation from '../src/operation.js'
import * as OperationSql from '../src/operationSql.js'

const Flags = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 2147483647 }))

// Positive cases: inference works without annotations or generic arguments.
const flagsOr = Operation.define({
  id: 'flags.or',
  version: 1,
  args: [Flags, Flags],
  returns: Flags,
  nulls: 'strict',
  claims: {
    commutative: true,
    associative: true,
    idempotent: true,
    identity: { value: 0, side: 'both' },
  },
})

const flagsXor = Operation.define({
  id: 'flags.xor',
  version: 1,
  args: [Flags, Flags],
  returns: Flags,
  nulls: 'strict',
  claims: {
    commutative: true,
    associative: true,
    identity: { value: 0, side: 'both' },
    invertible: { inverse: 'self' },
  },
})

const flagsClamp = Operation.define({
  id: 'flags.clamp',
  version: 1,
  args: [Flags, Flags, Flags],
  returns: Flags,
  nulls: 'strict',
  claims: { monotone: ['up', 'none', 'none'] },
})

const State = Schema.Struct({ granted: Flags, label: Schema.String })
const $ = Path.from(State)

// Literal argument does not erase the Path argument's environment, and non-null args stay non-null.
const grantedOrFour = flagsOr($.granted, 4)
expectTypeOf(grantedOrFour).toEqualTypeOf<Expr.Expr<typeof State.Type, number>>()

const clamped = flagsClamp($.granted, 0, 10)
expectTypeOf(clamped).toEqualTypeOf<Expr.Expr<typeof State.Type, number>>()

// Nullable argument widens strict operation result to `number | null`.
const grantedOrNull = flagsOr($.granted, null)
expectTypeOf(grantedOrNull).toEqualTypeOf<Expr.Expr<typeof State.Type, number | null>>()

// Negative cases: each constraint probed alone.

// 1. Core prefix id
Operation.define({
  // @ts-expect-error core prefix "num." is rejected
  id: 'num.half',
  version: 1,
  args: [Flags],
  returns: Flags,
  nulls: 'strict',
})

// 2. Identity of wrong type
Operation.define({
  id: 'flags.wrongId',
  version: 1,
  args: [Flags, Flags],
  returns: Flags,
  nulls: 'strict',
  // @ts-expect-error identity value must be number, not string
  claims: { identity: { value: '0', side: 'both' } },
})

// 3. Commutative on (Int, String)
Operation.define({
  id: 'mix.bad',
  version: 1,
  args: [Schema.Int, Schema.String],
  returns: Schema.Int,
  nulls: 'strict',
  // @ts-expect-error commutative requires two arguments of one Schema and result of that Schema
  claims: { commutative: true },
})

// 4. Monotone tuple of wrong length
Operation.define({
  id: 'flags.badMono',
  version: 1,
  args: [Flags, Flags],
  returns: Flags,
  nulls: 'strict',
  // @ts-expect-error monotone tuple must match args length (2, not 3)
  claims: { monotone: ['up', 'up', 'none'] },
})

// 5. Inverse of wrong signature
const unaryText = Operation.define({
  id: 'txt.id',
  version: 1,
  args: [Schema.String],
  returns: Schema.String,
  nulls: 'strict',
})
Operation.define({
  id: 'flags.badInv',
  version: 1,
  args: [Flags, Flags],
  returns: Flags,
  nulls: 'strict',
  // @ts-expect-error inverse must be (Flags, Flags) => Flags or 'self'
  claims: { invertible: { inverse: unaryText } },
})

// 6. Call with wrong argument type (error lands on the argument)
// @ts-expect-error string is not assignable to number | null
flagsOr($.granted, 'nope')

// 7. implement with wrong argument type
// @ts-expect-error parameter a is number, not string
Operation.implement(flagsOr, (a: string, b: number) => a.length + b)

// 8. implement with wrong arity (3 args for 2-arg op)
// @ts-expect-error too many parameters for binary flagsOr
Operation.implement(flagsOr, (a: number, b: number, c: number) => a + b + c)

// 9. lowering with wrong arity
OperationSql.lowering(flagsOr, {
  // @ts-expect-error binary op lowering takes 2 pieces, not 3
  sqlite: (a, b, c) => OperationSql.piece`(${a} | ${b} | ${c})`,
})

// 10. piece rejects raw string interpolation
// @ts-expect-error raw string cannot be interpolated into piece
OperationSql.piece`(${'raw'})`

void flagsXor
