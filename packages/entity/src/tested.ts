/**
 * What made each `Tested` record: `Conformance.laws` over one memory
 * implementation, or `Conformance.lawsBy` through a runner. A table records
 * only evidence of its own kind, so a record built by hand, copied, or tested
 * on another implementation is refused. Kept beside the records rather than in
 * them: a record is JSON a server publishes, and an implementation is a
 * function. Not exported from the package.
 */
import { Option } from 'effect'
import type { Evidence, MemoryImplementation } from './operators.js'

const testedOn = new WeakMap<Evidence, MemoryImplementation>()
const ranByRunner = new WeakSet<Evidence>()

export const stampTested = (record: Evidence, implementation: MemoryImplementation): void => {
  testedOn.set(record, implementation)
}

export const stampRun = (record: Evidence): void => {
  ranByRunner.add(record)
}

export const implementationTested = (record: Evidence): Option.Option<MemoryImplementation> =>
  Option.fromUndefinedOr(testedOn.get(record))

export const testedByRunner = (record: Evidence): boolean => ranByRunner.has(record)
