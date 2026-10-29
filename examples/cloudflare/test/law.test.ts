// @vitest-environment node
/**
 * The law over the page's four writes: each run through the page's own
 * `Data.mutate` and through the Worker's Remote server, on Node's SQLite with
 * the same migrations D1 runs. What the page shows while a write is pending
 * must be what the table then holds, the list's order included.
 */
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { Effect, Layer } from 'effect'
import { databaseLayer } from 'foldkit-remote-drizzle'
import { Remote } from 'foldkit-remote'
import { Law } from 'foldkit-remote/testing'
import { RemoteServer } from 'foldkit-remote-server'
import { describe, expect, it } from 'vitest'
import { Data, initial } from '../src/app.js'
import { Todo } from '../src/domain.js'
import { AllTodos, CreateTodo, DeleteTodo, RenameTodo, ToggleTodo } from '../src/operations.js'
import { makeServer } from '../src/schema.js'

const MIGRATIONS = [
  '0001_init.sql',
  '0002_changes.sql',
  '0003_row_changes.sql',
  '0004_row_change_log.sql',
  '0006_write_ledger.sql',
]

/** The migrations on Node's SQLite, with three todos. */
const seeded = () => {
  const sqlite = new DatabaseSync(':memory:')
  for (const file of MIGRATIONS)
    sqlite.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'))
  sqlite.exec(`insert into todos (id, title, done) values
    ('a', 'Apples', 0), ('m', 'Milk', 1), ('t', 'Tea', 0)`)
  return databaseLayer(drizzle({ client: sqlite }))
}

const { server } = makeServer()
const list = AllTodos.ref({})

const checked = (mutation: Parameters<typeof Law.check>[1]['mutation'], input: unknown) =>
  Effect.runPromise(
    Law.check(Data, {
      model: initial('ada'),
      holds: [{ entity: Todo, ids: ['a', 'm', 't'] }],
      lists: [list],
      mutation,
      input,
      now: 0,
    }).pipe(
      Effect.provide(
        Remote.clientLayer(RemoteServer.handlers(server, 'ada')).pipe(Layer.provide(seeded())),
      ),
    ),
  )

describe("the law over the page's writes", () => {
  it.each([
    {
      what: 'a new todo, placed by its title',
      mutation: CreateTodo,
      input: { id: 'n', title: 'Nuts', done: 0 },
      compares: ['Todo:n.title', 'Todo:n.done', list.identity],
    },
    {
      what: 'a rename that moves the row',
      mutation: RenameTodo,
      input: { id: 'a', title: 'Zucchini' },
      compares: ['Todo:a.title', list.identity],
    },
    {
      what: 'a toggle',
      mutation: ToggleTodo,
      input: { id: 'm', done: 0 },
      compares: ['Todo:m.done'],
    },
    {
      what: 'a delete, gone from the list',
      mutation: DeleteTodo,
      input: { id: 't' },
      compares: ['Todo:t', list.identity],
    },
  ])('$what', async ({ mutation, input, compares }) => {
    const report = await checked(mutation, input)
    expect(report.disagreed).toEqual([])
    expect(report.agreed).toEqual(expect.arrayContaining(compares))
  })
})
