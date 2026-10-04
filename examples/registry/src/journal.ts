/**
 * The edits' journal: `foldkit-durable` keeps the document's operations in the
 * order it commits them, and applies each committed edit to the products table.
 *
 * The exchange itself is `foldkit-sync/journal`'s: what a replica sends is
 * appended, refused operations are rejected by their id, and the reply is
 * what committed since. What is this registry's own is applying an edit.
 *
 * The table is derived: the seed with every committed edit applied. Applying is
 * the journal's effect recovery: each change is an intent keyed by its
 * operation and position, run once and recorded, and `recover` advances only
 * past operations whose intents all ran. Writing a field to a value is
 * idempotent, so an intent run again after a crash writes the same thing.
 */
import { Effect, Exit, Match, Schema, Scope } from 'effect'
import { ActorId, Cursor, DocumentId, Journal, OpId } from 'foldkit-durable'
import type { Operation, SocketLike, TransportClient } from 'foldkit-sync'
import { journalExchange, serveJournal } from 'foldkit-sync/journal'
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
  /** Serves one socket: its exchanges, and a notice after each commit. Returns the stop. */
  readonly serve: (socket: SocketLike) => () => void
  readonly close: () => void
}

const decodeMessage = Schema.decodeUnknownSync(Message)

/** The journal, applying each committed change through `apply`. */
export const openJournal = (apply: (change: ProductChange) => void): EditJournal => {
  const scope = Effect.runSync(Scope.make())
  const journal = Effect.runSync(
    Journal.make<Operation, Shared, Principal>({
      // The contract gives the codecs, the empty snapshot and the reducer, so
      // the journal folds operations with the application's own update.
      ...journalContract(),
      file: ':memory:',
      opId: operation => OpId.make(operation.opId),
      actorId: principal => ActorId.make(principal.actorId),
      validate: ({ operation, cursor }) => {
        if (operation.baseCursor > cursor)
          throw new Error('Operation cursor is ahead of the server')
      },
    }).pipe(Effect.provideService(Scope.Scope, scope)),
  )
  const key = DocumentId.make(RegistrySync.documentId)

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
  // Suspended, so each exchange recovers from where the last one got to.
  const settle = Effect.suspend(() =>
    Effect.map(journal.recover({ key, from: applied, intents }), cursor => {
      applied = cursor
    }),
  )

  const options = { sync: RegistrySync, journal, principal: everyone, settle }
  return {
    transport: journalExchange(options),
    serve: socket => serveJournal(socket, options),
    close: () => Effect.runSync(Scope.close(scope, Exit.void)),
  }
}
