/**
 * Portable semantic artifacts (`metakit/artifact`, #645 P0).
 *
 * Encodes and decodes the portable subset of MetaKit `Expr` nodes as versioned
 * Effect `Schema` values: paths, JSON-safe literals, bound `Rows` variables,
 * core/foreign calls by stable `(id, version)`, conditionals, and matches.
 *
 * Never serializes JavaScript closures (`Opaque`), raw `SchemaAST` internals,
 * or interpreter functions, and never fabricates `Expr<Env, A>` without
 * validating wire shape, size/depth limits, operator registry & allowlist,
 * path scope, arity, and result kind against the caller's Schemas.
 */
import { Effect, Match, Option, Schema, SchemaAST } from 'effect'
import * as Node from './node.js'
import type { AnyOperation } from './operation.js'
import { wrap } from './ops/core.js'
import { loadRows } from './ops/rowsLoad.js'
import { coreArity, coreOps, isCoreOpId } from './ops/table.js'
import { format as formatPath, optionInner, type EnvOf, type Expr } from './path.js'

export { isCoreOpId } from './ops/table.js'

/** Current wire format version for portable expression artifacts. */
export const CODEC_VERSION = 1 as const

/** Bounds enforced during both encoding and decoding to guard against hostile inputs. */
export interface ArtifactLimits {
  readonly maxDepth: number
  readonly maxNodes: number
}

/** Default resource bounds for portable artifacts. */
export const DEFAULT_LIMITS: ArtifactLimits = {
  maxDepth: 64,
  maxNodes: 2048,
}

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

/** A node or literal value lies outside the portable subset (e.g. `Opaque`, `NaN`, function). */
export class UnsupportedNodeError extends Schema.TaggedError<UnsupportedNodeError>()(
  'UnsupportedNodeError',
  {
    nodeTag: Schema.String,
    detail: Schema.String,
  },
) {}

/** An artifact exceeded the configured depth or node-count limit. */
export class ArtifactLimitError extends Schema.TaggedError<ArtifactLimitError>()(
  'ArtifactLimitError',
  {
    kind: Schema.Literals(['depth', 'nodes']),
    limit: Schema.Number,
    actual: Schema.Number,
  },
) {}

/** Two incompatible operations were registered under the same `id@version`. */
export class DuplicateOperationError extends Schema.TaggedError<DuplicateOperationError>()(
  'DuplicateOperationError',
  {
    op: Schema.String,
    detail: Schema.String,
  },
) {}

/** An artifact referenced an unknown, unregistered, or disallowed operator. */
export class UnknownOperationError extends Schema.TaggedError<UnknownOperationError>()(
  'UnknownOperationError',
  {
    op: Schema.String,
    kind: Schema.Literals(['core', 'foreign']),
    detail: Schema.String,
  },
) {}

/** A wire artifact failed version, schema, scope, arity, or result-type validation. */
export class ArtifactDecodeError extends Schema.TaggedError<ArtifactDecodeError>()(
  'ArtifactDecodeError',
  {
    phase: Schema.Literals(['version', 'schema', 'scope', 'arity', 'type']),
    path: Schema.String,
    detail: Schema.String,
  },
) {}

export type ArtifactError =
  | UnsupportedNodeError
  | ArtifactLimitError
  | DuplicateOperationError
  | UnknownOperationError
  | ArtifactDecodeError

// ---------------------------------------------------------------------------
// Portable wire schemas
// ---------------------------------------------------------------------------

export type PortableLiteral =
  | null
  | boolean
  | number
  | string
  | ReadonlyArray<PortableLiteral>
  | { readonly [key: string]: PortableLiteral }

const FiniteNumber = Schema.Number.check(
  Schema.isFinite(),
  Schema.makeFilter(n => (!Object.is(n, -0) ? undefined : 'negative zero (-0) is not portable')),
)

const PositiveVersion = Schema.Int.check(Schema.isGreaterThan(0))

export const PortableLiteral: Schema.Codec<PortableLiteral> = Schema.suspend(() =>
  Schema.Union([
    Schema.Null,
    Schema.Boolean,
    FiniteNumber,
    Schema.String,
    Schema.Array(PortableLiteral),
    Schema.Record(Schema.String, PortableLiteral),
  ]),
)

export const PortableOpRef = Schema.Union([
  Schema.TaggedStruct('Core', { id: Schema.String }),
  Schema.TaggedStruct('Foreign', { id: Schema.String, version: PositiveVersion }),
])
export type PortableOpRef = Schema.Schema.Type<typeof PortableOpRef>

const RowsFoldSchema = Schema.Literals([
  'any',
  'every',
  'count',
  'sum',
  'min',
  'max',
  'reduce',
  'find',
  'keep',
  'patch',
])

const CardinalitySchema = Schema.Literals(['one', 'optional', 'many'])

export type PortableRowsOver =
  | { readonly _tag: 'List'; readonly list: PortableNode }
  | {
      readonly _tag: 'Related'
      readonly of: PortableNode
      readonly relation: string
      readonly cardinality?: 'one' | 'optional' | 'many'
    }

export type PortableNode =
  | { readonly _tag: 'Lit'; readonly value: PortableLiteral }
  | { readonly _tag: 'Path'; readonly segments: ReadonlyArray<string> }
  | {
      readonly _tag: 'Call'
      readonly op: PortableOpRef
      readonly args: ReadonlyArray<PortableNode>
    }
  | {
      readonly _tag: 'If'
      readonly cond: PortableNode
      readonly then: PortableNode
      readonly otherwise: PortableNode
    }
  | {
      readonly _tag: 'Match'
      readonly on: PortableNode
      readonly cases: ReadonlyArray<readonly [string, PortableNode]>
      readonly otherwise?: PortableNode
    }
  | {
      readonly _tag: 'Rows'
      readonly fold: Node.RowsFold
      readonly over: PortableRowsOver
      readonly where?: PortableNode
      readonly value?: PortableNode
      readonly set: ReadonlyArray<readonly [string, PortableNode]>
      readonly op?: { readonly id: string; readonly version: number }
      readonly each?: string
    }

const PortableRowsOverSchema: Schema.Codec<PortableRowsOver> = Schema.suspend(() =>
  Schema.Union([
    Schema.TaggedStruct('List', { list: PortableNodeSchema }),
    Schema.TaggedStruct('Related', {
      of: PortableNodeSchema,
      relation: Schema.String,
      cardinality: Schema.optionalKey(CardinalitySchema),
    }),
  ]),
)

