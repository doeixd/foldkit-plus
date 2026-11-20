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

/** Build a `Call` expression from an `Op` and argument `ExprInput`s. */
export const call = <Env, A>(
  op: Node.Op,
  args: ReadonlyArray<ExprInput<Env, unknown>>,
): Expr<Env, A> => wrap<Env, A>(Node.Call({ op, args: args.map(toNode) }))
