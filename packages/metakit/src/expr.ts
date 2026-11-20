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
import {
  isExpr,
  toNode,
  wrap,
  type EnvOfInput,
  type ExprInput,
  type UnionToIntersection,
  type ValueOfInput,
} from './ops/core.js'
import { evalNode } from './ops/eval.js'
import { gtOp, gteOp, ltOp, lteOp } from './ops/ord.js'
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

type TupleEnv<Terms extends ReadonlyArray<ExprInput<never, unknown>>> = Terms extends readonly []
  ? unknown
  : UnionToIntersection<EnvOfInput<Terms[number]>>

/** Conjunction of any number of boolean expressions (empty = `true`). */
export const all = <const Terms extends ReadonlyArray<ExprInput<never, boolean>>>(
  ...terms: Terms
): ExprType<TupleEnv<Terms>, boolean> => {
  if (terms.length === 0) return lit(true) as ExprType<TupleEnv<Terms>, boolean>
  let acc: ExprType<never, boolean> = isExpr(terms[0]) ? terms[0] : lit(terms[0] as boolean)
  for (let i = 1; i < terms.length; i++) {
    acc = Bool.and(acc, terms[i]!) as ExprType<never, boolean>
  }
  return acc as unknown as ExprType<TupleEnv<Terms>, boolean>
}

/** Disjunction of any number of boolean expressions (empty = `false`). */
export const any = <const Terms extends ReadonlyArray<ExprInput<never, boolean>>>(
  ...terms: Terms
): ExprType<TupleEnv<Terms>, boolean> => {
  if (terms.length === 0) return lit(false) as ExprType<TupleEnv<Terms>, boolean>
  let acc: ExprType<never, boolean> = isExpr(terms[0]) ? terms[0] : lit(terms[0] as boolean)
  for (let i = 1; i < terms.length; i++) {
    acc = Bool.or(acc, terms[i]!) as ExprType<never, boolean>
  }
  return acc as unknown as ExprType<TupleEnv<Terms>, boolean>
}

/** Logical negation. */
export const not = Bool.not

/** Logical implication (`condition => then`, equivalent to `!condition || then`). */
export const implies = <C extends ExprInput<never, boolean>, T extends ExprInput<never, boolean>>(
  condition: C,
  then: T,
): ExprType<EnvOfInput<C> & EnvOfInput<T>, boolean> => Bool.or(Bool.not(condition), then)

/** Two-way conditional expression. */
export const when = <
  C extends ExprInput<never, boolean>,
  const T extends ExprInput<never, unknown>,
  const E extends ExprInput<never, unknown>,
>(
  cond: C,
  branches: { readonly then: T; readonly else: E },
): ExprType<EnvOfInput<C> & EnvOfInput<T> & EnvOfInput<E>, ValueOfInput<T> | ValueOfInput<E>> =>
  wrap(
    Node.If({
      cond: toNode(cond),
      then: toNode(branches.then),
      otherwise: toNode(branches.else),
    }),
  )

/** Exhaustive literal `Match` over a string union expression. */
export const match = <
  Env,
  K extends string,
  const Cases extends { readonly [P in K]: ExprInput<never, unknown> },
>(
  on: ExprType<Env, K>,
  cases: Cases,
): ExprType<
  Env & UnionToIntersection<EnvOfInput<Cases[keyof Cases]>>,
  ValueOfInput<Cases[keyof Cases]>
> =>
  wrap(
    Node.Match({
      on: on.node,
      cases: Object.entries(cases).map(([value, branch]) => [
        value,
        toNode(branch as ExprInput<never, unknown>),
      ]),
      otherwise: Option.none(),
    }),
  )

/** Partial literal `Match` with an explicit fallback branch. */
export const matchOrElse = <
  Env,
  K extends string,
  const Cases extends { readonly [P in K]?: ExprInput<never, unknown> },
  const Fallback extends ExprInput<never, unknown>,
>(
  on: ExprType<Env, K>,
  cases: Cases,
  otherwise: Fallback,
): ExprType<
  Env &
    UnionToIntersection<EnvOfInput<Exclude<Cases[keyof Cases], undefined>>> &
    EnvOfInput<Fallback>,
  ValueOfInput<Exclude<Cases[keyof Cases], undefined>> | ValueOfInput<Fallback>
