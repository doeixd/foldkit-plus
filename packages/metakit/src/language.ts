/**
 * Domain languages (`@doeixd/metakit/language`, Phase 9 Bout 9.1).
 *
 * Groups typed custom operations into named families so an application can:
 *   - construct expressions with `language.families.<family>.<op>(...)`
 *   - provide exhaustive (`implement`) or partial (`implementSome`) JS tables
 *   - validate dialect SQL lowerings (`sql(dialect, lowerings)`)
 *   - emit serializable descriptions (`describe()`) for client/server comparison
 *   - collect law obligations (`obligations(tables, options)`)
 */
import { Effect, Match, Option, Schema } from 'effect'
import * as Node from './node.js'
import {
  describe as describeOp,
  implement as implementOp,
  implementations,
  type AnyOperation,
  type Implementation,
  type Operation,
  type OperationDescription,
  type OperationImplementations,
  type RunArgs,
} from './operation.js'
import { lawObligations } from './operationChecks.js'
import type { ForeignLowerings, SqlDialect } from './operationSql.js'
import type { Expr } from './path.js'
import type * as Temporal from './temporal.js'

/** Implementation function type for a single `Operation`. */
export type ImplementationFn<O> =
  O extends Operation<
    string,
    number,
    infer Args extends ReadonlyArray<Schema.Top>,
    infer R extends Schema.Top,
    infer N extends 'strict' | 'own',
    object
  >
    ? (...args: RunArgs<Args, N>) => Schema.Schema.Type<R> | null
    : never

/** Exhaustive implementation record matching every family and operation in `F`. */
export type ImplementationsFor<
  F extends Readonly<Record<string, Readonly<Record<string, AnyOperation>>>>,
> = {
  readonly [Family in keyof F]: {
    readonly [Op in keyof F[Family]]: ImplementationFn<F[Family][Op]>
  }
}

/** Partial implementation record (e.g. a browser page implementing a subset of operations). */
export type PartialImplementationsFor<
  F extends Readonly<Record<string, Readonly<Record<string, AnyOperation>>>>,
> = {
  readonly [Family in keyof F]?:
    | {
        readonly [Op in keyof F[Family]]?: ImplementationFn<F[Family][Op]> | undefined
      }
    | undefined
}

export interface Language<
  F extends Readonly<Record<string, Readonly<Record<string, AnyOperation>>>>,
> {
  /** The declared operation families, callable directly as expression constructors. */
  readonly families: F
  /** Flat list of every operation declared in `families`. */
  readonly operations: ReadonlyArray<AnyOperation>
  /** Exhaustive implementation table (missing any operation is a compile error). */
  readonly implement: (name: string, impls: ImplementationsFor<F>) => OperationImplementations
  /** Partial implementation table (for a browser page that only runs a subset). */
  readonly implementSome: (
    name: string,
    impls: PartialImplementationsFor<F>,
  ) => OperationImplementations
  /**
   * Validate that `lowerings` provides a `dialect` lowering for every operation
   * in this language, refusing any missing lowering by name.
   */
  readonly sql: (dialect: SqlDialect, lowerings?: ForeignLowerings) => ForeignLowerings
  /** Serializable descriptions of every operation, for server/page comparison and agents. */
  readonly describe: () => ReadonlyArray<OperationDescription>
  /** Collect all law-check obligations for this language across `tables`. */
  readonly obligations: (
    tables: ReadonlyArray<OperationImplementations>,
    options?: { readonly dialects?: ReadonlyArray<SqlDialect> },
  ) => ReadonlyArray<Temporal.WalkObligation>
}

export interface LanguageOptions {
  /** Default SQL lowerings validated by `language.sql(dialect)`. */
  readonly lowerings?: ForeignLowerings | undefined
}

/**
 * Define a domain language from named families of `Operation`s.
 */
export const make = <
  const Families extends Readonly<Record<string, Readonly<Record<string, AnyOperation>>>>,
