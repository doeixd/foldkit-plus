/**
 * The sandbox's server, wherever it runs: the products table on sql.js and the
 * journal on SQLite compiled to WebAssembly, both in memory, seeded with fewer
 * products than `pnpm dev`'s so it starts quickly. The same server code as
 * `pnpm dev`'s: Remote's handlers for reads, the journal for each device's
 * socket, and the absorbing clock, each over a conversation's port.
 */
import * as WasmClient from '@effect/sql-sqlite-wasm/SqliteClient'
import { Effect, Layer, ManagedRuntime, Match } from 'effect'
import type { ConversationHandler } from 'foldkit-primitives/net'
import { Journal } from 'foldkit-durable/core'
import { RemoteServer } from 'foldkit-remote-server'
import { servePort } from 'foldkit-remote-server/port'
import { portSocket, type Operation } from 'foldkit-sync'
import initSqlJs from 'sql.js'
import wasm from 'sql.js/dist/sql-wasm.wasm?url'
import { journalOptions, openJournal } from '../journal.js'
import { openServer } from '../server.js'
import type { Principal, Shared } from '../sync.js'
import type { Opening } from './protocol.js'
import { sqlJsSqlite } from './sqliteSqlJs.js'

const Edits = Journal.define<Operation, Shared, Principal>('registry/Edits')

/** Starts the server, and returns what it does with each conversation a page opens. */
export const openHost = async (): Promise<ConversationHandler<Opening>> => {
  const SQL = await initSqlJs({ locateFile: () => wasm })
  const backend = openServer(sqlJsSqlite(new SQL.Database()), { count: 10_000 })
  const handlers = RemoteServer.handlers(backend.server, null)
  // The journal and its database live as long as the host: the runtime is
  // never disposed, since the host lasts as long as its worker or page.
  const runtime = ManagedRuntime.make(
    Edits.layer(journalOptions(backend)).pipe(
      Layer.provide(WasmClient.layerMemory({})),
      Layer.orDie,
    ),
  )
  const journal = openJournal(backend, await runtime.runPromise(Effect.service(Edits.tag)))
  setInterval(() => {
    void Effect.runPromise(journal.absorb).catch(error =>
      console.error('Could not record what the table holds', error),
    )
  }, 5_000)

  return (opening, { port, signal }) =>
    Match.valueTags(opening, {
      RemoteOpening: () => {
        Effect.runFork(
          servePort(handlers, port).pipe(
            Effect.provide(backend.layer),
            Effect.catchCause(cause => Effect.logError('Remote over a port failed', cause)),
          ),
          { signal },
        )
      },
      // The device a page says it is: a sandbox has no sign-in, so this is trusted.
      // The socket closes, and the journal stops serving it, when the page goes.
      SyncOpening: ({ device }) => {
        journal.serve(portSocket(port, { signal }), { actorId: device })
      },
    })
}
