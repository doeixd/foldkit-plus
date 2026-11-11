/**
 * The outbox's queue as the Model holds it (#378): what the reducer keeps of
 * durable writes. The store, the locks and the sending are
 * `foldkit-remote/outbox`'s, so a page with no outbox keeps none of them.
 */
import { Data, Match, Option, Schema } from 'effect'
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

/** Whether `owner` names someone signed in, rather than a visitor or no one. */
export const signedOwner = (owner: Option.Option<MadeAs>): boolean =>
  Option.exists(owner, made => made._tag === 'Signed')

/**
 * Whether a write made as `madeAs` may be sent while the page last heard
 * `heard` (#405): anything, before a page has heard; one made for someone
 * only while no one else is signed in; a visitor's, or one made before any
 * answer said who, only while no one is, since `outbox.adopt` stamps it as
 * whoever signs in first and says so.
 */
export const sendable = (madeAs: MadeAs | undefined, heard: Option.Option<MadeAs>): boolean =>
  Option.match(heard, {
    onNone: () => true,
    onSome: page =>
      Match.valueTags(page, {
        Visitor: () => true,
        Signed: ({ key }) => madeAs?._tag === 'Signed' && madeAs.key === key,
      }),
  })

/** The key a write made for someone is sent with; none for a visitor's, or one queued before any answer said. */
export const signedKey = (madeAs: MadeAs | undefined): Option.Option<string> =>
  madeAs === undefined
    ? Option.none()
    : Match.valueTags(madeAs, {
        Visitor: () => Option.none(),
        Signed: ({ key }) => Option.some(key),
      })

/**
 * Who owns a scope's queue once `heard` is heard (#405): the first person
 * signed in heard under it, for good; a visitor only while no one has been.
 * A cookie dropped, or another's, under Ada's scope leaves it Ada's.
 */
export const ownerAfter = (owner: Option.Option<MadeAs>, heard: MadeAs): Option.Option<MadeAs> => {
  if (signedOwner(owner) || (Option.isSome(owner) && heard._tag === 'Visitor')) return owner
  return Option.some(heard)
}

/** Two copies' owners as one: a signed-in owner over a visitor or none, the first if both. */
export const ownerOf = (
  first: Option.Option<MadeAs>,
  second: Option.Option<MadeAs>,
): Option.Option<MadeAs> =>
  signedOwner(first) || !signedOwner(second) ? Option.orElse(first, () => second) : second

/**
 * Who a durable write queued now is made for (#405): whom the page heard
 * last, except that one made while it heard a visitor is the queue's
 * owner's, when someone signed in owns it. None before any answer said.
 */
export const stampOf = (outbox: OutboxState): Option.Option<MadeAs> =>
  Option.map(outbox.principal, heard =>
    Match.valueTags(heard, {
      Visitor: () =>
        Option.getOrElse(
          Option.filter(outbox.owner, owner => owner._tag === 'Signed'),
          () => heard,
        ),
      Signed: () => heard,
    }),
  )

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
   * Who owns the queue the page holds (`ownerAfter`), as heard here and as
   * saved with it: a write made while the page last heard a visitor is
   * stamped as its owner, when someone is, and a visitor's writes are moved
   * only out of a queue no one signed in owns (#405).
   */
  readonly owner: Option.Option<MadeAs>
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
  owner: Option.none(),
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
