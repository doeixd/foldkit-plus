/**
 * Struct construction operator (`struct`) for pure structured values such as
 * derived records or declarative `Transition.emits` payloads.
 */
import * as Node from '../node.js'
import type { Expr } from '../path.js'
import { call, type EnvOfInput, type ExprInput } from './core.js'

export const structOp: Node.Op<'struct'> = {
  id: 'struct',
  evaluate: args => {
    const out: Record<string, unknown> = {}
    for (let i = 0; i + 1 < args.length; i += 2) {
      out[args[i] as string] = args[i + 1]
    }
    return out
  },
}

type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (
  x: infer I,
) => void
  ? I
  : never

type FieldsEnv<Fields extends Readonly<Record<string, ExprInput<never, unknown>>>> =
  UnionToIntersection<EnvOfInput<Fields[keyof Fields]>>

type FieldsOut<Fields extends Readonly<Record<string, ExprInput<never, unknown>>>> = {
  readonly [K in keyof Fields]: Fields[K] extends Expr<never, infer A> ? A : Fields[K]
}

/** Construct a pure record expression from named field expressions or literals. */
export const struct = <Fields extends Readonly<Record<string, ExprInput<never, unknown>>>>(
  fields: Fields,
): Expr<FieldsEnv<Fields>, FieldsOut<Fields>> => {
  const args: Array<ExprInput<never, unknown>> = []
  for (const [k, v] of Object.entries(fields)) {
    args.push(k, v)
  }
  return call(structOp, args) as Expr<FieldsEnv<Fields>, FieldsOut<Fields>>
}