> =>
  wrap(
    Node.Match({
      on: on.node,
      cases: Object.entries(cases)
        .filter(([, branch]) => branch !== undefined)
        .map(([value, branch]) => [value, toNode(branch as ExprInput<never, unknown>)]),
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
 * Read every symbolic `Expr` constraint attached to `schema` via `Expr.refine`
 * as well as built-in Effect `Schema` numeric bound checks (`isGreaterThan`,
 * `isGreaterThanOrEqualTo`, `isLessThan`, `isLessThanOrEqualTo`, `isBetween`),
 * including nested struct properties prefixed with their property path.
 */
export const refinementsOf = <S extends Schema.Top>(
  schema: S,
): ReadonlyArray<ExprType<S['Type'], boolean>> =>
  collectAstRefinements(schema.ast, []).map(node => wrap<S['Type'], boolean>(node))

const collectChecks = (
  checks: ReadonlyArray<SchemaAST.Check<unknown>>,
  prefix: ReadonlyArray<string>,
  out: Array<Node.Node>,
): void => {
  const selfPath = Node.Path({ segments: prefix, ast: Option.none() })
  for (const check of checks) {
    const ann = check.annotations as Readonly<Record<string, unknown>> | undefined
    if (ann !== undefined) {
      if (REFINEMENT_ANNOTATION_KEY in ann) {
        out.push(Node.prefix(ann[REFINEMENT_ANNOTATION_KEY] as Node.Node, prefix))
      }
      const repr = ann['representation'] as
        | { readonly id?: string; readonly payload?: Readonly<Record<string, unknown>> | null }
        | undefined
      if (repr !== undefined && typeof repr.id === 'string') {
        switch (repr.id) {
          case 'effect/schema/isGreaterThanOrEqualTo':
            if (typeof repr.payload?.['minimum'] === 'number') {
              out.push(
                Node.Call({
                  op: gteOp,
                  args: [selfPath, Node.Lit({ value: repr.payload['minimum'] })],
                }),
              )
            }
            break
          case 'effect/schema/isGreaterThan':
            if (typeof repr.payload?.['exclusiveMinimum'] === 'number') {
              out.push(
                Node.Call({
                  op: gtOp,
                  args: [selfPath, Node.Lit({ value: repr.payload['exclusiveMinimum'] })],
                }),
              )
            }
            break
          case 'effect/schema/isLessThanOrEqualTo':
            if (typeof repr.payload?.['maximum'] === 'number') {
              out.push(
                Node.Call({
                  op: lteOp,
                  args: [selfPath, Node.Lit({ value: repr.payload['maximum'] })],
                }),
              )
            }
            break
          case 'effect/schema/isLessThan':
            if (typeof repr.payload?.['exclusiveMaximum'] === 'number') {
              out.push(
                Node.Call({
                  op: ltOp,
                  args: [selfPath, Node.Lit({ value: repr.payload['exclusiveMaximum'] })],
                }),
              )
            }
            break
          case 'effect/schema/isBetween':
            if (
              typeof repr.payload?.['minimum'] === 'number' &&
              typeof repr.payload?.['maximum'] === 'number'
            ) {
              const loOp = repr.payload['exclusiveMinimum'] === true ? gtOp : gteOp
              const hiOp = repr.payload['exclusiveMaximum'] === true ? ltOp : lteOp
              out.push(
                Node.Call({
                  op: loOp,
                  args: [selfPath, Node.Lit({ value: repr.payload['minimum'] })],
                }),
              )
              out.push(
                Node.Call({
                  op: hiOp,
                  args: [selfPath, Node.Lit({ value: repr.payload['maximum'] })],
                }),
              )
            }
            break
        }
      }
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
): ExprType<Outer, A> => wrap(Node.prefix(expr.node, path.segments))

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

const infixSymbols: Readonly<Partial<Record<Node.CoreOpId, string>>> = {
  'bool.and': '&&',
  'bool.or': '||',
  'eq.is': '==',
  'eq.isNot': '!=',
  'ord.lt': '<',
  'ord.lte': '<=',
  'ord.gt': '>',
  'ord.gte': '>=',
  'num.add': '+',
  'num.sub': '-',
  'num.mul': '*',
}

const showNode = (node: Node.Node): string =>
  Node.$match(node, {
    Lit: ({ value }) => (typeof value === 'bigint' ? `${value}n` : JSON.stringify(value)),
    Path: ({ segments }) => Path.format(segments),
    Call: ({ op, args }) => {
      if (op.id === 'bool.not' && args.length === 1) return `!${showNode(args[0]!)}`
      if (op.id === 'num.neg' && args.length === 1) return `-${showNode(args[0]!)}`
      const sym = infixSymbols[op.id]
      if (sym !== undefined && args.length === 2) {
        return `(${showNode(args[0]!)} ${sym} ${showNode(args[1]!)})`
      }
      return `${op.id}(${args.map(showNode).join(', ')})`
    },
    If: ({ cond, then, otherwise }) =>
      `(if ${showNode(cond)} then ${showNode(then)} else ${showNode(otherwise)})`,
    Match: ({ on, cases, otherwise }) => {
      const arms = cases.map(([v, b]) => `${JSON.stringify(v)} => ${showNode(b)}`)
      if (Option.isSome(otherwise)) arms.push(`_ => ${showNode(otherwise.value)}`)
      return `match ${showNode(on)} { ${arms.join(', ')} }`
    },
    Opaque: ({ name }) => `<opaque:${name}>`,
  })

/** Format an `Expr` into a readable string for debugging, logs, and diagnostics. */
export const show = <Env, A>(expr: ExprType<Env, A>): string => showNode(expr.node)
