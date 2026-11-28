/**
 * Typed custom operations with checked algebraic claims (`@doeixd/metakit/operation`).
 *
 * An operation is declared once with `Operation.define`: its id, version,
 * argument and result Schemas, null rule and claims. The declaration is a
 * callable function that builds `Expr` nodes and carries its `ForeignOp`
 * descriptor. Evaluation checks arguments and results against the declared
 * Schemas so every claim's domain is enforced at run time.
 */
import { Equal, Option, Schema, SchemaAST } from 'effect'
import type { Fn, ParamSchemas, ReturnCarrier } from './fn.js'
import * as Node from './node.js'
import { orOp } from './ops/bool.js'
import { toNode, wrap, type ExprInput, type NullOf } from './ops/core.js'
import { evalNode, type ForeignImplementation, type ForeignImplementations } from './ops/eval.js'
import { isNullOp } from './ops/null.js'
export { applyForeign } from './ops/eval.js'
import type { Expr } from './path.js'

type CorePrefix = (typeof Node.RESERVED_PREFIXES)[number]

/** Rejects ids starting with any core operator prefix (`bool.`, `num.`, …). */
export type NotCore<Id extends string> = Id extends `${CorePrefix}${string}`
  ? `id must not start with a core prefix (${CorePrefix})`
  : unknown

/** Intersects the environments of each argument left to right; literals add none. */
export type EnvOfAll<Args extends ReadonlyArray<unknown>, Acc = unknown> = Args extends readonly [
  infer Head,
  ...infer Tail,
]
  ? EnvOfAll<Tail, Head extends Expr<infer E, unknown> ? (unknown extends Acc ? E : Acc & E) : Acc>
  : Acc

type SameSchema<A extends Schema.Top, B extends Schema.Top> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : false
  : false

type Binary<Args extends ReadonlyArray<Schema.Top>, R extends Schema.Top> = Args extends readonly [
  infer A extends Schema.Top,
  infer B extends Schema.Top,
]
  ? SameSchema<A, B> extends true
    ? SameSchema<A, R>
    : false
  : false

type SameType<
  Args extends ReadonlyArray<Schema.Top>,
  R extends Schema.Top,
> = Args extends readonly [infer A extends Schema.Top] ? SameSchema<A, R> : Binary<Args, R>

type MonotoneTuple<Args extends ReadonlyArray<Schema.Top>> = {
  readonly [K in keyof Args]: Node.MonotoneDirection
}

/**
 * Algebraic claims typed by the operation's signature. A claim that does not
 * fit the signature resolves to a human-readable sentence rather than `never`.
 */
export type Claims<Args extends ReadonlyArray<Schema.Top>, R extends Schema.Top> = {
  readonly identity?: Binary<Args, R> extends true
    ? { readonly value: Schema.Schema.Type<R>; readonly side: Node.ClaimSide }
    : 'identity needs two arguments of one Schema and a result of that Schema'
  readonly absorbing?: Binary<Args, R> extends true
    ? {
        readonly value: Schema.Schema.Type<R>
        readonly result: Schema.Schema.Type<R>
        readonly side: Node.ClaimSide
      }
    : 'absorbing needs two arguments of one Schema and a result of that Schema'
  readonly idempotent?: SameType<Args, R> extends true
    ? true
    : 'idempotent needs one or two arguments of one Schema and a result of that Schema'
  readonly commutative?: Binary<Args, R> extends true
    ? true
    : 'commutative needs two arguments of one Schema and a result of that Schema'
  readonly associative?: Binary<Args, R> extends true
    ? true | { readonly unlessRefused: true }
    : 'associative needs two arguments of one Schema and a result of that Schema'
  readonly invertible?: Args extends readonly [
    infer A extends Schema.Top,
    infer B extends Schema.Top,
  ]
    ? {
        readonly inverse:
          | (Binary<Args, R> extends true ? 'self' : never)
          | Operation<string, number, readonly [R, B], A, 'strict' | 'own', object>
      }
    : 'invertible needs two arguments (A, B) => R'
  readonly monotone?: MonotoneTuple<Args>
  /** Never throws or returns a `Refusal` when given non-refused arguments matching its Schemas. */
  readonly total?: true
}