export const PortableNodeSchema: Schema.Codec<PortableNode> = Schema.suspend(() =>
  Schema.Union([
    Schema.TaggedStruct('Lit', { value: PortableLiteral }),
    Schema.TaggedStruct('Path', { segments: Schema.Array(Schema.String) }),
    Schema.TaggedStruct('Call', { op: PortableOpRef, args: Schema.Array(PortableNodeSchema) }),
    Schema.TaggedStruct('If', {
      cond: PortableNodeSchema,
      then: PortableNodeSchema,
      otherwise: PortableNodeSchema,
    }),
    Schema.TaggedStruct('Match', {
      on: PortableNodeSchema,
      cases: Schema.Array(Schema.Tuple([Schema.String, PortableNodeSchema])),
      otherwise: Schema.optionalKey(PortableNodeSchema),
    }),
    Schema.TaggedStruct('Rows', {
      fold: RowsFoldSchema,
      over: PortableRowsOverSchema,
      where: Schema.optionalKey(PortableNodeSchema),
      value: Schema.optionalKey(PortableNodeSchema),
      set: Schema.Array(Schema.Tuple([Schema.String, PortableNodeSchema])),
      op: Schema.optionalKey(Schema.Struct({ id: Schema.String, version: PositiveVersion })),
      each: Schema.optionalKey(Schema.String),
    }),
  ]),
)

export const PortableArtifactV1 = Schema.Struct({
  codecVersion: Schema.Literal(CODEC_VERSION),
  node: PortableNodeSchema,
  requiredOps: Schema.Array(PortableOpRef),
})
export type PortableArtifactV1 = Schema.Schema.Type<typeof PortableArtifactV1>

// ---------------------------------------------------------------------------
// Operation registry
// ---------------------------------------------------------------------------

/** Source accepted by `Artifact.registry`: a single `Operation` or a `Language`. */
export type RegistrySource = AnyOperation | { readonly operations: ReadonlyArray<AnyOperation> }

const isLanguageSource = (
  source: RegistrySource,
): source is { readonly operations: ReadonlyArray<AnyOperation> } =>
  'operations' in source && Array.isArray(source.operations)

/** Immutable registry resolving `(id, version)` to declared `AnyOperation`s. */
export interface OperationRegistry {
  readonly operations: ReadonlyMap<string, AnyOperation>
  readonly resolve: (id: string, version: number) => Option.Option<AnyOperation>
}

const makeRegistry = (operations: ReadonlyMap<string, AnyOperation>): OperationRegistry => ({
  operations,
  resolve: (id, version) =>
    Option.fromUndefinedOr(operations.get(Node.foreignName({ id, version }))),
})

/** Registry with no foreign operations (core operators only). */
export const emptyRegistry: OperationRegistry = makeRegistry(new Map())

const compatibleOps = (a: AnyOperation, b: AnyOperation): boolean => {
  if (a === b) return true
  const da = a.descriptor
  const db = b.descriptor
  if (
    da.id !== db.id ||
    da.version !== db.version ||
    da.returns !== db.returns ||
    da.nulls !== db.nulls ||
    da.args.length !== db.args.length
  ) {
    return false
  }
  const ca = da.checkArgs ?? []
  const cb = db.checkArgs ?? []
  if (ca.length !== cb.length) return false
  for (let i = 0; i < ca.length; i++) {
    if (ca[i]!.describe !== cb[i]!.describe) return false
  }
  if (da.checkResult?.describe !== db.checkResult?.describe) return false
  return JSON.stringify(da.claims) === JSON.stringify(db.claims)
}

/**
 * Build an `OperationRegistry` from `Operation`s and/or `Language`s.
 * Identical or signature-compatible duplicate registrations are idempotent;
 * conflicting registrations for the same `id@version` fail with `DuplicateOperationError`.
 */
export const registry = (
  ...sources: ReadonlyArray<RegistrySource>
): Effect.Effect<OperationRegistry, DuplicateOperationError> =>
  Effect.suspend(() => {
    const map = new Map<string, AnyOperation>()
    for (const source of sources) {
      const ops: ReadonlyArray<AnyOperation> = isLanguageSource(source)
        ? source.operations
        : [source]
      for (const op of ops) {
        const key = Node.foreignName(op.descriptor)
        const existing = map.get(key)
        if (existing !== undefined) {
          if (!compatibleOps(existing, op)) {
            return Effect.fail(
              new DuplicateOperationError({
                op: key,
                detail: `conflicting operation registrations for ${key} (signature/schemas/claims differ)`,
              }),
            )
          }
          continue
        }
        map.set(key, op)
      }
    }
    return Effect.succeed(makeRegistry(map))
  })

// ---------------------------------------------------------------------------
// Limits & literal portability helpers
// ---------------------------------------------------------------------------

const resolveLimits = (limits?: Partial<ArtifactLimits>): ArtifactLimits => ({
  maxDepth: limits?.maxDepth ?? DEFAULT_LIMITS.maxDepth,
  maxNodes: limits?.maxNodes ?? DEFAULT_LIMITS.maxNodes,
})

const isPlainObject = (value: object): boolean => {
  const proto: unknown = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

const setOwn = (
  target: Record<string, PortableLiteral>,
  key: string,
  value: PortableLiteral,
): void => {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  })
}

const checkRawBounds = (
  raw: unknown,
  limits: ArtifactLimits,
): Effect.Effect<void, ArtifactLimitError> =>
  Effect.suspend(() => {
    let nodes = 0
    const stack: Array<readonly [value: unknown, depth: number]> = [[raw, 0]]
    const maxRawDepth = limits.maxDepth * 3 + 8
    const maxRawValues = limits.maxNodes * 16 + 64
    while (stack.length > 0) {
      const [current, depth] = stack.pop()!
      nodes += 1
      if (nodes > maxRawValues) {
        return Effect.fail(
          new ArtifactLimitError({ kind: 'nodes', limit: limits.maxNodes, actual: nodes }),
        )
      }
      if (depth > maxRawDepth) {
        return Effect.fail(
          new ArtifactLimitError({ kind: 'depth', limit: limits.maxDepth, actual: depth }),
        )
      }
      if (current !== null && typeof current === 'object') {
        if (Array.isArray(current)) {
          for (let i = 0; i < current.length; i++) stack.push([current[i], depth + 1])
        } else {
          for (const key of Object.keys(current)) {
            stack.push([(current as Record<string, unknown>)[key], depth + 1])
          }
        }
      }
    }
    return Effect.void
  })

