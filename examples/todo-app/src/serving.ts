/**
 * How the journal is opened and served, apart from where it runs: Node's file
 * journal (`journal.ts`) and the sandbox's in the browser (`sandbox/host.ts`)
 * share it. Browser-safe: `foldkit-durable/core`, never the Node entry.
 */
import { ActorId, OpId, type Journal, type JournalStoreOptions } from 'foldkit-durable/core'
import type { Operation, SocketLike } from 'foldkit-sync'
import { serveJournal } from 'foldkit-sync/journal'
import type { Shared } from './app.js'
import type { SyncPrincipal } from './principal.js'
import { TodoSync, journalContract } from './sync.js'

/** The journal's options, wherever its database is. */
export const journalOptions = (): JournalStoreOptions<Operation, Shared, SyncPrincipal> => ({
  // The contract produces the journal's codecs, initial snapshot, and
  // reducer, and its `authorize` rules: none is written twice, and the
  // policy declared in `sync.ts` is the policy this journal enforces.
  ...journalContract(),
  opId: operation => OpId.make(operation.opId),
  actorId: principal => ActorId.make(principal.actorId),
  validate: ({ key, operation, cursor }) => {
    if (String(operation.documentId) !== String(key)) throw new Error('Wrong document')
    if (operation.baseCursor > cursor) throw new Error('Operation cursor is ahead of the server')
  },
})

/**
 * The shared exchange, as one principal: one that may only read has every
 * operation refused, unread by the journal.
 */
export const exchangeAs = (
  journal: Journal<Operation, Shared, SyncPrincipal>,
  principal: SyncPrincipal,
) => ({ sync: TodoSync, journal, principal, refuse: () => !principal.canWrite })

/** Serves one socket as `principal`: its exchanges, and a notice after each commit. */
export const serveAs =
  (journal: Journal<Operation, Shared, SyncPrincipal>) =>
  (socket: SocketLike, principal: SyncPrincipal): (() => void) =>
    serveJournal(socket, exchangeAs(journal, principal))