/** `null` when any argument in `Args` may be `null`, else `never`. */
export type NullOfAll<Args extends ReadonlyArray<unknown>> = Args extends readonly [
  infer Head,
  ...infer Tail,
]
  ? NullOf<Head> | NullOfAll<Tail>
  : never

/** A declared custom operation: callable to build `Expr` calls, plus its `ForeignOp` descriptor. */
export interface Operation<
  Id extends string,
  V extends number,
  Args extends ReadonlyArray<Schema.Top>,
  R extends Schema.Top,
  N extends 'strict' | 'own',
  C extends object = {},
> {
  <
    const A extends {
      readonly [K in keyof Args]: Args[K] extends Schema.Top
        ? ExprInput<never, Schema.Schema.Type<Args[K]> | null>
        : never
    },
  >(
    ...args: A
  ): Expr<
    EnvOfAll<A>,
    N extends 'strict' ? Schema.Schema.Type<R> | NullOfAll<A> : Schema.Schema.Type<R> | null
  >
  readonly descriptor: Node.ForeignOp & {
    readonly id: Id
    readonly version: V
    readonly args: Args
    readonly result: R
    readonly nulls: N
    readonly claims: C
  }
}

/** Any declared `Operation`, regardless of id, version, arity, null rule or claims. */
export type AnyOperation = {
  readonly descriptor: Node.ForeignOp & {
    readonly args: ReadonlyArray<Schema.Top>
    readonly result: Schema.Top
  }
}

const collectChecks = (check: SchemaAST.Check<unknown>, out: Array<string>): void => {
  const rep = check.annotations?.representation as
    | { readonly id?: string; readonly payload?: Record<string, unknown> }
    | undefined
  if (rep?.id === 'effect/schema/isBetween' && rep.payload !== undefined) {
    out.push(
      `a value between ${String(rep.payload['minimum'])} and ${String(rep.payload['maximum'])}`,
    )
    return
  }
  if (rep?.id === 'effect/schema/isGreaterThanOrEqualTo' && rep.payload !== undefined) {
    out.push(`a value >= ${String(rep.payload['minimum'])}`)
    return
  }
  if (rep?.id === 'effect/schema/isGreaterThan' && rep.payload !== undefined) {
    out.push(`a value > ${String(rep.payload['minimum'])}`)
    return
  }
  if (rep?.id === 'effect/schema/isLessThanOrEqualTo' && rep.payload !== undefined) {
    out.push(`a value <= ${String(rep.payload['maximum'])}`)
    return
  }
  if (rep?.id === 'effect/schema/isLessThan' && rep.payload !== undefined) {
    out.push(`a value < ${String(rep.payload['maximum'])}`)
    return
  }
  if (rep?.id === 'effect/schema/isInt') {
    out.push('an integer')
    return
  }
  if (rep?.id === 'effect/schema/isFinite') {
    out.push('a finite number')
    return
  }
  if (check._tag === 'FilterGroup') {
    for (const inner of check.checks) collectChecks(inner, out)
  }
}

const describeAst = (ast: SchemaAST.AST): string => {
  if (SchemaAST.isUnion(ast)) return ast.types.map(describeAst).join(' | ')
  const checks =
    'checks' in ast
      ? (ast.checks as ReadonlyArray<SchemaAST.Check<unknown>> | undefined)
      : undefined
  if (checks !== undefined) {
    const parts: Array<string> = []
    for (const check of checks) collectChecks(check, parts)
    if (parts.length > 0) return parts.join(', ')
  }
  if (SchemaAST.isNumber(ast)) return 'a number'
  if (SchemaAST.isBoolean(ast)) return 'a boolean'
  if (SchemaAST.isString(ast)) return 'text'
  if (SchemaAST.isNull(ast)) return 'null'
  const id = ast.annotations?.identifier
  if (typeof id === 'string') return `a ${id}`
  return ast._tag
}

