/**
 * What a reader runs, as far as a check of a body needs to know (`OperatorTable`),
 * and what a body needs that a reader lacks, by name.
 */
import { dependenciesOf, missingFrom, type Operation, type Walked } from './dependencies.js'
import type { OperatorDescriptor } from './operator.js'

/** What an interpreter runs, as far as a check of a body needs to know. */
export interface OperatorTable {
  /** Whether this table implements the operator. */
  readonly has: (operator: OperatorDescriptor) => boolean
  /**
   * The versions of the operator `id` it implements: what a refusal of a call
   * to another version names, since a client and a server on different
   * deploys can disagree on one.
   */
  readonly versions: (id: string) => ReadonlyArray<number>
}

/** A table implementing nothing: every primitive operator is unsupported by it. */
export const noOperators: OperatorTable = Object.freeze({ has: () => false, versions: () => [] })

/** An operator by its id, and its version when that is not the first. */
export const operatorName = (operator: Pick<OperatorDescriptor, 'id' | 'version'>): string =>
  operator.version === 1 ? operator.id : `${operator.id}@${operator.version}`

/**
 * An operator `operators` does not implement, by name, with the versions of it
 * the table does implement: `acme.slug@2 (this table has acme.slug)`.
 */
export const missingName = (operator: OperatorDescriptor, operators: OperatorTable): string => {
  const held = operators.versions(operator.id)
  // The same name and version from another `Expr.operator` call: a table holds
  // declarations, not names, so it is a different operator.
  if (held.includes(operator.version)) {
    return `${operatorName(operator)} (this table has another declaration of it; declare an operator once and import it)`
  }
  return held.length === 0
    ? operatorName(operator)
    : `${operatorName(operator)} (this table has ${held
        .map(version => operatorName({ ...operator, version }))
        .join(', ')})`
}

/**
 * What `walked` need that an interpreter lacks: each kernel operation it does
 * not list, then each primitive operator its table does not implement, by
 * name. A defined operator needs nothing: what it means is walked instead.
 */
export const unsupportedIn = (
  walked: ReadonlyArray<Walked>,
  supported: ReadonlyArray<Operation>,
  table: OperatorTable,
): ReadonlyArray<string> => {
  const read = dependenciesOf(...walked)
  const runs = new Set(supported)
  return [
    ...read.operations.filter(operation => !runs.has(operation)),
    ...missingFrom(read.operators, table, operator => missingName(operator, table)),
  ]
}
