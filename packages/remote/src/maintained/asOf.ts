/**
 * Offline as-of reads for maintained values (Phase 4 Part B, Bout 4.15).
 *
 * A retained result carries `completeAsOf: number` (revision), apart from
 * `Current`, and never restores a server cursor: on reconnect the value is
 * shown as of `completeAsOf` and flagged `needsRefresh: true` so the client
 * reads it again from the server.
 */
import { Data } from 'effect'

export type Freshness = Data.TaggedEnum<{
  /** Current with the live/connected store. */
  Current: {}
  /** Restored from offline persistence as of `completeAsOf`; never carries a server cursor. */
  AsOf: { readonly completeAsOf: number }
}>
export const Freshness = Data.taggedEnum<Freshness>()

export interface RetainedAsOf<A> {
  readonly value: A
  readonly completeAsOf: number
}

export interface AsOfResult<A> {
  readonly value: A
  readonly freshness: Freshness
  /** True when restored from offline storage and due for a fresh read on reconnect. */
  readonly needsRefresh: boolean
}

/**
 * Snapshot a maintained value for offline persistence at `revision`.
 * Intentionally carries only `value` and `completeAsOf` (never a server cursor).
 */
export const retainAsOf = <A>(value: A, revision: number): RetainedAsOf<A> => {
  if (!Number.isInteger(revision) || revision < 0) {
    throw new Error(
      `[foldkit-remote/maintained] retainAsOf: revision must be a non-negative integer, got ${revision}`,
    )
  }
  return { value, completeAsOf: revision }
}

/**
 * Restore a retained maintained value after reload/reconnect.
 * Strips any extraneous cursor field, tags freshness as `AsOf`, and marks
 * `needsRefresh: true` so the application reads it again on reconnect.
 */
export const restoreAsOf = <A>(
  retained: RetainedAsOf<A> & { readonly cursor?: unknown },
): AsOfResult<A> => ({
  value: retained.value,
  freshness: Freshness.AsOf({ completeAsOf: retained.completeAsOf }),
  needsRefresh: true,
})

/** Promote an `AsOfResult` to `Current` once a fresh read settles. */
export const markCurrent = <A>(value: A): AsOfResult<A> => ({
  value,
  freshness: Freshness.Current(),
  needsRefresh: false,
})