const describeSchema = (schema: Schema.Top): string => describeAst(schema.ast)

const encodingName = (ast: SchemaAST.AST): string | undefined => {
  if (ast.encoding === undefined) return undefined
  const id = ast.annotations?.identifier
  return typeof id === 'string' ? id : 'transformed'
}

const scalarKindOf = (ast: SchemaAST.AST): Node.ValueKind | undefined => {
  if (SchemaAST.isNumber(ast)) return 'number'
  if (SchemaAST.isBoolean(ast)) return 'boolean'
  if (SchemaAST.isString(ast)) return 'text'
  if (SchemaAST.isLiteral(ast)) {
    if (typeof ast.literal === 'number') return 'number'
    if (typeof ast.literal === 'boolean') return 'boolean'
    if (typeof ast.literal === 'string') return 'text'
  }
  if (SchemaAST.isUnion(ast) && ast.types.length > 0) {
    const nonNull = ast.types.filter(member => !SchemaAST.isNull(member))
    if (nonNull.length === 0) return undefined
    const first = scalarKindOf(nonNull[0]!)
    if (first !== undefined && nonNull.every(member => scalarKindOf(member) === first)) {
      return first
    }
  }
  return undefined
}

const storedSchema = (schema: Schema.Top, id: string, label: string): SchemaAST.AST => {
  const encoded = encodingName(schema.ast)
  if (encoded !== undefined) {
    throw new Error(
      `[metakit] Operation.define: ${label} of "${id}" decodes from another form (${encoded}); declare the Schema of the value as stored, such as Schema.Number.`,
    )
  }
  return schema.ast
}

const unsupportedSchema = (schema: Schema.Top, id: string, label: string): never => {
  throw new Error(
    `[metakit] Operation.define: ${label} of "${id}" holds ${describeSchema(schema)}; an operation takes and gives numbers, booleans and text.`,
  )
}

const scalarArgument = (ast: SchemaAST.AST): boolean =>
  SchemaAST.isUnion(ast)
    ? ast.types.some(member => !SchemaAST.isNull(member)) &&
      ast.types.every(member => SchemaAST.isNull(member) || scalarArgument(member))
    : scalarKindOf(ast) !== undefined

const resultKind = (schema: Schema.Top, id: string): Node.ValueKind => {
  const kind = scalarKindOf(storedSchema(schema, id, 'result'))
  if (kind === undefined) {
    return unsupportedSchema(schema, id, 'result')
  }
  return kind
}

const toForeignClaims = (raw: Record<string, unknown> | undefined): Node.ForeignClaims => {
  if (raw === undefined) return {}
  const out: {
    identity?: { readonly value: unknown; readonly side: Node.ClaimSide }
    absorbing?: { readonly value: unknown; readonly result: unknown; readonly side: Node.ClaimSide }
    idempotent?: true
    commutative?: true
    associative?: true | { readonly unlessRefused: true }
    invertible?: { readonly inverse: Node.ForeignOp | 'self' }
    monotone?: ReadonlyArray<Node.MonotoneDirection>
    total?: true
  } = {}
  if (raw['identity'] !== undefined) {
    out.identity = raw['identity'] as { readonly value: unknown; readonly side: Node.ClaimSide }
  }
  if (raw['absorbing'] !== undefined) {
    out.absorbing = raw['absorbing'] as {
      readonly value: unknown
      readonly result: unknown
      readonly side: Node.ClaimSide
    }
  }
  if (raw['idempotent'] === true) out.idempotent = true
  if (raw['commutative'] === true) out.commutative = true
  if (raw['associative'] !== undefined) {
    out.associative = raw['associative'] as true | { readonly unlessRefused: true }
  }
  if (raw['invertible'] !== undefined) {
    const inv = (raw['invertible'] as { readonly inverse: 'self' | AnyOperation }).inverse
    out.invertible = { inverse: inv === 'self' ? 'self' : inv.descriptor }
  }
  if (raw['monotone'] !== undefined) {
    out.monotone = [...(raw['monotone'] as ReadonlyArray<Node.MonotoneDirection>)]
  }
  if (raw['total'] === true) out.total = true
  return out
}

