/**
 * Internal helpers for wrapping `Node`s into typed `Expr<Env, A>` values and
 * accepting either an `Expr<Env, A>` or a plain literal `A` at call sites.
 */
import * as Node from '../node.js'
import { ExprTypeId, type Expr } from '../path.js'

/** Either an `Expr<Env, A>` or a plain literal value `A`. */
export type ExprInput<Env, A> = Expr<Env, A> | A

/** Extract the `Env` required by an `ExprInput` (`unknown` for plain literals). */
export type EnvOfInput<T> = T extends Expr<infer E, unknown> ? E : unknown

/** Extract the output value type of an `ExprInput`. */
export type ValueOfInput<T> = T extends Expr<never, infer A> ? A : T

/** `null` where the input may be null: what a null-strict operator's result then may be. */
export type NullOf<T> = null extends ValueOfInput<T> ? null : never

/** Convert a union of environments into their intersection. */
export type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (
  x: infer I,
) => void
  ? I
  : never

/** Wrap a raw `Node` as a typed `Expr<Env, A>`. */
export const wrap = <Env, A>(node: Node.Node): Expr<Env, A> => ({
  [ExprTypeId]: undefined as never,
  node,
})

/** True when `value` is an `Expr` (including a `Path`). */
export const isExpr = (value: unknown): value is Expr<never, unknown> =>
  typeof value === 'object' && value !== null && ExprTypeId in value

/** Convert an `ExprInput` (either an `Expr` or a literal) to a `Node`. */
export const toNode = <Env, A>(input: ExprInput<Env, A>): Node.Node =>
  isExpr(input) ? input.node : Node.Lit({ value: input })

/** Build a `Call` expression from an operator, core or foreign, and argument `ExprInput`s. */
export const call = <Env, A>(
  op: Node.AnyOp,
  args: ReadonlyArray<ExprInput<Env, unknown>>,
): Expr<Env, A> => wrap<Env, A>(Node.Call({ op, args: args.map(toNode) }))
