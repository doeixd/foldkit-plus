import { Effect, Exit, Fiber, Scope, Stream } from 'effect'
import {
  ActorId,
  Cursor,
  DocumentId,
  Journal,
  OpId,
  Sequence,
  type AppendResult as DurableAppendResult,
  type Committed as DurableCommitted,
} from 'foldkit-durable'
import { journalExchange } from 'foldkit-sync/journal'
import {
  DocumentId as SyncDocumentId,
  type CommittedOperation as Committed,
  type Operation,
  type TransportClient,
} from 'foldkit-sync'
import { decodeMessage, type Message, type Shared } from './app.js'
import { TodoSync } from './sync.js'

/** Supplied by a trusted transport, never decoded from an operation. */
export interface Principal {
  readonly actorId: string
  readonly documentId: string
  readonly canWrite: boolean
}

/** What the application's authorization policy sees before an operation commits. */
export interface AuthorizationRequest {
  readonly principal: Principal
  readonly message: Message
  readonly model: Shared
}

/** Decides whether a principal may commit an operation against the current Model. */
export type Authorize = (request: AuthorizationRequest) => boolean

/** An externally visible effect a committed operation triggers server-side. */
export interface ServerEffect {
  readonly name: string
  readonly run: () => Promise<void>
}

export interface JournalPolicy {
  /** Defaults to allowing; an authenticated write still requires `Principal.canWrite`. */
  readonly authorize?: Authorize
  /**
   * Effects a committed operation triggers. Recorded successes are reused;
   * uncertain outcomes can run again. This example keys effects by array position,
   * so its policy must not reorder effects for previously committed operations.
   */
  readonly effects?: (message: Message) => ReadonlyArray<ServerEffect>
  /** At most this many committed operations per exchange; a replica far behind asks again. Default 500. */
  readonly page?: number
}

export interface ServerJournal {
  readonly append: (input: unknown, principal: Principal) => Committed
  readonly appendAsServer: (message: Message, principal: Principal, producer: string) => Committed
  readonly settle: (committed: Committed) => Promise<void>
  readonly read: (documentId: string, after: number) => ReadonlyArray<Committed>
  readonly compact: (documentId: string, through: number) => void
  readonly snapshot: (documentId: string) => { cursor: number; model: Shared }
  readonly subscribe: (listener: (key: string) => void) => () => void
  readonly transport: (principal: Principal) => TransportClient
  readonly close: () => void
}

/**
 * The sync server's journal: the Effect-native durable package configured for
 * this application, exposed through the synchronous and promise seams the
 * Foldkit runtime, agent host, and replica still speak.
 *
 * `node:sqlite` is synchronous, so the reads and writes run to completion here;
 * only settling an effect can suspend.
 */
