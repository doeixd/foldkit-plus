/**
 * The journal's rules and its serving, apart from where it runs: the Node
 * server's file journal (`journal.ts`) and the sandbox's in the browser
 * (`sandbox/host.ts`) share them. Browser-safe: `foldkit-durable/core`, never
 * the Node entry.
 */
import { Effect, Option, Schema } from 'effect'
import {
  ActorId,
  DocumentId,
  OpId,
  type Journal,
  type JournalStoreOptions,
} from 'foldkit-durable/core'
import type { Operation, SocketLike, TransportClient } from 'foldkit-sync'
import { journalExchange, serveJournal } from 'foldkit-sync/journal'
import { Message, type Shared } from './app.js'
import { PagesSync } from './contract.js'

/** Who exchanges: a tab, or the server committing its own operations. */
export interface Principal {
  readonly actorId: string
}

/** The actor, and replica, the server commits its own operations as. No tab can be it. */
export const SERVER = 'server'

/**
 * The tab a connection says it is, where it may be one: always `tab-…`, so a
 * connection cannot act as the server or take another's odd name. A real
 * deployment authenticates instead.
 */
export const tabOf = (name: string | null): Option.Option<string> =>
  name !== null && name.startsWith('tab-') && name !== SERVER ? Option.some(name) : Option.none()

const pages = DocumentId.make('pages')
const decodeMessage = Schema.decodeUnknownSync(Message)

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

/** The journal's options, wherever its database is. */
export const journalOptions = (): JournalStoreOptions<Operation, Shared, Principal> => ({
  ...PagesSync.journalContract(),
  // A page is large and an edit small: the pages are written once every 50 edits,
  // and a load replays the edits since.
  snapshotEvery: 50,
  opId: operation => OpId.make(operation.opId),
  actorId: principal => ActorId.make(principal.actorId),
  authorize: ({ principal, operation }) =>
    principal.actorId === SERVER ||
    !collects(operation) || { allowed: false, reason: 'only the server collects' },
})

/**
 * The server over a journal: the exchange each tab's transport calls, a socket served as a
 * tab, and the collection of deleted text. Every page edit is appended, reduced by the same
 * `update` the replicas run, and read back by the others after their cursor.
 */
export const servingOn = (
  journal: Journal<Operation, Shared, Principal>,
  options: { readonly limit?: number | undefined } = {},
) => {
  const exchangeAs = (actorId: string) => ({
    sync: PagesSync,
    journal,
    principal: { actorId },
    limit: options.limit,
  })
  return {
    transport: (actorId: string): TransportClient => journalExchange(exchangeAs(actorId)),
    /** Serves one socket as the tab `actorId`: its exchanges, and a notice after each commit. */
    serve: (socket: SocketLike, actorId: string): (() => void) =>
      serveJournal(socket, exchangeAs(actorId)),
    /**
     * Collects deleted text: one `Collect` op per page that holds any, committed by the
     * server like any edit, so every replica applies it at the same place in the order.
     * Text deleted before the previous collection is removed, so a tab offline across two of
     * them finds its anchors on that text gone, and its typing there lands at the end of the
     * block, or of the block that one was joined into.
     */
    collect: Effect.gen(function* () {
      for (const page of (yield* journal.load(pages)).snapshot.pages) {
        if (!collectable(page)) continue
        const cursor = yield* journal.cursor(pages)
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
        yield* journal.append(pages, operation, { actorId: SERVER })
      }
    }),
  }
}
