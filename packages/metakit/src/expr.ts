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
import { Option, Predicate, Result, Schema, SchemaAST } from 'effect'
import * as Node from './node.js'
import * as Bool from './ops/bool.js'
import {
  isExpr,
  toNode,
  wrap,
  type EnvOfInput,
  type ExprInput,
  type NullOf,
  type UnionToIntersection,
  type ValueOfInput,
} from './ops/core.js'
import { evalNode, type ForeignImplementations } from './ops/eval.js'
import { present } from './ops/kind.js'
import { isNullOp } from './ops/null.js'
import { gtOp, gteOp, ltOp, lteOp } from './ops/ord.js'
import { readsOfNode } from './ops/reads.js'
import { judgeNode } from './ops/judge.js'
import {
  foreignEvidence,
  type EvidenceAssurance,
  type ForeignClaimKind,
  type ForeignRewriteEvidence,
  type ForeignRewritePolicy,
} from './ops/laws.js'
import { loadRows } from './ops/rowsLoad.js'
import { residualizeNode } from './ops/residualize.js'
import * as Path from './path.js'
import type { Expr as ExprType, Path as PathType, PathAccessor } from './path.js'
import type { Verdict } from './verdict.js'

export type {
  ExprType as Expr,
  ExprInput,
  EnvOfInput,
  ForeignImplementations,
  EvidenceAssurance,
  ForeignClaimKind,
  ForeignRewriteEvidence,
  ForeignRewritePolicy,
}
export type { ForeignImplementation } from './ops/eval.js'
export { isExpr, wrap as fromNode, foreignEvidence }

/**
 * What evaluation, `residualize` and `judge` take besides the expression: the
 * implementations of the foreign operations it calls, by id, and an optional
 * `rewritePolicy` gating algebraic claim rewrites on bound evidence. A call
 * with no implementation is refused by evaluation and `Unknown` to `judge`.
 */
export interface ReaderOptions {
  readonly foreign?: ForeignImplementations
  readonly rewritePolicy?: ForeignRewritePolicy
}

/** Annotation key under which `Expr.refine` stores its `Node` on a `SchemaAST.Filter`. */
export const REFINEMENT_ANNOTATION_KEY = 'metakit/expr' as const

/** Construct a constant expression. */
export const lit = <const A>(value: A): ExprType<unknown, A> => wrap(Node.Lit({ value }))

type TupleEnv<Terms extends ReadonlyArray<ExprInput<never, unknown>>> = Terms extends readonly []
  ? unknown
  : UnionToIntersection<EnvOfInput<Terms[number]>>

/** `terms` joined left to right by `op`, or `empty` when there are none. */
const joined = (
  op: Node.Op,
  empty: boolean,
  terms: ReadonlyArray<ExprInput<never, boolean | null>>,
): Node.Node => {
  const [first, ...rest] = terms.map(toNode)
  return first === undefined
    ? Node.Lit({ value: empty })
    : rest.reduce((acc, term) => Node.Call({ op, args: [acc, term] }), first)
}

/** Conjunction of any number of boolean expressions (empty = `true`). */
export const all = <const Terms extends ReadonlyArray<ExprInput<never, boolean | null>>>(
  ...terms: Terms
): ExprType<TupleEnv<Terms>, boolean | NullOf<Terms[number]>> =>
  wrap(joined(Bool.andOp, true, terms))

/** Disjunction of any number of boolean expressions (empty = `false`). */
export const any = <const Terms extends ReadonlyArray<ExprInput<never, boolean | null>>>(
  ...terms: Terms
): ExprType<TupleEnv<Terms>, boolean | NullOf<Terms[number]>> =>
  wrap(joined(Bool.orOp, false, terms))

/** Logical negation. */
export const not = Bool.not

/** Logical implication (`condition => then`, equivalent to `!condition || then`). */
export const implies = <
  C extends ExprInput<never, boolean | null>,
  T extends ExprInput<never, boolean | null>,
>(
  condition: C,
  then: T,
): ExprType<EnvOfInput<C> & EnvOfInput<T>, boolean | NullOf<C> | NullOf<T>> =>
  wrap(Node.Call({ op: Bool.orOp, args: [Bool.not(condition).node, toNode(then)] }))