const encodeLiteral = (
  value: unknown,
  depth: number,
  limits: ArtifactLimits,
): Effect.Effect<PortableLiteral, UnsupportedNodeError | ArtifactLimitError> => {
  if (depth > limits.maxDepth) {
    return Effect.fail(
      new ArtifactLimitError({ kind: 'depth', limit: limits.maxDepth, actual: depth }),
    )
  }
  if (value === null) return Effect.succeed(null)
  if (typeof value === 'boolean' || typeof value === 'string') return Effect.succeed(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return Effect.fail(
        new UnsupportedNodeError({
          nodeTag: 'Lit',
          detail: `non-finite number literal (${String(value)}) is not portable`,
        }),
      )
    }
    if (Object.is(value, -0)) {
      return Effect.fail(
        new UnsupportedNodeError({
          nodeTag: 'Lit',
          detail: 'negative zero (-0) literal is not portable across JSON codecs',
        }),
      )
    }
    return Effect.succeed(value)
  }
  if (Array.isArray(value)) {
    return Effect.forEach(value, item => encodeLiteral(item, depth + 1, limits))
  }
  if (typeof value === 'object' && isPlainObject(value)) {
    const entries = Object.entries(value as Record<string, unknown>)
    return Effect.forEach(entries, ([k, v]) =>
      encodeLiteral(v, depth + 1, limits).pipe(Effect.map(ev => [k, ev] as const)),
    ).pipe(
      Effect.map(pairs => {
        const out: Record<string, PortableLiteral> = {}
        for (const [k, v] of pairs) setOwn(out, k, v)
        return out
      }),
    )
  }
  return Effect.fail(
    new UnsupportedNodeError({
      nodeTag: 'Lit',
      detail: `literal of type ${typeof value} is not portable`,
    }),
  )
}

const opRefKey = (ref: PortableOpRef): string =>
  Match.value(ref).pipe(
    Match.tags({
      Core: ({ id }) => `core:${id}`,
      Foreign: ({ id, version }) => `foreign:${id}@${version}`,
    }),
    Match.exhaustive,
  )

// ---------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------

export interface EncodeOptions {
  readonly limits?: Partial<ArtifactLimits>
}

/**
 * Encode an `Expr` into a versioned `PortableArtifactV1`.
 * Rejects `Opaque` nodes, non-portable literals (`NaN`, `Infinity`, `-0`,
 * functions, symbols, class instances), and expressions exceeding `limits`.
 */
export const encodeExpr = (
  expr: Expr<never, unknown>,
  options?: EncodeOptions,
): Effect.Effect<PortableArtifactV1, UnsupportedNodeError | ArtifactLimitError> =>
  Effect.suspend(() => {
    const limits = resolveLimits(options?.limits)
    const ops = new Map<string, PortableOpRef>()
    let nodeCount = 0

    const recordOp = (ref: PortableOpRef): void => {
      ops.set(opRefKey(ref), ref)
    }

    const visit = (
      node: Node.Node,
      depth: number,
    ): Effect.Effect<PortableNode, UnsupportedNodeError | ArtifactLimitError> => {
      nodeCount += 1
      if (nodeCount > limits.maxNodes) {
        return Effect.fail(
          new ArtifactLimitError({ kind: 'nodes', limit: limits.maxNodes, actual: nodeCount }),
        )
      }
      if (depth > limits.maxDepth) {
        return Effect.fail(
          new ArtifactLimitError({ kind: 'depth', limit: limits.maxDepth, actual: depth }),
        )
      }
      return Node.$match(node, {
        Lit: ({ value }) =>
          encodeLiteral(value, depth, limits).pipe(
            Effect.map(v => ({ _tag: 'Lit' as const, value: v })),
          ),
        Path: ({ segments }) => Effect.succeed({ _tag: 'Path' as const, segments: [...segments] }),
        Call: ({ op, args }) => {
          const ref: PortableOpRef = Node.isForeign(op)
            ? { _tag: 'Foreign', id: op.id, version: op.version }
            : { _tag: 'Core', id: op.id }
          recordOp(ref)
          return Effect.forEach(args, arg => visit(arg, depth + 1)).pipe(
            Effect.map(encodedArgs => ({ _tag: 'Call' as const, op: ref, args: encodedArgs })),
          )
        },
        If: ({ cond, then: t, otherwise }) =>
          Effect.all([
            visit(cond, depth + 1),
            visit(t, depth + 1),
            visit(otherwise, depth + 1),
          ]).pipe(
            Effect.map(([c, th, el]) => ({
              _tag: 'If' as const,
              cond: c,
              then: th,
              otherwise: el,
            })),
          ),
        Match: ({ on, cases, otherwise }) =>
          Effect.gen(function* () {
            const encodedOn = yield* visit(on, depth + 1)
            const encodedCases = yield* Effect.forEach(cases, ([label, branch]) =>
              visit(branch, depth + 1).pipe(Effect.map(b => [label, b] as const)),
            )
            const encodedOtherwise = Option.isSome(otherwise)
              ? yield* visit(otherwise.value, depth + 1)
              : undefined
            return {
              _tag: 'Match' as const,
              on: encodedOn,
              cases: encodedCases,
              ...(encodedOtherwise === undefined ? {} : { otherwise: encodedOtherwise }),
            }
          }),
        Opaque: ({ name }) =>
          Effect.fail(
            new UnsupportedNodeError({
              nodeTag: 'Opaque',
              detail: `opaque node "${name}" cannot be serialized as a portable artifact`,
            }),
          ),
        Rows: rows =>
          Effect.gen(function* () {
            const over: PortableRowsOver = yield* Node.RowsOver.$match(rows.over, {
              List: ({ list }) =>
                visit(list, depth + 1).pipe(Effect.map(l => ({ _tag: 'List' as const, list: l }))),
              Related: ({ of, relation, cardinality }) =>
                visit(of, depth + 1).pipe(
                  Effect.map(o => ({
                    _tag: 'Related' as const,
                    of: o,
                    relation,
                    ...(cardinality === undefined ? {} : { cardinality }),
                  })),
                ),
            })
            const where = Option.isSome(rows.where)
              ? yield* visit(rows.where.value, depth + 1)
              : undefined
            const value = Option.isSome(rows.value)
              ? yield* visit(rows.value.value, depth + 1)
              : undefined
            const set = yield* Effect.forEach(rows.set, ([field, v]) =>
              visit(v, depth + 1).pipe(Effect.map(ev => [field, ev] as const)),
            )
            if (rows.op !== undefined) {
              recordOp({ _tag: 'Foreign', id: rows.op.id, version: rows.op.version })
            }
            return {
              _tag: 'Rows' as const,
              fold: rows.fold,
              over,
              ...(where === undefined ? {} : { where }),
              ...(value === undefined ? {} : { value }),
              set,
              ...(rows.op === undefined
                ? {}
                : { op: { id: rows.op.id, version: rows.op.version } }),
              ...(rows.each === undefined ? {} : { each: rows.each }),
            }
          }),
      })
    }

    return visit(expr.node, 0).pipe(
      Effect.map(node => ({
        codecVersion: CODEC_VERSION,
        node,
        requiredOps: [...ops.entries()]
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([, ref]) => ref),
      })),
    )
  })