>(
  families: Families,
  options?: LanguageOptions,
): Language<Families> => {
  const operations: Array<AnyOperation> = []
  const seen = new Set<string>()

  for (const familyName of Object.keys(families)) {
    const family = families[familyName]!
    for (const opName of Object.keys(family)) {
      const op = family[opName]!
      const key = Node.foreignName(op.descriptor)
      if (seen.has(key)) {
        throw new Error(
          `[metakit/language] Language.make: operation "${key}" appears more than once in the language.`,
        )
      }
      seen.add(key)
      operations.push(op)
    }
  }

  const collect = (
    name: string,
    impls: Readonly<Record<string, Readonly<Record<string, unknown>> | undefined>>,
    requireAll: boolean,
  ): OperationImplementations => {
    const list: Array<Implementation> = []
    for (const familyName of Object.keys(families)) {
      const family = families[familyName]!
      const familyImpls = Object.hasOwn(impls, familyName) ? impls[familyName] : undefined
      for (const opName of Object.keys(family)) {
        const op = family[opName]!
        const fn =
          familyImpls !== undefined && Object.hasOwn(familyImpls, opName)
            ? familyImpls[opName]
            : undefined
        if (fn === undefined) {
          if (requireAll) {
            throw new Error(
              `[metakit/language] implement("${name}"): missing implementation for "${familyName}.${opName}" (${Node.foreignName(op.descriptor)}).`,
            )
          }
          continue
        }
        list.push(
          implementOp(
            op as unknown as Operation<
              string,
              number,
              ReadonlyArray<Schema.Top>,
              Schema.Top,
              'own',
              object
            >,
            fn as (...args: ReadonlyArray<unknown>) => unknown,
          ),
        )
      }
    }
    return implementations(name, ...list)
  }

  return {
    families,
    operations,
    implement: (name, impls) =>
      collect(
        name,
        impls as unknown as Readonly<Record<string, Readonly<Record<string, unknown>> | undefined>>,
        true,
      ),
    implementSome: (name, impls) =>
      collect(
        name,
        impls as unknown as Readonly<Record<string, Readonly<Record<string, unknown>> | undefined>>,
        false,
      ),
    sql: (dialect, lowerings) => {
      const table = lowerings ?? options?.lowerings
      for (const op of operations) {
        const key = Node.foreignName(op.descriptor)
        const entry = table?.entries.get(key)
        const hasLowering =
          entry !== undefined &&
          (dialect === 'sqlite' ? entry.sqlite !== undefined : entry.postgres !== undefined)
        if (!hasLowering) {
          throw new Error(
            `[metakit/sql] no ${dialect} lowering of "${key}"; declare one with lowering(..., { ${dialect} }) from metakit/operation/sql.`,
          )
        }
      }
      return table!
    },
    describe: () => operations.map(describeOp),
    obligations: (tables, opts) => lawObligations(operations, tables, opts),
  }
}

// ---------------------------------------------------------------------------
// Phase B (#645 P1): Composable languages & target readiness checks
// ---------------------------------------------------------------------------

/** Two composed languages declared conflicting definitions for a family member or operation id. */
export class LanguageConflictError extends Schema.TaggedError<LanguageConflictError>()(
  'LanguageConflictError',
  {
    location: Schema.String,
    detail: Schema.String,
  },
) {}

type FamilyMap = Readonly<Record<string, Readonly<Record<string, AnyOperation>>>>

/** Merge two family maps, combining operations within shared family names. */
export type ComposedFamilies<A extends FamilyMap, B extends FamilyMap> = {
  readonly [K in keyof A | keyof B]: K extends keyof A
    ? K extends keyof B
      ? A[K] & B[K]
      : A[K]
    : K extends keyof B
      ? B[K]
      : never
}

/**
 * Compose two `Language`s into one while preserving literal operation IDs and types.
 * Identical `AnyOperation` references are merged idempotently; conflicting
 * definitions for the same `family.op` slot or `id@version` fail with
 * `LanguageConflictError`.
 */
