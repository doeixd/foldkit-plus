/**
 * Inspectable, pure, terminating expressions indexed by a typed environment
 * `Env` (`Expr<Env, A>`).
 *
 * - `Expr.refine` attaches a symbolic `Expr` to an Effect `Schema` as both a
 *   real `Schema.makeFilter` runtime check and a `SchemaAST` annotation.
 * - `Expr.in` builds an expression over a multi-slice environment such as
 *   `{ row: Account, principal: Principal }` or `{ model: State }`.
 * - `Expr.eval`, `Expr.residualize`, `Expr.judge`, `Expr.reads`, and
 *   `Expr.lift` operate on any `Expr`.
 */
import { Option, Schema, SchemaAST } from 'effect'
import * as Node from './node.js'
import * as Bool from './ops/bool.js'
import { isExpr, toNode, wrap, type EnvOfInput, type ExprInput } from './ops/core.js'
import { evalNode } from './ops/eval.js'
import { judgeNode, readsOfNode, residualizeNode } from './ops/residualize.js'
import * as Path from './path.js'
import type { Expr as ExprType, Path as PathType, PathAccessor } from './path.js'
import type { Verdict } from './verdict.js'

export type { ExprType as Expr, ExprInput, EnvOfInput }
export { isExpr }

/** Annotation key under which `Expr.refine` stores its `Node` on a `SchemaAST.Filter`. */
export const REFINEMENT_ANNOTATION_KEY = 'metakit/expr' as const

/** Construct a constant expression. */
export const lit = <const A>(value: A): ExprType<unknown, A> => wrap(Node.Lit({ value }))

/** Conjunction of any number of boolean expressions (empty = `true`). */
export const all = <Env>(
  ...terms: ReadonlyArray<ExprInput<Env, boolean>>
): ExprType<Env, boolean> => {
  if (terms.length === 0) return lit(true)
  let acc: ExprType<Env, boolean> = isExpr(terms[0]) ? terms[0] : lit(terms[0] as boolean)
  for (let i = 1; i < terms.length; i++) {
    acc = Bool.and(acc, terms[i]!) as ExprType<Env, boolean>
  }
  return acc
}

/** Disjunction of any number of boolean expressions (empty = `false`). */
export const any = <Env>(
  ...terms: ReadonlyArray<ExprInput<Env, boolean>>
): ExprType<Env, boolean> => {
  if (terms.length === 0) return lit(false)
  let acc: ExprType<Env, boolean> = isExpr(terms[0]) ? terms[0] : lit(terms[0] as boolean)
  for (let i = 1; i < terms.length; i++) {
    acc = Bool.or(acc, terms[i]!) as ExprType<Env, boolean>
  }
  return acc
}

/** Logical negation. */
export const not = Bool.not

/** Two-way conditional expression. */
export const when = <
  C extends ExprInput<never, boolean>,
  T extends ExprInput<never, unknown>,
  E extends ExprInput<never, unknown>,
>(
  cond: C,
  branches: { readonly then: T; readonly else: E },
): ExprType<
  EnvOfInput<C> & EnvOfInput<T> & EnvOfInput<E>,
  (T extends ExprType<never, infer A> ? A : T) | (E extends ExprType<never, infer B> ? B : E)
> =>
  wrap(
    Node.If({
      cond: toNode(cond),
      then: toNode(branches.then),
      otherwise: toNode(branches.else),
    }),
  )

/** Exhaustive literal `Match` over a string union expression (or with an `otherwise` fallback). */
export const match = <Env, K extends string, A>(
  on: ExprType<Env, K>,
  cases: { readonly [P in K]: ExprInput<Env, A> },
): ExprType<Env, A> =>
  wrap(
    Node.Match({
      on: on.node,
      cases: Object.entries(cases).map(([value, branch]) => [
        value,
        toNode(branch as ExprInput<Env, A>),
      ]),
      otherwise: Option.none(),
    }),
  )