// ---------------------------------------------------------------------------
// Schema AST path resolution & static result kind checking
// ---------------------------------------------------------------------------

const unwrapNullable = (ast: SchemaAST.AST): SchemaAST.AST => {
  const opt = optionInner(ast)
  if (Option.isSome(opt)) return unwrapNullable(opt.value)
  if (!SchemaAST.isUnion(ast)) return ast
  const nonNull = ast.types.filter(t => !SchemaAST.isNull(t) && !SchemaAST.isUndefined(t))
  return nonNull.length === 1 ? unwrapNullable(nonNull[0]!) : ast
}

const resolveAstSegments = (
  root: SchemaAST.AST,
  segments: ReadonlyArray<string>,
): Option.Option<SchemaAST.AST> => {
  let current: SchemaAST.AST = root
  for (const segment of segments) {
    const unwrapped = unwrapNullable(current)
    if (!SchemaAST.isObjects(unwrapped)) return Option.none()
    const prop = unwrapped.propertySignatures.find(p => p.name === segment)
    if (prop === undefined) return Option.none()
    current = prop.type
  }
  return Option.some(current)
}

const arrayElementAst = (ast: SchemaAST.AST): Option.Option<SchemaAST.AST> => {
  const unwrapped = unwrapNullable(ast)
  if (!SchemaAST.isArrays(unwrapped)) return Option.none()
  const rest = unwrapped.rest[0]
  return rest !== undefined ? Option.some(rest) : Option.none()
}

type InferredKind =
  | 'number'
  | 'boolean'
  | 'text'
  | 'array'
  | 'object'
  | 'null'
  | 'mixed'
  | 'unknown'

const kindOfAst = (ast: SchemaAST.AST): InferredKind => {
  const unwrapped = unwrapNullable(ast)
  if (SchemaAST.isNull(unwrapped) || SchemaAST.isUndefined(unwrapped)) return 'null'
  if (SchemaAST.isNumber(unwrapped)) return 'number'
  if (SchemaAST.isBoolean(unwrapped)) return 'boolean'
  if (SchemaAST.isString(unwrapped)) return 'text'
  if (SchemaAST.isArrays(unwrapped)) return 'array'
  if (SchemaAST.isObjects(unwrapped)) return 'object'
  if (SchemaAST.isLiteral(unwrapped)) {
    if (typeof unwrapped.literal === 'number') return 'number'
    if (typeof unwrapped.literal === 'boolean') return 'boolean'
    if (typeof unwrapped.literal === 'string') return 'text'
  }
  if (SchemaAST.isUnion(unwrapped)) {
    const kinds = new Set(unwrapped.types.map(kindOfAst).filter(k => k !== 'null'))
    return kinds.size === 1 ? [...kinds][0]! : 'unknown'
  }
  return 'unknown'
}

const joinKinds = (a: InferredKind, b: InferredKind): InferredKind => {
  if (a === 'null') return b
  if (b === 'null') return a
  if (a === 'unknown' || b === 'unknown') return 'unknown'
  return a === b ? a : 'mixed'
}

const inferNodeKind = (node: Node.Node): InferredKind =>
  Node.$match(node, {
    Lit: ({ value }): InferredKind => {
      if (value === null || value === undefined) return 'null'
      if (typeof value === 'number') return 'number'
      if (typeof value === 'boolean') return 'boolean'
      if (typeof value === 'string') return 'text'
      if (Array.isArray(value)) return 'array'
      if (typeof value === 'object') return 'object'
      return 'unknown'
    },
    Path: ({ ast }): InferredKind =>
      Option.match(ast, { onNone: (): InferredKind => 'unknown', onSome: kindOfAst }),
    Call: ({ op, args }): InferredKind => {
      if (Node.isForeign(op)) return op.returns
      if (op.returns === 'operand') {
        return args.reduce<InferredKind>((acc, arg) => joinKinds(acc, inferNodeKind(arg)), 'null')
      }
      if (
        op.id === 'arr.append' ||
        op.id === 'arr.include' ||
        op.id === 'arr.exclude' ||
        op.id === 'arr.move' ||
        op.id === 'set.union' ||
        op.id === 'set.intersect' ||
        op.id === 'set.difference'
      ) {
        return 'array'
      }
      return op.returns
    },
    If: ({ then: t, otherwise }) => joinKinds(inferNodeKind(t), inferNodeKind(otherwise)),
    Match: ({ cases, otherwise }) => {
      let acc: InferredKind = Option.match(otherwise, {
        onNone: () => 'null',
        onSome: inferNodeKind,
      })
      for (const [, branch] of cases) acc = joinKinds(acc, inferNodeKind(branch))
      return acc
    },
    Opaque: (): InferredKind => 'unknown',
    Rows: (rows): InferredKind => {
      switch (rows.fold) {
        case 'any':
        case 'every':
          return 'boolean'
        case 'count':
        case 'sum':
        case 'min':
        case 'max':
          return 'number'
        case 'keep':
        case 'patch':
          return 'array'
        case 'reduce':
          return rows.op !== undefined ? rows.op.returns : 'unknown'
        case 'find':
          return 'unknown'
      }
    },
  })