export const compose = <A extends FamilyMap, B extends FamilyMap>(
  a: Language<A>,
  b: Language<B>,
): Effect.Effect<Language<ComposedFamilies<A, B>>, LanguageConflictError> =>
  Effect.suspend(() => {
    const merged: Record<string, Record<string, AnyOperation>> = {}
    const byOpKey = new Map<string, { readonly slot: string; readonly op: AnyOperation }>()

    const addLanguage = (families: FamilyMap): LanguageConflictError | undefined => {
      for (const familyName of Object.keys(families)) {
        const family = families[familyName]!
        const target = (merged[familyName] ??= {})
        for (const opName of Object.keys(family)) {
          const op = family[opName]!
          const slot = `${familyName}.${opName}`
          const existingSlot = target[opName]
          if (existingSlot !== undefined && existingSlot !== op) {
            return new LanguageConflictError({
              location: slot,
              detail: `slot "${slot}" is defined differently by both languages`,
            })
          }
          const key = Node.foreignName(op.descriptor)
          const existingKey = byOpKey.get(key)
          if (existingKey !== undefined && (existingKey.op !== op || existingKey.slot !== slot)) {
            return new LanguageConflictError({
              location: key,
              detail: `operation "${key}" conflicts between "${existingKey.slot}" and "${slot}"`,
            })
          }
          target[opName] = op
          byOpKey.set(key, { slot, op })
        }
      }
      return undefined
    }

    const errA = addLanguage(a.families)
    if (errA !== undefined) return Effect.fail(errA)
    const errB = addLanguage(b.families)
    if (errB !== undefined) return Effect.fail(errB)

    return Effect.succeed(make(merged as ComposedFamilies<A, B>))
  })

/** Selection map accepted by `Language.restrict`: `true` keeps a whole family, or pick op names. */
export type FamilySelection<F extends FamilyMap> = {
  readonly [K in keyof F]?: true | ReadonlyArray<keyof F[K] & string>
}

export type RestrictedFamilies<F extends FamilyMap, S extends FamilySelection<F>> = {
  readonly [K in keyof S & keyof F]: S[K] extends true
    ? F[K]
    : S[K] extends ReadonlyArray<infer Ops extends keyof F[K] & string>
      ? Pick<F[K], Ops>
      : never
}

/**
 * Derive a smaller host-specific vocabulary (e.g. a browser-safe subset) from
 * `language`, preserving exact operation types for the kept families/operations.
 */
export const restrict = <F extends FamilyMap, const S extends FamilySelection<F>>(
  language: Language<F>,
  selection: S,
): Language<RestrictedFamilies<F, S>> => {
  const out: Record<string, Record<string, AnyOperation>> = {}
  for (const familyName of Object.keys(selection)) {
    const pick = selection[familyName]
    if (pick === undefined) continue
    if (!Object.hasOwn(language.families, familyName)) {
      throw new Error(`[metakit/language] restrict: unknown family "${familyName}"`)
    }
    const family = language.families[familyName]!
    if (pick === true) {
      out[familyName] = { ...family }
    } else {
      const subset: Record<string, AnyOperation> = {}
      for (const opName of pick) {
        if (!Object.hasOwn(family, opName)) {
          throw new Error(
            `[metakit/language] restrict: unknown operation "${familyName}.${opName}"`,
          )
        }
        subset[opName] = family[opName]!
      }
      out[familyName] = subset
    }
  }
  return make(out as RestrictedFamilies<F, S>)
}

/** Backend target inspected by `Language.readiness`. */
export type ReadinessTarget =
  | { readonly _tag: 'portable' }
  | { readonly _tag: 'js'; readonly foreign?: OperationImplementations }
  | {
      readonly _tag: 'sql'
      readonly dialect: SqlDialect
      readonly lowerings?: ForeignLowerings
    }
  | { readonly _tag: 'z3' }

/** Specific node or capability gap reported by `Language.readiness`. */
export interface UnsupportedReason {
  readonly path: string
  readonly kind: 'opaque' | 'non-portable-literal' | 'missing-foreign' | 'unsupported-node'
  readonly detail: string
}

/** Structured capability check result distinguishing portability from target support. */
export interface ReadinessReport {
  /** True when the expression lies within the portable fragment (no `Opaque` or non-JSON literals). */
  readonly portable: boolean
  /** True when `target` supports every node and foreign operation used by the expression. */
  readonly supported: boolean
  readonly requiredCoreOps: ReadonlyArray<Node.CoreOpId>
  readonly requiredForeignOps: ReadonlyArray<string>
  readonly unsupportedNodes: ReadonlyArray<UnsupportedReason>
}

