/** Node's own SQLite, in memory: what the tests start from, empty. */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import type { Sqlite } from './server.js'

export const memorySqlite = (): Sqlite => {
  const sqlite = new DatabaseSync(':memory:')
  return {
    fresh: true,
    exec: statements => sqlite.exec(statements),
    drizzle: drizzle({ client: sqlite }),
  }
}