/**
 * Declare a typed custom operation with Schemas and algebraic claims.
 *
 * Returns a callable function that builds `Call` expressions, with `.descriptor`
 * holding the `ForeignOp` carried in expression trees.
 */
export const define = <
  const Id extends string,
  const V extends number,
  const Args extends ReadonlyArray<Schema.Top>,
  R extends Schema.Top,
  const N extends 'strict' | 'own',
  const C extends Claims<Args, R> = {},
>(spec: {
  readonly id: Id & NotCore<Id>
  readonly version: V
  readonly args: Args
  readonly returns: R
  readonly nulls: N
  readonly claims?: C
}): Operation<Id, V, Args, R, N, C> => {
  const id: string = spec.id
  const reserved = Node.RESERVED_PREFIXES.find(prefix => id.startsWith(prefix))
  if (reserved !== undefined) {
    throw new Error(
      `[metakit] Operation.define: "${id}" is under the core prefix "${reserved}"; choose an id outside ${Node.RESERVED_PREFIXES.join(', ')}.`,
    )
  }
  if (id.includes('@')) {
    throw new Error(
      `[metakit] Operation.define: "${id}" contains "@", which separates an operation id from its version; choose an id without "@".`,
    )
  }
  if (!Number.isSafeInteger(spec.version) || spec.version < 1) {
    throw new Error(
      `[metakit] Operation.define: the version of "${id}" is ${String(spec.version)}; a version is a positive integer, and a changed meaning takes a new one.`,
    )
  }
  for (let index = 0; index < spec.args.length; index++) {
    const argument = spec.args[index]!
    const label = `argument ${index + 1}`
    if (!scalarArgument(storedSchema(argument, id, label))) unsupportedSchema(argument, id, label)
  }
  const returns = resultKind(spec.returns, id)

  const checkArgs: ReadonlyArray<Node.ForeignSchemaCheck> = spec.args.map(arg => ({
    is: Schema.is(arg),
    describe: describeSchema(arg),
  }))
  const checkResult: Node.ForeignSchemaCheck = {
    is: Schema.is(spec.returns),
    describe: describeSchema(spec.returns),
  }

  const claims = toForeignClaims(spec.claims as Record<string, unknown> | undefined)
  const firstArgCheck = checkArgs[0]
  const secondArgCheck = checkArgs[1]
  if (claims.identity !== undefined) {
    const { value, side } = claims.identity
    if (side !== 'right' && firstArgCheck !== undefined && !firstArgCheck.is(value)) {
      throw new Error(
        `[metakit] Operation.define: the identity of "${id}" is ${String(value)}, which its first argument Schema does not admit (${firstArgCheck.describe}).`,
      )
    }
    if (side !== 'left' && secondArgCheck !== undefined && !secondArgCheck.is(value)) {
      throw new Error(
        `[metakit] Operation.define: the identity of "${id}" is ${String(value)}, which its second argument Schema does not admit (${secondArgCheck.describe}).`,
      )
    }
    if (side === 'both' && !checkResult.is(value)) {
      throw new Error(
        `[metakit] Operation.define: the identity of "${id}" is ${String(value)}, which its result Schema does not admit (${checkResult.describe}).`,
      )
    }
  }
  if (claims.absorbing !== undefined) {
    const { value, result, side } = claims.absorbing
    if (side !== 'right' && firstArgCheck !== undefined && !firstArgCheck.is(value)) {
      throw new Error(
        `[metakit] Operation.define: the absorbing value of "${id}" is ${String(value)}, which its first argument Schema does not admit (${firstArgCheck.describe}).`,
      )
    }
    if (side !== 'left' && secondArgCheck !== undefined && !secondArgCheck.is(value)) {
      throw new Error(
        `[metakit] Operation.define: the absorbing value of "${id}" is ${String(value)}, which its second argument Schema does not admit (${secondArgCheck.describe}).`,
      )
    }
    if (!checkResult.is(result)) {
      throw new Error(
        `[metakit] Operation.define: the absorbing result of "${id}" is ${String(result)}, which its result Schema does not admit (${checkResult.describe}).`,
      )
    }
  }
  if (claims.monotone !== undefined && claims.monotone.length !== spec.args.length) {
    throw new Error(
      `[metakit] Operation.define: monotone claim of "${id}" has length ${claims.monotone.length}, expected ${spec.args.length} to match args.`,
    )
  }

  const descriptor: Node.ForeignOp & {
    readonly id: Id
    readonly version: V
    readonly args: Args
    readonly result: R
    readonly nulls: N
    readonly claims: C
  } = {
    _tag: 'Foreign',
    id: spec.id,
    version: spec.version,
    returns,
    nulls: spec.nulls,
    args: spec.args,
    result: spec.returns,
    checkArgs,
    checkResult,
    claims: claims as Node.ForeignClaims & C,
  }

  const build = ((...args: ReadonlyArray<ExprInput<never, unknown>>) =>
    wrap(Node.Call({ op: descriptor, args: args.map(toNode) }))) as Operation<Id, V, Args, R, N, C>
  Object.defineProperty(build, 'descriptor', {
    value: descriptor,
    enumerable: true,
    writable: false,
  })
  return build
}

