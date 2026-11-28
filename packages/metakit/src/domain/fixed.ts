/**
 * The one implementation behind `Decimal` and `Money`: an integer count of
 * units of `10^-scale`, with exact parsing, formatting, half-even rounding and
 * multiplication in integers, and the symbolic operations both modules export
 * under their own brand. Internal: `@doeixd/metakit/domain` does not export it.
 */
import { Data, Option, Result, SchemaAST } from 'effect'
import * as Node from '../node.js'
import * as Bool from '../ops/bool.js'
import { call, toNode, type EnvOfInput, type ExprInput, type ValueOfInput } from '../ops/core.js'
import * as Eq from '../ops/eq.js'
import { mulScaledOp, roundHalfEvenBig } from '../ops/mulScaled.js'
import * as Num from '../ops/num.js'
import * as Ord from '../ops/ord.js'
import type { Expr } from '../path.js'
import { domainOfAst } from './annotation.js'

export class InvalidDecimalError extends Data.TaggedError('InvalidDecimalError')<{
  readonly input: string
  readonly reason: string
}> {}

export const MAX_SCALE = 12

export const assertScale = (scale: number, who: string): void => {
  if (!Number.isInteger(scale) || scale < 0 || scale > MAX_SCALE) {
    throw new Error(
      `[metakit] ${who} scale must be an integer between 0 and ${MAX_SCALE}, got ${scale}`,
    )
  }
}

/** Refuse a unit count that is not a safe integer; `-0` becomes `0`. */
export const assertUnits = (amount: number, who: string): number => {
  if (!Number.isSafeInteger(amount)) {
    throw new Error(`[metakit] ${who} requires a safe integer count of units, got ${amount}`)
  }
  return amount === 0 ? 0 : amount
}

const DECIMAL_RE = /^(-)?(\d+)(?:\.(\d+))?$/

/** Parse exact base-10 text into integer units at `scale`, refusing extra digits and unsafe results. */
export const parseUnits = (
  text: string,
  scale: number,
): Result.Result<number, InvalidDecimalError> => {
  const match = DECIMAL_RE.exec(text.trim())
  if (match === null) {
    return Result.fail(new InvalidDecimalError({ input: text, reason: 'invalid decimal syntax' }))
  }
  const frac = match[3] ?? ''
  if (frac.length > scale) {
    return Result.fail(
      new InvalidDecimalError({
        input: text,
        reason: `expected at most ${scale} fractional digit(s), got ${frac.length}`,
      }),
    )
  }
  const magnitude = BigInt(`${match[2]!}${frac.padEnd(scale, '0')}`)
  const num = Number(match[1] === '-' ? -magnitude : magnitude)
  if (!Number.isSafeInteger(num)) {
    return Result.fail(
      new InvalidDecimalError({ input: text, reason: 'decimal value exceeds safe integer range' }),
    )
  }
  return Result.succeed(num === 0 ? 0 : num)
}

/** Format integer units at `scale` as exact fixed-decimal text (`1250`, scale 2: `"12.50"`). */
export const formatUnits = (units: number, scale: number, who: string): string => {
  assertScale(scale, who)
  assertUnits(units, who)
  const sign = units < 0 ? '-' : ''
  const digits = String(Math.abs(units)).padStart(scale + 1, '0')
  if (scale === 0) return `${sign}${digits}`
  return `${sign}${digits.slice(0, -scale)}.${digits.slice(-scale)}`
}

/**
 * Exact half-even (banker's) rounding of `numerator / divisor`, both safe
 * integers and `divisor > 0`. Integer arithmetic only, so no float drift.
 */
export const roundHalfEven = (numerator: number, divisor: number): number => {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(divisor) || divisor <= 0) {
    throw new Error(
      `[metakit] Decimal.roundHalfEven requires a safe integer numerator and a positive safe integer divisor, got (${numerator}, ${divisor})`,
    )
  }
  const result = Number(roundHalfEvenBig(BigInt(numerator), BigInt(divisor)))
  return result === 0 ? 0 : result
}

const scaleAnnotated = (node: Node.Node): Option.Option<number> =>
  Node.$is('Path')(node)
    ? Option.flatMap(
        Option.flatMap(node.ast, ast => domainOfAst(SchemaAST.isUnion(ast) ? nonNull(ast) : ast)),
        meta =>
          meta.kind === 'decimal' || meta.kind === 'money'
            ? Option.some(meta.scale)
            : Option.none(),
      )
    : Option.none()

const nonNull = (ast: SchemaAST.Union): SchemaAST.AST =>
  ast.types.find(member => !SchemaAST.isNull(member)) ?? ast

/** A multiplication operand, with the scale the caller stated for it when it has one. */
export interface Operand {
  readonly value: ExprInput<never, number | null>
  readonly scale: Option.Option<number>
}

/**
 * Multiply two fixed-scale operands into a `num.mulScaled` call, which every
 * reader implements or refuses by name. The product moves `shift` decimal
 * places (down with half-even rounding, or up). A missing operand evaluates to
 * `null`, and a product outside the safe range is refused. An operand read
 * from a field whose Schema declares a scale other than the stated one is
 * refused here.
 */
