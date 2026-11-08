// @vitest-environment node
/**
 * Every page the server's queries read is served from an index, not sorted
 * per request (#437), over the tables the migrations create.
 */
import { drizzle } from 'drizzle-orm/node-sqlite'
import { Effect, Option } from 'effect'
import { databaseLayer, queryPlans } from 'foldkit-plus/remote-drizzle'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import { accounts } from '../src/auth.js'
import { notes, server } from '../src/server.js'
import { createTable } from './schemaSql.js'

it('serves every page of Notes from an index', async () => {
  const sqlite = new DatabaseSync(':memory:')
  // The tables as the Drizzle declarations write them, which `migrations.test.ts`
  // holds the migrations to: a mutation of the declaration reaches this test.
  for (const table of [accounts, notes]) sqlite.exec(createTable(table).join('\n'))
  sqlite.exec(`
    insert into accounts values ('ada', 'active', 'r1', 'ada@example.invalid', 'Ada');
    insert into notes (id, author_id, title, body, created_at) values
      ('n1', 'ada', 'One', '', 100),
      ('n2', 'ada', 'Two', '', 200),
      ('n3', 'ada', 'Three', '', 300);
  `)
  const source = server.queries.get('Notes')
  if (source === undefined) throw new Error('Notes is not served')
  const plans = await Effect.runPromise(
    queryPlans([{ source, input: {}, principal: Option.some({ id: 'ada' }) }]).pipe(
      Effect.provide(databaseLayer(drizzle({ client: sqlite }))),
    ),
  )
  expect(plans.map(plan => plan.page)).toEqual(['first', 'later'])
  expect(plans.filter(plan => plan.verdict === 'sorted')).toEqual([])
})
