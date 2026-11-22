/**
 * What each database the writer writes to guarantees of concurrent writes,
 * and so which hold a rule that reads other rows: SQLite does, Postgres only
 * where it is said to run serializable. Refused where the write is registered.
 */
import { postgres } from '../src/pg.js'
import { pgTable, text as pgText } from 'drizzle-orm/pg-core'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Schema } from 'effect'
import { Entity, Expr, Relation, Write } from 'foldkit-entity'
import { Mutation } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { describe, expect, it } from 'vitest'
import { bind, writer } from '../src/index.js'

postgres()

const ProjectFields = Entity.define(
  'Project',
  Schema.Struct({ id: Schema.String, status: Schema.String }),
)
const TaskFields = Entity.define('Task', Schema.Struct({ id: Schema.String, title: Schema.String }))
const Domain = Entity.relate(
  { Project: ProjectFields, Task: TaskFields },
  { Task: { project: Relation.one(ProjectFields) } },
)
const { Project, Task } = Domain

const TitleInput = Entity.input(Task, Schema.Struct({ id: Schema.String, title: Schema.String }))
/** Reads the task's own row only. */
const Retitle = Mutation.write(
  'Retitle',
  Write.update(TitleInput, { id: 'id', when: ({ row }) => Expr.eq(row.title, 'draft') }),
)
/** Reads the project the task points at. */
const RetitleWhileOpen = Mutation.write(
  'RetitleWhileOpen',
  Write.update(TitleInput, {
    id: 'id',
    when: () => Expr.eq(Expr.path(Task.relations.project, Project.fields.status), 'open'),
  }),
)
/** Reads every task pointing at the project. */
const CloseWhenEmpty = Mutation.write(
  'CloseWhenEmpty',
  Write.update(Entity.input(Project, Schema.Struct({ id: Schema.String, status: Schema.String })), {
    id: 'id',
    when: () => Expr.not(Expr.exists(Task.relations.project)),
  }),
)

const sqliteProjects = sqliteTable('store_projects', {
  id: text('id').primaryKey(),
  status: text('status').notNull(),
})
const sqliteTasks = sqliteTable('store_tasks', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  projectId: text('project_id').notNull(),
})
const Sqlite = bind(Domain, {
  Project: { table: sqliteProjects },
  Task: { table: sqliteTasks, relations: { project: { field: sqliteTasks.projectId } } },
})

const pgProjects = pgTable('store_projects', {
  id: pgText('id').primaryKey(),
  status: pgText('status').notNull(),
})
const pgTasks = pgTable('store_tasks', {
  id: pgText('id').primaryKey(),
  title: pgText('title').notNull(),
  projectId: pgText('project_id').notNull(),
})
const Pg = bind(Domain, {
  Project: { table: pgProjects },
  Task: { table: pgTasks, relations: { project: { field: pgTasks.projectId } } },
})

describe('what a writer says of its store', () => {
  it('SQLite runs every write alone, isolating no more than one statement, as D1 does', () => {
    expect(writer(Sqlite.Task).store).toEqual({
      name: 'SQLite',
      isolation: 'serializable',
      isolates: 'statement',
      parentRowLock: false,
    })
  })

  it('Postgres is read-committed unless it is said to run serializable, and locks no parent', () => {
    expect(writer(Pg.Task).store).toEqual({
      name: 'Postgres',
      isolation: 'read-committed',
      isolates: 'transaction',
      parentRowLock: false,
    })
    expect(writer(Pg.Task, { isolation: 'serializable' }).store).toEqual({
      name: 'Postgres',
      isolation: 'serializable',
      isolates: 'transaction',
      parentRowLock: false,
    })
  })

  it('judges every rule it is handed in the statement that writes', () => {
    expect(writer(Sqlite.Task).judgesInStatement).toBe(true)
    expect(writer(Pg.Task).judgesInStatement).toBe(true)
  })
})

describe('a write whose precondition reads other rows', () => {
  it('is refused by the writer first, which compiles no path or exists into a write', () => {
    expect(() => RemoteServer.write(RetitleWhileOpen, writer(Sqlite.Task))).toThrow(
      'its precondition needs path, which this compiler does not run',
    )
    expect(() => RemoteServer.write(CloseWhenEmpty, writer(Pg.Project))).toThrow(
      'its precondition needs exists, which this compiler does not run',
    )
  })

  /** The writer as one that ran such a rule would be: its own refusal aside, its store kept. */
  const running = (made: ReturnType<typeof writer>) => {
    const { refuses: _, ...rest } = made
    return rest
  }

  it('would register on SQLite and D1, where the writer judges it in its statement', () => {
    expect(() => RemoteServer.write(RetitleWhileOpen, running(writer(Sqlite.Task)))).not.toThrow()
    expect(() => RemoteServer.write(CloseWhenEmpty, running(writer(Sqlite.Project)))).not.toThrow()
  })

  it('would be refused there through a writer reading first and writing in a second round trip', () => {
    const { judgesInStatement: _, ...readFirst } = running(writer(Sqlite.Task))
    expect(() => RemoteServer.write(RetitleWhileOpen, readFirst)).toThrow(
      'store "SQLite" (serializable per statement, does not lock the parent row) cannot hold:\n  - "RetitleWhileOpen precondition" needs parent-serialized (writers of the rows under one parent run one at a time), judged from a read before the write: it reads other rows',
    )
  })

  it('would be refused on Postgres, naming the rule, what it needs and the store', () => {
    expect(() => RemoteServer.write(RetitleWhileOpen, running(writer(Pg.Task)))).toThrow(
      'store "Postgres" (read-committed per transaction, does not lock the parent row) cannot hold:\n  - "RetitleWhileOpen precondition" needs parent-serialized (writers of the rows under one parent run one at a time), judged in the statement that writes: it reads other rows',
    )
    expect(() => RemoteServer.write(CloseWhenEmpty, running(writer(Pg.Project)))).toThrow(
      '"CloseWhenEmpty precondition" needs parent-serialized',
    )
  })

  it('would register on a Postgres said to run serializable', () => {
    const serializable = { isolation: 'serializable' } as const
    expect(() =>
      RemoteServer.write(RetitleWhileOpen, running(writer(Pg.Task, serializable))),
    ).not.toThrow()
    expect(() =>
      RemoteServer.write(CloseWhenEmpty, running(writer(Pg.Project, serializable))),
    ).not.toThrow()
  })
})

describe('a write whose precondition reads its own row', () => {
  it('registers on Postgres as it comes', () => {
    expect(() => RemoteServer.write(Retitle, writer(Pg.Task))).not.toThrow()
  })
})
