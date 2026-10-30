/**
 * The server on the published demo's database, SQLite compiled to
 * WebAssembly (sql.js), which turns foreign keys off unless asked: a deleted
 * chirp's likes go with it there too, as they do on Node's SQLite.
 */
import { drizzle } from 'drizzle-orm/sql-js'
import { Effect } from 'effect'
import { RemoteServer } from 'foldkit-remote-server'
import initSqlJs from 'sql.js'
import wasm from 'sql.js/dist/sql-wasm.wasm?url'
import { expect, it } from 'vitest'
import { openServer, principalOf } from '../src/server/server.js'

it("deletes a chirp's likes with it", async () => {
  const SQL = await initSqlJs({ locateFile: () => wasm })
  const database = new SQL.Database()
  const { server, database: layer } = openServer({
    fresh: true,
    exec: statements => database.exec(statements),
    drizzle: drizzle(database),
  })
  const deleted = await Effect.runPromise(
    RemoteServer.handlers(server, principalOf('grace'))
      .FoldkitRemoteMutate({ requestId: 'r', mutation: 'DeletePost', input: { id: 'p2' } })
      .pipe(Effect.result, Effect.provide(layer)),
  )
  // Grace's own chirp, which Ada and Linus like.
  expect(deleted._tag).toBe('Success')
  expect(database.exec("select count(*) from likes where post_id = 'p2'")[0]!.values).toEqual([[0]])
})
