/**
 * The edits' journal: `foldkit-durable` keeps the document's operations in the
 * order it commits them, and applies each committed edit to the products table.
 *
 * The exchange itself is `foldkit-sync/journal`'s: what a replica sends is
 * appended, refused operations are rejected by their id, and the reply is
 * what committed since. What is this registry's own is applying an edit.
 *
 * The table is the journal's read model: the seed with every committed edit
 * applied. Applying is the journal's effect recovery: each change is an intent
 * keyed by its operation and position, run once and recorded, and `recover`
 * advances only past operations whose intents all ran. A write carries the
 * sequence it committed at and never moves a row back, so an intent run again
 * after a crash changes nothing a later one wrote.
 *
 * Once the table holds edits, `absorb` says so in the journal itself, as the
 * server: the replicas drop them, and the log behind them is compacted.
 */
import { Effect, Exit, Match, Option, Schema, Scope } from 'effect'
import { ActorId, Cursor, DocumentId, Journal, OpId, Sequence } from 'foldkit-durable'
import type { Operation, SocketLike, TransportClient } from 'foldkit-sync'
import { journalExchange, serveJournal } from 'foldkit-sync/journal'
import { Message } from './app.js'
import type { ProductChange } from './domain.js'
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
  /** Serves one socket: its exchanges, and a notice after each commit. Returns the stop. */
  readonly serve: (socket: SocketLike) => () => void
  /**
   * Records that the table holds every edit through the recovery cursor, if
   * the replicated edits still keep one, and compacts the log behind it.
   * Batched by whoever calls it (`http.ts` does on a clock), since each record
   * is a commit every replica hears of.
   */
  readonly absorb: Effect.Effect<void, unknown>
  readonly close: () => void
}

const decodeMessage = Schema.decodeUnknownSync(Message)
const encodeMessage = Schema.encodeSync(Message)

/** Whether any edit kept in `edits` committed at or before `through`. */
const holdsThrough = (edits: Shared['edits'], through: number) =>
  edits.some(edit =>
    [
      Option.flatMap(edit.description, field => field.at),
      Option.flatMap(edit.cents, field => field.at),
    ].some(at => Option.exists(at, committed => committed <= through)),
  )

/** The journal, applying each committed change through `apply`. */
export const openJournal = (apply: (change: ProductChange, at: number) => void): EditJournal => {
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
        // When an edit committed is the journal's to say: one that says so
        // itself claims a commit it did not get, and its sender would show it
        // as committed.
        const claimsCommit = Match.value(decodeMessage(operation.message)).pipe(
          Match.tag('EditedProducts', ({ at }) => at !== undefined),
          Match.orElse(() => false),
        )
        if (claimsCommit) throw new Error('An edit cannot say when it committed')
      },
    }).pipe(Effect.provideService(Scope.Scope, scope)),
  )
  const key = DocumentId.make(RegistrySync.documentId)

  // Operations at or before `applied` have every change in the table.
  let applied = Cursor.make(0)
  const intents = (operation: Operation) =>
    Match.value(decodeMessage(operation.message)).pipe(
      Match.tag('EditedProducts', ({ changes, at }) =>
        changes.map((change, index) => ({
          key: `${operation.opId}:${index}`,
          // The stamp gave every committed edit its sequence; one without is
          // not this journal's, and fails rather than writing revision 0.
          run:
            at === undefined
              ? Effect.fail(new Error(`Edit ${operation.opId} committed without its sequence`))
              : // A write that throws fails the intent rather than dying, so
                // recovery stops there and the next exchange tries it again.
                Effect.try(() => apply(change, at)),
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

  // The server writes as a producer of its own, sequenced from the
  // authoritative cursor, which only advances and keeps each id unique.
  const absorb = Effect.gen(function* () {
    const through = applied
    const { snapshot, cursor } = yield* journal.load(key)
    if (!holdsThrough(snapshot.edits, through)) return
    yield* journal.append(
      key,
      {
        protocolVersion: 1,
        schemaVersion: 1,
        documentId: RegistrySync.documentId,
        replicaId: server.actorId,
        localSequence: cursor + 1,
        opId: `${server.actorId}:${cursor + 1}`,
        baseCursor: cursor,
        message: encodeMessage(Message.AbsorbedEdits({ through })),
      },
      server,
    )
    // What the log holds through `through` is in the table and gone from the
    // snapshot; a replica behind it is sent the snapshot instead.
    yield* journal.compact(key, Sequence.make(through))
  })

  const options = { sync: RegistrySync, journal, principal: everyone, settle }
  return {
    transport: journalExchange(options),
    serve: socket => serveJournal(socket, options),
    absorb,
    close: () => Effect.runSync(Scope.close(scope, Exit.void)),
  }
}
