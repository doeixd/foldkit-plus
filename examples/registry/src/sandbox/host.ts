/**
 * The sandbox's server, wherever it runs: the products table on sql.js and the
 * journal on SQLite compiled to WebAssembly, both in memory, seeded with fewer
 * products than `pnpm dev`'s so it starts quickly. The same server code as
 * `pnpm dev`'s: `RemoteServer.answer` for reads, `serveJournal` for each
 * device's socket, and the absorbing clock.
 */
import * as WasmClient from '@effect/sql-sqlite-wasm/SqliteClient'
import { Effect, Layer, ManagedRuntime, Match } from 'effect'
import { Journal } from 'foldkit-durable/core'
import { RemoteServer } from 'foldkit-remote-server'
import { portSocket, type Operation } from 'foldkit-sync'
import initSqlJs from 'sql.js'
import wasm from 'sql.js/dist/sql-wasm.wasm?url'
import { journalOptions, openJournal } from '../journal.js'
import { openServer } from '../server.js'
import type { Principal, Shared } from '../sync.js'
import type { Opening, RemoteAnswer, RemoteRequest } from './protocol.js'
import { sqlJsSqlite } from './sqliteSqlJs.js'

/** Answers each conversation a pane opens with `connect`. */
export interface Host {
  readonly connect: (opening: Opening, port: MessagePort) => void
}

const Edits = Journal.define<Operation, Shared, Principal>('registry/Edits')

export const openHost = async (): Promise<Host> => {
  const SQL = await initSqlJs({ locateFile: () => wasm })
  const backend = openServer(sqlJsSqlite(new SQL.Database()), { count: 10_000 })
  const handlers = RemoteServer.handlers(backend.server, null)
  // The journal and its database live as long as the host: the runtime is
  // never disposed, since the host lasts as long as its worker or page.
  const runtime = ManagedRuntime.make(
    Edits.layer(journalOptions()).pipe(Layer.provide(WasmClient.layerMemory({})), Layer.orDie),
  )
  const journal = openJournal(backend.apply, await runtime.runPromise(Effect.service(Edits.tag)))
  setInterval(() => {
    void Effect.runPromise(journal.absorb).catch(error =>
      console.error('Could not record what the table holds', error),
    )
  }, 5_000)

  const answer = (port: MessagePort) => {
    port.addEventListener('message', (event: MessageEvent<RemoteRequest>) => {
      const { id, request } = event.data
      void Effect.runPromise(
        RemoteServer.answer(handlers, JSON.parse(request)).pipe(Effect.provide(backend.layer)),
      ).then(answered => port.postMessage({ id, body: answered.body } satisfies RemoteAnswer))
    })
    port.start()
  }

  return {
    connect: (opening, port) =>
      Match.valueTags(opening, {
        RemoteOpening: () => answer(port),
        // The device a pane says it is: a sandbox has no sign-in, so this is trusted.
        SyncOpening: ({ device }) => {
          journal.serve(portSocket(port), { actorId: device })
        },
      }),
  }
}