/** Partial literal `Match` with an explicit fallback branch. */
export const matchOrElse = <Env, K extends string, A>(
  on: ExprType<Env, K>,
  cases: { readonly [P in K]?: ExprInput<Env, A> },
  otherwise: ExprInput<Env, A>,
): ExprType<Env, A> =>
  wrap(
    Node.Match({
      on: on.node,
      cases: Object.entries(cases)
        .filter(([, branch]) => branch !== undefined)
        .map(([value, branch]) => [value, toNode(branch as ExprInput<Env, A>)]),
      otherwise: Option.some(toNode(otherwise)),
    }),
  )

/**
 * First-class escape hatch for arbitrary JavaScript logic.
 *
 * Declaring `reads` lets partial evaluation run the function once those paths
 * are known, and lets footprint analyses stay precise. Omitting `reads`
 * declares `Footprint.All` (unbounded reads). Every static checker treats an
 * `Opaque` node soundly as `Unknown`.
 */
export const opaque = <Env, A>(
  options: {
    readonly name?: string
    readonly reads?: ReadonlyArray<PathType<Env, unknown>>
  },
  run: (env: Env) => A,
): ExprType<Env, A> =>
  wrap(
    Node.Opaque({
      name: options.name ?? (run.name || 'opaque'),
      reads:
        options.reads === undefined
          ? Option.none()
          : Option.some(options.reads.map(p => p.segments)),
      run: run as (env: unknown) => unknown,
    }),
  )

/**
 * Build an `Expr` over a multi-slice environment declared as `{ slice: Schema }`,
 * such as `{ row: Account, principal: Principal }` or `{ model: Account }`.
 */
export const inEnv = <Shape extends Readonly<Record<string, Schema.Top>>, A>(
  shape: Shape,
  build: (env: {
    readonly [K in keyof Shape & string]: PathAccessor<Path.EnvOf<Shape>, Shape[K]['Type']>
  }) => ExprInput<Path.EnvOf<Shape>, A>,
): ExprType<Path.EnvOf<Shape>, A> => wrap(toNode(build(Path.forEnv(shape))))

/** Alias for `inEnv` matching `Expr.in({ row: Account, principal: Principal }, ...)`. */
export { inEnv as in }

/**
 * Attach a symbolic `Expr` invariant to an Effect `Schema`.
 *
 * Compiles to a real `Schema.makeFilter` (so `Schema.decodeUnknownSync`
 * enforces it at runtime) AND stores the `Expr` `Node` in the filter's
 * `SchemaAST` annotations (so SQL, Zone, Z3, and Forms read the AST straight
 * off the Schema).
 */
export const refine =
  <S extends Schema.Top>(
    build: ($: PathAccessor<S['Type'], S['Type']>) => ExprInput<S['Type'], boolean>,
    options?: { readonly message?: string },
  ) =>
  (schema: S): S['Rebuild'] => {
    const exprNode = toNode(build(Path.forSchema(schema)))
    const annotations: Record<string, unknown> = {
      [REFINEMENT_ANNOTATION_KEY]: exprNode,
    }
    if (options?.message !== undefined) {
      annotations['message'] = options.message
    }
    const filter = Schema.makeFilter<S['Type']>(input => {
      const ok = Boolean(evalNode(exprNode, input))
      return ok ? undefined : (options?.message ?? 'Refinement failed')
    }, annotations as Schema.Annotations.Filter)
    return schema.check(filter) as S['Rebuild']
  }

/**
 * Read every symbolic `Expr` node attached to `schema` via `Expr.refine`
 * (including refinements attached to nested struct properties, prefixed with
 * their property path).
 */
export const refinementsOf = <S extends Schema.Top>(
  schema: S,
): ReadonlyArray<ExprType<S['Type'], boolean>> =>
  collectAstRefinements(schema.ast, []).map(node => wrap<S['Type'], boolean>(node))

