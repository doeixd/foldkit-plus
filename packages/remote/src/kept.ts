/**
 * The fields a newer server value moved while a write was pending: a live
 * patch, or a read answered beside the write. The newer value writes the base,
 * so the server's newest word is always there. For a patch the record holds
 * what the field held before it, and a relative layer (`adds`, `computes`)
 * resolves over that instead, or its own echo would be counted twice (#498).
 * The record also tells an answer which fields moved while its request was
 * pending, to be read again where the answer disagrees (#499, #480). Every
 * domain with writes keeps it, through the layer capability, whether or not it
 * reads live (`keeping.ts`).
 */
import { Option } from 'effect'
import { put } from './record.js'
import type { EntityKey } from './store.js'

export interface KeptField {
  /**
   * The requests pending when a newer value wrote the field, each with the
   * value a relative layer of it resolves over: for a patch, the base's value
   * from before it (none when the row did not hold the field); for a read, the
   * read's own. A request started after a newer value cannot be echoed by it.
   * Their answers are compared with what was written.
   */
  readonly by: ReadonlyMap<string, Option.Option<unknown>>
  /** When the first newer value was heard: a kept value older than the bound is dropped. */
  readonly since: number
}

export type Kept = ReadonlyMap<EntityKey, ReadonlyMap<string, KeptField>>

export const noKept: Kept = new Map()

/** `values` with each field `id` was pending beside a newer value of, as it was before it. */
export const overKept = (
  values: Readonly<Record<string, unknown>>,
  kept: ReadonlyMap<string, KeptField> | undefined,
  id: string,
): Readonly<Record<string, unknown>> => {
  if (kept === undefined) return values
  const next: Record<string, unknown> = { ...values }
  for (const [field, { by }] of kept) {
    const before = by.get(id)
    if (before === undefined) continue
    if (Option.isSome(before)) put(next, field, before.value)
    else delete next[field]
  }
  return next
}