export const mulExpr = <Env, A>(
  name: string,
  left: Operand,
  right: Operand,
  shift: number,
): Expr<Env, A> => {
  const leftNode = toNode(left.value)
  const rightNode = toNode(right.value)
  for (const [node, stated] of [
    [leftNode, left.scale],
    [rightNode, right.scale],
  ] as const) {
    const declared = scaleAnnotated(node)
    if (Option.isSome(stated) && Option.isSome(declared) && declared.value !== stated.value) {
      throw new Error(
        `[metakit] ${name}: the field's Schema has scale ${declared.value}, but scale ${stated.value} was stated`,
      )
    }
  }
  return call(mulScaledOp, [left.value, right.value, shift])
}

/** `null` when some input may be null, else `never`. */
export type NullIn<I> = null extends ValueOfInput<I> ? null : never

type Same<L> = ExprInput<never, ValueOfInput<L>>
type Env2<L, R> = EnvOfInput<L> & EnvOfInput<R>

/** The symbolic operations `Decimal` and `Money` share, typed by their brand `V`. */
export interface FixedOps<V extends number> {
  readonly add: <L extends ExprInput<never, V>, R extends Same<L>>(
    left: L,
    right: R,
  ) => Expr<Env2<L, R>, ValueOfInput<L>>
  readonly sub: <L extends ExprInput<never, V>, R extends Same<L>>(
    left: L,
    right: R,
  ) => Expr<Env2<L, R>, ValueOfInput<L>>
  readonly neg: <X extends ExprInput<never, V>>(value: X) => Expr<EnvOfInput<X>, ValueOfInput<X>>
  readonly mulInt: <L extends ExprInput<never, V>, F extends ExprInput<never, number>>(
    amount: L,
    factor: F,
  ) => Expr<Env2<L, F>, ValueOfInput<L>>
  readonly min: <L extends ExprInput<never, V>, R extends Same<L>>(
    left: L,
    right: R,
  ) => Expr<Env2<L, R>, ValueOfInput<L>>
  readonly max: <L extends ExprInput<never, V>, R extends Same<L>>(
    left: L,
    right: R,
  ) => Expr<Env2<L, R>, ValueOfInput<L>>
  readonly lt: <L extends ExprInput<never, V>, R extends Same<L>>(
    left: L,
    right: R,
  ) => Expr<Env2<L, R>, boolean>
  readonly lte: <L extends ExprInput<never, V>, R extends Same<L>>(
    left: L,
    right: R,
  ) => Expr<Env2<L, R>, boolean>
  readonly gt: <L extends ExprInput<never, V>, R extends Same<L>>(
    left: L,
    right: R,
  ) => Expr<Env2<L, R>, boolean>
  readonly gte: <L extends ExprInput<never, V>, R extends Same<L>>(
    left: L,
    right: R,
  ) => Expr<Env2<L, R>, boolean>
  readonly is: <L extends ExprInput<never, V>, R extends Same<L>>(
    left: L,
    right: R,
  ) => Expr<Env2<L, R>, boolean>
  readonly isNot: <L extends ExprInput<never, V>, R extends Same<L>>(
    left: L,
    right: R,
  ) => Expr<Env2<L, R>, boolean>
  readonly between: <X extends ExprInput<never, V>, Lo extends Same<X>, Hi extends Same<X>>(
    value: X,
    lo: Lo,
    hi: Hi,
  ) => Expr<EnvOfInput<X> & EnvOfInput<Lo> & EnvOfInput<Hi>, boolean>
}

type AnyNum = ExprInput<never, number>

// Every operation lowers to the core numeric, order and equality operators,
// so each reader (evaluation, SQL, intervals, zones, Z3) reads it as integers.
const untyped = {
  add: (left: AnyNum, right: AnyNum) => Num.add(left, right),
  sub: (left: AnyNum, right: AnyNum) => Num.sub(left, right),
  neg: (value: AnyNum) => Num.neg(value),
  mulInt: (amount: AnyNum, factor: AnyNum) => Num.mul(amount, factor),
  min: (left: AnyNum, right: AnyNum) => Num.min(left, right),
  max: (left: AnyNum, right: AnyNum) => Num.max(left, right),
  lt: (left: AnyNum, right: AnyNum) => Ord.lt(left, right),
  lte: (left: AnyNum, right: AnyNum) => Ord.lte(left, right),
  gt: (left: AnyNum, right: AnyNum) => Ord.gt(left, right),
  gte: (left: AnyNum, right: AnyNum) => Ord.gte(left, right),
  is: (left: AnyNum, right: AnyNum) => call(Eq.isOp, [left, right]),
  isNot: (left: AnyNum, right: AnyNum) => call(Eq.isNotOp, [left, right]),
  between: (value: AnyNum, lo: AnyNum, hi: AnyNum) =>
    Bool.and(Ord.gte(value, lo), Ord.lte(value, hi)),
}

/** The shared operations, typed by the brand `V` of the module that exports them. */
export const ops = <V extends number>(): FixedOps<V> => untyped as unknown as FixedOps<V>
