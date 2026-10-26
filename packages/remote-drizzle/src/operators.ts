/**
 * How the SQL compiler runs primitive operators: a table of implementations,
 * each building Drizzle SQL from its arguments already compiled. A binding
 * holds one beside the in-memory table (`bind(…, { operators })`), so what it
 * compiles and what it judges in memory are the same operators. See
 * `docs/design/expr-operations-DESIGN.md` §5.4.
 */
import { sql, type SQL } from 'drizzle-orm'
import { Option } from 'effect'
import {
  Operators,
  Text,
  type Collation,
  type MemoryOperators,
  type OperatorDescriptor,
  type OperatorTable,
} from 'foldkit-entity'

/** What an implementation is handed to build its SQL. */
export interface SqlContext {
  /** Each argument, compiled: a column, a parameter (cast on Postgres where its type needs one), or a call's SQL. */
  readonly args: ReadonlyArray<SQL>
  readonly dialect: 'sqlite' | 'postgres'
  /** The collation the call compares text under, from its operator's `collation` rule. */
  readonly collation: Option.Option<Collation>
  /**
   * Text under the call's collation, as this dialect writes it: `binary` as
   * `collate binary` (SQLite) or `collate "C"` (Postgres), `asciiFold` as
   * `collate nocase` or `lower(… collate "C")`. Text unchanged without one.
   */
  readonly collate: (text: SQL) => SQL
}

/** One operator's SQL implementation. */
export interface SqlImplementation {
  readonly operator: OperatorDescriptor
  readonly build: (context: SqlContext) => SQL
}

/** The SQL compiler's implementations, by operator. */
export interface DrizzleOperators extends OperatorTable {
  readonly _tag: 'DrizzleOperators'
  readonly get: (operator: OperatorDescriptor) => Option.Option<SqlImplementation['build']>
  readonly implementations: ReadonlyArray<SqlImplementation>
}

/** What a binding runs its expressions' primitive operators by, in SQL and in memory. */
export interface BindingOperators {
  readonly memory: MemoryOperators
  readonly sql: DrizzleOperators
}

const nameOf = (operator: OperatorDescriptor): string =>
  operator.version === 1 ? operator.id : `${operator.id}@${operator.version}`

const fail = (what: string): never => {
  throw new Error(`[foldkit-remote-drizzle] DrizzleOperators: ${what}`)
}

const table = (implementations: ReadonlyArray<SqlImplementation>): DrizzleOperators => {
  const byOperator = new Map<OperatorDescriptor, SqlImplementation['build']>()
  const byName = new Map<string, OperatorDescriptor>()
  for (const { operator, build } of implementations) {
    if (byOperator.has(operator)) {
      fail(`${nameOf(operator)} is implemented twice; replace one with DrizzleOperators.override`)
    }
    const named = byName.get(nameOf(operator))
    if (named !== undefined && named !== operator) {
      fail(`two operators are named ${nameOf(operator)}; give one another id or version`)
    }
    byName.set(nameOf(operator), operator)
    byOperator.set(operator, build)
  }
  return Object.freeze({
    _tag: 'DrizzleOperators',
    has: (operator: OperatorDescriptor) => byOperator.has(operator),
    get: (operator: OperatorDescriptor) => Option.fromUndefinedOr(byOperator.get(operator)),
    implementations: Object.freeze([...implementations]),
  })
}

/**
 * `startsWith` as SQL: the text's first `length(prefix)` characters equal the
 * prefix under the call's collation. `substr` on SQLite and `left` on Postgres
 * both count characters, as JavaScript's `startsWith` does over valid text; not
 * `like`, which would read `%` and `_` as wildcards and folds case on SQLite.
 */
const startsWith: SqlImplementation = Object.freeze({
  operator: Text.startsWith.descriptor,
  build: ({ args: [text, prefix], dialect, collate }: SqlContext) =>
    dialect === 'postgres'
      ? sql`${collate(sql`left(${text}, length(${prefix}))`)} = ${collate(prefix!)}`
      : sql`${collate(sql`substr(${text}, 1, length(${prefix}))`)} = ${collate(prefix!)}`,
})

export const DrizzleOperators = {
  /**
   * An SQL implementation: built from the call's arguments, compiled, and its
   * collation. It must agree with the operator's in-memory implementation,
   * nulls included (SQL's own operators give null for one, as a strict operator
   * does); the conformance suite is what holds the two together.
   *
   * ```ts
   * DrizzleOperators.implement(joined, ({ args: [left, right] }) => sql`${left} || ${right}`)
   * ```
   */
  implement: (
    operator: { readonly descriptor: OperatorDescriptor },
    build: (context: SqlContext) => SQL,
  ): SqlImplementation => Object.freeze({ operator: operator.descriptor, build }),

  /** A table of implementations. One operator implemented twice, or two under one name, is refused. */
  make: (...implementations: ReadonlyArray<SqlImplementation>): DrizzleOperators =>
    table(implementations),

  /** Both tables' implementations. An operator both implement is refused: say which wins with `override`. */
  merge: (left: DrizzleOperators, right: DrizzleOperators): DrizzleOperators => {
    const both = right.implementations.filter(({ operator }) => left.has(operator))
    if (both.length > 0) {
      fail(
        `both tables implement ${both.map(({ operator }) => nameOf(operator)).join(', ')}; replace with DrizzleOperators.override`,
      )
    }
    return table([...left.implementations, ...right.implementations])
  },

  /** The table with these implementations in place of its own for the same operators. */
  override: (
    base: DrizzleOperators,
    ...implementations: ReadonlyArray<SqlImplementation>
  ): DrizzleOperators => {
    const replaced = new Set(implementations.map(({ operator }) => operator))
    return table([
      ...base.implementations.filter(({ operator }) => !replaced.has(operator)),
      ...implementations,
    ])
  },

  /** The kernel's own operators (`Text.startsWith`): every binding's default. */
  kernel: table([startsWith]),
}

/** Both kernels: what a binding runs by when it is given no table. */
export const kernelOperators: BindingOperators = Object.freeze({
  memory: Operators.kernel,
  sql: DrizzleOperators.kernel,
})

/** A binding's tables: each given, or its kernel. */
export const operatorsFrom = (given: Partial<BindingOperators> | undefined): BindingOperators =>
  Object.freeze({
    memory: given?.memory ?? Operators.kernel,
    sql: given?.sql ?? DrizzleOperators.kernel,
  })
