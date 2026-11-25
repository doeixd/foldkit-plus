/**
 * Dependent queries (Phase 4 Part B, Bout 4.19, #606): a query whose
 * parameters come from another read is asked only once `queryReadiness`
 * (`metakit/graph/readiness`) confirms every parameter is bound.
 */
import { Option } from 'effect'
import type { Expr } from 'metakit'
import { queryReadiness, type QueryReadiness } from 'metakit/graph/readiness'

export interface DependentQueryOptions<Model, Env, Out> {
  /** Filter expression over `{ row, ...params }` whose non-row paths must be bound. */
  readonly filter: Expr.Expr<Env, boolean | null>
  /** Extract the partial parameter environment from `model`. */
  readonly params: (model: Model) => Expr.PartialEnv<NoInfer<Env>>
  /** Build the query projection or request once `queryReadiness` reports `ready: true`. */
  readonly query: (model: Model, residual: Expr.Expr<Env, boolean | null>) => Out
  /** Row prefix inside `Env` (defaults to `['row']`). */
  readonly rowPrefix?: ReadonlyArray<string> | undefined
}

export interface DependentQuery<Model, Env, Out> {
  /** Evaluate readiness of this dependent query against `model`. */
  readonly readiness: (model: Model) => QueryReadiness<Env, boolean | null>
  /**
   * Returns `Option.some(query)` only when every parameter of `filter` is
   * bound; returns `Option.none()` while any parameter is still unbound so no
   * query is ever sent with an unbound parameter.
   */
  readonly resolve: (model: Model) => Option.Option<Out>
}

/**
 * Declare a dependent query gated by `metakit/graph/readiness`'s `queryReadiness`.
 */
export const dependentQuery = <Model, Env, Out>(
  options: DependentQueryOptions<Model, Env, Out>,
): DependentQuery<Model, Env, Out> => {
  const readiness = (model: Model): QueryReadiness<Env, boolean | null> =>
    queryReadiness(
      options.filter,
      options.params(model),
      options.rowPrefix === undefined ? undefined : { rowPrefix: options.rowPrefix },
    )

  return {
    readiness,
    resolve: model => {
      const state = readiness(model)
      if (!state.ready) return Option.none()
      return Option.some(options.query(model, state.residual))
    },
  }
}
