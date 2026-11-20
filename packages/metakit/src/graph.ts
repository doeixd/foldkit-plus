/**
 * Static dependency graph, SSR live-frontier pruning, and dependent-query
 * readiness (`metakit/graph`).
 *
 * Pure compile-time / SSR / planner analysis over `Machine` transitions and
 * named `Expr` bindings — zero runtime framework dependency.
 */
import { Option } from 'effect'
import * as Expr from './expr.js'
import type { Machine } from './machine.js'
import * as Node from './node.js'
import * as Path from './path.js'

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

const pathsOverlap = (a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean =>
  Path.isPrefix(a, b) || Path.isPrefix(b, a)

/**
 * Deduplicate and prefix-minimize a list of paths: if `['account']` is present,
 * `['account', 'balance']` is subsumed and dropped. Deterministic order.
 */
const minimizePaths = (
  paths: ReadonlyArray<ReadonlyArray<string>>,
): ReadonlyArray<ReadonlyArray<string>> => {
  const unique: Array<ReadonlyArray<string>> = []
  const seen = new Set<string>()
  for (const segs of paths) {
    const key = JSON.stringify(segs)
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(segs)
    }
  }
  return unique.filter(
    (candidate, i) =>
      !unique.some(
        (other, j) => i !== j && other.length < candidate.length && Path.isPrefix(other, candidate),
      ),
  )
}

export interface GraphAnalysis<
  Transitions extends Readonly<Record<string, unknown>>,
  Bindings extends Readonly<Record<string, unknown>>,
> {
  /** For each transition tag, the exact binding IDs invalidated when it fires. */
  readonly affectedBy: {
    readonly [K in keyof Transitions & string]: ReadonlyArray<keyof Bindings & string>
  }
  /** Static read footprint of each binding (`Option.none()` if unbounded `Opaque`). */
  readonly bindingReads: {
    readonly [B in keyof Bindings & string]: Option.Option<ReadonlyArray<ReadonlyArray<string>>>
  }
  /** Minimal set of `Model` paths read by any binding or read/written by any transition. */
  readonly liveModelPaths: Option.Option<ReadonlyArray<ReadonlyArray<string>>>
  /** Bindings that depend on no path written by any transition (provably static). */
  readonly deadBindings: ReadonlyArray<keyof Bindings & string>
}

/**
 * Statically analyze a `Machine` and a record of named view `Expr` bindings:
 *   - `affectedBy[tag]`: bindings whose read footprint overlaps `tag`'s writes
 *     (symmetrically via `Path.isPrefix`; unbounded reads are conservatively
 *     affected by any transition that writes at least one path).
 *   - `deadBindings`: bindings unaffected by every transition in `machine`.
 *   - `liveModelPaths`: minimal `Model` paths touched by the machine or bindings.
 */
export const analyze = <
  State,
  Transitions extends Readonly<Record<string, unknown>>,
  Bindings extends Readonly<Record<string, Expr.Expr<State, unknown>>>,
>(
  machine: Machine<State, Transitions>,
  bindings: Bindings,
): GraphAnalysis<Transitions, Bindings> => {
  const bindingIds = Object.keys(bindings) as Array<keyof Bindings & string>
  const bindingReadsMap: Record<string, Option.Option<ReadonlyArray<ReadonlyArray<string>>>> = {}
  const modelPaths: Array<ReadonlyArray<string>> = []
  let unboundedModel = false

  for (const id of bindingIds) {
    const r = Expr.reads(bindings[id]!)
    bindingReadsMap[id] = r
    if (Option.isNone(r)) {
      unboundedModel = true
    } else {
      for (const segs of r.value) modelPaths.push(segs)
    }
  }

  const affectedBy: Record<string, ReadonlyArray<string>> = {}
  const everAffected = new Set<string>()

  for (const [tag, fp] of Object.entries(machine.footprints)) {
    if (Option.isNone(fp.reads)) {
      unboundedModel = true
    } else {
      for (const segs of fp.reads.value) {
        if (segs[0] === 'state') {
          modelPaths.push(segs.slice(1))
        }
      }
    }
    for (const w of fp.writes) {
      modelPaths.push(w)
    }

    const hit: Array<string> = []
    if (fp.writes.length > 0) {
      for (const id of bindingIds) {
        const reads = bindingReadsMap[id]!
        const overlaps = Option.isNone(reads)
          ? true
          : reads.value.some(r => fp.writes.some(w => pathsOverlap(r, w)))
        if (overlaps) {
          hit.push(id)
          everAffected.add(id)
        }
      }
    }
    affectedBy[tag] = hit
  }

  const deadBindings: Array<keyof Bindings & string> = []
  for (const id of bindingIds) {
    if (!everAffected.has(id)) {
      deadBindings.push(id)
    }
  }

  return {
    affectedBy: affectedBy as GraphAnalysis<Transitions, Bindings>['affectedBy'],
    bindingReads: bindingReadsMap as GraphAnalysis<Transitions, Bindings>['bindingReads'],
    liveModelPaths: unboundedModel ? Option.none() : Option.some(minimizePaths(modelPaths)),
    deadBindings,
  }
}

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

export type QueryReadiness<Env, A> =
  | {
      readonly ready: true
      readonly residual: Expr.Expr<Env, A>
    }
  | {
      readonly ready: false
      readonly missing: Option.Option<ReadonlyArray<ReadonlyArray<string>>>
      readonly residual: Expr.Expr<Env, A>
    }

/**
 * Check whether a query/filter `Expr` has all upstream parameter paths bound
 * in `partialEnv` so it can be lowered to SQL/Drizzle or executed.
 *
 * Paths under `options.rowPrefix` (default `['row']`) represent the table row
 * being queried and do not block readiness. Short-circuited branches (e.g.
 * `params.all === true || row.countryId === params.countryId`) automatically
 * drop unused parameter dependencies via `Expr.residualize`.
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
    return { ready: false, missing: Option.none(), residual }
  }
  const unresolved = reads.value.filter(
    segs => rowPrefix.length === 0 || !Path.isPrefix(rowPrefix, segs),
  )
  const missing = minimizePaths(unresolved)
  if (missing.length === 0) {
    return { ready: true, residual }
  }
  return { ready: false, missing: Option.some(missing), residual }
}