const kindCompatible = (actual: InferredKind, expected: SchemaAST.AST): boolean => {
  const expectedKind = kindOfAst(expected)
  if (expectedKind === 'unknown' || actual === 'unknown') return true
  if (actual === 'mixed') return false
  if (actual === 'null') {
    return (
      SchemaAST.isNull(expected) ||
      SchemaAST.isUndefined(expected) ||
      Option.isSome(optionInner(expected)) ||
      (SchemaAST.isUnion(expected) &&
        expected.types.some(t => SchemaAST.isNull(t) || SchemaAST.isUndefined(t)))
    )
  }
  return actual === expectedKind
}

// ---------------------------------------------------------------------------
// Decoding
// ---------------------------------------------------------------------------

/** Policy controlling which operators an externally received artifact may invoke. */
export interface AllowlistPolicy {
  /** Allowed core operator ids; omit to allow all closed-set core operators. */
  readonly core?: ReadonlySet<Node.CoreOpId> | ReadonlyArray<Node.CoreOpId>
  /** Allowed foreign operator names (`id@version`); empty by default when `allowlist` is passed. */
  readonly foreign?: ReadonlySet<string> | ReadonlyArray<string>
}

export interface DecodeBaseOptions<R extends Schema.Top> {
  /** Expected result Schema for the decoded expression. */
  readonly result: R
  /** Registry resolving foreign `(id, version)` calls. Defaults to `emptyRegistry` (core ops only). */
  readonly registry?: OperationRegistry
  /** Resource bounds enforced during decode. Defaults to `DEFAULT_LIMITS`. */
  readonly limits?: Partial<ArtifactLimits>
  /**
   * Operator allowlist. When omitted, all core operators and all operations
   * registered in `registry` are allowed. Pass `{ foreign: [] }` for a safe
   * core-only default on untrusted wire inputs.
   */
  readonly allowlist?: AllowlistPolicy
}

export interface DecodeEnvOptions<
  Shape extends Readonly<Record<string, Schema.Top>>,
  R extends Schema.Top,
> extends DecodeBaseOptions<R> {
  readonly env: Shape
}

export interface DecodeSchemaOptions<
  S extends Schema.Top,
  R extends Schema.Top,
> extends DecodeBaseOptions<R> {
  readonly schema: S
}

const toSet = <T>(
  input: ReadonlySet<T> | ReadonlyArray<T> | undefined,
): ReadonlySet<T> | undefined =>
  input === undefined ? undefined : input instanceof Set ? input : new Set(input)

