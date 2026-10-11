/**
 * What each guard seam built, and for which Policy and Entities, so
 * `GuardServer.validate` can tell a Source that applies a guard set's rules
 * from one that only looks as if it does.
 */
import type { Policy } from './index.js'

interface Placed {
  readonly policy: Policy<any, any>
  readonly entities: ReadonlySet<string>
}

const record = (registry: WeakMap<object, Placed>) => ({
  add: <F extends object>(built: F, policy: Policy<any, any>, entities: Iterable<string>): F => {
    registry.set(built, { policy, entities: new Set(entities) })
    return built
  },
  has: (built: unknown, policy: Policy<any, any>, entity: string): boolean => {
    if (typeof built !== 'function' && (typeof built !== 'object' || built === null)) return false
    const placed = registry.get(built)
    return placed !== undefined && placed.policy === policy && placed.entities.has(entity)
  },
})

/** Row rules: `GuardDrizzle.visible`'s, and `GuardServer.memory`'s `readable`. */
export const rowRules = record(new WeakMap())

/** Member and relation rules: `GuardServer.filter`'s. */
export const memberRules = record(new WeakMap())

/** Write rules: `GuardServer.writer`'s. */
export const writeRules = record(new WeakMap())
