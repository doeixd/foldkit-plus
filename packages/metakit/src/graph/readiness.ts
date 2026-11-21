/**
 * Dependent-query readiness (`metakit/graph/readiness`).
 *
 * Kept in its own module so browser pages using `metakit/graph/match` never
 * load `sqlLowering` or `ops/residualize`.
 */
import { Option, Result } from 'effect'
import * as Expr from '../expr.js'
import * as Path from '../path.js'
import { lowerNode } from '../sqlLowering.js'
import { minimizePaths } from './match.js'

export type QueryReadiness<Env, A> =
  | {
      readonly ready: true
      readonly residual: Expr.Expr<Env, A>
    }
  | {
      readonly ready: false
      /** The parameter paths still unbound; none when an opaque term declares no reads. */
      readonly missing: Option.Option<ReadonlyArray<ReadonlyArray<string>>>
      /** Why the predicate cannot be lowered to SQL although every parameter is bound. */
      readonly unsupported: Option.Option<string>
      readonly residual: Expr.Expr<Env, A>
    }

/**
 * Whether a query's filter can be lowered to SQL yet: every parameter path it
 * still reads is bound in `partialEnv`, and what is left lowers
 * (`Sql.toWhere`, `Drizzle.toWhere`). An opaque term over the row alone has
 * nothing missing and is still not ready: `unsupported` says so.
 */
export const queryReadiness = <Env, A>(
  expr: Expr.Expr<Env, A>,
  partialEnv: Expr.PartialEnv<NoInfer<Env>>,
  options?: {
    readonly rowPrefix?: ReadonlyArray<string>
  },
): QueryReadiness<Env, A> => {
  const rowPrefix = options?.rowPrefix ?? ['row']
  const residual = Expr.residualize(expr, partialEnv)
  const reads = Expr.reads(residual)
  if (Option.isNone(reads)) {
    return { ready: false, missing: Option.none(), unsupported: Option.none(), residual }
  }
  const missing = minimizePaths(reads.value.filter(segs => !Path.isPrefix(rowPrefix, segs)))
  if (missing.length > 0) {
    return { ready: false, missing: Option.some(missing), unsupported: Option.none(), residual }
  }
  return Result.match(lowerNode(residual.node, { dialect: 'postgres', rowPrefix }), {
    onSuccess: (): QueryReadiness<Env, A> => ({ ready: true, residual }),
    onFailure: ({ reason }) => ({
      ready: false,
      missing: Option.some([]),
      unsupported: Option.some(reason),
      residual,
    }),
  })
}
