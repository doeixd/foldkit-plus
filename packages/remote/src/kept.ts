/**
 * What a row's fields held before the first live patch that landed while a
 * write was pending. A live patch writes the base, so the server's newest word
 * is always there; a relative layer (`adds`, `computes`) resolves over this
 * older value instead, or its own echo would be counted twice (#498). The same
 * record tells an answer which fields a stream wrote while its request was
 * pending (#499).
 */
import { Option } from 'effect'
import { put } from './record.js'
import type { EntityKey } from './store.js'

export interface KeptField {
  /** The base's value before the first patch: none when the row did not hold the field. */
  readonly before: Option.Option<unknown>
  /** When that patch was heard: a kept value older than the bound is dropped. */
  readonly since: number
  /** The requests pending when a patch wrote the field, whose answers are compared with it. */
  readonly by: ReadonlySet<string>
}

export type Kept = ReadonlyMap<EntityKey, ReadonlyMap<string, KeptField>>

export const noKept: Kept = new Map()

/** `values` with each kept field as it was before the stream wrote it. */
export const overKept = (
  values: Readonly<Record<string, unknown>>,
  kept: ReadonlyMap<string, KeptField> | undefined,
): Readonly<Record<string, unknown>> => {
  if (kept === undefined) return values
  const next: Record<string, unknown> = { ...values }
  for (const [field, { before }] of kept) {
    if (Option.isSome(before)) put(next, field, before.value)
    else delete next[field]
  }
  return next
}
