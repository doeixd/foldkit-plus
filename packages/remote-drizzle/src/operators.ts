/**
 * How the SQL compiler runs primitive operators: a table of implementations,
 * each building Drizzle SQL from its arguments already compiled. A binding
 * holds one beside the in-memory table (`bind(…, { operators })`), so what it
 * compiles and what it judges in memory are the same operators.
 */
import type { SQL } from 'drizzle-orm'
import { Option } from 'effect'
import {
  Operators,
  type MemoryOperators,
  type OperatorDescriptor,
  type OperatorTable,
} from 'foldkit-entity'
import { isKernelOperator } from './kernel.js'

/** What an implementation is handed to build its SQL. */
export interface SqlContext {
  readonly args: ReadonlyArray<SQL>
  readonly dialect: 'sqlite' | 'postgres'
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
  readonly named: (name: string) => Option.Option<OperatorDescriptor>
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
    versions: (id: string) =>
      implementations
        .filter(({ operator }) => operator.id === id)
        .map(({ operator }) => operator.version),
    get: (operator: OperatorDescriptor) => Option.fromUndefinedOr(byOperator.get(operator)),
    named: (name: string) => Option.fromUndefinedOr(byName.get(name)),
    implementations: Object.freeze([...implementations]),
  })
}

export const DrizzleOperators = {
  implement: (
    operator: { readonly descriptor: OperatorDescriptor },
    build: (context: SqlContext) => SQL,
  ): SqlImplementation => {
    if (isKernelOperator(operator.descriptor)) {
      fail(
        `${nameOf(operator.descriptor)} is a kernel operator, whose SQL is metakit's own; it takes no implementation`,
      )
    }
    if (Option.isSome(operator.descriptor.definedAs)) {
      fail(
        `${nameOf(operator.descriptor)} is defined by an expression, which every interpreter runs; it takes no implementation`,
      )
    }
    return Object.freeze({ operator: operator.descriptor, build })
  },

  make: (...implementations: ReadonlyArray<SqlImplementation>): DrizzleOperators =>
    table(implementations),

  merge: (left: DrizzleOperators, right: DrizzleOperators): DrizzleOperators => {
    const both = right.implementations.filter(({ operator }) => left.has(operator))
    if (both.length > 0) {
      fail(
        `both tables implement ${both.map(({ operator }) => nameOf(operator)).join(', ')}; replace with DrizzleOperators.override`,
      )
    }
    return table([...left.implementations, ...right.implementations])
  },

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

  kernel: table([]),
}

export const kernelOperators: BindingOperators = Object.freeze({
  memory: Operators.kernel,
  sql: DrizzleOperators.kernel,
})

export const operatorsFrom = (given: Partial<BindingOperators> | undefined): BindingOperators =>
  Object.freeze({
    memory: given?.memory ?? Operators.kernel,
    sql: given?.sql ?? DrizzleOperators.kernel,
  })