export const openJournal = (path: string, policy: JournalPolicy = {}): ServerJournal => {
  const authorize = policy.authorize
  const effectsFor = policy.effects
  const page = policy.page ?? 500
  const scope = Effect.runSync(Scope.make())
  const durable: Journal<Operation, Shared, Principal> = (() => {
    try {
      return Effect.runSync(
        Journal.make<Operation, Shared, Principal>({
          // The replica contract also produces the durable journal's codecs,
          // initial snapshot, and replay, so they are not written twice.
          ...TodoSync.journalContract(),
          file: path,
          opId: operation => OpId.make(operation.opId),
          actorId: principal => ActorId.make(principal.actorId),
          validate: ({ key, operation, cursor }) => {
            if (String(operation.documentId) !== String(key)) throw new Error('Wrong document')
            if (operation.baseCursor > cursor)
              throw new Error('Operation cursor is ahead of the server')
          },
          ...(authorize === undefined
            ? {}
            : {
                authorize: ({ principal, operation, snapshot }) =>
                  authorize({
                    principal,
                    message: decodeMessage(operation.message),
                    model: snapshot,
                  }),
              }),
        }).pipe(Effect.provideService(Scope.Scope, scope)),
      )
    } catch (error) {
      Effect.runSync(Scope.close(scope, Exit.void))
      throw error
    }
  })()

  /** The durable record, flattened into the wire shape the protocol exchanges. */
  const toCommitted = (committed: DurableCommitted<Operation>, documentId: string): Committed =>
    TodoSync.codec.committedFrom(
      { ...committed.operation, serverSequence: committed.sequence, actorId: committed.actorId },
      SyncDocumentId.make(documentId),
    )

  const appendResult = (input: unknown, principal: Principal): DurableAppendResult<Operation> => {
    if (!principal.actorId || !principal.canWrite) throw new Error('Unauthorized operation')
    return Effect.runSync(durable.append(DocumentId.make(principal.documentId), input, principal))
  }

  const append = (input: unknown, principal: Principal): Committed => {
    const result = appendResult(input, principal)
    if (result._tag === 'AlreadyCommitted')
      throw new Error(
        `Operation "${result.opId}" was already committed and its payload was compacted`,
      )
    return toCommitted(result.committed, principal.documentId)
  }

  const snapshot = (documentId: string): { cursor: number; model: Shared } => {
    const { cursor, snapshot: model } = Effect.runSync(durable.load(DocumentId.make(documentId)))
    return { cursor, model }
  }

  /**
   * Appends a Message a server-side producer authored, sequencing it from the
   * authoritative cursor.
   *
   * A server producer has no local outbox and no persisted sequence, so it
   * cannot supply a genuine per-replica counter. The cursor only advances, which
   * keeps the operation identity unique and survives a restart; `producer`
   * labels who authored it in the log.
   */
  const appendAsServer = (message: Message, principal: Principal, producer: string): Committed => {
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

  /** An operation's effects, each keyed by its document, operation and position. */
  const intentsOf = (operation: Pick<Operation, 'opId' | 'message'>, documentId: string) =>
    (effectsFor?.(decodeMessage(operation.message)) ?? []).map((effect, index) => ({
      key: `${documentId}/${operation.opId}/command/${index}`,
      run: Effect.tryPromise({ try: () => effect.run(), catch: error => error }),
    }))

  /** Where each document's effects have settled up to, in this process. */
  const settled = new Map<string, Cursor>()

  /**
   * Settles the effects of every operation committed since the last settle, as
   * an exchange's `settle`: recorded successes are reused, and an effect that
   * fails stops the cursor there, so the next exchange tries it again. A new
   * process starts from the compacted floor, below which nothing is left to run.
   */
  const settleThrough = (documentId: string) =>
    Effect.gen(function* () {
      const key = DocumentId.make(documentId)
      const from = settled.get(documentId) ?? Cursor.make(yield* durable.floor(key))
      const through = yield* durable.recover({
        key,
        from,
        intents: operation => intentsOf(operation, documentId),
      })
      settled.set(documentId, through)
    })

  /**
   * Runs the effects a committed operation declared, once each.
   *
   * The ledger keys each effect to the document and operation, so a resend,
   * replay, or second call is a no-op.
   */
  const settle = async (committed: Committed): Promise<void> => {
    for (const intent of intentsOf(committed, committed.documentId))
      await Effect.runPromise(durable.runEffect(intent.key, intent.run))
  }

  return {
    append,
    appendAsServer,
    settle,
    read,
    compact: (documentId, through) =>
      Effect.runSync(durable.compact(DocumentId.make(documentId), Sequence.make(through))),
    snapshot,
    // The agent host still registers a callback; the journal's subscription is
    // a Stream, so this is the edge where it is bridged back.
    subscribe: listener => {
      const fiber = Effect.runFork(
        Stream.runForEach(durable.subscribe, key =>
          Effect.sync(() => listener(key)).pipe(Effect.catchCause(() => Effect.void)),
        ),
      )
      return () => Effect.runSync(Fiber.interrupt(fiber))
    },
    // The exchange is `foldkit-sync/journal`'s: an operation it cannot take is
    // rejected by its id, so the edits behind it still go, and a principal that
    // may only read has every operation refused. Effects settle after the appends
    // and before the reply, so a resend after a lost reply finds them recorded.
    transport: (principal: Principal): TransportClient => {
      const exchange = journalExchange({
        sync: TodoSync,
        journal: durable,
        principal,
        limit: page,
        admit: () => principal.canWrite,
        settle: settleThrough(principal.documentId),
      })
      return {
        exchange: (cursor, pending, epoch) =>
          principal.actorId
            ? exchange.exchange(cursor, pending, epoch)
            : Promise.reject(new Error('Unauthenticated reader')),
      }
    },
    close: () => {
      Effect.runSync(Scope.close(scope, Exit.void))
    },
  }
}