/** Two-way conditional expression; a null condition gives null. */
export const when = <
  C extends ExprInput<never, boolean | null>,
  const T extends ExprInput<never, unknown>,
  const E extends ExprInput<never, unknown>,
>(
  cond: C,
  branches: { readonly then: T; readonly else: E },
): ExprType<
  EnvOfInput<C> & EnvOfInput<T> & EnvOfInput<E>,
  ValueOfInput<T> | ValueOfInput<E> | NullOf<C>
> =>
  wrap(
    Node.If({
      cond: toNode(cond),
      then: toNode(branches.then),
      otherwise: toNode(branches.else),
    }),
  )

/** The string literals `on` may hold, where it is a path whose Schema is a union of them. */
const literalsOf = (on: Node.Node): Option.Option<ReadonlyArray<string>> => {
  if (!Node.$is('Path')(on) || Option.isNone(on.ast)) return Option.none()
  const literals: Array<string> = []
  for (const member of present(on.ast.value)) {
    if (!SchemaAST.isLiteral(member) || typeof member.literal !== 'string') return Option.none()
    literals.push(member.literal)
  }
  return literals.length === 0 ? Option.none() : Option.some(literals)
}

/** Refuse a case the Schema of `on` cannot hold and, where `exhaustive`, a value with no case. */
const checkCases = (
  name: string,
  on: Node.Node,
  keys: ReadonlyArray<string>,
  exhaustive: boolean,
): void => {
  const literals = literalsOf(on)
  if (Option.isNone(literals)) return
  const quote = (values: ReadonlyArray<string>): string =>
    values.map(value => JSON.stringify(value)).join(', ')
  const extra = keys.filter(key => !literals.value.includes(key))
  if (extra.length > 0) {
    throw new Error(`[metakit] Expr.${name}: ${quote(extra)} is not a value of ${showNode(on)}`)
  }
  const missing = exhaustive ? literals.value.filter(literal => !keys.includes(literal)) : []
  if (missing.length > 0) {
    throw new Error(`[metakit] Expr.${name}: no case for ${quote(missing)} of ${showNode(on)}`)
  }
}

/**
 * Exhaustive literal `Match` over a string union expression: one case for
 * each value and no other, checked by the types and again where the
 * expression is built. A null `on` gives null.
 */
export const match = <
  Env,
  K extends string,
  const Cases extends { readonly [P in K]: ExprInput<never, unknown> },
>(
  on: ExprType<Env, K>,
  cases: Cases & { readonly [P in Exclude<keyof Cases, K>]: never },
): ExprType<
  Env & UnionToIntersection<EnvOfInput<Cases[keyof Cases]>>,
  ValueOfInput<Cases[keyof Cases]>
> => {
  const entries = Object.entries(cases)
  checkCases(
    'match',
    on.node,
    entries.map(([value]) => value),
    true,
  )
  return wrap(
    Node.Match({
      on: on.node,
      cases: entries.map(([value, branch]) => [value, toNode(branch as ExprInput<never, unknown>)]),
      otherwise: Option.none(),
    }),
  )
}

/**
 * Partial literal `Match` with an explicit fallback branch, which takes null
 * and every value no case names.
 */
export const matchOrElse = <
  Env,
  K extends string | null,
  const Cases extends { readonly [P in Exclude<K, null>]?: ExprInput<never, unknown> },
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
> => {
  const entries = Object.entries(cases).filter(([, branch]) => branch !== undefined)
  checkCases(
    'matchOrElse',
    on.node,
    entries.map(([value]) => value),
    false,
  )
  return wrap(
    Node.Match({
      on: on.node,
      cases: entries.map(([value, branch]) => [value, toNode(branch as ExprInput<never, unknown>)]),
      otherwise: Option.some(toNode(otherwise)),
    }),
  )
}

