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
import { clearEdited, isStale, markEdited, SANDBOX_KEY } from './sandboxKey.js'
import type { Send } from './transport.js'

/**
 * Bytes as base64, and back: by the browser's own where it has them (a big
 * database took 50 ms a save through `String.fromCharCode` and `btoa`), else so.
 */
const toText = (bytes: Uint8Array): string => {
  if ('toBase64' in bytes && typeof bytes.toBase64 === 'function') return String(bytes.toBase64())
  let text = ''
  for (let at = 0; at < bytes.length; at += 0x8000)
    text += String.fromCharCode(...bytes.subarray(at, at + 0x8000))
  return btoa(text)
}
const fromText = (text: string): Uint8Array =>
  'fromBase64' in Uint8Array && typeof Uint8Array.fromBase64 === 'function'
    ? new Uint8Array(Uint8Array.fromBase64(text))
    : Uint8Array.from(atob(text), char => char.charCodeAt(0))

/** The database last kept; none where there is none, or storage is refused. */
const kept = (): Uint8Array | undefined => {
  try {
    for (const key of Object.keys(localStorage)) if (isStale(key)) localStorage.removeItem(key)
    const text = localStorage.getItem(SANDBOX_KEY)
    return text === null ? undefined : fromText(text)
  } catch {
    return undefined
  }
}

/** Keeps the database; a sandbox that cannot be kept still works until the page closes. */
const keep = (database: Database) => {
  try {
    localStorage.setItem(SANDBOX_KEY, toText(database.export()))
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

/**
 * Opens the sandbox, seeded the first time or when asked for `fresh` (what was
 * kept is then stored over), and the `Send` the page's Remote client uses.
 */
export const openSandbox = async (options: { readonly fresh: boolean }): Promise<Send> => {
  const SQL = await initSqlJs({ locateFile: () => wasm })
  const bytes = options.fresh ? undefined : kept()
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
    clearEdited()
  }
  // Kept a moment after the last change, not after each: saves come in runs while
  // someone types. Kept at once when the page is left, so a change of chair keeps all.
  let pending: ReturnType<typeof setTimeout> | undefined
  const flush = () => {
    if (pending === undefined) return
    clearTimeout(pending)
    pending = undefined
    keep(database)
  }
  const keepSoon = () => {
    clearTimeout(pending)
    pending = setTimeout(flush, 500)
  }
  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
  setInterval(() => {
    void publishDue(backend).then(said => {
      if (said.length === 0) return
      markEdited()
      keepSoon()
    })
  }, 5000)
  return async (chair, body) => {
    const parsed: unknown = JSON.parse(body)
    const answered = await answer(backend, chair, parsed)
    // Reads change nothing; a mutation, and the drafts a save writes, are kept.
    if (answered.ok && typeof parsed === 'object' && parsed !== null && 'operation' in parsed)
      if (parsed.operation === 'mutate') {
        markEdited()
        keepSoon()
      }
    return answered
  }
}
