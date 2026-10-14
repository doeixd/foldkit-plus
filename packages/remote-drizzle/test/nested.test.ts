/**
 * Nested selections through real SQL, on SQLite and on Postgres itself
 * (PGlite, Postgres compiled to WebAssembly): a relation graph batched one
 * statement per level and entity, and a windowed relation paging every parent
 * in one ranked statement, however many parents.
 */
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { drizzle as drizzlePg } from 'drizzle-orm/pglite'
import { pgTable, text as pgText } from 'drizzle-orm/pg-core'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect } from 'effect'
import {
  REMOTE_PROTOCOL_VERSION,
  Remote,
  Selection,
  emptyStore,
  type BoundRemote,
  type EntitySelection,
  type RemoteModel,
  initialRemoteModel,
  requirementsOf,
} from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { databaseLayer, entity, many, one, source } from '../src/index.js'

const schema = `
  create table users (id text primary key, name text not null);
  create table projects (id text primary key, name text not null, owner_id text not null);
  create table comments (id text primary key, body text not null, project_id text not null, author_id text not null);
  insert into users values ('u1', 'Ada'), ('u2', 'Grace'), ('u3', 'Linus');
`
/** `count` projects, each with two comments by different authors. */
const seed = (count: number) =>
  Array.from({ length: count }, (_, index) => {
    const n = index + 1
    return `
      insert into projects values ('p${n}', 'Project ${n}', 'u1');
      insert into comments values ('c${n}a', 'a', 'p${n}', 'u2'), ('c${n}b', 'b', 'p${n}', 'u3');
    `
  }).join('')

const sqliteTables = {
  users: sqliteTable('users', { id: text('id').primaryKey(), name: text('name').notNull() }),
  projects: sqliteTable('projects', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    ownerId: text('owner_id').notNull(),
  }),
  comments: sqliteTable('comments', {
    id: text('id').primaryKey(),
    body: text('body').notNull(),
    projectId: text('project_id').notNull(),
    authorId: text('author_id').notNull(),
  }),
}
const pgTables = {
  users: pgTable('users', { id: pgText('id').primaryKey(), name: pgText('name').notNull() }),
  projects: pgTable('projects', {
    id: pgText('id').primaryKey(),
    name: pgText('name').notNull(),
    ownerId: pgText('owner_id').notNull(),
  }),
  comments: pgTable('comments', {
    id: pgText('id').primaryKey(),
    body: pgText('body').notNull(),
    projectId: pgText('project_id').notNull(),
    authorId: pgText('author_id').notNull(),
  }),
}

/** The domain over one dialect's tables, and the two selections it is read with. */
const domainOver = (tables: typeof sqliteTables | typeof pgTables) => {
  const User = entity('User', tables.users)
  const Comment = entity('Comment', tables.comments, {
    relations: { author: one(User, { field: tables.comments.authorId }) },
  })
  const Project = entity('Project', tables.projects, {
    relations: {
      owner: one(User, { field: tables.projects.ownerId }),
      comments: many(Comment, {
        foreignKey: tables.comments.projectId,
        localKey: tables.projects.id,
      }),
    },
  })
  const UserName = Selection.make(User, { name: true })
  return {
    User,
    Comment,
    Project,
    ProjectCard: Selection.make(Project, {
      name: true,
      owner: UserName,
      comments: Selection.make(Comment, { body: true, author: UserName }),
    }),
    PagedCard: Selection.make(Project, {
      name: true,
      comments: Selection.connection(
        Comment,
        { first: 1 },
        Selection.make(Comment, { body: true }),
      ),
    }),
  }
}
type Domain = ReturnType<typeof domainOver>

/** A seeded database, every statement it runs counted, and how to close it. */
interface Opened {
  readonly layer: ReturnType<typeof databaseLayer>
  readonly statements: ReadonlyArray<string>
  readonly close: () => Promise<void>
}

interface Backend {
  readonly name: string
  readonly domain: Domain
  readonly open: (count: number) => Promise<Opened>
}

