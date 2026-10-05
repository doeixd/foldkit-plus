/**
 * `foldkit-sync/journal` — the server's side of an exchange, over a
 * `foldkit-durable` journal. Every Sync server needs the same loop: append
 * what a replica sends, refuse what cannot be taken, and read back what
 * committed since the replica's cursor. Written by hand three times, it
 * failed the same way: an operation that did not decode failed the whole
 * exchange, so the replica sent it again on every one and the edits behind it
 * never went. Here, refused operations are reported by id, and the replica
 * drops them.
 */
import { Effect, Fiber, Match, Option, Schema, Stream } from 'effect'
import {
  Cursor,
  DocumentId as JournalDocumentId,
  type Committed,
  type Journal,
} from 'foldkit-durable/core'
import { sequence } from './ids.js'
import type { Operation, Sync, TransportClient } from './sync.js'
import { serveSocket, type SocketLike } from './transport.js'

export interface JournalExchangeOptions<Message, Shared, Principal> {
  /** The document's contract: its codecs, and the snapshot a checkpoint encodes. */
  readonly sync: Sync<Message, Shared>
  /**
   * The journal made from `sync.journalContract()`, which orders and keeps the
   * document. One that takes any input, or only operations, is accepted.
   */
  readonly journal: Journal<Operation, Shared, Principal, Operation>
  /**
   * Who is exchanging, as the transport established it. The journal's
   * `authorize` reads it; a refused operation is reported as rejected.
   */
  readonly principal: Principal
  /**
   * Runs after each exchange's appends and before the reply is read: apply
   * what committed to another store, through `journal.recover`. It runs on
   * every exchange, so a write that failed is tried again on the next.
   */
  readonly settle?: Effect.Effect<void, unknown> | undefined
  /**
   * Refuses an operation before the journal sees it, by what the transport
   * established rather than by the document: a principal that may only read.
   * A refused operation is rejected by its id. The journal's own `authorize`
   * is where a rule about the document goes.
   */
  readonly refuse?: ((operation: Operation) => boolean) | undefined
  /** The most committed operations one reply carries; a replica further behind asks again. Default 500. */
  readonly limit?: number | undefined
}

/** The id an entry names, read without trusting the rest of it. */
const idOf = (input: unknown): Option.Option<string> =>
  Option.map(
    Schema.decodeUnknownOption(Schema.Struct({ opId: Schema.String }))(input),
    ({ opId }) => opId,
  )

/**
 * One replica's exchanges with the journal, as the replica's transport
 * speaks them (`Sync.transport.fromPromise`, or behind
 * `Sync.transport.serve` on a socket). Each pending operation is appended in
 * order, and acknowledged once committed, or already committed. One is
 * rejected by its id when its message does not decode, it names another
 * document, or the journal refuses it (`authorize`, `validate`); the replica
 * drops it rather than send it again. Only an entry with no id at all, a
 * cursor ahead of the journal's, or the journal failing fails the exchange. The reply carries what committed
 * after the replica's cursor, a checkpoint when that history was compacted,
 * and the journal's epoch, so a replica of a reset journal starts again.
 */
