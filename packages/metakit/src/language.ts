/**
 * Domain languages (`metakit/language`, Phase 9 Bout 9.1).
 *
 * Groups typed custom operations into named families so an application can:
 *   - construct expressions with `language.families.<family>.<op>(...)`
 *   - provide exhaustive (`implement`) or partial (`implementSome`) JS tables
 *   - validate dialect SQL lowerings (`sql(dialect, lowerings)`)
 *   - emit serializable descriptions (`describe()`) for client/server comparison
 *   - collect law obligations (`obligations(tables, options)`)
 */
import type { Schema } from 'effect'
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