const decodeAgainstRoot = <Env, A>(
  raw: unknown,
  rootAst: SchemaAST.AST,
  resolveRootSegment: (segments: ReadonlyArray<string>) => Option.Option<SchemaAST.AST>,
  options: DecodeBaseOptions<Schema.Top>,
): Effect.Effect<Expr<Env, A>, ArtifactError> =>
  Effect.gen(function* () {
    if (
      typeof raw === 'object' &&
      raw !== null &&
      'codecVersion' in raw &&
      (raw as { readonly codecVersion: unknown }).codecVersion !== CODEC_VERSION
    ) {
      return yield* Effect.fail(
        new ArtifactDecodeError({
          phase: 'version',
          path: '$.codecVersion',
          detail: `unsupported codecVersion ${String((raw as { readonly codecVersion: unknown }).codecVersion)}; expected ${CODEC_VERSION}`,
        }),
      )
    }

    const limits = resolveLimits(options.limits)
    yield* checkRawBounds(raw, limits)

    const artifact = yield* Schema.decodeUnknownEffect(PortableArtifactV1)(raw).pipe(
      Effect.mapError(
        err =>
          new ArtifactDecodeError({
            phase: 'schema',
            path: '$',
            detail: String(err),
          }),
      ),
    )

    const reg = options.registry ?? emptyRegistry
    const coreAllow = toSet(options.allowlist?.core)
    const foreignAllow =
      options.allowlist === undefined
        ? undefined
        : (toSet(options.allowlist.foreign) ?? new Set<string>())
    const actualOps = new Set<string>()
    let nodeCount = 0

    const resolveForeign = (
      id: string,
      version: number,
    ): Effect.Effect<AnyOperation, UnknownOperationError> => {
      const key = Node.foreignName({ id, version })
      if (foreignAllow !== undefined && !foreignAllow.has(key)) {
        return Effect.fail(
          new UnknownOperationError({
            op: key,
            kind: 'foreign',
            detail: `foreign operation ${key} is not permitted by allowlist`,
          }),
        )
      }
      return Option.match(reg.resolve(id, version), {
        onNone: () =>
          Effect.fail(
            new UnknownOperationError({
              op: key,
              kind: 'foreign',
              detail: `foreign operation ${key} is not registered`,
            }),
          ),
        onSome: Effect.succeed,
      })
    }

    const rebuild = (
      pnode: PortableNode,
      depth: number,
      bound: ReadonlyMap<string, Option.Option<SchemaAST.AST>>,
    ): Effect.Effect<Node.Node, ArtifactError> => {
      nodeCount += 1
      if (nodeCount > limits.maxNodes) {
        return Effect.fail(
          new ArtifactLimitError({ kind: 'nodes', limit: limits.maxNodes, actual: nodeCount }),
        )
      }
      if (depth > limits.maxDepth) {
        return Effect.fail(
          new ArtifactLimitError({ kind: 'depth', limit: limits.maxDepth, actual: depth }),
        )
      }

      return Match.value(pnode).pipe(
        Match.tags({
          Lit: ({ value }) => Effect.succeed(Node.Lit({ value })),
          Path: ({ segments }) => {
            if (segments.length === 0) {
              return Effect.succeed(Node.Path({ segments: [], ast: Option.some(rootAst) }))
            }
            const head = segments[0]!
            const binderAst = bound.get(head)
            if (binderAst !== undefined) {
              if (segments.length === 1) {
                return Effect.succeed(Node.Path({ segments: [...segments], ast: binderAst }))
              }
              if (Option.isNone(binderAst)) {
                return Effect.succeed(Node.Path({ segments: [...segments], ast: Option.none() }))
              }
              const resolved = resolveAstSegments(binderAst.value, segments.slice(1))
              if (Option.isNone(resolved)) {
                return Effect.fail(
                  new ArtifactDecodeError({
                    phase: 'scope',
                    path: formatPath(segments),
                    detail: `path "${formatPath(segments)}" is not in scope of binder "${head}"`,
                  }),
                )
              }
              return Effect.succeed(Node.Path({ segments: [...segments], ast: resolved }))
            }
            const resolved = resolveRootSegment(segments)
            if (Option.isNone(resolved)) {
              return Effect.fail(
                new ArtifactDecodeError({
                  phase: 'scope',
                  path: formatPath(segments),
                  detail: `path "${formatPath(segments)}" does not exist in the target environment Schema`,
                }),
              )
            }
            return Effect.succeed(Node.Path({ segments: [...segments], ast: resolved }))
          },
          Call: ({ op, args }) =>
            Effect.gen(function* () {
              actualOps.add(opRefKey(op))
              const resolvedOp: Node.AnyOp = yield* Match.value(op).pipe(
                Match.tags({
                  Core: ({ id }) => {
                    if (!isCoreOpId(id)) {
                      return Effect.fail(
                        new UnknownOperationError({
                          op: id,
                          kind: 'core',
                          detail: `unknown core operator "${id}"`,
                        }),
                      )
                    }
                    if (coreAllow !== undefined && !coreAllow.has(id)) {
                      return Effect.fail(
                        new UnknownOperationError({
                          op: id,
                          kind: 'core',
                          detail: `core operator "${id}" is not permitted by allowlist`,
                        }),
                      )
                    }
                    const expectedArity = coreArity[id]
                    if (args.length !== expectedArity) {
                      return Effect.fail(
                        new ArtifactDecodeError({
                          phase: 'arity',
                          path: id,
                          detail: `core operator "${id}" expects ${expectedArity} argument(s), got ${args.length}`,
                        }),
                      )
                    }
                    return Effect.succeed(coreOps[id])
                  },
                  Foreign: ({ id, version }) =>
                    resolveForeign(id, version).pipe(
                      Effect.flatMap(found => {
                        const expectedArity = found.descriptor.args.length
                        if (args.length !== expectedArity) {
                          return Effect.fail(
                            new ArtifactDecodeError({
                              phase: 'arity',
                              path: Node.foreignName({ id, version }),
                              detail: `foreign operator "${Node.foreignName({ id, version })}" expects ${expectedArity} argument(s), got ${args.length}`,
                            }),
                          )
                        }
                        return Effect.succeed(found.descriptor)
                      }),
                    ),
                }),
                Match.exhaustive,
              )
              const rebuiltArgs = yield* Effect.forEach(args, a => rebuild(a, depth + 1, bound))
              return Node.Call({ op: resolvedOp, args: rebuiltArgs })
            }),
          If: ({ cond, then: t, otherwise }) =>
            Effect.all([
              rebuild(cond, depth + 1, bound),
              rebuild(t, depth + 1, bound),
              rebuild(otherwise, depth + 1, bound),
            ]).pipe(Effect.map(([c, th, el]) => Node.If({ cond: c, then: th, otherwise: el }))),
          Match: ({ on, cases, otherwise }) =>
            Effect.gen(function* () {
              const rebuiltOn = yield* rebuild(on, depth + 1, bound)
              const rebuiltCases = yield* Effect.forEach(cases, ([label, branch]) =>
                rebuild(branch, depth + 1, bound).pipe(Effect.map(b => [label, b] as const)),
              )
              const rebuiltOtherwise =
                otherwise === undefined
                  ? Option.none()
                  : Option.some(yield* rebuild(otherwise, depth + 1, bound))
              return Node.Match({ on: rebuiltOn, cases: rebuiltCases, otherwise: rebuiltOtherwise })
            }),
          Rows: rows =>
            Effect.gen(function* () {
              loadRows()
              if (rows.set.length > 0 && rows.fold !== 'patch') {
                return yield* Effect.fail(
                  new ArtifactDecodeError({
                    phase: 'schema',
                    path: 'Rows.set',
                    detail: `Rows.set is only valid for fold "patch", got "${rows.fold}"`,
                  }),
                )
              }
              if (
                rows.value === undefined &&
                (rows.fold === 'sum' ||
                  rows.fold === 'min' ||
                  rows.fold === 'max' ||
                  rows.fold === 'reduce')
              ) {
                return yield* Effect.fail(
                  new ArtifactDecodeError({
                    phase: 'schema',
                    path: 'Rows.value',
                    detail: `Rows with fold "${rows.fold}" requires a value expression`,
                  }),
                )
              }
              let elementAst: Option.Option<SchemaAST.AST> = Option.none()
              const rebuiltOver: Node.RowsOver = yield* Match.value(rows.over).pipe(
                Match.tags({
                  List: ({ list }) =>
                    rebuild(list, depth + 1, bound).pipe(
                      Effect.flatMap(rebuiltList => {
                        if (Node.$is('Lit')(rebuiltList) && !Array.isArray(rebuiltList.value)) {
                          return Effect.fail(
                            new ArtifactDecodeError({
                              phase: 'type',
                              path: 'Rows.over.list',
                              detail: 'Rows List source literal must be an array',
                            }),
                          )
                        }
                        if (Node.$is('Path')(rebuiltList) && Option.isSome(rebuiltList.ast)) {
                          const elem = arrayElementAst(rebuiltList.ast.value)
                          if (Option.isNone(elem)) {
                            return Effect.fail(
                              new ArtifactDecodeError({
                                phase: 'type',
                                path: formatPath(rebuiltList.segments),
                                detail: `Rows List source "${formatPath(rebuiltList.segments)}" is not an array Schema`,
                              }),
                            )
                          }
                          elementAst = elem
                        }
                        return Effect.succeed(Node.RowsOver.List({ list: rebuiltList }))
                      }),
                    ),
                  Related: ({ of, relation, cardinality }) =>
                    rebuild(of, depth + 1, bound).pipe(
                      Effect.map(rebuiltOf =>
                        Node.RowsOver.Related({
                          of: rebuiltOf,
                          relation,
                          ...(cardinality === undefined ? {} : { cardinality }),
                        }),
                      ),
                    ),
                }),
                Match.exhaustive,
              )

              let foreignOp: Node.ForeignOp | undefined = undefined
              if (rows.op !== undefined) {
                if (rows.fold !== 'reduce') {
                  return yield* Effect.fail(
                    new ArtifactDecodeError({
                      phase: 'schema',
                      path: 'Rows.op',
                      detail: `Rows.op is only valid for fold "reduce", got "${rows.fold}"`,
                    }),
                  )
                }
                foreignOp = (yield* resolveForeign(rows.op.id, rows.op.version)).descriptor
                actualOps.add(
                  opRefKey({ _tag: 'Foreign', id: rows.op.id, version: rows.op.version }),
                )
              } else if (rows.fold === 'reduce') {
                return yield* Effect.fail(
                  new ArtifactDecodeError({
                    phase: 'schema',
                    path: 'Rows.op',
                    detail: 'Rows with fold "reduce" requires an op reference',
                  }),
                )
              }

              const binderName = rows.each ?? Node.EACH
              const innerBound = new Map(bound)
              innerBound.set(binderName, elementAst)

              const where =
                rows.where === undefined
                  ? Option.none()
                  : Option.some(yield* rebuild(rows.where, depth + 1, innerBound))
              const value =
                rows.value === undefined
                  ? Option.none()
                  : Option.some(yield* rebuild(rows.value, depth + 1, innerBound))
              const set = yield* Effect.forEach(rows.set, ([field, v]) =>
                rebuild(v, depth + 1, innerBound).pipe(Effect.map(rv => [field, rv] as const)),
              )

              return Node.Rows({
                fold: rows.fold,
                over: rebuiltOver,
                where,
                value,
                set,
                ...(foreignOp === undefined ? {} : { op: foreignOp }),
                ...(rows.each === undefined ? {} : { each: rows.each }),
              })
            }),
        }),
        Match.exhaustive,
      )
    }

    const decodedNode = yield* rebuild(artifact.node, 0, new Map())
    const declaredOps = new Set(artifact.requiredOps.map(opRefKey))
    if (declaredOps.size !== actualOps.size || [...actualOps].some(k => !declaredOps.has(k))) {
      return yield* Effect.fail(
        new ArtifactDecodeError({
          phase: 'schema',
          path: '$.requiredOps',
          detail: 'artifact.requiredOps does not match the operators invoked in artifact.node',
        }),
      )
    }
    const inferredKind = inferNodeKind(decodedNode)
    if (!kindCompatible(inferredKind, options.result.ast)) {
      return yield* Effect.fail(
        new ArtifactDecodeError({
          phase: 'type',
          path: '$',
          detail: `decoded expression has kind "${inferredKind}", which is incompatible with expected result Schema (${kindOfAst(options.result.ast)})`,
        }),
      )
    }

    return wrap<Env, A>(decodedNode)
  })

