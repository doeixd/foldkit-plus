/** SQLite compiled to WebAssembly by sql.js, in memory: the sandbox's products table. */
import { drizzle } from 'drizzle-orm/sql-js'
import type { Database } from 'sql.js'
import type { Sqlite } from '../server.js'

export const sqlJsSqlite = (database: Database): Sqlite => ({
  exec: statements => database.exec(statements),
  runAll: (statement, rows) => {
    const prepared = database.prepare(statement)
    database.exec('begin')
    try {
      for (const row of rows) prepared.run([...row])
      database.exec('commit')
    } catch (error) {
      database.exec('rollback')
      throw error
    } finally {
      prepared.free()
    }
  },
  get: (query, values) => {
    const prepared = database.prepare(query)
    try {
      prepared.bind([...values])
      return prepared.step() ? prepared.getAsObject() : undefined
    } finally {
      prepared.free()
    }
  },
  drizzle: drizzle(database),
  close: () => database.close(),
})
