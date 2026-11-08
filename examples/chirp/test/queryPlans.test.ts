// @vitest-environment node
/**
 * Every page the server's queries read is served from an index, not sorted
 * per request (#437). The database is the server's own schema and seed.
 */
import { Effect, Option } from 'effect'
import { queryPlans } from 'foldkit-remote-drizzle'
import { expect, it } from 'vitest'
import { openServer, principalOf, server } from '../src/server/server.js'
import { memorySqlite } from '../src/server/sqlite-node.js'

it('serves every page of Timeline and ByAuthor from an index', async () => {
  const sqlite = memorySqlite()
  const { database } = openServer(sqlite)
  // Ada has two posts in the seed: a later page of her own needs more.
  sqlite.exec(`
    insert into posts values
      ('x1', 'ada', 'more', 1767268000000),
      ('x2', 'ada', 'again', 1767267000000),
      ('x3', 'ada', 'and more', 1767266000000);
  `)
  const cases = ['Timeline', 'ByAuthor'].map(name => {
    const source = server.queries.get(name)
    if (source === undefined) throw new Error(`${name} is not served`)
    return {
      source,
      input: name === 'ByAuthor' ? { authorId: 'ada' } : {},
      principal: principalOf('ada') as Option.Option<{ readonly id: string }>,
    }
  })
  const plans = await Effect.runPromise(queryPlans(cases).pipe(Effect.provide(database)))
  expect(plans.map(plan => plan.page).sort()).toEqual(['first', 'first', 'later', 'later'])
  expect(plans.filter(plan => plan.verdict === 'sorted')).toEqual([])
})
