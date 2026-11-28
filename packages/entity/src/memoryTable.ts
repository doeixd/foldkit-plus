/**
 * The in-memory operator table. Apart from `Operators` so evaluating a body
 * keeps none of what describes an operator.
 *
 * The kernel's primitive operators (`Text.startsWith`, `Expr.add`,
 * `Expr.sub`) are metakit's own operations, which every reader runs
 * (`expr/operator.ts`): every table runs them, and none implements them.
 */
import { Option } from 'effect'
import { add, sub } from './expr/arithmetic.js'
import type { OperatorDescriptor } from './expr/operator.js'
import type { MemoryImplementation, MemoryOperators, OperatorContext } from './operators.js'
import { Text } from './text.js'

/** An operator by its id, and its version when that is not the first. */
export const nameOf = (operator: OperatorDescriptor): string =>
  operator.version === 1 ? operator.id : `${operator.id}@${operator.version}`

export const fail = (what: string): never => {
  throw new Error(`[foldkit-entity] Operators: ${what}`)
}

/** The kernel's primitive operators, by name. */
const kernel: ReadonlyMap<string, OperatorDescriptor> = new Map(
  [add.descriptor, sub.descriptor, Text.startsWith.descriptor].map(
    operator => [nameOf(operator), operator] as const,
  ),
)

export const table = (
  implementations: ReadonlyArray<MemoryImplementation>,
  checked: boolean,
): MemoryOperators => {
  const byOperator = new Map<OperatorDescriptor, MemoryImplementation['run']>()
  const byName = new Map<string, OperatorDescriptor>(kernel)
  for (const { operator, run } of implementations) {
    if (kernel.get(nameOf(operator)) === operator) {
      fail(
        `${nameOf(operator)} is metakit's own operation, which every reader runs; no table implements it`,
      )
    }
    if (byOperator.has(operator)) {
      fail(`${nameOf(operator)} is implemented twice; replace one with Operators.override`)
    }
    // Two descriptors under one name would leave a body's call ambiguous.
    const named = byName.get(nameOf(operator))
    if (named !== undefined && named !== operator) {
      fail(`two operators are named ${nameOf(operator)}; give one another id or version`)
    }
    byName.set(nameOf(operator), operator)
    byOperator.set(operator, run)
  }
  return Object.freeze({
    _tag: 'MemoryOperators',
    has: (operator: OperatorDescriptor) =>
      byOperator.has(operator) || kernel.get(nameOf(operator)) === operator,
    versions: (id: string) =>
      [...byName.values()].filter(operator => operator.id === id).map(({ version }) => version),
    get: (operator: OperatorDescriptor) => Option.fromUndefinedOr(byOperator.get(operator)),
    named: (name: string) => Option.fromUndefinedOr(byName.get(name)),
    checked,
    implementations: Object.freeze([...implementations]),
  })
}

/** An implementation, its operator's null rule checked against the function chosen for it. */
export const implementation = (
  operator: OperatorDescriptor,
  nulls: OperatorDescriptor['nulls'],
  run: (...args: ReadonlyArray<unknown>) => unknown,
): MemoryImplementation => {
  // SQL compiles what a defined operator means, so an implementation here would
  // be a second meaning that only memory runs.
  if (Option.isSome(operator.definedAs)) {
    fail(
      `${nameOf(operator)} is defined by an expression, which every interpreter runs; it takes no implementation`,
    )
  }
  if (operator.nulls !== nulls) {
    fail(
      nulls === 'strict'
        ? `${nameOf(operator)} handles null itself; implement it with Operators.implementHandlingNulls`
        : `${nameOf(operator)} is strict about null; implement it with Operators.implement`,
    )
  }
  return Object.freeze({
    operator,
    run: (args: ReadonlyArray<unknown>, context: OperatorContext) => run(...args, context),
  })
}

/** A table implementing nothing: it runs the kernel's operators, as every table does. */
export const kernelOperators = table([], false)
