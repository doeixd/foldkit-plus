/**
 * The sync server's journal: `foldkit-durable` on a real SQLite file, exposed
 * through the synchronous and promise seams the transport and the replica
 * speak. `node:sqlite` is synchronous, so reads and writes run to completion.
 */
import { Effect, Exit, Fiber, Scope, Stream } from 'effect'
import {
  Cursor,
  DocumentId,
  Journal,
  Sequence,
  type AppendResult as DurableAppendResult,
  type Committed as DurableCommitted,
} from 'foldkit-durable'
import {
  DocumentId as SyncDocumentId,
  type CommittedOperation as Committed,
  type Operation,
  type SocketLike,
  type TransportClient,
} from 'foldkit-sync'
import { journalExchange } from 'foldkit-sync/journal'
import { type Message, type Shared } from './app.js'
import type { SyncPrincipal } from './principal.js'
import { exchangeAs, journalOptions, serveAs } from './serving.js'
import { TodoSync } from './sync.js'

export type { SyncPrincipal } from './principal.js'

export interface ServerJournal {
  readonly append: (input: unknown, principal: SyncPrincipal) => Committed
  /** Appends a Message a server-side producer authored, using its own id. */
  readonly appendAsServer: (
    message: Message,
    principal: SyncPrincipal,
    producer: string,
  ) => Committed
  readonly read: (documentId: string, after: number) => ReadonlyArray<Committed>
  readonly compact: (documentId: string, through: number) => void
  readonly snapshot: (documentId: string) => { readonly cursor: number; readonly model: Shared }
  readonly subscribe: (listener: (key: string) => void) => () => void
  readonly transport: (principal: SyncPrincipal) => TransportClient
  /** Serves one socket as `principal`: its exchanges, and a notice after each commit. */
  readonly serve: (socket: SocketLike, principal: SyncPrincipal) => () => void
  readonly close: () => void
}

export const openJournal = (path: string): ServerJournal => {
  const scope = Effect.runSync(Scope.make())
  const durable: Journal<Operation, Shared, SyncPrincipal> = (() => {
    try {
      return Effect.runSync(
        Journal.make<Operation, Shared, SyncPrincipal>({ ...journalOptions(), file: path }).pipe(
          Effect.provideService(Scope.Scope, scope),
        ),
      )
    } catch (error) {
      Effect.runSync(Scope.close(scope, Exit.void))
      throw error
    }
  })()

  const toCommitted = (committed: DurableCommitted<Operation>, documentId: string): Committed =>
    TodoSync.codec.committedFrom(
      { ...committed.operation, serverSequence: committed.sequence, actorId: committed.actorId },
      SyncDocumentId.make(documentId),
    )

  const snapshot = (documentId: string): { cursor: number; model: Shared } => {
    const { cursor, snapshot: model } = Effect.runSync(durable.load(DocumentId.make(documentId)))
    return { cursor, model }
  }

  const append = (input: unknown, principal: SyncPrincipal): Committed => {
    if (!principal.actorId || !principal.canWrite) throw new Error('Unauthorized operation')
    const result: DurableAppendResult<Operation> = Effect.runSync(
      durable.append(DocumentId.make(principal.documentId), input, principal),
    )
    if (result._tag === 'AlreadyCommitted')
      throw new Error(
        `Operation "${result.opId}" was already committed and its payload was compacted`,
      )
    return toCommitted(result.committed, principal.documentId)
  }

  /**
   * A server producer has no local outbox, so it sequences from the
   * authoritative cursor. The cursor only advances, which keeps the operation
   * identity unique and survives a restart; `producer` labels the author.
   */
  const appendAsServer = (
    message: Message,
    principal: SyncPrincipal,
    producer: string,
  ): Committed => {
    const baseCursor = snapshot(principal.documentId).cursor
    return append(
      {
        protocolVersion: 1,
        schemaVersion: 1,
        documentId: principal.documentId,
        replicaId: producer,
        localSequence: baseCursor + 1,
        opId: `${producer}:${baseCursor + 1}`,
        baseCursor,
        message,
      },
      principal,
    )
  }

  const read = (documentId: string, after: number): ReadonlyArray<Committed> =>
    Effect.runSync(durable.read(DocumentId.make(documentId), Cursor.make(after))).map(committed =>
      toCommitted(committed, documentId),
    )

  return {
    append,
    appendAsServer,
    read,
    compact: (documentId, through) =>
      Effect.runSync(durable.compact(DocumentId.make(documentId), Sequence.make(through))),
    snapshot,
    subscribe: listener => {
      const fiber = Effect.runFork(
        Stream.runForEach(durable.subscribe, key =>
          Effect.sync(() => listener(key)).pipe(Effect.catchCause(() => Effect.void)),
        ),
      )
      return () => Effect.runSync(Fiber.interrupt(fiber))
    },
    // The exchange is `foldkit-sync/journal`'s: an operation it cannot take is
    // rejected by its id, so the edits behind it still go. A principal that may
    // only read has every operation refused.
    transport: (principal: SyncPrincipal): TransportClient => {
      const exchange = journalExchange(exchangeAs(durable, principal))
      return {
        exchange: (cursor, pending, epoch) =>
          principal.actorId
            ? exchange.exchange(cursor, pending, epoch)
            : Promise.reject(new Error('Unauthenticated reader')),
      }
    },
    serve: serveAs(durable),
    close: () => {
      Effect.runSync(Scope.close(scope, Exit.void))
    },
  }
}