const backends: ReadonlyArray<Backend> = [
  {
    name: 'SQLite',
    domain: domainOver(sqliteTables),
    open: async count => {
      const sqlite = new DatabaseSync(':memory:')
      sqlite.exec(schema + seed(count))
      const statements: Array<string> = []
      const database = drizzle({
        client: sqlite,
        logger: { logQuery: query => void statements.push(query) },
      })
      return { layer: databaseLayer(database), statements, close: async () => sqlite.close() }
    },
  },
  {
    name: 'Postgres',
    domain: domainOver(pgTables),
    open: async count => {
      const pglite = new PGlite()
      await pglite.exec(schema + seed(count))
      const statements: Array<string> = []
      const database = drizzlePg({
        client: pglite,
        logger: { logQuery: query => void statements.push(query) },
      })
      return { layer: databaseLayer(database), statements, close: () => pglite.close() }
    },
  },
]

/** A kernel binding over a hand-built root: the definition registers the entities. */
const boundOver = (domain: Domain, model: RemoteModel): BoundRemote<unknown, RemoteModel> =>
  ({
    definition: Remote.define({ entities: [domain.Project, domain.Comment, domain.User] }),
    contract: { name: 'test' },
    store: { get: () => model },
  }) as unknown as BoundRemote<unknown, RemoteModel>

/** Reads `selection` for `count` projects in one request, and what it ran. */
const read = async <Value>(
  backend: Backend,
  pick: (domain: Domain) => EntitySelection<Value, 'Project'>,
  count: number,
) => {
  const { domain } = backend
  const selection = pick(domain)
  const opened = await backend.open(count)
  try {
    const server = RemoteServer.make({
      entities: [source(domain.Project), source(domain.Comment), source(domain.User)],
    })
    const reads = Array.from({ length: count }, (_, index) =>
      Remote.select(boundOver(domain, initialRemoteModel), selection)(`p${index + 1}`),
    )
    const requests = reads.flatMap(requirementsOf)
    const result = await Effect.runPromise(
      RemoteServer.handlers(server, null)
        .FoldkitRemoteRead({ version: REMOTE_PROTOCOL_VERSION, requests })
        .pipe(Effect.provide(opened.layer)),
    )
    const bound = boundOver(domain, {
      ...initialRemoteModel,
      entities: Remote.writeRead(emptyStore, requests, result),
    })
    return {
      statements: opened.statements.length,
      entities: result.entities.length,
      cards: reads.map((_, index) =>
        Remote.select(bound, selection)(`p${index + 1}`).read(undefined),
      ),
    }
  } finally {
    await opened.close()
  }
}

describe.each(backends)('RemoteDrizzle nested graph over $name', backend => {
  it('resolves a nested selection through real SQL and Remote.select reads it', async () => {
    const { cards, entities } = await read(backend, domain => domain.ProjectCard, 1)
    expect(entities).toBe(1 + 1 + 2 + 2)
    expect(cards[0]).toEqual({
      _tag: 'Ready',
      value: {
        name: 'Project 1',
        owner: { name: 'Ada' },
        comments: [
          { body: 'a', author: { name: 'Grace' } },
          { body: 'b', author: { name: 'Linus' } },
        ],
      },
    })
  }, 60_000)

  it('runs one statement per level and entity, however many parents', async () => {
    const one = await read(backend, domain => domain.ProjectCard, 1)
    const five = await read(backend, domain => domain.ProjectCard, 5)
    // projects, comments-by-project, owners, comments-by-id, authors
    expect(one.statements).toBe(5)
    expect(five.statements).toBe(one.statements)
    expect(five.cards.every(card => card._tag === 'Ready')).toBe(true)
  }, 60_000)

  it('pages every parent in one ranked statement, however many parents', async () => {
    const one = await read(backend, domain => domain.PagedCard, 1)
    const five = await read(backend, domain => domain.PagedCard, 5)
    // projects, one ranked comments statement, comment bodies
    expect(one.statements).toBe(3)
    expect(five.statements).toBe(one.statements)
    expect(five.cards.map(card => card._tag)).toEqual(Array(5).fill('Ready'))
    expect(five.cards[4]).toEqual({
      _tag: 'Ready',
      value: {
        name: 'Project 5',
        comments: { items: [{ body: 'a' }], hasNext: true, hasPrevious: false },
      },
    })
  }, 60_000)
})