const prefixNode = (node: Node.Node, prefix: ReadonlyArray<string>): Node.Node => {
  if (prefix.length === 0) return node
  return Node.$match(node, {
    Lit: lit => lit,
    Path: ({ segments, ast }) => Node.Path({ segments: [...prefix, ...segments], ast }),
    Call: ({ op, args }) => Node.Call({ op, args: args.map(a => prefixNode(a, prefix)) }),
    If: ({ cond, then, otherwise }) =>
      Node.If({
        cond: prefixNode(cond, prefix),
        then: prefixNode(then, prefix),
        otherwise: prefixNode(otherwise, prefix),
      }),
    Match: ({ on, cases, otherwise }) =>
      Node.Match({
        on: prefixNode(on, prefix),
        cases: cases.map(([v, b]) => [v, prefixNode(b, prefix)] as const),
        otherwise: Option.map(otherwise, b => prefixNode(b, prefix)),
      }),
    Opaque: ({ name, reads, run }) =>
      Node.Opaque({
        name,
        reads: Option.map(reads, list => list.map(s => [...prefix, ...s])),
        run: env => {
          let sub: unknown = env
          for (const seg of prefix) {
            if (sub === null || typeof sub !== 'object') return undefined
            sub = (sub as Record<string, unknown>)[seg]
          }
          return run(sub)
        },
      }),
  })
}

const collectChecks = (
  checks: ReadonlyArray<SchemaAST.Check<unknown>>,
  prefix: ReadonlyArray<string>,
  out: Array<Node.Node>,
): void => {
  for (const check of checks) {
    const ann = check.annotations as Readonly<Record<string, unknown>> | undefined
    if (ann !== undefined && REFINEMENT_ANNOTATION_KEY in ann) {
      out.push(prefixNode(ann[REFINEMENT_ANNOTATION_KEY] as Node.Node, prefix))
    }
    if ('checks' in check && Array.isArray(check.checks)) {
      collectChecks(check.checks, prefix, out)
    }
  }
}

const collectAstRefinements = (
  ast: SchemaAST.AST,
  prefix: ReadonlyArray<string>,
): ReadonlyArray<Node.Node> => {
  const out: Array<Node.Node> = []
  if (SchemaAST.isObjects(ast)) {
    for (const prop of ast.propertySignatures) {
      if (typeof prop.name === 'string') {
        out.push(...collectAstRefinements(prop.type, [...prefix, prop.name]))
      }
    }
  }
  if (ast.checks !== undefined) {
    collectChecks(ast.checks, prefix, out)
  }
  return out
}

/** Lift an `Expr<Inner, A>` along `Path<Outer, Inner>` into `Expr<Outer, A>`. */
export const lift = <Outer, Inner, A>(
  path: PathType<Outer, Inner>,
  expr: ExprType<Inner, A>,
): ExprType<Outer, A> => wrap(prefixNode(expr.node, path.segments))

/** Evaluate `expr` against a complete environment `env`. */
export const evaluate = <Env, A>(expr: ExprType<Env, A>, env: Env): A =>
  evalNode(expr.node, env) as A

/** Alias for `evaluate` matching `Expr.eval(expr, env)`. */
export { evaluate as eval }

/** Partially known environment where any top-level slice or nested field may be omitted. */
export type PartialEnv<Env> =
  Env extends ReadonlyArray<unknown>
    ? Env
    : Env extends object
      ? { readonly [K in keyof Env]?: PartialEnv<Env[K]> }
      : Env

/**
 * Partially evaluate `expr` against a partially known environment, returning
 * the simplified residual `Expr`.
 */
export const residualize = <Env, A>(
  expr: ExprType<Env, A>,
  partialEnv: PartialEnv<Env>,
): ExprType<Env, A> => wrap(residualizeNode(expr.node, partialEnv))

/**
 * Partially evaluate a boolean `expr` and return its Kleene $K_3$ `Verdict`.
 */
export const judge = <Env>(
  expr: ExprType<Env, boolean>,
  partialEnv: PartialEnv<Env>,
): Verdict<never> => judgeNode(expr.node, partialEnv)

/**
 * Static read footprint of `expr`. Returns `Option.some(paths)` when every
 * read is known, or `Option.none()` when an `Opaque` term declares no `reads`.
 */
export const reads = <Env, A>(
  expr: ExprType<Env, A>,
): Option.Option<ReadonlyArray<ReadonlyArray<string>>> => readsOfNode(expr.node)
