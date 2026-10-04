/**
 * The edits' journal: `foldkit-durable` keeps the document's operations in the
 * order it commits them, and applies each committed edit to the products table.
 *
 * The table is derived: the seed with every committed edit applied. Applying is
 * the journal's effect recovery: each change is an intent keyed by its
 * operation and position, run once and recorded, and `recover` advances only
 * past operations whose intents all ran. Writing a field to a value is
 * idempotent, so an intent run again after a crash writes the same thing.
 */
import { Effect, Exit, Match, Option, Schema, Scope } from 'effect'
import { ActorId, Cursor, DocumentId, Journal, OpId } from 'foldkit-durable'
import {
  DocumentId as SyncDocumentId,
  type CommittedOperation,
  type Operation,
  type TransportClient,
} from 'foldkit-sync'
import { Message } from './app.js'
import type { ProductChange } from './domain.js'
import { RegistrySync, journalContract, type Shared } from './sync.js'

/** Who wrote an edit. There is no sign-in here, so one author writes everything. */
interface Principal {
  readonly actorId: string
}
const everyone: Principal = { actorId: 'registry' }

export interface EditJournal {
  /** How a replica exchanges with the journal: in process, or behind a socket. */
  readonly transport: TransportClient
  /** Calls `listener` after each commit, so a socket can wake its replica. */
  readonly changes: (listener: () => void) => () => void
  readonly close: () => void
}

const documentId = 'registry-edits'
const decodeMessage = Schema.decodeUnknownSync(Message)
const normalize = Option.liftThrowable(RegistrySync.codec.normalizeOperation)
/** The id an operation names, read without trusting the rest of it. */
const idOf = (input: unknown): Option.Option<string> =>
  Option.map(
    Schema.decodeUnknownOption(Schema.Struct({ opId: Schema.String }))(input),
    ({ opId }) => opId,
  )

/** The journal, applying each committed change through `apply`. */
export const openJournal = (apply: (change: ProductChange) => void): EditJournal => {
  const scope = Effect.runSync(Scope.make())
  const durable = Effect.runSync(
    Journal.make<Operation, Shared, Principal>({
      // The contract gives the codecs, the empty snapshot and the reducer, so
      // the journal folds operations with the application's own update.
      ...journalContract(),
      file: ':memory:',
      opId: operation => OpId.make(operation.opId),
      actorId: principal => ActorId.make(principal.actorId),
      validate: ({ key, operation, cursor }) => {
        if (String(operation.documentId) !== String(key)) throw new Error('Wrong document')
        if (operation.baseCursor > cursor)
          throw new Error('Operation cursor is ahead of the server')
      },
    }).pipe(Effect.provideService(Scope.Scope, scope)),
  )
  const key = DocumentId.make(documentId)

  // Operations at or before `applied` have every change in the table.
  let applied = Cursor.make(0)
  const intents = (operation: Operation) =>
    Match.value(decodeMessage(operation.message)).pipe(
      Match.tag('EditedProducts', ({ changes }) =>
        changes.map((change, index) => ({
          key: `${operation.opId}:${index}`,
          run: Effect.sync(() => apply(change)),
        })),
      ),
      Match.orElse(() => []),
    )
  const settle = () => {
    applied = Effect.runSync(durable.recover({ key, from: applied, intents }))
  }

  const listeners = new Set<() => void>()
  const transport: TransportClient = {
    exchange: async (cursor, pending) => {
      const rejected: string[] = []
      const acknowledged: string[] = []
      for (const input of pending) {
        const decoded = normalize(input)
        if (Option.isNone(decoded)) {
          // Its message breaks the schema. Refused by its id, the replica drops
          // it; failing the exchange would have it sent again, blocking every
          // edit behind it. A body with no id is no operation.
          rejected.push(Option.getOrThrowWith(idOf(input), () => new Error('No operation id')))
          continue
        }
        const operation = decoded.value
        Effect.runSync(
          durable.append(key, operation, everyone).pipe(
            Effect.map(appended =>
              // Already committed is acknowledged too: a replica resends after a lost reply.
              acknowledged.push(
                Match.valueTags(appended, {
                  Committed: ({ committed }): string => committed.operation.opId,
                  AlreadyCommitted: ({ opId }): string => opId,
                }),
              ),
            ),
            Effect.catchTags({
              OperationRejectedError: error => Effect.sync(() => rejected.push(error.opId)),
              InvalidOperationError: () => Effect.sync(() => rejected.push(operation.opId)),
            }),
          ),
        )
      }
      // Every exchange settles, so a change whose write failed is tried again.
      settle()
      if (acknowledged.length > 0) for (const listener of listeners) listener()
      const operations: ReadonlyArray<CommittedOperation> = Effect.runSync(
        durable.read(key, Cursor.make(cursor)),
      ).map(committed =>
        RegistrySync.codec.committedFrom(
          {
            ...committed.operation,
            serverSequence: committed.sequence,
            actorId: committed.actorId,
          },
          SyncDocumentId.make(documentId),
        ),
      )
      return { operations, rejected, acknowledged }
    },
  }
  return {
    transport,
    changes: listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    close: () => Effect.runSync(Scope.close(scope, Exit.void)),
  }
}
