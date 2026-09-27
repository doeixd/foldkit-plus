import { Effect, Exit, Fiber, Scope, Stream } from 'effect'
import { ActorId, Cursor, DocumentId, Journal, OpId } from 'foldkit-durable'
import {
  DocumentId as SyncDocumentId,
  type CommittedOperation,
  type Operation,
  type TransportClient,
} from 'foldkit-sync'
import type { Shared } from './app.js'
import { PagesSync } from './contract.js'

const pages = DocumentId.make('pages')

/**
 * The server: a Durable journal that puts every replica's edits in one order, and the
 * exchange a replica's transport calls. Every page edit is appended, reduced by the same
 * `update` the replicas run, and read back by the others after their cursor.
 */
export const openJournal = (file = ':memory:') => {
  const scope = Effect.runSync(Scope.make())
  const journal = Effect.runSync(
    Journal.make<Operation, Shared, { readonly actorId: string }>({
      ...PagesSync.journalContract(),
      file,
      opId: operation => OpId.make(operation.opId),
      actorId: principal => ActorId.make(principal.actorId),
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
    exchange: async (cursor, pending) => {
      // A cursor past the server's names history this server does not have (it was reset,
      // or the client is confused). Refused before anything is appended, or the edits
      // would commit and their acknowledgements be lost with the failed read.
      const at = Effect.runSync(journal.cursor(pages))
      if (cursor > at) throw new Error(`Cursor ${cursor} is ahead of the server's ${at}`)
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
      const rows = Effect.runSync(journal.read(pages, Cursor.make(cursor)))
      return { operations: rows.map(committed), rejected, acknowledged }
    },
  })

  return {
    transport,
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