const checkPortableLiteral = (value: unknown): string | undefined => {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return undefined
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return `non-finite number literal (${String(value)})`
    if (Object.is(value, -0)) return 'negative zero (-0) literal'
    return undefined
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const bad = checkPortableLiteral(item)
      if (bad !== undefined) return bad
    }
    return undefined
  }
  if (typeof value === 'object') {
    const proto: unknown = Object.getPrototypeOf(value)
    if (proto !== Object.prototype && proto !== null) return 'non-plain object literal'
    for (const v of Object.values(value as Record<string, unknown>)) {
      const bad = checkPortableLiteral(v)
      if (bad !== undefined) return bad
    }
    return undefined
  }
  return `literal of type ${typeof value}`
}

const SQL_UNSUPPORTED_OPS = new Set<Node.CoreOpId>([
  'arr.append',
  'arr.include',
  'arr.exclude',
  'arr.move',
  'set.union',
  'set.intersect',
  'set.difference',
  'set.subset',
  'set.disjoint',
])

const Z3_UNSUPPORTED_OPS = new Set<Node.CoreOpId>([
  'time.addMonths',
  'time.startOfMonth',
  'arr.append',
  'arr.move',
])

const SQL_UNSUPPORTED_RELATED_FOLDS = new Set<Node.RowsFold>(['find', 'keep', 'patch'])
const Z3_SUPPORTED_RELATED_FOLDS = new Set<Node.RowsFold>(['count', 'any', 'every'])

const checkSqlLiteral = (value: unknown): string | undefined => {
  if (typeof value === 'string' && value.includes('\u0000')) {
    return 'string literal containing NUL byte (\\u0000) is refused by SQL'
  }
  if (typeof value === 'number' && Number.isInteger(value) && !Number.isSafeInteger(value)) {
    return `integer literal ${value} outside safe range is refused by SQL`
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const bad = checkSqlLiteral(item)
      if (bad !== undefined) return bad
    }
  }
  return undefined
}

/**
 * Inspect `expr` against `target` and report portability, required core/foreign
 * operations, and every unsupported node/path rather than a bare boolean.
 */