/** Portable JSON-compatible description of a declared operation for cross-boundary comparison. */
export interface OperationDescription {
  readonly id: string
  readonly version: number
  readonly returns: Node.ValueKind
  readonly nulls: 'strict' | 'own'
  readonly args: ReadonlyArray<string>
  readonly result: string
  readonly claims: {
    readonly identity?: { readonly value: unknown; readonly side: Node.ClaimSide }
    readonly absorbing?: {
      readonly value: unknown
      readonly result: unknown
      readonly side: Node.ClaimSide
    }
    readonly idempotent?: true
    readonly commutative?: true
    readonly associative?: true | { readonly unlessRefused: true }
    readonly invertible?: { readonly inverse: string }
    readonly monotone?: ReadonlyArray<Node.MonotoneDirection>
  }
}

/** Build a serializable description of `op` for comparing client and server declarations. */
export const describe = (op: AnyOperation): OperationDescription => {
  const { descriptor } = op
  const { claims } = descriptor
  return {
    id: descriptor.id,
    version: descriptor.version,
    returns: descriptor.returns,
    nulls: descriptor.nulls,
    args: descriptor.args.map(describeSchema),
    result: describeSchema(descriptor.result),
    claims: {
      ...(claims.identity !== undefined ? { identity: claims.identity } : {}),
      ...(claims.absorbing !== undefined ? { absorbing: claims.absorbing } : {}),
      ...(claims.idempotent === true ? { idempotent: true } : {}),
      ...(claims.commutative === true ? { commutative: true } : {}),
      ...(claims.associative !== undefined ? { associative: claims.associative } : {}),
      ...(claims.invertible !== undefined
        ? {
            invertible: {
              inverse:
                claims.invertible.inverse === 'self'
                  ? 'self'
                  : Node.foreignName(claims.invertible.inverse),
            },
          }
        : {}),
      ...(claims.monotone !== undefined ? { monotone: claims.monotone } : {}),
    },
  }
}

const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>
    const keys = Object.keys(record).sort()
    const entries: Array<string> = []
    for (const k of keys) {
      if (record[k] !== undefined) entries.push(`${JSON.stringify(k)}:${canonicalJson(record[k])}`)
    }
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value)
}

/**
 * Compare two operation descriptions of one `id@version`. Returns `Option.none()`
 * when they match, or the first difference (`args`, `result`, `nulls`, `claims`).
 */
export const compare = (
  local: OperationDescription,
  remote: OperationDescription,
): Option.Option<string> => {
  if (local.id !== remote.id || local.version !== remote.version) {
    return Option.some(
      `operation identity differs (${local.id}@${local.version} vs ${remote.id}@${remote.version})`,
    )
  }
  if (local.nulls !== remote.nulls) return Option.some('null rules differ')
  if (local.returns !== remote.returns || local.result !== remote.result) {
    return Option.some('result Schema differs')
  }
  if (!Equal.equals(local.args, remote.args)) return Option.some('argument Schemas differ')
  if (canonicalJson(local.claims) !== canonicalJson(remote.claims)) {
    return Option.some('claims differ')
  }
  return Option.none()
}

