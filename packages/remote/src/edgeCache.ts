/**
 * How long a read of an Entity's rows stays fresh, as the domain declares it
 * (#428), and the tags a store keeps answers under. Whether a read may be
 * shared is the server's to prove, never the declaration's
 * (`foldkit-remote-server`'s `serveFetch` and `pageReader`).
 */
import { Duration, Option } from 'effect'
import { Metadata } from 'foldkit-metadata'
import { cachePolicy, type CacheOptions, type CachePolicy } from 'foldkit-surface'

export {
  CachedRead,
  CacheStore,
  PageReads,
  cachePolicy,
  maxAgeSeconds,
  shorterPolicy,
  type CacheOptions,
  type CachePolicy,
  type WorkersCache,
  type WorkersKv,
} from 'foldkit-surface'

const key = Metadata.key<CachePolicy>('foldkit-remote/cache', {
  // Two declarations on one Entity keep the shorter.
  merge: policies => [
    policies.reduce((shortest, policy) =>
      Duration.isLessThan(policy.maxAge, shortest.maxAge) ? policy : shortest,
    ),
  ],
  summarize: policy => `fresh for ${Duration.format(policy.maxAge)}`,
})

/** The tag of one row, as a store keys what a write names. */
export const rowTag = (entity: string, id: string): string => `row:${entity}:${id}`

/** The tag of every list of an entity's rows: a write to any of them can move one in or out. */
export const listTag = (entity: string): string => `list:${entity}`

export const EdgeCache = {
  /**
   * Entity metadata: its rows stay fresh for `maxAge` wherever a server
   * proves a read of them public. `Entity.annotate(EdgeCache.of({ maxAge:
   * '60 seconds' }))`. It says nothing of who may share an answer.
   */
  of: (options: CacheOptions): Metadata => key.of(cachePolicy(options)),

  /** The policy an Entity declares (`EdgeCache.of`), none when it declares none. */
  policyOf: (entity: object): Option.Option<CachePolicy> => {
    const metadata = 'metadata' in entity ? entity.metadata : undefined
    return Metadata.is(metadata) ? Option.fromUndefinedOr(key.get(metadata)[0]) : Option.none()
  },
}
