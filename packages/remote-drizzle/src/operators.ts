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
  Law,
  Operators,
  Text,
  type Collation,
  type Evidence,
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
  /** The operator it implements under a name (`id`, or `id@version`): how a computed assignment as data compiles. */
  readonly named: (name: string) => Option.Option<OperatorDescriptor>
  readonly implementations: ReadonlyArray<SqlImplementation>
  /** What is known of its implementations' laws: `DrizzleOperators.withEvidence`. */
  readonly evidence: ReadonlyArray<Evidence>
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

const table = (
  implementations: ReadonlyArray<SqlImplementation>,
  evidence: ReadonlyArray<Evidence>,
): DrizzleOperators => {
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
    versions: (id: string) =>
      implementations
        .filter(({ operator }) => operator.id === id)
        .map(({ operator }) => operator.version),
    get: (operator: OperatorDescriptor) => Option.fromUndefinedOr(byOperator.get(operator)),
    named: (name: string) => Option.fromUndefinedOr(byName.get(name)),
    implementations: Object.freeze([...implementations]),
    evidence: Object.freeze([...evidence]),
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
  ): SqlImplementation => {
    // Memory runs what a defined operator means; SQL must too.
    if (Option.isSome(operator.descriptor.definedAs)) {
      fail(
        `${nameOf(operator.descriptor)} is defined by an expression, which every interpreter runs; it takes no implementation`,
      )
    }
    return Object.freeze({ operator: operator.descriptor, build })
  },

  /** A table of implementations. One operator implemented twice, or two under one name, is refused. */
  make: (...implementations: ReadonlyArray<SqlImplementation>): DrizzleOperators =>
    table(implementations, []),

  /** Both tables' implementations. An operator both implement is refused: say which wins with `override`. */
  merge: (left: DrizzleOperators, right: DrizzleOperators): DrizzleOperators => {
    const both = right.implementations.filter(({ operator }) => left.has(operator))
    if (both.length > 0) {
      fail(
        `both tables implement ${both.map(({ operator }) => nameOf(operator)).join(', ')}; replace with DrizzleOperators.override`,
      )
    }
    return table(
      [...left.implementations, ...right.implementations],
      [...left.evidence, ...right.evidence],
    )
  },

  /**
   * The table with these implementations in place of its own for the same
   * operators, a replaced implementation's evidence going with it.
   */
  override: (
    base: DrizzleOperators,
    ...implementations: ReadonlyArray<SqlImplementation>
  ): DrizzleOperators => {
    const replaced = new Set(implementations.map(({ operator }) => operator))
    const names = new Set([...replaced].map(nameOf))
    return table(
      [
        ...base.implementations.filter(({ operator }) => !replaced.has(operator)),
        ...implementations,
      ],
      // A replaced operator's evidence goes, and so does a law's that called it as a witness.
      base.evidence.filter(
        ({ operator, law }) =>
          !names.has(operator) && !Law.witnessesNamed(law).some(name => names.has(name)),
      ),
    )
  },

  /**
   * The table with what is known of its implementations' laws: records from
   * `Conformance.lawsBy` run against the database, each of an operator it
   * implements and a law that operator declares. A computed assignment
   * without `expect` lands under a ledger only by an operator whose
   * commutativity and associativity both tables record as tested.
   */
  withEvidence: (base: DrizzleOperators, evidence: ReadonlyArray<Evidence>): DrizzleOperators => {
    for (const record of evidence) {
      const operator =
        base.implementations.find(({ operator }) => nameOf(operator) === record.operator)
          ?.operator ??
        fail(`evidence names ${record.operator}, which this table does not implement`)
      const declared = operator.laws.map(law => JSON.stringify(Law.describe(law)))
      if (!declared.includes(JSON.stringify(record.law))) {
        fail(`evidence names a law of ${record.operator} it does not declare (${record.law.kind})`)
      }
      // Only a run of `Conformance.lawsBy` speaks of SQL: not a record built by hand
      // or copied, nor one of a memory implementation, which says nothing of it.
      if (record._tag === 'Tested' && !Operators.testedByRunner(record)) {
        fail(
          `evidence of ${record.operator}'s ${record.law.kind} law was not made by Conformance.lawsBy; test this table's SQL with it`,
        )
      }
    }
    return table(base.implementations, [...base.evidence, ...evidence])
  },

  /** The kernel's own operators (`Text.startsWith`): every binding's default. */
  kernel: table([startsWith], []),
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
