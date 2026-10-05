/**
 * The published demo's server: the same one `pnpm dev` runs, on SQLite
 * compiled to WebAssembly, in a SharedWorker every tab of the demo shares (or
 * in the page, where a browser has none). Each visitor has a sandbox of their
 * own, kept in IndexedDB after each change; a page that asks for it fresh
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
import { principalOf, publishDue } from './endpoint.js'
import type { RemoteOpening } from './opening.js'
import { openServer, type Sqlite } from './server.js'
import { read, write } from './store.js'

const sqliteOver = (database: Database, fresh: boolean): Sqlite => ({
  fresh,
  exec: statements => database.exec(statements),
  all: query => {
    const statement = database.prepare(query)
    const rows: Array<Record<string, unknown>> = []
    while (statement.step()) rows.push(statement.getAsObject())
    statement.free()
    return rows
  },
  drizzle: drizzle(database),
})

interface Sandbox {
  readonly database: Database
  readonly backend: ReturnType<typeof openServer>
  edited: boolean
}

/** What was kept, where it opens as the sandbox's own; anything else starts from the seed. */
const restore = (SQL: SqlJsStatic, bytes: Uint8Array): Option.Option<Database> => {
  try {
    const database = new SQL.Database(bytes)
    database.exec('select count(*) from posts, pages')
    return Option.some(database)
  } catch {
    return Option.none()
  }
}

const seeded = async (SQL: SqlJsStatic): Promise<Sandbox> => {
  const database = new SQL.Database()
  const backend = openServer(() => new Date(), sqliteOver(database, true))
  await backend.seed()
  return { database, backend, edited: false }
}

/** Starts the server, and returns what it does with each conversation a page opens. */
export const openHost = async (): Promise<ConversationHandler<RemoteOpening>> => {
  const SQL = await initSqlJs({ locateFile: () => wasm })
  // Storage refused: the sandbox lives as long as the host.
  const kept = await read().catch(() => Option.none())
  const restored = Option.flatMap(kept, ({ bytes, edited }) =>
    Option.map(restore(SQL, bytes), database => ({ database, edited })),
  )
  let sandbox: Sandbox = await Option.match(restored, {
    onNone: () => seeded(SQL),
    onSome: ({ database, edited }) =>
      Promise.resolve({
        database,
        backend: openServer(() => new Date(), sqliteOver(database, false)),
        edited,
      }),
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
      const { database, edited } = sandbox
      // Storage full or refused: the sandbox lives as long as the host.
      await write({ bytes: database.export(), edited }).catch(() => {})
    }
    saving = false
  }
  const changed = () => {
    sandbox.edited = true
    void keep()
  }
  // A seed, over nothing kept or over what would not open, is kept at once.
  if (Option.isNone(restored)) void keep()

  // One reset at a time, and every conversation waits for the one before it.
  let ready: Promise<void> = Promise.resolve()
  const reset = () => {
    ready = ready.then(async () => {
      sandbox = await seeded(SQL)
      await keep()
    })
  }

  setInterval(() => {
    void publishDue(sandbox.backend).then(said => {
      if (said.length > 0) changed()
    })
  }, 5000)

  /** Remote's handlers as `chair`, each call answered by the sandbox as it is then. */
  const handlersAs = (chair: string): RemoteRpcClient => {
    const now = () => ({
      handlers: RemoteServer.handlers(sandbox.backend.server, principalOf(chair)),
      database: sandbox.backend.database,
    })
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
      // A mutation, and the drafts a save writes, are kept.
      FoldkitRemoteMutate: payload =>
        Effect.suspend(() => {
          const { handlers, database } = now()
          return handlers.FoldkitRemoteMutate(payload).pipe(
            Effect.provide(database),
            Effect.tap(() => Effect.sync(changed)),
          )
        }),
      FoldkitRemoteLive: payload =>
        Stream.suspend(() => {
          const { handlers, database } = now()
          return handlers.FoldkitRemoteLive(payload).pipe(Stream.provide(database))
        }),
    }
  }

  return ({ chair, fresh }, { port, signal }) => {
    if (fresh) reset()
    void ready.then(() =>
      Effect.runPromise(
        servePort(handlersAs(chair), port).pipe(
          Effect.catchCause(cause => Effect.logError('Remote over a port failed', cause)),
        ),
        { signal },
      ),
    )
  }
}