/** Argument tuple for `implement`, adding `null` only when `N` is `'own'`. */
export type RunArgs<Args extends ReadonlyArray<Schema.Top>, N extends 'strict' | 'own'> = {
  readonly [K in keyof Args]: Args[K] extends Schema.Top
    ? N extends 'own'
      ? Schema.Schema.Type<Args[K]> | null
      : Schema.Schema.Type<Args[K]>
    : never
}

/** One typed implementation binding an `Operation` to its JavaScript function. */
export interface Implementation<O extends AnyOperation = AnyOperation> {
  readonly op: O
  readonly key: string
  readonly entry: ForeignImplementation
}

/**
 * Bind a JavaScript implementation to `op`. Strict operations receive non-null
 * arguments; `nulls: 'own'` operations receive `T | null`. Throw to refuse.
 */
export const implement = <
  Id extends string,
  V extends number,
  Args extends ReadonlyArray<Schema.Top>,
  R extends Schema.Top,
  N extends 'strict' | 'own',
  C extends object,
>(
  op: Operation<Id, V, Args, R, N, C>,
  run: (...args: RunArgs<Args, N>) => Schema.Schema.Type<R> | null,
): Implementation<Operation<Id, V, Args, R, N, C>> => ({
  op,
  key: Node.foreignName(op.descriptor),
  entry: {
    run: values => run(...(values as unknown as RunArgs<Args, N>)),
  },
})

/** Metadata symbol carried on a table built by `implementations`. */
export const IMPLEMENTATIONS_META = Symbol.for('metakit/operation/implementations')

export interface ImplementationsMeta {
  readonly name: string
  readonly entries: ReadonlyMap<string, Implementation>
}

/** A named table of custom operation implementations, accepted by every reader. */
export type OperationImplementations = ForeignImplementations & {
  readonly [IMPLEMENTATIONS_META]: ImplementationsMeta
}

/**
 * Collect implementations under a `name` (used in reports and obligation names).
 * Refuses two implementations for the same `id@version`.
 */
export const implementations = (
  name: string,
  ...list: ReadonlyArray<Implementation>
): OperationImplementations => {
  const table: Record<string, ForeignImplementation> = {}
  const entries = new Map<string, Implementation>()
  for (const item of list) {
    if (entries.has(item.key)) {
      throw new Error(
        `[metakit] Operation.implementations: "${item.key}" is implemented twice in "${name}"; pass one implementation per operation and version.`,
      )
    }
    entries.set(item.key, item)
    table[item.key] = item.entry
  }
  Object.defineProperty(table, IMPLEMENTATIONS_META, {
    value: { name, entries } satisfies ImplementationsMeta,
    enumerable: false,
    writable: false,
  })
  return table as OperationImplementations
}

/** Read the name and entries from an `OperationImplementations` table. */
export const implementationsMeta = (table: OperationImplementations): ImplementationsMeta =>
  table[IMPLEMENTATIONS_META]

// ---------------------------------------------------------------------------
// Derived operations (#648 #7 & #597): named Operations backed by a canonical Fn
// ---------------------------------------------------------------------------

/** Positional argument Schema tuple derived from `P` and `Order`. */
export type OrderedParamSchemas<
  P extends ParamSchemas,
  Order extends ReadonlyArray<keyof P & string>,
> = {
  readonly [K in keyof Order]: Order[K] extends keyof P ? P[Order[K]] : never
}

/**
 * A named, versioned `Operation` whose canonical meaning is a `Fn` definition.
 * Preserves operation identity in `Expr` / `Artifact` / `Language`, derives a
 * canonical JS `implementation` automatically, and can be expanded into core
 * primitives via `expandDerived` for SQL, Tier 3, and Z3 readers.
 */
