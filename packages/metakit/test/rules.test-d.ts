import { Option, Schema } from 'effect'
import { expectTypeOf } from 'vitest'
import { Expr, Num } from 'metakit'

const Account = Schema.Struct({ balance: Schema.Number, reserved: Schema.Number }).pipe(
  Expr.refine($ => Num.lte($.reserved, $.balance), { message: 'reserved exceeds balance' }),
)
type Account = typeof Account.Type

for (const rule of Expr.rulesOf(Account)) {
  expectTypeOf(rule.at).toEqualTypeOf<ReadonlyArray<string>>()
  expectTypeOf(rule.expr).toEqualTypeOf<Expr.Expr<Account, boolean>>()
  expectTypeOf(rule.message).toEqualTypeOf<Option.Option<string>>()
  // @ts-expect-error the rule reads an Account, not any value
  Expr.eval(rule.expr, { balance: 'ten' })
}

expectTypeOf(Expr.rulesOf(Account)).toEqualTypeOf<ReadonlyArray<Expr.Refinement<Account>>>()
