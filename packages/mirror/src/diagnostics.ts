/**
 * What a key-value mirror absorbs: a store that fails a read or a write, and
 * a document under its key that is not a mirror's. The mirror is disposable
 * state, so it goes on as if the store held nothing; each is reported through
 * `Diagnostics.report`, so the log says why a slice did not survive.
 */
import type { KeyValueStore } from 'effect/persistence'
import type { Diagnostic } from 'foldkit-surface'

const source = 'foldkit-mirror'

/** The store failed to read the mirror's document: the slice restored nothing. */
export interface StoreUnread extends Diagnostic {
  readonly _tag: 'StoreUnread'
  readonly key: string
  readonly error: KeyValueStore.KeyValueStoreError
}

/** The store failed to write (or remove) the mirror's document: the slice was not kept. */
export interface StoreUnwritten extends Diagnostic {
  readonly _tag: 'StoreUnwritten'
  readonly key: string
  readonly error: KeyValueStore.KeyValueStoreError
}

/**
 * The document under the mirror's key is not one a mirror writes (not JSON,
 * or not its shape), so it was discarded: something else writes that key.
 * Another version or scope is a mirror's own and is discarded with no report.
 */
export interface StoreMalformed extends Diagnostic {
  readonly _tag: 'StoreMalformed'
  readonly key: string
  /** Why it did not decode. */
  readonly reason: string
}

/** Every diagnostic a mirror reports. */
export type MirrorDiagnostic = StoreUnread | StoreUnwritten | StoreMalformed

export const storeUnread = (key: string, error: KeyValueStore.KeyValueStoreError): StoreUnread => ({
  _tag: 'StoreUnread',
  source,
  level: 'warning',
  message: `could not read "${key}" (${error.message}), so the mirror restored nothing.`,
  key,
  error,
})

export const storeUnwritten = (
  key: string,
  error: KeyValueStore.KeyValueStoreError,
): StoreUnwritten => ({
  _tag: 'StoreUnwritten',
  source,
  level: 'warning',
  message: `could not write "${key}" (${error.message}), so the store does not hold the slice.`,
  key,
  error,
})

export const storeMalformed = (key: string, reason: string): StoreMalformed => ({
  _tag: 'StoreMalformed',
  source,
  level: 'warning',
  message: `"${key}" held a document no mirror writes (${reason}); it was discarded. Give the mirror a key nothing else writes.`,
  key,
  reason,
})
