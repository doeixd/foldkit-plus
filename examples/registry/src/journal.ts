/**
 * The edits' journal: `foldkit-durable` keeps the document's operations in the
 * order it commits them, and applies each committed edit to the products table.
 *
 * The exchange itself is `foldkit-sync/journal`'s: what a replica sends is
 * appended, refused operations are rejected by their id, and the reply is
 * what committed since. What is this registry's own is applying an edit.
 *
 * The table is the journal's read model: the seed with every committed edit
 * applied, by `editsJournal` from `foldkit-sync/journal`. Each change is a
 * recovery intent, keyed by the journal's epoch, its operation and position,
 * run once and recorded; recovery starts at the journal's floor and advances
 * only past operations whose intents all ran. A write carries the sequence it
 * committed at and never moves a row back, so an intent run again after a
 * crash changes nothing a later one wrote. What is this registry's own is the
 * write, and the Messages it reads and records.
 *
 * Once the table holds edits, `absorb` says so in the journal itself, as the
 * server: the replicas drop them, and the log behind them is compacted.
 */
import { Effect, Match, Option, Schema } from 'effect'
import { ActorId, OpId, type Journal, type JournalStoreOptions } from 'foldkit-durable/core'
import {
  Sync,
  localSequence,
  opId,
  replicaId,
  sequence,
  type Operation,
  type SocketLike,
  type TransportClient,
} from 'foldkit-sync'
import { editsJournal, journalExchange, serveJournal } from 'foldkit-sync/journal'
import { Message } from './app.js'
import { type ProductChange, ProductEdits } from './domain.js'
import {
  RegistrySync,
  everyone,
  journalContract,
  server,
  type Principal,
  type Shared,
} from './sync.js'

export interface EditJournal {
  /** How a replica exchanges with the journal: in process, or behind a socket. */
  readonly transport: TransportClient
  /** The same in process, as one device: what a test of two devices exchanges through. */
  readonly transportAs: (principal: Principal) => TransportClient
  /**
   * Serves one socket: its exchanges, as `principal`, a notice after each
   * commit, and presence, where each device is. Returns the stop. A connection that says who it is (a sandbox's
   * device) passes it; otherwise every client is one author.
   */
  readonly serve: (socket: SocketLike, principal?: Principal) => () => void
  /**
   * Records that the table holds every edit through the recovery cursor, if
   * the replicated edits still keep one, and compacts the log behind it.
   * Batched by whoever calls it (`http.ts` does on a clock), since each record
   * is a commit every replica hears of.
   */
  readonly absorb: Effect.Effect<void, unknown>
}

const decodeMessage = Schema.decodeUnknownSync(Message)
const encodeMessage = Schema.encodeSync(Message)

/** The products table, as the journal writes and checks it (`openServer` gives one). */
export interface ProductTable {
  /** Writes a committed change, with the sequence it committed at. */
  readonly apply: (change: ProductChange, at: number) => void
  /** The highest revision any row holds. */
  readonly revision: () => number
  /** Whether the table has the product. */
  readonly holds: (id: string) => boolean
}

/**
 * How the journal is opened, wherever it runs: over a `node:sqlite` file
 * (`journalNode.ts`) or SQLite compiled to WebAssembly in a browser.
 */
export const journalOptions = (
  table: ProductTable,
): JournalStoreOptions<Operation, Shared, Principal> => ({
  // The contract gives the codecs, the empty snapshot and the reducer, so
  // the journal folds operations with the application's own update.
  ...journalContract(),
  opId: operation => OpId.make(operation.opId),
  actorId: principal => ActorId.make(principal.actorId),
  validate: ({ operation, cursor }) => {
    if (operation.baseCursor > cursor) throw new Error('Operation cursor is ahead of the server')
    // When an edit committed is the journal's to say: one that says so
    // itself claims a commit it did not get, and its sender would show it
    // as committed.
    const message = decodeMessage(operation.message)
    const claimsCommit = Match.value(message).pipe(
      Match.tag('EditedProducts', ({ at, by }) => at !== undefined || by !== undefined),
      Match.orElse(() => false),
    )
    if (claimsCommit) throw new Error('An edit cannot say when it committed')
    // An edit to a product the table has not got would commit, change no row,
    // and vanish once absorbed: refused here, so its sender is told.
    const missing = Match.value(message).pipe(
      Match.tag('EditedProducts', ({ changes }) => changes.some(change => !table.holds(change.id))),
      Match.orElse(() => false),
    )
    if (missing) throw new Error('An edit names a product the table has not got')
  },
})

/** The journal's exchange, applying each committed change to `table`. */
export const openJournal = (
  table: ProductTable,
  journal: Journal<Operation, Shared, Principal>,
): EditJournal => {
  const { settle, absorb } = editsJournal({
    documentId: RegistrySync.documentId,
    journal,
    editsOf: operation =>
      Match.value(decodeMessage(operation.message)).pipe(
        Match.tag('EditedProducts', ({ changes, at }) =>
          Option.some({ changes, at: Option.fromUndefinedOr(at) }),
        ),
        Match.orElse(() => Option.none()),
      ),
    // A write that throws fails the intent rather than dying, so recovery
    // stops there and the next exchange tries it again.
    apply: (change, at) => Effect.try(() => table.apply(change, at)),
    tableRevision: Effect.try(() => table.revision()),
    holdsThrough: (snapshot, through) => ProductEdits.holdsThrough(snapshot.edits, through),
    // The server writes as a producer of its own, sequenced from the
    // authoritative cursor, which only advances and keeps each id unique.
    absorbed: (through, cursor) => ({
      protocolVersion: 1,
      schemaVersion: 1,
      documentId: RegistrySync.documentId,
      replicaId: replicaId(server.actorId),
      localSequence: localSequence(cursor + 1),
      opId: opId(`${server.actorId}:${cursor + 1}`),
      baseCursor: sequence(cursor),
      message: encodeMessage(Message.AbsorbedEdits({ through })),
    }),
    server,
  })

  const options = { sync: RegistrySync, journal, principal: everyone, settle }
  // Presence fans out to every device; each validates what it receives.
  const presence = Sync.presence.hub<unknown>()
  return {
    transport: journalExchange(options),
    transportAs: principal => journalExchange({ ...options, principal }),
    serve: (socket, principal = everyone) => {
      const stops = [
        serveJournal(socket, { ...options, principal }),
        // On the same socket: where each device is, under the name it connected as.
        Sync.presence.serve(socket, presence, { peerId: principal.actorId }),
      ]
      return () => {
        for (const stop of stops) stop()
      }
    },
    absorb,
  }
}
