/**
 * The outbox's queue as the Model holds it (#378): what the reducer keeps of
 * durable writes. The store, the locks and the sending are
 * `foldkit-remote/outbox`'s, so a page with no outbox keeps none of them.
 */
import { Data, Option, Schema } from 'effect'
import type { StoredWrite } from './outboxStore.js'
import type { RemoteError } from './remoteData.js'

/**
 * How many settled operation ids are kept. A copy of a write settled longer
 * ago than this could come back from a tab that slept through it; the
 * server's ledger answers it again from its record.
 */
const DONE_WINDOW = 256

/** `done` with `settled` after it, the newest `DONE_WINDOW`, each once. */
export const withDone = (
  done: ReadonlyArray<string>,
  settled: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  if (settled.every(operation => done.includes(operation))) return done
  const kept = new Set(done)
  for (const operation of settled) kept.add(operation)
  return [...kept].slice(-DONE_WINDOW)
}

/**
 * Whom an answer was for, and so who a durable write was made for when it
 * was queued (#405): a visitor, or someone by the server's key for them.
 */
export const MadeAs = Schema.Union([
  Schema.TaggedStruct('Visitor', {}),
  Schema.TaggedStruct('Signed', { key: Schema.String }),
])
export type MadeAs = typeof MadeAs.Type

/** An answer's `principal` as the wire says it: `null` a visitor, a key someone. */
export const madeAsOf = (said: string | null): MadeAs =>
  said === null ? { _tag: 'Visitor' } : { _tag: 'Signed', key: said }

/** A queued write in the Model. */
export type Queued = Data.TaggedEnum<{
  /** One this version can send: shown, in the ledger, and sent in its turn. */
  Readable: {
    readonly write: StoredWrite
    /** Whether the store is known to hold this revision: only then is it sent. */
    readonly stored: boolean
    /** Sends in a row that nothing answered, this page. */
    readonly attempt: number
    /** Why the last of them failed. */
    readonly delayed: Option.Option<RemoteError>
  }
  /** One this version cannot read (a Mutation it lacks, an input that no longer decodes): kept, never sent. */
  Unreadable: {
    readonly operation: string
    readonly revision: number
    /** The entry as it was stored, written back as it is. */
    readonly raw: unknown
    readonly reason: string
    readonly stored: boolean
  }
}>
export const Queued = Data.taggedEnum<Queued>()

/** The durable writes this page holds, and the store they are copied to. */
export interface OutboxState {
  /** Names this page load's operations; minted by the outbox's restore. */
  readonly session: Option.Option<string>
  /** The store key the queue was read from; it is saved there and nowhere else. */
  readonly key: Option.Option<string>
  /**
   * Whose queue it is, as it was read: a page whose scope moves on sends none
   * of it, and reads the new scope's instead.
   */
  readonly scope: Option.Option<string>
  /** Every tab's queued writes, in the order they are sent. */
  readonly queue: ReadonlyArray<Queued>
  /** Operations settled lately, here or in another tab. */
  readonly done: ReadonlyArray<string>
  /**
   * Whom the server last said it answered as (an answer's `principal`):
   * what a durable write queued now is stamped with. None until an answer
   * says, and again after `forget` (#405).
   */
  readonly principal: Option.Option<MadeAs>
  /**
   * The queue this page held before its key or scope moved on: a visitor's
   * writes there move to the queue it holds now once an answer names who is
   * signed in (#405).
   */
  readonly left: Option.Option<{ readonly key: string; readonly scope: string }>
}

export const emptyOutbox: OutboxState = {
  session: Option.none(),
  key: Option.none(),
  scope: Option.none(),
  queue: [],
  done: [],
  principal: Option.none(),
  left: Option.none(),
}

/** The queue `outbox` holds, as `left` names it once the page moves on; else what it left before. */
export const leftOf = (outbox: OutboxState): OutboxState['left'] =>
  Option.isSome(outbox.key) && Option.isSome(outbox.scope)
    ? Option.some({ key: outbox.key.value, scope: outbox.scope.value })
    : outbox.left

export const operationOf = Queued.$match({
  Readable: ({ write }) => write.operation,
  Unreadable: ({ operation }) => operation,
})

export const revisionOf = Queued.$match({
  Readable: ({ write }) => write.revision,
  Unreadable: ({ revision }) => revision,
})

/**
 * A stored entry as a page reads it: a write it can send, with its input
 * decoded, or one it cannot, with why.
 */
export type ReadEntry =
  | { readonly _tag: 'Readable'; readonly write: StoredWrite; readonly input: unknown }
  | {
      readonly _tag: 'Unreadable'
      readonly operation: string
      readonly revision: number
      readonly raw: unknown
      readonly reason: string
    }