export interface DerivedOperation<
  Id extends string,
  V extends number,
  Args extends ReadonlyArray<Schema.Top>,
  R extends Schema.Top,
  N extends 'strict' | 'own',
  C extends object,
  P extends ParamSchemas,
  FR,
> extends Operation<Id, V, Args, R, N, C> {
  readonly definition: Fn<P, FR>
  readonly paramOrder: ReadonlyArray<keyof P & string>
  /** Canonical JS implementation derived directly from `definition.body`. */
  readonly implementation: Implementation<Operation<Id, V, Args, R, N, C>>
}

/** Any `DerivedOperation`, regardless of its concrete signature. */
export interface AnyDerivedOperation extends AnyOperation {
  readonly definition: (args: never) => Expr<never, unknown>
  readonly paramOrder: ReadonlyArray<string>
  readonly implementation: Implementation
}

/**
 * Define a named, versioned `Operation` backed by a canonical `Fn` body.
 * Validates that `paramOrder` names every parameter of `definition` once.
 */
export const derived = <
  const Id extends string,
  const V extends number,
  const P extends ParamSchemas,
  const Order extends ReadonlyArray<keyof P & string>,
  R extends Schema.Top,
  N extends 'strict' | 'own' = 'strict',
  const C extends Claims<OrderedParamSchemas<P, Order>, R> = {},
  FR extends ReturnCarrier<Schema.Schema.Type<R>> | (N extends 'own' ? null : never) =
    ReturnCarrier<Schema.Schema.Type<R>>,
>(spec: {
  readonly id: Id & NotCore<Id>
  readonly version: V
  readonly definition: Fn<P, FR>
  readonly paramOrder: Order
  readonly returns: R
  readonly nulls?: N
  readonly claims?: C
  /** Optional foreign implementations needed if `definition.body` calls other foreign/derived ops. */
  readonly foreign?: ForeignImplementations
}): DerivedOperation<Id, V, OrderedParamSchemas<P, Order>, R, N, C, P, FR> => {
  if (
    spec.definition.whereClauses.length > 0 ||
    spec.definition.ensuresClauses.length > 0 ||
    spec.definition.obligations.length > 0
  ) {
    throw new Error(
      `[metakit] Operation.derived(${spec.id}@${spec.version}): definition cannot carry where/ensures/obligations because Operation calls do not enforce Fn preconditions or obligations`,
    )
  }
  const expectedKeys = Object.keys(spec.definition.params)
  const seen = new Set<string>()
  for (const name of spec.paramOrder) {
    if (!Object.hasOwn(spec.definition.params, name)) {
      throw new Error(
        `[metakit] Operation.derived(${spec.id}@${spec.version}): unknown parameter "${name}" in paramOrder`,
      )
    }
    if (seen.has(name)) {
      throw new Error(
        `[metakit] Operation.derived(${spec.id}@${spec.version}): duplicate parameter "${name}" in paramOrder`,
      )
    }
    seen.add(name)
  }
  if (seen.size !== expectedKeys.length) {
    const missing = expectedKeys.filter(k => !seen.has(k))
    throw new Error(
      `[metakit] Operation.derived(${spec.id}@${spec.version}): paramOrder is missing parameter(s): ${missing.join(', ')}`,
    )
  }

  const orderedSchemas = spec.paramOrder.map(
    name => spec.definition.params[name]!,
  ) as unknown as OrderedParamSchemas<P, Order>
  const nulls = (spec.nulls ?? 'strict') as N
  const op = define({
    id: spec.id,
    version: spec.version,
    args: orderedSchemas,
    returns: spec.returns,
    nulls,
    ...(spec.claims === undefined ? {} : { claims: spec.claims }),
  }) as Operation<Id, V, OrderedParamSchemas<P, Order>, R, N, C>

  const implementation = implement(op, (...values) => {
    const env: Record<string, unknown> = {}
    for (let i = 0; i < spec.paramOrder.length; i++) {
      env[spec.paramOrder[i]!] = values[i]
    }
    const result = evalNode(spec.definition.body.node, env, spec.foreign)
    if (Node.isRefusal(result)) throw result
    return result as Schema.Schema.Type<R> | null
  })

  return Object.assign(op, {
    definition: spec.definition,
    paramOrder: [...spec.paramOrder],
    implementation,
  })
}

