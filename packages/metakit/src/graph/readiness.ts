/**
 * Dependent-query readiness (`@doeixd/metakit/graph/readiness`).
 *
 * Kept in its own module so browser pages using `@doeixd/metakit/graph/match` never
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
      /** Why preparation failed after every parameter was bound. */
      readonly unsupported: Option.Option<string>
      readonly residual: Expr.Expr<Env, A>
    }

/**
 * Fills in parameters and checks the residual filter. By default it checks
 * structural SQL lowering. Pass `prepare` to check the actual renderer and its
 * configuration, including foreign operations and relation mappings.
 */
export const queryReadiness = <Env, A>(
  expr: Expr.Expr<Env, A>,
  partialEnv: Expr.PartialEnv<NoInfer<Env>>,
  options?: {
    readonly rowPrefix?: ReadonlyArray<string>
    /** The selected backend's preparation, called after all parameters are bound. */
    readonly prepare?: (
      residual: Expr.Expr<Env, A>,
    ) => Result.Result<unknown, { readonly reason: string }>
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
  const prepared =
    options?.prepare === undefined
      ? lowerNode(residual.node, { dialect: 'postgres', rowPrefix })
      : options.prepare(residual)
  return Result.match(prepared, {
    onSuccess: (): QueryReadiness<Env, A> => ({ ready: true, residual }),
    onFailure: ({ reason }) => ({
      ready: false,
      missing: Option.some([]),
      unsupported: Option.some(reason),
      residual,
    }),
  })
}
