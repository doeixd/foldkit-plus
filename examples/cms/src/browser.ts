/**
 * The published demo's server: the same one `pnpm dev` runs, in the page, on
 * SQLite compiled to WebAssembly. Each visitor has a sandbox of their own. It
 * is kept in the browser's storage after each change, so a change of chair (a
 * reload) keeps what was written; `?reset` in the address starts afresh.
 */
import { drizzle } from 'drizzle-orm/sql-js'
import initSqlJs, { type Database } from 'sql.js'
import wasm from 'sql.js/dist/sql-wasm.wasm?url'
import { answer, publishDue } from './endpoint.js'
import { openServer, type Sqlite } from './server.js'
import type { Send } from './transport.js'

const KEY = 'foldkit-cms-demo'

/** The database last kept; none where there is none, or storage is refused. */
const kept = (): Uint8Array | undefined => {
  try {
    const url = new URL(window.location.href)
    // Not read, so a fresh sandbox is seeded and kept over it. Once: a reload after
    // it keeps what was written since.
    if (url.searchParams.has('reset')) {
      url.searchParams.delete('reset')
      window.history.replaceState(window.history.state, '', url)
      return undefined
    }
    const text = localStorage.getItem(KEY)
    return text === null ? undefined : Uint8Array.from(atob(text), char => char.charCodeAt(0))
  } catch {
    return undefined
  }
}

/** Keeps the database; a sandbox that cannot be kept still works until the page closes. */
const keep = (database: Database) => {
  try {
    const bytes = database.export()
    let text = ''
    for (let at = 0; at < bytes.length; at += 0x8000)
      text += String.fromCharCode(...bytes.subarray(at, at + 0x8000))
    localStorage.setItem(KEY, btoa(text))
  } catch {
    // Storage full or refused: the sandbox lives as long as the page.
  }
}

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

/** Opens the sandbox, seeded the first time, and the `Send` the page's Remote client uses. */
export const openSandbox = async (): Promise<Send> => {
  const SQL = await initSqlJs({ locateFile: () => wasm })
  const bytes = kept()
  // What was kept, where it opens as the sandbox's own: anything else starts afresh.
  const restored = ((): Database | undefined => {
    if (bytes === undefined) return undefined
    try {
      const database = new SQL.Database(bytes)
      database.exec('select count(*) from posts, pages')
      return database
    } catch {
      return undefined
    }
  })()
  const database = restored ?? new SQL.Database()
  const backend = openServer(() => new Date(), sqliteOver(database, restored === undefined))
  if (restored === undefined) {
    await backend.seed()
    keep(database)
  }
  setInterval(() => {
    void publishDue(backend).then(said => {
      if (said.length > 0) keep(database)
    })
  }, 5000)
  return async (chair, body) => {
    const parsed: unknown = JSON.parse(body)
    const answered = await answer(backend, chair, parsed)
    // Reads change nothing; a mutation, and the drafts a save writes, are kept.
    if (answered.ok && typeof parsed === 'object' && parsed !== null && 'operation' in parsed)
      if (parsed.operation === 'mutate') keep(database)
    return answered
  }
}
