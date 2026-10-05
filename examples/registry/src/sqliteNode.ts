/** Node's own SQLite, in memory: what `pnpm dev` and the tests run the server on. */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import type { Sqlite } from './server.js'

export const memorySqlite = (): Sqlite => {
  const sqlite = new DatabaseSync(':memory:')
  return {
    exec: statements => sqlite.exec(statements),
    runAll: (statement, rows) => {
      const prepared = sqlite.prepare(statement)
      sqlite.exec('begin')
      try {
        for (const row of rows) prepared.run(...row)
        sqlite.exec('commit')
      } catch (error) {
        sqlite.exec('rollback')
        throw error
      }
    },
    get: (query, values) => sqlite.prepare(query).get(...values),
    drizzle: drizzle({ client: sqlite }),
    close: () => sqlite.close(),
  }
}