const taggedVariantsOf = (
  ast: Option.Option<SchemaAST.AST>,
): {
  readonly variants: ReadonlyMap<string, SchemaAST.Objects>
  readonly tagAst: Option.Option<SchemaAST.AST>
  readonly nullable: boolean
} => {
  const variants = new Map<string, SchemaAST.Objects>()
  let nullable = false
  let allLiteralTagged = true
  const collect = (node: SchemaAST.AST): void => {
    const inner = Path.optionInner(node)
    if (Option.isSome(inner)) {
      nullable = true
      collect(inner.value)
      return
    }
    if (SchemaAST.isNull(node) || SchemaAST.isUndefined(node)) {
      nullable = true
      return
    }
    if (SchemaAST.isUnion(node)) {
      for (const member of node.types) collect(member)
      return
    }
    if (!SchemaAST.isObjects(node)) {
      allLiteralTagged = false
      return
    }
    const tagProp = node.propertySignatures.find(p => p.name === '_tag')
    if (
      tagProp !== undefined &&
      SchemaAST.isLiteral(tagProp.type) &&
      typeof tagProp.type.literal === 'string'
    ) {
      variants.set(tagProp.type.literal, node)
    } else {
      allLiteralTagged = false
    }
  }
  if (Option.isSome(ast)) collect(ast.value)
  if (!allLiteralTagged || variants.size === 0) {
    return { variants: new Map(), tagAst: Option.none(), nullable }
  }
  const keys = [...variants.keys()]
  const litSchema = Schema.Literals(keys)
  const tagAst = Option.some(nullable ? Schema.NullOr(litSchema).ast : litSchema.ast)
  return { variants, tagAst, nullable }
}

const checkTagCases = (
  name: 'matchTagsExhaustive' | 'matchTags',
  on: Node.PathNode,
  variants: ReadonlyMap<string, SchemaAST.Objects>,
  keys: ReadonlyArray<string>,
  exhaustive: boolean,
): void => {
  if (variants.size === 0) return
  const quote = (values: ReadonlyArray<string>): string =>
    values.map(value => JSON.stringify(value)).join(', ')
  const unknownTags = keys.filter(key => !variants.has(key))
  if (unknownTags.length > 0) {
    throw new Error(`[metakit] Expr.${name}: ${quote(unknownTags)} is not a tag of ${showNode(on)}`)
  }
  const missingTags = exhaustive ? [...variants.keys()].filter(tag => !keys.includes(tag)) : []
  if (missingTags.length > 0) {
    throw new Error(`[metakit] Expr.${name}: no case for ${quote(missingTags)} of ${showNode(on)}`)
  }
}

/**
 * Exhaustive tagged-union `Match` over a `Path` to a union of `Schema.TaggedStruct`s.
 * Each branch receives a narrowed `PathAccessor` for that variant's payload fields
 * and lowers directly to `Node.Match` over `subject._tag`, so JS eval, `prepare`,
 * `residualize`, `judge`, `reads`, `Artifact`, and `Fn` all work without a second AST.
 */
export const matchTagsExhaustive = <
  Env,
  U extends { readonly _tag: string },
  const Cases extends {
    readonly [Tag in U['_tag']]: (
      variant: PathAccessor<Env, Extract<U, { readonly _tag: Tag }>>,
    ) => ExprInput<never, unknown>
  },
>(
  on: PathType<Env, U>,
  cases: Cases & { readonly [P in Exclude<keyof Cases, U['_tag']>]: never },
): ExprType<
  Env & UnionToIntersection<EnvOfInput<ReturnType<Cases[keyof Cases]>>>,
  ValueOfInput<ReturnType<Cases[keyof Cases]>>
> => {
  const { variants, tagAst, nullable } = taggedVariantsOf(on.ast)
  if (nullable) {
    throw new Error(
      `[metakit] Expr.matchTagsExhaustive: cannot exhaustively match nullable ${showNode(on.node)}; use Expr.matchTags with a fallback`,
    )
  }
  const entries = Object.entries(cases) as ReadonlyArray<
    readonly [string, (variant: PathAccessor<Env, unknown>) => ExprInput<never, unknown>]
  >
  checkTagCases(
    'matchTagsExhaustive',
    on.node,
    variants,
    entries.map(([tag]) => tag),
    true,
  )
  const tagNode = Node.Path({ segments: [...on.segments, '_tag'], ast: tagAst })
  return wrap(
    Node.Match({
      on: tagNode,
      cases: entries.map(([tag, handler]) => {
        const narrowed = Path.accessor<Env, unknown>(
          on.segments,
          Option.fromUndefinedOr(variants.get(tag)),
        )
        return [tag, toNode(handler(narrowed))] as const
      }),
      otherwise: Option.none(),
    }),
  )
}

/**
 * Partial tagged-union `Match` with an explicit fallback branch, which handles
 * `null` and any tag not named in `cases`.
 */