/**
 * Decode and validate a wire artifact into a typed `Expr<EnvOf<Shape>, R['Type']>`
 * over a multi-slice environment `{ slice: Schema }`.
 */
export const decodeExpr = <
  Shape extends Readonly<Record<string, Schema.Top>>,
  R extends Schema.Top,
>(
  raw: unknown,
  options: DecodeEnvOptions<Shape, R>,
): Effect.Effect<Expr<EnvOf<Shape>, R['Type']>, ArtifactError> => {
  const rootSchema = Schema.Struct(options.env)
  return decodeAgainstRoot<EnvOf<Shape>, R['Type']>(
    raw,
    rootSchema.ast,
    segments => {
      const slice = segments[0]!
      if (!Object.hasOwn(options.env, slice)) return Option.none()
      const sliceSchema = options.env[slice]!
      return resolveAstSegments(sliceSchema.ast, segments.slice(1))
    },
    options,
  )
}

/**
 * Decode and validate a wire artifact into a typed `Expr<S['Type'], R['Type']>`
 * over a single `Schema`.
 */
export const decodeForSchema = <S extends Schema.Top, R extends Schema.Top>(
  raw: unknown,
  options: DecodeSchemaOptions<S, R>,
): Effect.Effect<Expr<S['Type'], R['Type']>, ArtifactError> =>
  decodeAgainstRoot<S['Type'], R['Type']>(
    raw,
    options.schema.ast,
    segments => resolveAstSegments(options.schema.ast, segments),
    options,
  )

// ---------------------------------------------------------------------------
// Phase B (#645 P1): Canonical encoding, ArtifactFingerprint & EvidenceKey
// ---------------------------------------------------------------------------

/** Content fingerprint of a canonical portable expression artifact (`sha256:<hex>`). */
export type ArtifactFingerprint = string & { readonly __brand: 'metakit/ArtifactFingerprint' }

/**
 * Cache key for reader/verification evidence (`ev:sha256:<hex>`).
 * Distinct from `ArtifactFingerprint`: includes reader identity/version,
 * backend profile, schema constraints, foreign implementation identities, and
 * proof assumptions. Never produced when a required foreign implementation has
 * no stable identity (`Option.none()`).
 */
export type EvidenceKey = string & { readonly __brand: 'metakit/EvidenceKey' }

const canonicalizeLiteral = (value: PortableLiteral): PortableLiteral => {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(canonicalizeLiteral)
  const record = value as Readonly<Record<string, PortableLiteral>>
  const out: Record<string, PortableLiteral> = {}
  for (const key of Object.keys(record).sort()) {
    setOwn(out, key, canonicalizeLiteral(record[key]!))
  }
  return out
}

/**
 * Deterministic canonical form of a `PortableNode`.
 *
 * Alpha-normalizes `Rows` binder names (`$r0`, `$r1`, …) in traversal order
 * and sorts literal object keys, while strictly preserving evaluation order,
 * `If`/`Match` branch order, and operator argument order (never reassociates
 * numeric operations).
 */
