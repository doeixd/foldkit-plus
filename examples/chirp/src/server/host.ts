/**
 * The demo's server: the same one the tests run, on SQLite compiled to
 * WebAssembly, in a SharedWorker every tab of the demo shares (or in the
 * page, where a browser has none). Each visitor has a sandbox of their own,
 * kept in IndexedDB after each change; a page that asks for it fresh
 * (`?reset`) starts it again from the seed, for every tab.
 */
import { drizzle } from 'drizzle-orm/sql-js'
import { Effect, Option, Stream } from 'effect'
import type { ConversationHandler } from 'foldkit-primitives/net'
import type { RemoteRpcClient } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { servePort } from 'foldkit-remote-server/port'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import wasm from 'sql.js/dist/sql-wasm.wasm?url'
import type { RemoteOpening } from './opening.js'
import type { Person } from './seed.js'
import { openServer, principalOf } from './server.js'
import { read, write } from './store.js'

interface Sandbox {
  readonly database: Database
  readonly backend: ReturnType<typeof openServer>
}

const over = (database: Database, fresh: boolean): Sandbox => ({
  database,
  backend: openServer({
    fresh,
    exec: statements => database.exec(statements),
    drizzle: drizzle(database),
  }),
})

/** What was kept, where it opens; anything else starts from the seed. */
const restore = (SQL: SqlJsStatic, bytes: Uint8Array): Option.Option<Database> => {
  try {
    const database = new SQL.Database(bytes)
    // A sandbox kept before likes had ids does not open: it starts from the seed.
    database.exec('select count(*) from users, posts, likes where likes.id is not null')
    return Option.some(database)
  } catch {
    return Option.none()
  }
}

/** Starts the server, and returns what it does with each conversation a page opens. */
export const openHost = async (): Promise<ConversationHandler<RemoteOpening>> => {
  const SQL = await initSqlJs({ locateFile: () => wasm })
  // Storage refused: the sandbox lives as long as the host.
  const kept = await read().catch(() => Option.none<Uint8Array>())
  const restored = Option.flatMap(kept, bytes => restore(SQL, bytes))
  let sandbox = Option.match(restored, {
    onNone: () => over(new SQL.Database(), true),
    onSome: database => over(database, false),
  })

  // Kept after each change, one write at a time, the latest last: a SharedWorker
  // has no moment it is left, so nothing waits for one.
  let saving = false
  let dirty = false
  const keep = async () => {
    dirty = true
    if (saving) return
    saving = true
    while (dirty) {
      dirty = false
      // Storage full or refused: the sandbox lives as long as the host.
      await write(sandbox.database.export()).catch(() => {})
    }
    saving = false
  }
  // A seed, over nothing kept or over what would not open, is kept at once.
  if (Option.isNone(restored)) void keep()

  // One reset at a time, and every conversation waits for the one before it.
  let ready: Promise<void> = Promise.resolve()
  const reset = () => {
    ready = ready.then(async () => {
      sandbox = over(new SQL.Database(), true)
      await keep()
    })
  }

  /** Remote's handlers as `person`, each call answered by the sandbox as it is then. */
  const handlersAs = (person: Person): RemoteRpcClient => {
    // #region person
    const now = () => ({
      handlers: RemoteServer.handlers(sandbox.backend.server, principalOf(person)),
      database: sandbox.backend.database,
    })
    // #endregion
    return {
      FoldkitRemoteRead: payload =>
        Effect.suspend(() => {
          const { handlers, database } = now()
          return handlers.FoldkitRemoteRead(payload).pipe(Effect.provide(database))
        }),
      FoldkitRemoteQuery: payload =>
        Effect.suspend(() => {
          const { handlers, database } = now()
          return handlers.FoldkitRemoteQuery(payload).pipe(Effect.provide(database))
        }),
      // A mutation that lands is kept.
      FoldkitRemoteMutate: payload =>
        Effect.suspend(() => {
          const { handlers, database } = now()
          return handlers.FoldkitRemoteMutate(payload).pipe(
            Effect.provide(database),
            Effect.tap(() => Effect.sync(() => void keep())),
          )
        }),
      FoldkitRemoteLive: payload =>
        Stream.suspend(() => {
          const { handlers, database } = now()
          return handlers.FoldkitRemoteLive(payload).pipe(Stream.provide(database))
        }),
    }
  }

  return ({ person, fresh }, { port, signal }) => {
    if (fresh) reset()
    void ready.then(() =>
      Effect.runPromise(
        servePort(handlersAs(person), port).pipe(
          Effect.catchCause(cause => Effect.logError('Remote over a port failed', cause)),
        ),
        { signal },
      ),
    )
  }
}