export const matchTags = <
  Env,
  U extends { readonly _tag: string } | null,
  const Cases extends {
    readonly [Tag in Exclude<U, null>['_tag']]?: (
      variant: PathAccessor<Env, Extract<Exclude<U, null>, { readonly _tag: Tag }>>,
    ) => ExprInput<never, unknown>
  },
  const Fallback extends ExprInput<never, unknown>,
>(
  on: PathType<Env, U>,
  cases: Cases & { readonly [P in Exclude<keyof Cases, Exclude<U, null>['_tag']>]: never },
  otherwise: Fallback,
): ExprType<
  Env &
    UnionToIntersection<EnvOfInput<ReturnType<Exclude<Cases[keyof Cases], undefined>>>> &
    EnvOfInput<Fallback>,
  ValueOfInput<ReturnType<Exclude<Cases[keyof Cases], undefined>>> | ValueOfInput<Fallback>
> => {
  const { variants, tagAst } = taggedVariantsOf(on.ast)
  const entries = Object.entries(cases).filter(
    ([, handler]) => handler !== undefined,
  ) as ReadonlyArray<
    readonly [string, (variant: PathAccessor<Env, unknown>) => ExprInput<never, unknown>]
  >
  checkTagCases(
    'matchTags',
    on.node,
    variants,
    entries.map(([tag]) => tag),
    false,
  )
  const tagNode = Node.Path({ segments: [...on.segments, '_tag'], ast: tagAst })
  return wrap(
    Node.Match({
      on: tagNode,
      cases: entries.map(([tag, handler]) => {
        const narrowed = Path.accessor<Env, unknown>(
          on.segments,
          Option.fromUndefinedOr(variants.get(tag)),
        )
        return [tag, toNode(handler(narrowed))] as const
      }),
      otherwise: Option.some(toNode(otherwise)),
    }),
  )
}

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
    build: ($: PathAccessor<S['Type'], S['Type']>) => ExprInput<S['Type'], boolean | null>,
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
      // A rule holds only where it is true: null and a refusal do not pass.
      return evalNode(exprNode, input) === true
        ? undefined
        : (options?.message ?? 'Refinement failed')
    }, annotations as Schema.Annotations.Filter)
    return schema.check(filter) as S['Rebuild']
  }

/** One rule `Expr.rulesOf` reads off a Schema. */
export interface Refinement<A> {
  /** Property path the check sits on; `[]` is the schema itself. */
  readonly at: ReadonlyArray<string>
  /** The rule over the whole schema's value (a property's rule reads through `at`). */
  readonly expr: ExprType<A, boolean>
  /** The check's `message` annotation, or its enclosing group's. */
  readonly message: Option.Option<string>
}

/**
 * Read every rule attached to `schema`, with where it sits and its message:
 * each `Expr.refine` and each built-in Effect numeric bound (`isGreaterThan`,
 * `isGreaterThanOrEqualTo`, `isLessThan`, `isLessThanOrEqualTo`, and
 * `isBetween`, which gives one rule per side), on the schema itself, on
 * nested struct properties, and under `Schema.optional`, `Schema.optionalKey`,
 * and `Schema.NullOr` (guarded with `Null.isNull(at) || rule` so absent or
 * null values pass). Checks on multi-branch non-nullish unions are not read.
 */
export const rulesOf = <S extends Schema.Top>(schema: S): ReadonlyArray<Refinement<S['Type']>> =>
  collectAstRefinements(schema.ast, []).map(rule => ({
    at: rule.at,
    expr: wrap<S['Type'], boolean>(rule.node),
    message: rule.message,
  }))

/** The expressions of `Expr.rulesOf`, in the same order. */
export const refinementsOf = <S extends Schema.Top>(
  schema: S,
): ReadonlyArray<ExprType<S['Type'], boolean>> => rulesOf(schema).map(rule => rule.expr)

interface RuleNode {
  readonly at: ReadonlyArray<string>
  readonly node: Node.Node
  readonly message: Option.Option<string>
}

