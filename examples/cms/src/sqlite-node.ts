/** Node's own SQLite, in memory: what the scripted run and `pnpm dev` start from, empty. */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import type { Sqlite } from './server.js'

export const memorySqlite = (): Sqlite => {
  const sqlite = new DatabaseSync(':memory:')
  return {
    fresh: true,
    exec: statements => sqlite.exec(statements),
    all: query => sqlite.prepare(query).all() as ReadonlyArray<Readonly<Record<string, unknown>>>,
    drizzle: drizzle({ client: sqlite }),
  }
}
