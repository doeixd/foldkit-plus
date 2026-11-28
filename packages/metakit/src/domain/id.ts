/**
 * `Id`: branded, non-empty, NUL-free entity identifiers (`@doeixd/metakit/domain`).
 *
 * `Id.make('User')` produces a `Schema` branded by `'User'` so TypeScript
 * rejects accidental cross-entity comparisons (`Eq.is(user.id, org.id)`), while
 * remaining a plain `string` at runtime, in SQL (`TEXT`), and in Z3 (`nulFree`).
 */
import { Schema } from 'effect'
import { DOMAIN_ANNOTATION_KEY } from './annotation.js'

declare const IdBrand: unique symbol

/** A branded string identifier for entity `Entity`. */
export type IdValue<Entity extends string = string> = string & {
  readonly [IdBrand]: Entity
}

export interface IdOptions {
  /** Required string prefix (e.g. `'usr_'`). */
  readonly prefix?: string
  /** Minimum length (defaults to `1`, or `prefix.length + 1` when `prefix` is set). */
  readonly minLength?: number
  /** Optional maximum length. */
  readonly maxLength?: number
}

/**
 * Create a branded, non-empty, NUL-free identifier Schema for `entity`.
 * Recognized as `nulFree` by MetaKit's checker and Z3 prover.
 */
export const make = <const Entity extends string>(
  entity: Entity,
  options?: IdOptions,
): Schema.Codec<IdValue<Entity>, string> => {
  const prefix = options?.prefix
  const minLen = Math.max(1, options?.minLength ?? (prefix !== undefined ? prefix.length + 1 : 1))
  const maxLen = options?.maxLength
  const filter = Schema.makeFilter<string>(
    value => {
      if (value.includes('\u0000')) return `${entity} id must not contain a NUL character`
      if (value.length < minLen) return `${entity} id must be at least ${minLen} characters`
      if (maxLen !== undefined && value.length > maxLen) {
        return `${entity} id must be at most ${maxLen} characters`
      }
      if (prefix !== undefined && !value.startsWith(prefix)) {
        return `${entity} id must start with "${prefix}"`
      }
      return undefined
    },
    {
      [DOMAIN_ANNOTATION_KEY]: {
        kind: 'id',
        entity,
        ...(prefix === undefined ? {} : { prefix }),
      },
      expected: `${entity} identifier`,
    } as Schema.Annotations.Filter,
  )
  let base: Schema.String = Schema.String.check(Schema.isMinLength(minLen))
  if (maxLen !== undefined) base = base.check(Schema.isMaxLength(maxLen))
  return base.check(filter) as unknown as Schema.Codec<IdValue<Entity>, string>
}

/** Construct a branded `IdValue<Entity>`, throwing if empty or holding a NUL character. */
export const value = <const Entity extends string>(
  entity: Entity,
  raw: string,
): IdValue<Entity> => {
  if (raw.length === 0 || raw.includes('\u0000')) {
    throw new Error(`[metakit] Id.value(${entity}): id must be non-empty and NUL-free`)
  }
  return raw as IdValue<Entity>
}
