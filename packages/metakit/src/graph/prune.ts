/**
 * SSR static pruning (`metakit/graph/prune`).
 *
 * Partially evaluates bindings against a known `staticSlice` via
 * `Expr.residualize`, separating `staticValues` from `liveBindings` and
 * computing the minimal `resumePaths`. Kept in its own module so browser pages
 * using `metakit/graph/match` never load `ops/residualize` or `sqlLowering`.
 */
import { Option } from 'effect'
import * as Expr from '../expr.js'
import * as Node from '../node.js'
import { minimizePaths } from './match.js'

type ExprValue<E> = E extends Expr.Expr<never, infer A> ? A : unknown
type ExprEnvOf<E> = E extends Expr.Expr<infer Env, unknown> ? Env : never
type NonUnknown<T> = unknown extends T ? never : T
type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (
  k: infer I,
) => void
  ? I
  : never
type SpecificEnvs<Bindings extends Readonly<Record<string, unknown>>> = {
  readonly [K in keyof Bindings]: NonUnknown<ExprEnvOf<Bindings[K]>>
}[keyof Bindings]
type BindingsEnv<Bindings extends Readonly<Record<string, unknown>>> = [
  SpecificEnvs<Bindings>,
] extends [never]
  ? Readonly<Record<string, unknown>>
  : UnionToIntersection<SpecificEnvs<Bindings>>

export interface PrunedBindings<Bindings extends Readonly<Record<string, unknown>>> {
  /** Bindings that folded completely to a literal value (including known `null`). */
  readonly staticValues: { readonly [K in keyof Bindings & string]?: ExprValue<Bindings[K]> }
  /** Residual bindings that still depend on unknown dynamic paths. */
  readonly liveBindings: {
    readonly [K in keyof Bindings & string]?: Expr.Expr<
      ExprEnvOf<Bindings[K]>,
      ExprValue<Bindings[K]>
    >
  }
  /** Minimal `Model` paths still read by `liveBindings` (the exact SSR resume payload). */
  readonly resumePaths: Option.Option<ReadonlyArray<ReadonlyArray<string>>>
}

/**
 * Partially evaluate every binding against a known `staticSlice` (e.g. feature
 * flags, tenant config, or server-only constants), separating fully folded
 * `staticValues` from `liveBindings` and computing the minimal `resumePaths`
 * SSR must serialize for client resumability.
 */
export const pruneStatic = <Bindings extends Readonly<Record<string, Expr.Expr<never, unknown>>>>(
  bindings: Bindings,
  staticSlice: Expr.PartialEnv<BindingsEnv<Bindings>>,
): PrunedBindings<Bindings> => {
  const staticValues: Record<string, unknown> = {}
  const liveBindings: Record<string, Expr.Expr<never, unknown>> = {}
  const liveReads: Array<ReadonlyArray<string>> = []
  let unbounded = false

  for (const [id, expr] of Object.entries(bindings)) {
    const residual = Expr.residualize(
      expr as Expr.Expr<BindingsEnv<Bindings>, unknown>,
      staticSlice,
    )
    if (Node.$is('Lit')(residual.node)) {
      staticValues[id] = residual.node.value
    } else {
      liveBindings[id] = residual as Expr.Expr<never, unknown>
      const r = Expr.reads(residual)
      if (Option.isNone(r)) {
        unbounded = true
      } else {
        for (const segs of r.value) liveReads.push(segs)
      }
    }
  }

  return {
    staticValues: staticValues as PrunedBindings<Bindings>['staticValues'],
    liveBindings: liveBindings as PrunedBindings<Bindings>['liveBindings'],
    resumePaths: unbounded ? Option.none() : Option.some(minimizePaths(liveReads)),
  }
}
