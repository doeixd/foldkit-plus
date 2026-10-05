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
  Sequence,
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

/**
 * The table holds revisions past every sequence the journal has: it outlived
 * a reset of the journal, or was built from another. New edits commit at
 * sequences the table already passed, so `apply` would skip every one and
 * the replicas count each absorbed: rebuild the table with the journal.
 */
export class TableAheadOfJournalError extends Schema.TaggedError<TableAheadOfJournalError>()(
  'SyncTableAheadOfJournalError',
  { table: Schema.Number, journal: Schema.Number },
) {
  override get message(): string {
    return `The table holds revision ${this.table}, past the journal's ${this.journal}: rebuild the table with the journal`
  }
}

export interface EditsJournalOptions<Shared, Principal, Change> {
  /** The document whose edits the table reads. */
  readonly documentId: string
  /** The journal the edits commit to. */
  readonly journal: Journal<Operation, Shared, Principal, Operation>
  /**
   * The cells an operation edits, with the sequence its stamp wrote in; none
   * for an operation that edits nothing. An edit committed without a sequence
   * is not this journal's: its intents fail rather than write revision 0.
   */
  readonly editsOf: (operation: Operation) => Option.Option<{
    readonly changes: ReadonlyArray<Change>
    readonly at: Option.Option<number>
  }>
  /**
   * Writes one committed change to the table, with the sequence it committed
   * at. It runs as a recovery intent, so it may run again after a crash: it
   * must never move a row back (`revision <= at`). A failure stops recovery
   * there, and the next settle tries it again.
   *
   * It cannot refuse an edit: the edit has committed. One naming a row the
   * table lacks is refused at commit instead, by the journal's `validate`,
   * so its sender is told; let through, it would change nothing and vanish
   * once absorbed.
   */
  readonly apply: (change: Change, at: number) => Effect.Effect<void, unknown>
  /**
   * The highest revision the table holds. Settling refuses to start while it
   * is past the journal's cursor (`TableAheadOfJournalError`), since every
   * edit would then be skipped and counted absorbed; it asks again on each
   * settle until the two agree.
   */
  readonly tableRevision: Effect.Effect<number, unknown>
  /** Whether the snapshot still keeps an edit committed through `through`: whether to absorb. */
  readonly holdsThrough: (snapshot: Shared, through: number) => boolean
  /**
   * The server's operation saying the table holds every edit through
   * `through`, sequenced from `cursor`, the journal's: the replicas drop those
   * edits on hearing it.
   */
  readonly absorbed: (through: number, cursor: number) => Operation
  /** Who the server commits `absorbed` as; the contract's `authorize` should let only it. */
  readonly server: Principal
}

/**
 * The table as the journal's read model: `settle` applies each committed
 * edit through `apply`, as a recovery intent, and `absorb` records in the
 * journal what the table holds and compacts the log behind it. For
 * `journalExchange`'s `settle`, and a clock that absorbs.
 *
 * Recovery starts at the journal's floor, where compaction left it, so a
 * server restarted over a journal that outlived it does not ask for history
 * that is gone. Intents are keyed by the journal's epoch as well as the
 * operation, so after a reset an operation sent again is applied again, not
 * taken as already run.
 */
export const editsJournal = <Shared, Principal, Change>(
  options: EditsJournalOptions<Shared, Principal, Change>,
): {
  readonly settle: Effect.Effect<void, unknown>
  readonly absorb: Effect.Effect<void, unknown>
} => {
  const { journal } = options
  const key = JournalDocumentId.make(options.documentId)
  // Operations at or before `applied.cursor` have every change in the table,
  // in `applied.epoch`: none until a settle has run in this process.
  let applied: Option.Option<{ readonly cursor: Cursor; readonly epoch: string }> = Option.none()
  const intents = (epoch: string) => (operation: Operation) =>
    Option.match(options.editsOf(operation), {
      onNone: () => [],
      onSome: ({ changes, at }) =>
        changes.map((change, index) => ({
          key: `${epoch}:${operation.opId}:${index}`,
          run: Option.match(at, {
            onNone: () =>
              Effect.fail(new Error(`Edit ${operation.opId} committed without its sequence`)),
            onSome: sequence => options.apply(change, sequence),
          }),
        })),
    })
  // Before the first recovery of an epoch: the table must not be past it.
  const checked = Effect.gen(function* () {
    const table = yield* options.tableRevision
    const at = yield* journal.cursor(key)
    if (table > at) return yield* new TableAheadOfJournalError({ table, journal: at })
    return Cursor.make(yield* journal.floor(key))
  })
  const settle = Effect.gen(function* () {
    const epoch = yield* journal.epoch(key)
    // A new epoch is a new history: recovery starts over at its floor.
    const from = yield* Option.match(
      Option.filter(applied, previous => previous.epoch === epoch),
      {
        onSome: ({ cursor }) => Effect.succeed(cursor),
        onNone: () => checked,
      },
    )
    const cursor = yield* journal.recover({ key, from, intents: intents(epoch) })
    applied = Option.some({ cursor, epoch })
  })
  // Two absorbs at once need no lock: both name the record by the journal's
  // cursor, so the second is the first's retry, answered from history.
  const absorb = Effect.gen(function* () {
    const epoch = yield* journal.epoch(key)
    const known = Option.filter(applied, previous => previous.epoch === epoch)
    if (Option.isNone(known)) return
    const through = known.value.cursor
    const { snapshot, cursor } = yield* journal.load(key)
    if (!options.holdsThrough(snapshot, through)) return
    yield* journal.append(key, options.absorbed(through, cursor), options.server)
    // What the log holds through `through` is in the table and gone from
    // the snapshot; a replica behind it is sent the snapshot instead.
    yield* journal.compact(key, Sequence.make(through))
  })
  return { settle, absorb }
}
