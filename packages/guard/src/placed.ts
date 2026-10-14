/**
 * What each guard seam built, and for which Policy and Entities, so
 * `GuardServer.validate` can tell a Source that applies a guard set's rules
 * from one that only looks as if it does.
 */
import { Option } from 'effect'
import type { AnyEntity } from 'foldkit-entity'
import { attached, type Attachment } from './attach.js'
import type { Policy } from './index.js'
import { originOf } from './origin.js'

interface Placed {
  readonly policy: Policy<any, any>
  /** Each Entity's attachment as it was built from: none for one built before `attach`. */
  readonly entities: ReadonlyMap<string, Attachment | undefined>
}

/** An Entity's guards, by identity: the same attachment is the same rules. */
const guardsOf = (entity: AnyEntity) => Option.getOrUndefined(attached(entity))

const record = (registry: WeakMap<object, Placed>) => ({
  add: <F extends object>(built: F, policy: Policy<any, any>, entities: Iterable<AnyEntity>): F => {
    registry.set(built, {
      policy,
      entities: new Map([...entities].map(entity => [entity.name, guardsOf(entity)])),
    })
    return built
  },
  /**
   * Whether `built` applies `entity`'s guards from `policy`: built for it,
   * not for another Entity of its name, nor for it before its guards were
   * attached, which decides nothing.
   */
  has: (built: unknown, policy: Policy<any, any>, entity: AnyEntity): boolean => {
    if (typeof built !== 'function' && (typeof built !== 'object' || built === null)) return false
    const placed = registry.get(built)
    return (
      placed !== undefined &&
      originOf(placed.policy) === originOf(policy) &&
      placed.entities.has(entity.name) &&
      placed.entities.get(entity.name) === guardsOf(entity)
    )
  },
})

/** Row rules: `GuardDrizzle.visible`'s, and `GuardServer.memory`'s `readable`. */
export const rowRules = record(new WeakMap())

/** Member and relation rules: `GuardServer.filter`'s. */
export const memberRules = record(new WeakMap())

/** Write rules: `GuardServer.writer`'s. */
export const writeRules = record(new WeakMap())
