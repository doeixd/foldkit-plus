/**
 * Which Policy another was provided from, so a seam built from one counts as
 * built from the other: `Policy.provide` keeps the bodies and rules, and
 * changes only the services they run with. `validate` checks that a seam's
 * rules are the declared ones; it does not check which services they were
 * given.
 */
import type { Policy } from './index.js'

const origins = new WeakMap<object, object>()

/** The Policy `G.implement` built that `policy` was provided from: itself, for one it built. */
export const originOf = (policy: Policy<any, any>): object => origins.get(policy) ?? policy

/** Records `policy` as provided from `from`. */
export const providedFrom = <P extends Policy<any, any>>(policy: P, from: Policy<any, any>): P => {
  origins.set(policy, originOf(from))
  return policy
}