export const readiness = (
  expr: Expr<never, unknown>,
  target: ReadinessTarget,
): Effect.Effect<ReadinessReport> =>
  Effect.sync(() => {
    const coreOps = new Set<Node.CoreOpId>()
    const foreignOps = new Set<string>()
    const unsupported: Array<UnsupportedReason> = []
    let portable = true

    const checkForeign = (op: Node.ForeignOp, at: string): void => {
      const key = Node.foreignName(op)
      foreignOps.add(key)
      Match.value(target).pipe(
        Match.tags({
          portable: () => undefined,
          js: ({ foreign }) => {
            if (foreign === undefined || !Object.hasOwn(foreign, key)) {
              unsupported.push({
                path: at,
                kind: 'missing-foreign',
                detail: `missing JS implementation for "${key}"`,
              })
            }
          },
          sql: ({ dialect, lowerings }) => {
            const entry = lowerings?.entries.get(key)
            const has =
              entry !== undefined &&
              (dialect === 'sqlite' ? entry.sqlite !== undefined : entry.postgres !== undefined)
            if (!has) {
              unsupported.push({
                path: at,
                kind: 'missing-foreign',
                detail: `missing ${dialect} SQL lowering for "${key}"`,
              })
            }
          },
          z3: () => {
            unsupported.push({
              path: at,
              kind: 'missing-foreign',
              detail: `foreign operation "${key}" is uninterpreted in Z3`,
            })
          },
        }),
        Match.exhaustive,
      )
    }

    const visit = (node: Node.Node, at: string, rowsDepth: number): void => {
      Node.$match(node, {
        Lit: ({ value }) => {
          const bad = checkPortableLiteral(value)
          if (bad !== undefined) {
            portable = false
            Match.valueTags(target, {
              js: () => undefined,
              portable: () => {
                unsupported.push({ path: at, kind: 'non-portable-literal', detail: bad })
              },
              sql: () => {
                unsupported.push({ path: at, kind: 'non-portable-literal', detail: bad })
              },
              z3: () => {
                unsupported.push({ path: at, kind: 'non-portable-literal', detail: bad })
              },
            })
            return
          }
          Match.valueTags(target, {
            js: () => undefined,
            portable: () => undefined,
            z3: () => undefined,
            sql: () => {
              const sqlBad = checkSqlLiteral(value)
              if (sqlBad !== undefined) {
                unsupported.push({ path: at, kind: 'unsupported-node', detail: sqlBad })
              }
            },
          })
        },
        Path: () => undefined,
        Call: ({ op, args }) => {
          if (Node.isForeign(op)) {
            checkForeign(op, at)
          } else {
            coreOps.add(op.id)
            Match.valueTags(target, {
              js: () => undefined,
              portable: () => undefined,
              sql: () => {
                if (SQL_UNSUPPORTED_OPS.has(op.id)) {
                  unsupported.push({
                    path: at,
                    kind: 'unsupported-node',
                    detail: `core operator "${op.id}" is not supported by SQL lowering`,
                  })
                }
              },
              z3: () => {
                if (Z3_UNSUPPORTED_OPS.has(op.id)) {
                  unsupported.push({
                    path: at,
                    kind: 'unsupported-node',
                    detail: `core operator "${op.id}" is not supported by Z3 lowering`,
                  })
                }
              },
            })
          }
          args.forEach((arg, i) => visit(arg, `${at}.args[${i}]`, rowsDepth))
        },
        If: ({ cond, then: t, otherwise }) => {
          visit(cond, `${at}.cond`, rowsDepth)
          visit(t, `${at}.then`, rowsDepth)
          visit(otherwise, `${at}.otherwise`, rowsDepth)
        },
        Match: ({ on, cases, otherwise }) => {
          visit(on, `${at}.on`, rowsDepth)
          cases.forEach(([, branch], i) => visit(branch, `${at}.cases[${i}]`, rowsDepth))
          if (Option.isSome(otherwise)) visit(otherwise.value, `${at}.otherwise`, rowsDepth)
        },
        Opaque: ({ name }) => {
          portable = false
          if (target._tag !== 'js') {
            unsupported.push({
              path: at,
              kind: 'opaque',
              detail: `opaque node "${name}" is not supported by target "${target._tag}"`,
            })
          }
        },
        Rows: rows => {
          Node.RowsOver.$match(rows.over, {
            List: ({ list }) => {
              if (target._tag === 'sql' || target._tag === 'z3') {
                unsupported.push({
                  path: at,
                  kind: 'unsupported-node',
                  detail: `Rows over List (fold "${rows.fold}") is not supported by ${target._tag}`,
                })
              }
              visit(list, `${at}.over.list`, rowsDepth)
            },
            Related: ({ of }) => {
              Match.valueTags(target, {
                js: () => undefined,
                portable: () => undefined,
                sql: () => {
                  if (rowsDepth > 0) {
                    unsupported.push({
                      path: at,
                      kind: 'unsupported-node',
                      detail: 'nested Rows folds are not supported by SQL lowering',
                    })
                  } else if (SQL_UNSUPPORTED_RELATED_FOLDS.has(rows.fold)) {
                    unsupported.push({
                      path: at,
                      kind: 'unsupported-node',
                      detail: `Rows fold "${rows.fold}" over Related is not supported by SQL lowering`,
                    })
                  }
                },
                z3: () => {
                  if (!Z3_SUPPORTED_RELATED_FOLDS.has(rows.fold)) {
                    unsupported.push({
                      path: at,
                      kind: 'unsupported-node',
                      detail: `Rows fold "${rows.fold}" over Related is not supported by Z3 lowering`,
                    })
                  }
                },
              })
              visit(of, `${at}.over.of`, rowsDepth)
            },
          })
          if (rows.op !== undefined) checkForeign(rows.op, `${at}.op`)
          if (Option.isSome(rows.where)) visit(rows.where.value, `${at}.where`, rowsDepth + 1)
          if (Option.isSome(rows.value)) visit(rows.value.value, `${at}.value`, rowsDepth + 1)
          rows.set.forEach(([field, v]) => visit(v, `${at}.set.${field}`, rowsDepth + 1))
        },
      })
    }

    visit(expr.node, '$', 0)

    return {
      portable,
      supported: unsupported.length === 0,
      requiredCoreOps: [...coreOps].sort(),
      requiredForeignOps: [...foreignOps].sort(),
      unsupportedNodes: unsupported,
    }
  })
