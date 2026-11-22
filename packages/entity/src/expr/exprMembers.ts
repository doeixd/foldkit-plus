/**
 * The members of `Expr`: a namespace rather than an object, so a page keeps
 * only the constructors it calls (`Expr.exists` and the related-rows reading
 * stay off a page that never asks one).
 */
import type { Operation, Walked } from './dependencies.js'
import { unsupportedIn, type OperatorTable } from './table.js'

export { operator } from './operator.js'
export { add, sub } from './arithmetic.js'
export { literal, input, field, next } from './value.js'
export { eq, isNull, isNotNull, inAmong as in, and, or, not, implies, whenGiven } from './logic.js'
export { lt, lte, gt, gte } from './compare.js'
export { contains } from './text.js'
export { path, exists, is } from './relation.js'
export { viewer, now } from '../context.js'
export { show } from './show.js'
export { givesUnportable } from './dependencies.js'

/**
 * What these expressions need that an interpreter lacks, as `Query.unsupported`
 * says it for a query: each kernel operation `operations` does not list, then
 * each primitive operator `operators` does not implement, by name (`id`, or
 * `id@version` past the first). For anything holding expressions that is not a
 * query: a guard's rule, an invariant, a write's `when`.
 */
export const unsupported = (
  walked: ReadonlyArray<Walked>,
  interpreter: {
    readonly operations: ReadonlyArray<Operation>
    readonly operators: OperatorTable
  },
): ReadonlyArray<string> => unsupportedIn(walked, interpreter.operations, interpreter.operators)