export const canonicalizeNode = (root: PortableNode): PortableNode => {
  let nextBinder = 0

  const visit = (node: PortableNode, renames: ReadonlyMap<string, string>): PortableNode =>
    Match.value(node).pipe(
      Match.tags({
        Lit: ({ value }) => ({ _tag: 'Lit' as const, value: canonicalizeLiteral(value) }),
        Path: ({ segments }) => {
          if (segments.length === 0) return { _tag: 'Path' as const, segments: [] }
          const renamed = renames.get(segments[0]!)
          return {
            _tag: 'Path' as const,
            segments: renamed === undefined ? [...segments] : [renamed, ...segments.slice(1)],
          }
        },
        Call: ({ op, args }) => ({
          _tag: 'Call' as const,
          op,
          args: args.map(arg => visit(arg, renames)),
        }),
        If: ({ cond, then: t, otherwise }) => ({
          _tag: 'If' as const,
          cond: visit(cond, renames),
          then: visit(t, renames),
          otherwise: visit(otherwise, renames),
        }),
        Match: ({ on, cases, otherwise }) => ({
          _tag: 'Match' as const,
          on: visit(on, renames),
          cases: cases.map(([label, branch]) => [label, visit(branch, renames)] as const),
          ...(otherwise === undefined ? {} : { otherwise: visit(otherwise, renames) }),
        }),
        Rows: rows => {
          const over: PortableRowsOver = Match.value(rows.over).pipe(
            Match.tags({
              List: ({ list }) => ({ _tag: 'List' as const, list: visit(list, renames) }),
              Related: ({ of, relation, cardinality }) => ({
                _tag: 'Related' as const,
                of: visit(of, renames),
                relation,
                ...(cardinality === undefined ? {} : { cardinality }),
              }),
            }),
            Match.exhaustive,
          )
          const originalBinder = rows.each ?? Node.EACH
          const canonicalBinder = `$r${nextBinder++}`
          const innerRenames = new Map(renames)
          innerRenames.set(originalBinder, canonicalBinder)
          return {
            _tag: 'Rows' as const,
            fold: rows.fold,
            over,
            ...(rows.where === undefined ? {} : { where: visit(rows.where, innerRenames) }),
            ...(rows.value === undefined ? {} : { value: visit(rows.value, innerRenames) }),
            set: rows.set.map(([field, v]) => [field, visit(v, innerRenames)] as const),
            ...(rows.op === undefined ? {} : { op: rows.op }),
            each: canonicalBinder,
          }
        },
      }),
      Match.exhaustive,
    )

  return visit(root, new Map())
}

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const record = value as Readonly<Record<string, unknown>>
  const keys = Object.keys(record)
    .filter(k => record[k] !== undefined)
    .sort()
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(record[k])}`).join(',')}}`
}

/** Deterministic JSON encoding of a `PortableArtifactV1` after canonicalization. */
export const canonicalJson = (artifact: PortableArtifactV1): string => {
  const uniqueOps = new Map<string, PortableOpRef>()
  for (const ref of artifact.requiredOps) uniqueOps.set(opRefKey(ref), ref)
  const canonical: PortableArtifactV1 = {
    codecVersion: artifact.codecVersion,
    node: canonicalizeNode(artifact.node),
    requiredOps: [...uniqueOps.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, ref]) => ref),
  }
  return stableStringify(canonical)
}

const sha256Hex = (text: string): Effect.Effect<string> =>
  Effect.promise(async () => {
    const bytes = new TextEncoder().encode(text)
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
  })

const isPortableArtifact = (
  input: Expr<never, unknown> | PortableArtifactV1,
): input is PortableArtifactV1 =>
  typeof input === 'object' && input !== null && 'codecVersion' in input && 'requiredOps' in input

/**
 * Compute the deterministic `ArtifactFingerprint` (`sha256:<hex>`) of an `Expr`
 * or an already-encoded `PortableArtifactV1`.
 *
 * A fingerprint identifies one canonical portable definition — it is neither
 * an authorization token nor a proof of correctness.
 */
export const fingerprint = (
  input: Expr<never, unknown> | PortableArtifactV1,
  options?: EncodeOptions,
): Effect.Effect<ArtifactFingerprint, UnsupportedNodeError | ArtifactLimitError> =>
  (isPortableArtifact(input) ? Effect.succeed(input) : encodeExpr(input, options)).pipe(
    Effect.flatMap(artifact => sha256Hex(canonicalJson(artifact))),
    Effect.map(hex => `sha256:${hex}` as ArtifactFingerprint),
  )

/** Inputs that decide whether cached execution/verification evidence may be reused. */
export interface EvidenceKeyInput {
  readonly fingerprint: ArtifactFingerprint
  readonly reader: { readonly id: string; readonly version: string }
  /** Optional backend profile (e.g. `'postgres'`, `'sqlite'`, `'z3-4.15'`). */
  readonly profile?: string
  /** Optional fingerprint of relevant environment/target Schema constraints. */
  readonly schemaFingerprint?: string
  /**
   * Foreign operations (`id@version`) required by the expression. When given,
   * every listed operation must have an `Option.some(...)` identity in
   * `foreignIdentities`; otherwise `evidenceKey` returns `Option.none()`.
   */
  readonly requiredForeignOps?: ReadonlyArray<string>
  /**
   * Stable identity of each foreign implementation (`id@version -> Option<string>`).
   * Pass `Option.none()` for any implementation without a reliable identity;
   * `evidenceKey` then returns `Option.none()` so evidence is never reused
   * across anonymous closures.
   */
  readonly foreignIdentities?: Readonly<Record<string, Option.Option<string>>>
  /** Proof or execution assumptions (e.g. `{ timeoutMs: 10000 }`). */
  readonly assumptions?: Readonly<Record<string, string | number | boolean>>
}

/**
 * Compute an `EvidenceKey` (`ev:sha256:<hex>`) for caching reader/verifier results.
 * Returns `Option.none()` if any required foreign op lacks a stable identity or
 * any entry in `foreignIdentities` is `Option.none()`.
 */
export const evidenceKey = (input: EvidenceKeyInput): Effect.Effect<Option.Option<EvidenceKey>> =>
  Effect.suspend(() => {
    const resolvedForeign: Record<string, string> = {}
    if (input.requiredForeignOps !== undefined && input.requiredForeignOps.length > 0) {
      if (input.foreignIdentities === undefined) return Effect.succeed(Option.none())
      for (const req of input.requiredForeignOps) {
        if (!Object.hasOwn(input.foreignIdentities, req)) return Effect.succeed(Option.none())
        const identity = input.foreignIdentities[req]!
        if (Option.isNone(identity)) return Effect.succeed(Option.none())
      }
    }
    if (input.foreignIdentities !== undefined) {
      for (const key of Object.keys(input.foreignIdentities).sort()) {
        const identity = input.foreignIdentities[key]!
        if (Option.isNone(identity)) return Effect.succeed(Option.none())
        resolvedForeign[key] = identity.value
      }
    }
    const payload = stableStringify({
      v: 1,
      fingerprint: input.fingerprint,
      reader: { id: input.reader.id, version: input.reader.version },
      ...(input.profile === undefined ? {} : { profile: input.profile }),
      ...(input.schemaFingerprint === undefined
        ? {}
        : { schemaFingerprint: input.schemaFingerprint }),
      foreignIdentities: resolvedForeign,
      ...(input.assumptions === undefined ? {} : { assumptions: input.assumptions }),
    })
    return sha256Hex(payload).pipe(
      Effect.map(hex => Option.some(`ev:sha256:${hex}` as EvidenceKey)),
    )
  })
