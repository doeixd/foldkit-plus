/**
 * Numeric arithmetic primitives (`num.add`, `num.sub`, `num.mul`, `num.neg`)
 * and derived helpers (`min`, `max`, `abs`, `clamp`) built over `If` + `Ord`.
 *
 * Null-strict: a null operand gives null, after an operand that is NaN or
 * infinite is refused. A result that is NaN or infinite is refused, and so is
 * an integer result past ±(2^53−1), where a double no longer holds every
 * integer and SQL's answer would differ.
 *
 * `Ord` comparisons (`lt`, `lte`, `gt`, `gte`) are also re-exported here for
 * ergonomic `Num.lte(...)` call sites.
 */
import * as Node from '../node.js'
import type { Expr } from '../path.js'
import { call, toNode, wrap, type EnvOfInput, type NullOf } from './core.js'
import * as Ord from './ord.js'

export { gt, gte, gtOp, gteOp, lt, lte, ltOp, lteOp } from './ord.js'
export { mulScaled } from './mulScaled.js'

const arithmetic =
  (id: Node.CoreOpId, compute: (a: number, b: number) => number) =>
  (args: ReadonlyArray<unknown>): unknown => {
    const other = args.find(arg => typeof arg !== 'number')
    if (other !== undefined) return Node.illTyped(id, 'a number', other)
    const result = compute(args[0] as number, args[1] as number)
    if (!Number.isFinite(result)) {
      return new Node.Refusal({
        reason: 'non-finite',
        at: id,
        detail: `the result of ${args.join(', ')} is not a finite number`,
      })
    }
    if (args.every(Number.isSafeInteger) && !Number.isSafeInteger(result)) {
      return new Node.Refusal({
        reason: 'unsafe-integer',
        at: id,
        detail: `the result of ${args.join(', ')} is past ±(2^53−1)`,
      })
    }
    // -0 is a double's accident, not an integer SQL can hold.
    return result === 0 ? 0 : result
  }

/** NaN or an infinity, whose every result is not finite: refused before null. */
const notFinite =
  (id: Node.CoreOpId) =>
  (value: unknown): Node.Refusal | undefined =>
    typeof value === 'number' && !Number.isFinite(value)
      ? new Node.Refusal({ reason: 'non-finite', at: id, detail: `an operand is ${value}` })
      : undefined

export const addOp: Node.Op<'num.add'> = {
  id: 'num.add',
  returns: 'number',
  nulls: 'strict',
  refuses: notFinite('num.add'),
  evaluate: arithmetic('num.add', (a, b) => a + b),
}

export const subOp: Node.Op<'num.sub'> = {
  id: 'num.sub',
  returns: 'number',
  nulls: 'strict',
  refuses: notFinite('num.sub'),
  evaluate: arithmetic('num.sub', (a, b) => a - b),
}

export const mulOp: Node.Op<'num.mul'> = {
  id: 'num.mul',
  returns: 'number',
  nulls: 'strict',
  refuses: notFinite('num.mul'),
  evaluate: arithmetic('num.mul', (a, b) => a * b),
}

export const negOp: Node.Op<'num.neg'> = {
  id: 'num.neg',
  returns: 'number',
  nulls: 'strict',
  refuses: notFinite('num.neg'),
  evaluate: arithmetic('num.neg', a => -a),
}

export const add = <L extends Ord.NullableNumber, R extends Ord.NullableNumber>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, number | NullOf<L> | NullOf<R>> => call(addOp, [left, right])

export const sub = <L extends Ord.NullableNumber, R extends Ord.NullableNumber>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, number | NullOf<L> | NullOf<R>> => call(subOp, [left, right])

export const mul = <L extends Ord.NullableNumber, R extends Ord.NullableNumber>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, number | NullOf<L> | NullOf<R>> => call(mulOp, [left, right])

export const neg = <X extends Ord.NullableNumber>(
  value: X,
): Expr<EnvOfInput<X>, number | NullOf<X>> => call(negOp, [value])

/** Derived helper: `if (a <= b) then a else b`; null when either is null. */
export const min = <L extends Ord.NullableNumber, R extends Ord.NullableNumber>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, number | NullOf<L> | NullOf<R>> =>
  wrap(
    Node.If({
      cond: Ord.lte(left, right).node,
      then: toNode(left),
      otherwise: toNode(right),
    }),
  )

/** Derived helper: `if (a >= b) then a else b`; null when either is null. */
export const max = <L extends Ord.NullableNumber, R extends Ord.NullableNumber>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, number | NullOf<L> | NullOf<R>> =>
  wrap(
    Node.If({
      cond: Ord.gte(left, right).node,
      then: toNode(left),
      otherwise: toNode(right),
    }),
  )

/** Derived helper: `if (x < 0) then -x else x`; null for null. */
export const abs = <X extends Ord.NullableNumber>(
  value: X,
): Expr<EnvOfInput<X>, number | NullOf<X>> =>
  wrap(
    Node.If({
      cond: Ord.lt(value, 0).node,
      then: neg(value).node,
      otherwise: toNode(value),
    }),
  )

/** Derived helper: `min(hi, max(lo, x))`. */
export const clamp = <
  X extends Ord.NullableNumber,
  Lo extends Ord.NullableNumber,
  Hi extends Ord.NullableNumber,
>(
  value: X,
  lo: Lo,
  hi: Hi,
): Expr<
  EnvOfInput<X> & EnvOfInput<Lo> & EnvOfInput<Hi>,
  number | NullOf<X> | NullOf<Lo> | NullOf<Hi>
> => wrap(min(hi, max(lo, value)).node)
