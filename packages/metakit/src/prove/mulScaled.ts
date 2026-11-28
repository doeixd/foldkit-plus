/**
 * The solver's reading of `num.mulScaled`: the same integer formula as the
 * evaluator and the SQL, stated with the solver's integer `div` and `mod`
 * (for a positive literal divisor `div` floors and `mod` is never negative).
 */
import type { ZArith, ZBool, Z3 } from './lower.js'

/** `product / 10^shift`, an exact half going to the even neighbour, for `shift > 0`. */
export const halfEven = (z3: Z3, product: ZArith, shift: number): ZArith => {
  const d = z3.Int.val(10n ** BigInt(shift))
  const q = product.div(d)
  const r = product.mod(d)
  const twice = r.mul(2)
  const next = q.add(1)
  const even: ZBool = q.mod(2).eq(0)
  return z3.If(twice.gt(d), next, z3.If(twice.lt(d), q, z3.If(even, q, next)))
}
