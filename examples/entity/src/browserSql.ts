/**
 * SQLite in the page: sql.js (SQLite compiled to WebAssembly) holding the
 * seeded rows, asked through the same `query` source the server and the
 * `language` command use. The page imports this module lazily, so the
 * WebAssembly is fetched only when a question is first asked.
 */
import { drizzle } from 'drizzle-orm/sql-js'
import initSqlJs from 'sql.js'
import wasm from 'sql.js/dist/sql-wasm.wasm?url'
import { databaseLayer } from 'foldkit-remote-drizzle'
import { ask, seed, world, type Question, type Statement } from './questions.js'
import { ddl } from './tables.js'

const open = async () => {
  const SQL = await initSqlJs({ locateFile: () => wasm })
  const sqlite = new SQL.Database()
  sqlite.exec(ddl)
  for (const { sql, params } of seed(world)) sqlite.run(sql, [...params])
  return sqlite
}

let database: ReturnType<typeof open> | undefined

/** The ids SQLite answers in the body's order, and each statement Drizzle sent. */
export const askSqlite = async (
  question: Question,
): Promise<{
  readonly ids: ReadonlyArray<string>
  readonly statements: ReadonlyArray<Statement>
}> => {
  database ??= open()
  const statements: Array<Statement> = []
  const layer = databaseLayer(
    drizzle(await database, {
      logger: { logQuery: (sql, params) => statements.push({ sql, params }) },
    }),
  )
  return { ids: await ask(question, layer), statements }
}