const boundNodes = (
  representation: { readonly id: string; readonly payload: Schema.Json },
  self: Node.Node,
): ReadonlyArray<Node.Node> => {
  const { id, payload } = representation
  const fields: Readonly<Record<string, unknown>> = Predicate.isObject(payload) ? payload : {}
  const bound = (op: Node.Op, key: string): ReadonlyArray<Node.Node> => {
    const value = fields[key]
    return typeof value === 'number' ? [Node.Call({ op, args: [self, Node.Lit({ value })] })] : []
  }
  const flag = (key: string): boolean => fields[key] === true
  switch (id) {
    case 'effect/schema/isGreaterThanOrEqualTo':
      return bound(gteOp, 'minimum')
    case 'effect/schema/isGreaterThan':
      return bound(gtOp, 'exclusiveMinimum')
    case 'effect/schema/isLessThanOrEqualTo':
      return bound(lteOp, 'maximum')
    case 'effect/schema/isLessThan':
      return bound(ltOp, 'exclusiveMaximum')
    case 'effect/schema/isBetween':
      return [
        ...bound(flag('exclusiveMinimum') ? gtOp : gteOp, 'minimum'),
        ...bound(flag('exclusiveMaximum') ? ltOp : lteOp, 'maximum'),
      ]
    default:
      return []
  }
}

const collectChecks = (
  checks: ReadonlyArray<SchemaAST.Check<unknown>>,
  at: ReadonlyArray<string>,
  groupMessage: Option.Option<string>,
  out: Array<RuleNode>,
): void => {
  const self = Node.Path({ segments: at, ast: Option.none() })
  for (const check of checks) {
    const ann = check.annotations
    const message = Option.orElse(Option.fromUndefinedOr(ann?.message), () => groupMessage)
    if (ann !== undefined) {
      if (REFINEMENT_ANNOTATION_KEY in ann) {
        out.push({
          at,
          node: Node.prefix(ann[REFINEMENT_ANNOTATION_KEY] as Node.Node, at),
          message,
        })
      }
      if (ann.representation !== undefined) {
        for (const node of boundNodes(ann.representation, self)) out.push({ at, node, message })
      }
    }
    if (check._tag === 'FilterGroup') collectChecks(check.checks, at, message, out)
  }
}

const isGuardedAt = (node: Node.Node, at: ReadonlyArray<string>): boolean => {
  if (!Node.$is('Call')(node) || node.op.id !== 'bool.or' || node.args.length !== 2) return false
  const left = node.args[0]!
  if (!Node.$is('Call')(left) || left.op.id !== 'null.isNull' || left.args.length !== 1) {
    return false
  }
  const target = left.args[0]!
  return (
    Node.$is('Path')(target) &&
    target.segments.length === at.length &&
    target.segments.every((seg, i) => seg === at[i])
  )
}

const guardNullable = (node: Node.Node, at: ReadonlyArray<string>): Node.Node =>
  isGuardedAt(node, at)
    ? node
    : Node.Call({
        op: Bool.orOp,
        args: [
          Node.Call({ op: isNullOp, args: [Node.Path({ segments: at, ast: Option.none() })] }),
          node,
        ],
      })

const collectAstRefinements = (
  ast: SchemaAST.AST,
  at: ReadonlyArray<string>,
): ReadonlyArray<RuleNode> => {
  const out: Array<RuleNode> = []
  if (SchemaAST.isObjects(ast)) {
    for (const prop of ast.propertySignatures) {
      if (typeof prop.name === 'string') {
        const childAt = [...at, prop.name]
        const isOptionalKey = SchemaAST.isOptional(prop.type)
        for (const rule of collectAstRefinements(prop.type, childAt)) {
          out.push(
            isOptionalKey
              ? { at: rule.at, node: guardNullable(rule.node, childAt), message: rule.message }
              : rule,
          )
        }
      }
    }
  } else if (SchemaAST.isUnion(ast)) {
    const nullish = ast.types.filter(t => SchemaAST.isNull(t) || SchemaAST.isUndefined(t))
    const presentMembers = ast.types.filter(t => !SchemaAST.isNull(t) && !SchemaAST.isUndefined(t))
    if (nullish.length > 0 && presentMembers.length === 1) {
      for (const rule of collectAstRefinements(presentMembers[0]!, at)) {
        out.push({
          at: rule.at,
          node: guardNullable(rule.node, at),
          message: rule.message,
        })
      }
    }
  } else {
    const optInner = Path.optionInner(ast)
    if (Option.isSome(optInner)) {
      for (const rule of collectAstRefinements(optInner.value, at)) {
        out.push({
          at: rule.at,
          node: guardNullable(rule.node, at),
          message: rule.message,
        })
      }
    }
  }
  if (ast.checks !== undefined) {
    collectChecks(ast.checks, at, Option.none(), out)
  }
  return out
}