const DEFAULT_MAX_DERIVED_NODES = 10_000

/**
 * Symbolically expand calls to any `DerivedOperation` in `ops` using their
 * canonical `Fn` definitions, so SQL, Tier 3, and Z3 readers can lower and
 * verify them directly. Detects cyclic expansions and enforces `maxNodes`.
 */
export const expandDerived = <Env, A>(
  expr: Expr<Env, A>,
  ops: ReadonlyArray<AnyDerivedOperation>,
  options?: { readonly maxNodes?: number },
): Expr<Env, A> => {
  const byKey = new Map<string, AnyDerivedOperation>()
  for (const op of ops) {
    byKey.set(Node.foreignName(op.descriptor), op)
  }
  if (byKey.size === 0) return expr
  const maxNodes = options?.maxNodes ?? DEFAULT_MAX_DERIVED_NODES
  let budget = 0

  const expandNode = (node: Node.Node, active: ReadonlySet<string>): Node.Node => {
    budget += 1
    if (budget > maxNodes) {
      throw new RangeError(`[metakit] Operation.expandDerived exceeded budget of ${maxNodes} nodes`)
    }
    return Node.$match(node, {
      Lit: l => l,
      Path: p => p,
      Opaque: o => o,
      Call: ({ op, args }) => {
        const expandedArgs = args.map(arg => expandNode(arg, active))
        if (!Node.isForeign(op)) return Node.Call({ op, args: expandedArgs })
        const key = Node.foreignName(op)
        const derivedOp = byKey.get(key)
        if (derivedOp === undefined) return Node.Call({ op, args: expandedArgs })
        if (active.has(key)) {
          throw new Error(
            `[metakit] Operation.expandDerived: cyclic derived operation expansion detected at "${key}"`,
          )
        }
        if (expandedArgs.length !== derivedOp.paramOrder.length) {
          throw new Error(
            `[metakit] Operation.expandDerived: "${key}" expected ${derivedOp.paramOrder.length} argument(s), got ${expandedArgs.length}`,
          )
        }
        const argRecord: Record<string, Expr<never, unknown>> = {}
        for (let i = 0; i < derivedOp.paramOrder.length; i++) {
          argRecord[derivedOp.paramOrder[i]!] = wrap(expandedArgs[i]!)
        }
        const inlined = derivedOp.definition(argRecord as never).node
        const nextActive = new Set(active)
        nextActive.add(key)
        const expandedBody = expandNode(inlined, nextActive)
        if (derivedOp.descriptor.nulls === 'strict' && expandedArgs.length > 0) {
          let anyNull: Node.Node = Node.Call({ op: isNullOp, args: [expandedArgs[0]!] })
          for (let i = 1; i < expandedArgs.length; i++) {
            anyNull = Node.Call({
              op: orOp,
              args: [anyNull, Node.Call({ op: isNullOp, args: [expandedArgs[i]!] })],
            })
          }
          return Node.If({
            cond: anyNull,
            then: Node.Lit({ value: null }),
            otherwise: expandedBody,
          })
        }
        return expandedBody
      },
      If: ({ cond, then: t, otherwise }) =>
        Node.If({
          cond: expandNode(cond, active),
          then: expandNode(t, active),
          otherwise: expandNode(otherwise, active),
        }),
      Match: ({ on, cases, otherwise }) =>
        Node.Match({
          on: expandNode(on, active),
          cases: cases.map(([v, b]) => [v, expandNode(b, active)] as const),
          otherwise: Option.map(otherwise, b => expandNode(b, active)),
        }),
      Rows: rows =>
        Node.mapRows(
          rows,
          source => expandNode(source, active),
          body => expandNode(body, active),
        ),
    })
  }

  return wrap(expandNode(expr.node, new Set()))
}
