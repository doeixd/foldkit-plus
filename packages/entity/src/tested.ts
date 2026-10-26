/**
 * Which memory implementation each `Tested` record `Conformance.laws` made was
 * tested on, so a table records only evidence of its own implementation. Kept
 * beside the records rather than in them: a record is JSON a server publishes,
 * and an implementation is a function. Not exported from the package.
 */
import { Option } from 'effect'
import type { Evidence, MemoryImplementation } from './operators.js'

const testedOn = new WeakMap<Evidence, MemoryImplementation>()

export const stampTested = (record: Evidence, implementation: MemoryImplementation): void => {
  testedOn.set(record, implementation)
}

export const implementationTested = (record: Evidence): Option.Option<MemoryImplementation> =>
  Option.fromUndefinedOr(testedOn.get(record))
