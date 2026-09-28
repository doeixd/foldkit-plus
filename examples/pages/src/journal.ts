import { Effect, Exit, Fiber, Schema, Scope, Stream } from 'effect'
import { ActorId, Cursor, DocumentId, Journal, OpId } from 'foldkit-durable'
import {
  DocumentId as SyncDocumentId,
  type CommittedOperation,
  type Operation,
  type TransportClient,
} from 'foldkit-sync'
import { Message, type Shared } from './app.js'
import { PagesSync } from './contract.js'

const pages = DocumentId.make('pages')
const decodeMessage = Schema.decodeUnknownSync(Message)

/** The actor, and replica, the server commits its own operations as. No tab can be it. */
export const SERVER = 'server'

/**
 * Whether an operation collects deleted text. Only the server may: two collections in a row
 * would remove what a tab offline for a moment still anchors on.
 */
const collects = (operation: Operation): boolean => {
  const message = decodeMessage(operation.message)
  return message._tag === 'EditedPage' && message.ops.some(op => op.type === 'Collect')
}

/** Whether a page holds deleted text a collection would mark or remove. */
const collectable = (page: Shared['pages'][number]): boolean =>
  Object.values(page.body.blocks).some(entry =>
    entry.spans.some(span => span.kept !== true && (span.deleted || entry.deleted)),
  )

/**
 * The server: a Durable journal that puts every replica's edits in one order, and the
 * exchange a replica's transport calls. Every page edit is appended, reduced by the same
 * `update` the replicas run, and read back by the others after their cursor.
 */
/** How many committed edits one exchange sends back at most; a replica far behind asks again. */
const PAGE = 500

export const openJournal = (file = ':memory:', page = PAGE) => {
  const scope = Effect.runSync(Scope.make())
  const journal = Effect.runSync(
    Journal.make<Operation, Shared, { readonly actorId: string }>({
      ...PagesSync.journalContract(),
      file,
      // A page is large and an edit small: the pages are written once every 50 edits,
      // and a load replays the edits since.
      snapshotEvery: 50,
      opId: operation => OpId.make(operation.opId),
      actorId: principal => ActorId.make(principal.actorId),
      authorize: ({ principal, operation }) =>
        principal.actorId === SERVER ||
        !collects(operation) || { allowed: false, reason: 'only the server collects' },
    }).pipe(Effect.provideService(Scope.Scope, scope)),
  )

  const committed = (row: {
    readonly operation: Operation
    readonly sequence: number
    readonly actorId: string
  }): CommittedOperation =>
    PagesSync.codec.committedFrom(
      { ...row.operation, serverSequence: row.sequence, actorId: row.actorId },
      SyncDocumentId.make('pages'),
    )

  const transport = (actorId: string): TransportClient => ({
    exchange: async (cursor, pending, seen) => {
      // A replica that saw another epoch holds a cursor into history this server lacks
      // (it was reset): it is answered from the start, and rebuilds from that. Otherwise a
      // cursor past the server's is refused before anything is appended, or the edits
      // would commit and their acknowledgements be lost with the failed read.
      const epoch = Effect.runSync(journal.epoch(pages))
      const from = seen !== undefined && seen !== epoch ? 0 : cursor
      const at = Effect.runSync(journal.cursor(pages))
      if (from > at) throw new Error(`Cursor ${cursor} is ahead of the server's ${at}`)
      const rejected: Array<string> = []
      const acknowledged: Array<string> = []
      for (const input of pending) {
        // An operation that does not decode, or that the journal refuses or cannot apply,
        // fails the same way on every retry, so it is rejected rather than failing the
        // exchange and being resent forever. A storage failure may pass, so it still fails
        // the exchange, and the client keeps the edit and tries again.
        const outcome = Effect.runSync(
          Effect.result(
            Effect.try(() => PagesSync.codec.normalizeOperation(input)).pipe(
              Effect.flatMap(operation => journal.append(pages, operation, { actorId })),
            ),
          ),
        )
        if (outcome._tag === 'Success') {
          acknowledged.push(input.opId)
          continue
        }
        if (outcome.failure._tag === 'JournalError') throw outcome.failure
        const opId: unknown = (input as { readonly opId?: unknown } | null)?.opId
        if (typeof opId === 'string') rejected.push(opId)
      }
      const rows = Effect.runSync(journal.read(pages, Cursor.make(from), { limit: page }))
      return {
        operations: rows.map(committed),
        rejected,
        acknowledged,
        more: rows.length === page,
        epoch,
      }
    },
  })

  /**
   * Collects deleted text: one `Collect` op per page that holds any, committed by the server
   * like any edit, so every replica applies it at the same place in the order. Text deleted
   * before the previous collection is removed, so a tab offline across two of them finds its
   * anchors on that text gone, and its typing there lands at the end of the block, or of
   * the block that one was joined into.
   */
  const collect = (): void => {
    for (const page of Effect.runSync(journal.load(pages)).snapshot.pages) {
      if (!collectable(page)) continue
      const cursor = Effect.runSync(journal.cursor(pages))
      const operation = PagesSync.codec.normalizeOperation({
        protocolVersion: 1,
        schemaVersion: 1,
        documentId: 'pages',
        replicaId: SERVER,
        localSequence: cursor + 1,
        opId: `${SERVER}:${cursor + 1}`,
        baseCursor: cursor,
        message: { _tag: 'EditedPage', id: page.id, ops: [{ type: 'Collect' }] },
      })
      Effect.runSync(journal.append(pages, operation, { actorId: SERVER }))
    }
  }

  return {
    transport,
    collect,
    /** Calls `listener` after each commit; returns the unsubscribe. */
    subscribe: (listener: () => void): (() => void) => {
      const fiber = Effect.runFork(
        Stream.runForEach(journal.subscribe, () => Effect.sync(listener)),
      )
      return () => Effect.runSync(Fiber.interrupt(fiber))
    },
    snapshot: (): Shared => Effect.runSync(journal.load(pages)).snapshot,
    close: () => Effect.runSync(Scope.close(scope, Exit.void)),
  }
}
