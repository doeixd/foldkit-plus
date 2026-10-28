/**
 * What made each `Tested` record: `Conformance.laws` over one memory table,
 * or `Conformance.lawsBy` through a runner. A table records only evidence of
 * its own kind, so a record built by hand, copied, or tested on another
 * implementation (of its operator, or of a witness its law calls) is refused.
 * Kept beside the records rather than in them: a record is JSON a server
 * publishes, and an implementation is a function. Not exported from the
 * package.
 */
import { Option } from 'effect'
import type { Evidence, MemoryOperators } from './operators.js'

const testedOn = new WeakMap<Evidence, MemoryOperators>()
const ranByRunner = new WeakSet<Evidence>()

export const stampTested = (record: Evidence, operators: MemoryOperators): void => {
  testedOn.set(record, operators)
}

export const stampRun = (record: Evidence): void => {
  ranByRunner.add(record)
}

/** The table `Conformance.laws` tested a record on. */
export const tableTested = (record: Evidence): Option.Option<MemoryOperators> =>
  Option.fromUndefinedOr(testedOn.get(record))

export const testedByRunner = (record: Evidence): boolean => ranByRunner.has(record)
