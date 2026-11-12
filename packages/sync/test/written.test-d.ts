/**
 * A decoded `Operation` holds the current Message and names no version, so
 * read as written it would be version 1 and upcast again. Only Sync makes a
 * `WrittenOperation`: these are where a server would hand it the wrong one.
 */
import { Effect, Option } from 'effect'
import type { Journal } from 'foldkit-durable/core'
import {
  Sync,
  type Operation,
  type SocketLike,
  type TransportClient,
  type WrittenOperation,
} from '../src/index.js'
import { editsJournal } from '../src/journal.js'
import { Todos } from './fixtures/todos-contract.js'

type Shared = { readonly todos: ReadonlyArray<{ readonly id: string; readonly title: string }> }
declare const journal: Journal<Operation, Shared, string, WrittenOperation>
declare const decoded: Operation
declare const socket: SocketLike
declare const key: Parameters<typeof journal.append>[0]

// @ts-expect-error a decoded operation is not one as written
export const written: WrittenOperation = decoded
// @ts-expect-error the journal is given an operation as written
journal.append(key, decoded, 'server')
// Writing it at the current version is what makes one.
journal.append(key, Todos.journalContract().operation.encode(decoded), 'server')

editsJournal({
  documentId: 'todos',
  journal,
  editsOf: () => Option.none(),
  apply: () => Effect.void,
  tableRevision: Effect.succeed(0),
  holdsThrough: () => false,
  // @ts-expect-error a server's own operation is appended as written
  absorbed: () => decoded,
  server: 'server',
})

// What arrives from a wire is unread (#517): only `codec.writtenFrom` makes it
// an entry the journal takes, since that is where a sent entry is checked.
Sync.transport.serve(socket, {
  exchange: (_cursor, pending) =>
    Effect.runPromise(
      // @ts-expect-error a socket's entry is unread until `codec.writtenFrom` reads it
      Effect.forEach(pending, entry => journal.append(key, entry, 'server')),
    ),
})
Sync.transport.serve(socket, {
  exchange: (_cursor, pending) =>
    Effect.runPromise(
      Effect.forEach(pending, entry =>
        journal.append(key, Todos.codec.writtenFrom(entry, Todos.documentId), 'server'),
      ),
    ),
})
export const custom: TransportClient = {
  exchange: (_cursor, pending) =>
    // @ts-expect-error a client's entry is unread too
    Effect.runPromise(journal.append(key, pending[0]!, 'server')),
}
export const loopback = Sync.transport.loopback((_cursor, pending) =>
  // @ts-expect-error so is an in-process handler's
  Effect.runPromise(journal.append(key, pending[0]!, 'server')),
)
// What a retransmission is compared by is no entry the journal takes: it skips the sent checks.
declare const sent: unknown
// @ts-expect-error `compared` reads an entry for its hash, not for appending
journal.append(key, Todos.journalContract().operation.compared(sent), 'server')
