// @vitest-environment node
/**
 * A rule that reads another row holds on SQLite and on D1 because the writer
 * judges it in the statement that writes (`judgesInStatement`). Two writes
 * race, each passing a rule the other's write breaks: a task is made active
 * only while its project is open (a rule over the parent row), and a project
 * is closed only while none of its tasks is active (a rule over the rows
 * under it). Whichever lands first, the other is refused: never a closed
 * project with an active task. On D1 the two requests are real round trips
 * under miniflare. A writer that read the rows first and wrote in a second
 * round trip would let both land, which is why such a writer is refused on
 * D1 where the write is registered (`store.test.ts`), shown here last.
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle as drizzleD1 } from 'drizzle-orm/d1'
import { drizzle as drizzleSqlite } from 'drizzle-orm/node-sqlite'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Option, Result, Schema } from 'effect'
import { Entity, Expr, Query as Body, Relation, type AnyQuery } from 'foldkit-entity'
import { RowRequirement } from 'foldkit-remote-server'
import { Miniflare } from 'miniflare'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bind, databaseLayer, writer } from '../src/index.js'

const Fields = {
  Project: Entity.define('Project', Schema.Struct({ id: Schema.String, open: Schema.Boolean })),
  Task: Entity.define('Task', Schema.Struct({ id: Schema.String, active: Schema.Boolean })),
}
const { Project, Task } = Entity.relate(Fields, {
  Task: { project: Relation.one(Fields.Project) },
})

const projects = sqliteTable('race_projects', {
  id: text('id').primaryKey(),
  open: integer('open', { mode: 'boolean' }).notNull(),
})
const tasks = sqliteTable('race_tasks', {
  id: text('id').primaryKey(),
  active: integer('active', { mode: 'boolean' }).notNull(),
  projectId: text('project_id').notNull(),
})
const Db = bind(
  { Project, Task },
  {
    Project: { table: projects },
    Task: { table: tasks, relations: { project: { field: tasks.projectId } } },
  },
)

const schema = [
  'create table race_projects (id text primary key, open integer not null)',
  'create table race_tasks (id text primary key, active integer not null, project_id text not null)',
]
const reset = [
  'delete from race_tasks',
  'delete from race_projects',
  "insert into race_projects values ('p1', 1)",
  "insert into race_tasks values ('t1', 0, 'p1')",
]

/** A rule over the row as a guard hands it to the writer. */
const rule = (query: AnyQuery) => ({
  holds: RowRequirement.Body({
    query,
    input: {},
    context: { viewer: Option.none(), now: Option.none() },
  }),
  reason: Option.none(),
})
const projectOpen = rule(
  Body.from(Task).pipe(
    Body.where(Expr.eq(Expr.path(Task.relations.project, Project.fields.open), true)),
  ),
)
const noActiveTask = rule(
  Body.from(Project).pipe(
    Body.where(Expr.not(Expr.exists(Task.relations.project, Expr.eq(Task.fields.active, true)))),
  ),
)

const update = {
  operation: Option.none(),
  increments: {},
  assignments: {},
  links: {},
  expect: Option.none(),
  when: Option.none(),
  principal: undefined,
}
const tasksWriter = writer<undefined>(Db.Task)
const projectsWriter = writer<undefined>(Db.Project)

const ROUNDS = 12

/** Rounds of the two writes in flight together; what landed each round and what was left. */
const race = async (
  layer: () => ReturnType<typeof databaseLayer>,
  run: (statements: ReadonlyArray<string>) => Promise<void>,
  state: () => Promise<{ readonly open: boolean; readonly active: boolean }>,
) => {
  const outcomes: Array<string> = []
  for (let round = 0; round < ROUNDS; round++) {
    await run(reset)
    const activate = tasksWriter.update({
      ...update,
      id: 't1',
      request: `activate ${round}`,
      values: { active: true },
      requires: projectOpen,
    })
    const close = projectsWriter.update({
      ...update,
      id: 'p1',
      request: `close ${round}`,
      values: { open: false },
      requires: noActiveTask,
    })
    const answers = await Promise.all(
      [activate, close].map(write =>
        Effect.runPromise(write.pipe(Effect.result, Effect.provide(layer()))),
      ),
    )
    const landed = answers.map(
      Result.match({ onSuccess: () => 'landed', onFailure: error => error._tag }),
    )
    const left = await state()
    // What landed is what the state shows.
    expect(left).toEqual({ open: landed[1] !== 'landed', active: landed[0] === 'landed' })
    outcomes.push(landed.join(' / '))
  }
  return outcomes
}

/** Exactly one of the two lands each round, the other refused by its rule. */
const oneEachRound = (outcomes: ReadonlyArray<string>) => {
  expect(outcomes).toHaveLength(ROUNDS)
  for (const outcome of outcomes) {
    expect(['landed / Forbidden', 'Forbidden / landed']).toContain(outcome)
  }
}

const stateOf = Schema.decodeUnknownSync(
  Schema.Struct({ open: Schema.Number, active: Schema.Number }),
)
const stateQuery =
  "select p.open as open, t.active as active from race_projects p join race_tasks t on t.project_id = p.id where p.id = 'p1'"
const flags = (row: unknown) => {
  const { open, active } = stateOf(row)
  return { open: open === 1, active: active === 1 }
}

describe('two writes, each breaking the rule the other passed, on SQLite', () => {
  const sqlite = new DatabaseSync(':memory:')
  for (const statement of schema) sqlite.exec(statement)
  afterAll(() => sqlite.close())

  it('land one at a time: the second is refused', async () => {
    const outcomes = await race(
      () => databaseLayer(drizzleSqlite({ client: sqlite })),
      async statements => {
        for (const statement of statements) sqlite.exec(statement)
      },
      async () => flags(sqlite.prepare(stateQuery).get()),
    )
    oneEachRound(outcomes)
  })
})

describe('two writes, each breaking the rule the other passed, on D1', () => {
  let mf: Miniflare
  let db: Awaited<ReturnType<Miniflare['getD1Database']>>
  beforeAll(async () => {
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
      d1Databases: ['DB'],
      host: '127.0.0.1',
      port: 0,
    })
    db = await mf.getD1Database('DB')
    for (const statement of schema) await db.prepare(statement).run()
  }, 60_000)
  afterAll(async () => {
    await mf.dispose()
  })
  const run = async (statements: ReadonlyArray<string>) => {
    await db.batch(statements.map(statement => db.prepare(statement)))
  }
  const state = async () => flags(await db.prepare(stateQuery).first())

  it('overlap as two round trips, and one is refused: the rule is judged in each statement', async () => {
    oneEachRound(await race(() => databaseLayer(drizzleD1(db)), run, state))
  }, 120_000)

  it('both land where each rule is read first and written in a second round trip', async () => {
    await run(reset)
    // Each request reads what its rule needs, then writes: D1 keeps nothing still between.
    const [open, active] = await Promise.all([
      db.prepare("select open from race_projects where id = 'p1'").first<{ open: number }>(),
      db
        .prepare("select count(*) as n from race_tasks where project_id = 'p1' and active = 1")
        .first<{ n: number }>(),
    ])
    expect(open?.open).toBe(1)
    expect(active?.n).toBe(0)
    await Promise.all([
      db.prepare("update race_tasks set active = 1 where id = 't1'").run(),
      db.prepare("update race_projects set open = 0 where id = 'p1'").run(),
    ])
    // A closed project with an active task: what neither rule allows.
    expect(await state()).toEqual({ open: false, active: true })
  }, 60_000)
})