/** Lift an `Expr<Inner, A>` along `Path<Outer, Inner>` into `Expr<Outer, A>`. */
export const lift = <Outer, Inner, A>(
  path: PathType<Outer, Inner>,
  expr: ExprType<Inner, A>,
): ExprType<Outer, A> => wrap(Node.prefix(expr.node, path.segments))

/**
 * Evaluate `expr` against a complete environment `env`: its value, null where
 * an operand was null or absent, or the `Node.Refusal` of an integer past
 * ±(2^53−1), a non-finite number, an ill-typed operand or an unmatched case.
 */
export const evalResult = <Env, A>(
  expr: ExprType<Env, A>,
  env: Env,
  options?: ReaderOptions,
): Result.Result<A | null, Node.Refusal> => {
  const value = evalNode(expr.node, env, options?.foreign)
  return Node.isRefusal(value) ? Result.fail(value) : Result.succeed(value as A | null)
}

/**
 * `evalResult` for an environment that decodes against the Schemas `expr` was
 * built from, where no operand is null: it returns the value and throws the
 * `Node.Refusal`. Evaluation is null-strict, so over a null or absent operand
 * the result is null whatever `A` says.
 */
export const evaluate = <Env, A>(expr: ExprType<Env, A>, env: Env, options?: ReaderOptions): A => {
  const value = evalNode(expr.node, env, options?.foreign)
  if (Node.isRefusal(value)) throw value
  return value as A
}

/** Alias for `evaluate` matching `Expr.eval(expr, env)`. */
export { evaluate as eval }

/** Whether the rule `expr` holds of `env`: only where it evaluates to true, never on null or a refusal. */
export const holds = <Env>(
  expr: ExprType<Env, boolean | null>,
  env: Env,
  options?: ReaderOptions,
): boolean => evalNode(expr.node, env, options?.foreign) === true

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
  options?: ReaderOptions,
): ExprType<Env, A> =>
  wrap(residualizeNode(expr.node, partialEnv, options?.foreign, options?.rewritePolicy))

/**
 * Partially evaluate a boolean `expr` and return its Kleene $K_3$ `Verdict`.
 * A foreign call with no implementation given is `Unknown`.
 */
export const judge = <Env>(
  expr: ExprType<Env, boolean | null>,
  partialEnv: PartialEnv<Env>,
  options?: ReaderOptions,
): Verdict<never> => {
  // A list fold loads only its evaluation; judging one in part needs its judgement too.
  loadRows()
  return judgeNode(expr.node, partialEnv, options?.foreign, options?.rewritePolicy)
}

/**
 * Static read footprint of `expr`. Returns `Option.some(paths)` when every
 * read is known, or `Option.none()` when an `Opaque` term declares no `reads`.
 */
export const reads = <Env, A>(
  expr: ExprType<Env, A>,
): Option.Option<ReadonlyArray<ReadonlyArray<string>>> => readsOfNode(expr.node)

const infixSymbols: Readonly<Partial<Record<string, string>>> = {
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
      // A foreign id is the application's: `constructor` names no symbol here.
      const sym = Object.hasOwn(infixSymbols, op.id) ? infixSymbols[op.id] : undefined
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
    Rows: rows => {
      const source = Node.RowsOver.$match(rows.over, {
        List: ({ list }) => showNode(list),
        Related: ({ of, relation }) => `${showNode(of)}.${Node.relatedSegment(relation)}`,
      })
      const parts = [
        source,
        ...Option.toArray(Option.map(rows.where, where => `where ${showNode(where)}`)),
        ...Option.toArray(Option.map(rows.value, value => `of ${showNode(value)}`)),
        ...(rows.set.length === 0
          ? []
          : [
              `set { ${rows.set.map(([field, value]) => `${field}: ${showNode(value)}`).join(', ')} }`,
            ]),
      ]
      return `${rows.fold}(${parts.join(' ')})`
    },
  })

/** Format an `Expr` into a readable string for debugging, logs, and diagnostics. */
export const show = <Env, A>(expr: ExprType<Env, A>): string => showNode(expr.node)
