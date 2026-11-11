/**
 * A decoded `Operation` holds the current Message and names no version, so
 * read as written it would be version 1 and upcast again. Only Sync makes a
 * `WrittenOperation`: these are where a server would hand it the wrong one.
 */
import { Effect, Option } from 'effect'
import type { Journal } from 'foldkit-durable/core'
import type { Operation, WrittenOperation } from '../src/index.js'
import { editsJournal } from '../src/journal.js'
import { Todos } from './fixtures/todos-contract.js'

type Shared = { readonly todos: ReadonlyArray<{ readonly id: string; readonly title: string }> }
declare const journal: Journal<Operation, Shared, string, WrittenOperation>
declare const decoded: Operation
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
