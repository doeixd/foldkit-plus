/**
 * The sandbox's server: the same journal `pnpm dev` runs, on SQLite compiled
 * to WebAssembly and held in memory, in a SharedWorker every tab shares (or in
 * the page, where a browser has none). It lives while a tab of the sandbox is
 * open; the next one after the last closes starts a new history.
 */
import * as WasmClient from '@effect/sql-sqlite-wasm/SqliteClient'
import { Effect, Layer, ManagedRuntime } from 'effect'
import { Journal } from 'foldkit-durable/core'
import type { ConversationHandler } from 'foldkit-primitives/net'
import { portSocket, type Operation } from 'foldkit-sync'
import type { Shared } from '../app.js'
import type { SyncPrincipal } from '../principal.js'
import { journalOptions, serveAs } from '../serving.js'
import { TodoSync } from '../sync.js'
import type { SyncOpening } from './opening.js'

const Todos = Journal.define<Operation, Shared, SyncPrincipal>('todo-app/Todos')

/** Starts the journal, and returns what it does with each conversation a tab opens. */
export const openHost = async (): Promise<ConversationHandler<SyncOpening>> => {
  // The journal and its database live as long as the host: the runtime is
  // never disposed, since the host lasts as long as its worker or page.
  const runtime = ManagedRuntime.make(
    Todos.layer(journalOptions()).pipe(Layer.provide(WasmClient.layerMemory({})), Layer.orDie),
  )
  const serve = serveAs(await runtime.runPromise(Effect.service(Todos.tag)))
  return ({ token }, { port, signal }) => {
    // The dev server's sign-in, unchanged: the token names the actor. A sandbox
    // has no accounts, so whoever opens it is whoever the address says.
    serve(portSocket(port, { signal }), {
      actorId: token,
      documentId: String(TodoSync.documentId),
      canWrite: true,
    })
  }
}
