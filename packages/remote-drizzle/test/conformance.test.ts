/**
 * The compiling interpreter against the shared conformance suite, over a real
 * SQLite. The same cases run against `foldkit-remote-server`'s `evaluate`; a
 * body that means two things fails in whichever of the two is wrong.
 */
import { Effect } from 'effect'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { Query } from 'foldkit-remote'
import { Subject, cases, rows } from 'foldkit-remote-server'
import { DrizzleDatabase, databaseLayer, entity, query } from '../src/index.js'

const table = sqliteTable('conformance_rows', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  rank: integer('rank').notNull(),
  tag: text('tag'),
})

const binding = entity('Subject', table)

const open = () => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(
    'create table conformance_rows (id text primary key, label text not null, rank integer not null, tag text)',
  )
  const insert = sqlite.prepare('insert into conformance_rows values (?, ?, ?, ?)')
  for (const row of rows) insert.run(row.id, row.label, row.rank, row.tag)
  return databaseLayer(drizzle({ client: sqlite }))
}

describe('foldkit-remote-drizzle conforms to the query semantics', () => {
  it.each(cases.map((c, i) => ({ ...c, name: c.what, i })))(
    '$name',
    async ({ body, input, expected, i }) => {
      // A descriptor carrying this case's body, registered against the binding.
      const descriptor = {
        ...Query.make(`Case${i}`, { Input: {}, Result: Query.connection(Subject) }),
        body,
      }
      const source = query(descriptor, { entity: binding })

      const page = await Effect.runPromise(
        source.run({ input, window: { first: 50 }, principal: null }).pipe(Effect.provide(open())),
      )

      expect(page.edges.map(edge => edge.id)).toEqual(expected)
    },
  )
})