export const journalExchange = <Message, Shared, Principal>(
  options: JournalExchangeOptions<Message, Shared, Principal>,
): TransportClient => {
  const { sync, journal, principal } = options
  const limit = options.limit ?? 500
  const key = JournalDocumentId.make(sync.documentId)
  const snapshot = sync.journalContract().snapshot
  const operationOf = Option.liftThrowable((input: unknown) =>
    sync.codec.operationFrom(input, sync.documentId),
  )
  const committedOf = (committed: Committed<Operation>) =>
    sync.codec.committedFrom(
      { ...committed.operation, serverSequence: committed.sequence, actorId: committed.actorId },
      sync.documentId,
    )

  const exchange = (cursor: number, pending: ReadonlyArray<unknown>, seen?: string) =>
    Effect.gen(function* () {
      // A replica that saw another epoch holds a cursor into history this journal
      // lacks (it was reset): it is answered from the start. Otherwise a cursor
      // past the journal's is refused before anything is appended, or the
      // operations would commit and their acknowledgements be lost.
      const epoch = yield* journal.epoch(key)
      const from = seen !== undefined && seen !== epoch ? 0 : cursor
      const at = yield* journal.cursor(key)
      if (from > at) {
        return yield* Effect.fail(new Error(`Cursor ${cursor} is ahead of the server's ${at}`))
      }
      const rejected: Array<string> = []
      const reasons: Array<{ readonly opId: string; readonly reason: string }> = []
      // Each reason is words for the person whose edit came back: a policy's own,
      // or a fixed sentence, never an error's message, which may carry internals.
      const reject = (opId: string, reason: string) => {
        rejected.push(opId)
        reasons.push({ opId, reason })
      }
      const acknowledged: Array<string> = []
      for (const input of pending) {
        const decoded = operationOf(input)
        if (Option.isNone(decoded)) {
          const id = idOf(input)
          if (Option.isNone(id))
            return yield* Effect.fail(new Error('A pending entry names no operation'))
          reject(id.value, 'Not an operation this server accepts')
          continue
        }
        const operation = decoded.value
        if (options.refuse?.(operation) === true) {
          reject(operation.opId, 'This connection may not make changes')
          continue
        }
        yield* journal.append(key, operation, principal).pipe(
          Effect.map(appended =>
            acknowledged.push(
              Match.valueTags(appended, {
                Committed: ({ committed }): string => committed.operation.opId,
                AlreadyCommitted: ({ opId }): string => opId,
              }),
            ),
          ),
          // A refusal, an operation the journal cannot apply, and an id reused for
          // other content fail the same way on every retry, so they are rejected; a
          // `JournalError` may not, so it still fails the exchange.
          Effect.catchTags({
            OperationRejectedError: error =>
              Effect.sync(() => reject(error.opId, error.reason ?? 'Refused by the server')),
            InvalidOperationError: () =>
              Effect.sync(() => reject(operation.opId, 'Not a valid operation')),
            IdentityConflictError: () =>
              Effect.sync(() => reject(operation.opId, 'Its id was already used for another')),
          }),
        )
      }
      if (options.settle !== undefined) yield* options.settle
      // A cursor below the compacted floor is answered with the snapshot; the
      // read decides that itself, so a compaction cannot slip in between.
      const read = yield* journal.read(key, Cursor.make(from), { limit }).pipe(
        Effect.map(rows => Option.some(rows)),
        Effect.catchTag('CompactedCursorError', () => Effect.succeed(Option.none())),
      )
      return yield* Option.match(read, {
        onSome: rows =>
          Effect.succeed({
            operations: rows.map(committedOf),
            rejected,
            reasons,
            acknowledged,
            more: rows.length === limit,
            epoch,
          }),
        onNone: () =>
          Effect.map(journal.load(key), loaded => ({
            operations: [],
            rejected,
            reasons,
            acknowledged,
            checkpoint: { cursor: loaded.cursor, model: snapshot.encode(loaded.snapshot) },
            epoch,
          })),
      })
    })

  return {
    exchange: (cursor, pending, seen) => Effect.runPromise(exchange(cursor, pending, seen)),
  }
}

/**
 * Calls `listener` each time the document commits, for `Sync.transport.serve`'s
 * `changes`, so a socket wakes its replica to exchange. Returns the unsubscribe.
 */
export const journalChanges =
  <Shared, Principal>(
    journal: Journal<Operation, Shared, Principal, Operation>,
    documentId: string,
  ): ((listener: () => void) => () => void) =>
  listener => {
    const fiber = Effect.runFork(
      Stream.runForEach(
        Stream.filter(journal.subscribe, key => key === documentId),
        () => Effect.sync(listener),
      ),
    )
    return () => Effect.runSync(Fiber.interrupt(fiber))
  }

/**
 * Serves one accepted socket over the journal: each exchange frame answered by
 * `journalExchange` with the connection's principal, and a notice sent after
 * each commit, so the replica hears of others' edits. Returns the stop.
 */
export const serveJournal = <Message, Shared, Principal>(
  socket: SocketLike,
  options: JournalExchangeOptions<Message, Shared, Principal>,
): (() => void) => {
  const client = journalExchange(options)
  return serveSocket(socket, {
    exchange: (cursor, pending, epoch) => client.exchange(sequence(cursor), pending, epoch),
    changes: journalChanges(options.journal, options.sync.documentId),
  })
}
