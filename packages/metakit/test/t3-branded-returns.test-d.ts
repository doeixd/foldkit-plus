import { Schema } from 'effect'
import { expectTypeOf } from 'vitest'
import { Expr, Num } from '../src/index.js'
import * as Fn from '../src/fn.js'

const USD = Schema.Number.check(Schema.isGreaterThan(0)).pipe(Schema.brand('USD'))
const f = Fn.params({ x: Schema.Number })
  .returns(USD)
  .body(({ x }) => Num.add(x, 1))

// T3: direct and symbolic calls expose the declared brand before checking the return Schema.
const value: typeof USD.Type = f.run({ x: 1 })
expectTypeOf(value).toEqualTypeOf<typeof USD.Type>()
expectTypeOf(f.run).returns.toEqualTypeOf<typeof USD.Type>()
expectTypeOf(Expr.evaluate(f({ x: 1 }), {})).toEqualTypeOf<typeof USD.Type>()
