/**
 * A delete restricted in the domain (#467): `Relation.one(Topic, { onDelete:
 * 'restrict' })` refuses deleting a topic while a note points at it, in the
 * statement that deletes, and names the relation, never the notes. No table
 * here has a foreign key: the writer holds the restriction alone. t1 has two
 * notes, t2 none.
 */
import { postgres } from '../src/pg.js'
import { DatabaseSync } from 'node:sqlite'
import { PGlite } from '@electric-sql/pglite'
import { drizzle as drizzleD1 } from 'drizzle-orm/d1'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { foreignKey, pgTable, text as pgText } from 'drizzle-orm/pg-core'
import { drizzle as drizzlePg } from 'drizzle-orm/pglite'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Layer, Option, Schema } from 'effect'
import { Entity, Expr, Relation, Write } from 'foldkit-entity'
import { Mutation, Refusal } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { Miniflare } from 'miniflare'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bind, databaseLayer, source, writer, type DrizzleDatabase } from '../src/index.js'

postgres()

const TopicFields = Entity.define(
  'Topic',
  Schema.Struct({ id: Schema.String, name: Schema.String }),
)
const NoteFields = Entity.define('Note', Schema.Struct({ id: Schema.String }))
const Notes = Entity.relate(
  { Topic: TopicFields, Note: NoteFields },
  { Note: { topic: Relation.one(TopicFields, { onDelete: 'restrict' }) } },
)
const { Topic, Note } = Notes

const DeleteTopic = Mutation.write(
  'DeleteTopic',
  Write.delete(Entity.input(Topic, Schema.Struct({ id: Schema.String })), { id: 'id' }),
)
/** Only a topic still named "draft". */
const DeleteDraft = Mutation.write(
  'DeleteDraft',
  Write.delete(Entity.input(Topic, Schema.Struct({ id: Schema.String })), {
    id: 'id',
    when: () => Expr.eq(Topic.fields.name, 'draft'),
  }),
)
const DeleteNote = Mutation.write(
  'DeleteNote',
  Write.delete(Entity.input(Note, Schema.Struct({ id: Schema.String })), { id: 'id' }),
)

const sqliteTables = {
  topics: sqliteTable('topics', { id: text('id').primaryKey(), name: text('name').notNull() }),
  notes: sqliteTable('notes', { id: text('id').primaryKey(), topicId: text('topic_id').notNull() }),
}
const pgTables = {
  topics: pgTable('topics', { id: pgText('id').primaryKey(), name: pgText('name').notNull() }),
  notes: pgTable('notes', { id: pgText('id').primaryKey(), topicId: pgText('topic_id').notNull() }),
}
type Tables = typeof sqliteTables | typeof pgTables
const bindOn = ({ topics, notes }: Tables) =>
  bind({ Topic, Note }, {
    Topic: { table: topics },
    Note: { table: notes, relations: { topic: { field: notes.topicId } } },
  } as const)

const SCHEMA = [
  'create table topics (id text primary key, name text not null)',
  'create table notes (id text primary key, topic_id text not null)',
  "insert into topics values ('t1', 'draft'), ('t2', 'draft'), ('t3', 'final')",
  "insert into notes values ('n1', 't1'), ('n2', 't1')",
]

interface Backend {
  readonly layer: Layer.Layer<DrizzleDatabase>
  readonly ids: (table: 'topics' | 'notes') => Promise<ReadonlyArray<string>>
  readonly Db: ReturnType<typeof bindOn>
  readonly exec: (statement: string) => Promise<void>
}

let pglite: PGlite
let mf: Miniflare
beforeAll(async () => {
  pglite = await PGlite.create()
  mf = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("ok") } }',
    d1Databases: ['DB'],
    host: '127.0.0.1',
    port: 0,
  })
}, 60_000)
afterAll(async () => {
  await pglite.close()
  await mf.dispose()
})

const backends: ReadonlyArray<readonly [string, () => Promise<Backend>]> = [
  [
    'SQLite',
    async () => {
      const sqlite = new DatabaseSync(':memory:')
      for (const statement of SCHEMA) sqlite.exec(statement)
      return {
        layer: databaseLayer(drizzle({ client: sqlite })),
        ids: async table =>
          sqlite
            .prepare(`select id from ${table} order by id`)
            .all()
            .map(row => String(row['id'])),
        Db: bindOn(sqliteTables),
        exec: async statement => void sqlite.exec(statement),
      }
    },
  ],
  [
    'Postgres',
    async () => {
      await pglite.exec('drop table if exists topics, notes')
      for (const statement of SCHEMA) await pglite.exec(statement)
      return {
        layer: databaseLayer(drizzlePg({ client: pglite })),
        ids: async table =>
          (await pglite.query<{ id: string }>(`select id from ${table} order by id`)).rows.map(
            row => row.id,
          ),
        Db: bindOn(pgTables),
        exec: async statement => void (await pglite.exec(statement)),
      }
    },
  ],
  [
    'D1',
    async () => {
      const db = await mf.getD1Database('DB')
      await db.batch(
        ['drop table if exists topics', 'drop table if exists notes']
          .concat(SCHEMA)
          .map(statement => db.prepare(statement)),
      )
      return {
        layer: databaseLayer(drizzleD1(db)),
        ids: async table =>
          (
            await db.prepare(`select id from ${table} order by id`).all<{ id: string }>()
          ).results.map(row => row.id),
        Db: bindOn(sqliteTables),
        exec: async statement => void (await db.prepare(statement).run()),
      }
    },
  ],
]

const serverOf = (Db: Backend['Db']) =>
  RemoteServer.make<string, DrizzleDatabase>({
    entities: [source(Db.Topic), source(Db.Note)],
    mutations: [
      RemoteServer.write(DeleteTopic, writer(Db.Topic)),
      RemoteServer.write(DeleteDraft, writer(Db.Topic)),
      RemoteServer.write(DeleteNote, writer(Db.Note)),
    ],
  })

const sent = (backend: Backend, mutation: string, input: unknown) =>
  Effect.runPromise(
    RemoteServer.handlers(serverOf(backend.Db), 'ada')
      .FoldkitRemoteMutate({ requestId: 'r1', mutation, input })
      .pipe(Effect.result, Effect.provide(backend.layer)),
  )

/** The refusal a failed mutation answered, or none. */
const refusalOf = (answer: Awaited<ReturnType<typeof sent>>): unknown =>
  answer._tag === 'Failure' && 'refusal' in answer.failure ? answer.failure.refusal : undefined

describe.each(backends)('A declared restriction, on %s', (_, open) => {
  it('refuses deleting a row pointed at, naming the relation and no row', async () => {
    const backend = await open()
    const answer = await sent(backend, 'DeleteTopic', { id: 't1' })
    expect(refusalOf(answer)).toEqual(
      Refusal.referenced.make({ entity: 'Note', relation: 'topic' }),
    )
    expect(JSON.stringify(answer)).not.toMatch(/n1|n2/)
    expect(await backend.ids('topics')).toEqual(['t1', 't2', 't3'])
  })

  it('answers the refusal over JSON as a 409 its client reads back', async () => {
    const backend = await open()
    const answered = await Effect.runPromise(
      RemoteServer.answer(RemoteServer.handlers(serverOf(backend.Db), 'ada'), {
        operation: 'mutate',
        payload: { requestId: 'r1', mutation: 'DeleteTopic', input: { id: 't1' } },
      }).pipe(Effect.provide(backend.layer)),
    )
    expect(answered.status).toBe(409)
    expect(answered.body).toMatchObject({
      refusal: { _tag: 'Referenced', entity: 'Note', relation: 'topic' },
    })
  })

  it('deletes a row nothing points at, and one whose last pointer went', async () => {
    const backend = await open()
    expect(await sent(backend, 'DeleteTopic', { id: 't2' })).toMatchObject({ _tag: 'Success' })
    await sent(backend, 'DeleteNote', { id: 'n1' })
    expect(refusalOf(await sent(backend, 'DeleteTopic', { id: 't1' }))).toMatchObject({
      _tag: 'Referenced',
    })
    await sent(backend, 'DeleteNote', { id: 'n2' })
    expect(await sent(backend, 'DeleteTopic', { id: 't1' })).toMatchObject({ _tag: 'Success' })
    expect(await backend.ids('topics')).toEqual(['t3'])
  })

  it('answers a row already gone as gone, with rows pointing at its id', async () => {
    const backend = await open()
    await backend.exec("insert into notes values ('n9', 'missing')")
    expect(await sent(backend, 'DeleteTopic', { id: 'missing' })).toMatchObject({
      _tag: 'Success',
    })
  })

  it('tells a restriction from a when the row does not hold, whichever the miss is', async () => {
    const backend = await open()
    // Held, but pointed at.
    expect(refusalOf(await sent(backend, 'DeleteDraft', { id: 't1' }))).toMatchObject({
      _tag: 'Referenced',
    })
    // Not pointed at, but not held.
    expect(refusalOf(await sent(backend, 'DeleteDraft', { id: 't3' }))).toMatchObject({
      _tag: 'Unmet',
    })
    expect(await sent(backend, 'DeleteDraft', { id: 't2' })).toMatchObject({ _tag: 'Success' })
  })
})

describe('A restriction where the writer is made', () => {
  it('refuses a delete of a restricted Entity through a writer that does not restrict', () => {
    const { restricts: _, ...unrestricting } = writer(bindOn(sqliteTables).Topic)
    expect(() => RemoteServer.write(DeleteTopic, unrestricting)).toThrow(
      /which Note\.topic restricts .*\(restricts\)/,
    )
  })

  it('refuses a cascade into an Entity something restricts', () => {
    const Board = Entity.define('Board', Schema.Struct({ id: Schema.String }))
    const Card = Entity.define('Card', Schema.Struct({ id: Schema.String }))
    const Pin = Entity.define('Pin', Schema.Struct({ id: Schema.String }))
    const Wall = Entity.relate(
      { Board, Card, Pin },
      {
        Card: { board: Relation.one(Board, { onDelete: 'cascade' }) },
        Pin: { card: Relation.one(Card, { onDelete: 'restrict' }) },
      },
    )
    const boards = sqliteTable('boards', { id: text('id').primaryKey() })
    const cards = sqliteTable('cards', {
      id: text('id').primaryKey(),
      board: text('board').notNull(),
    })
    const pins = sqliteTable('pins', { id: text('id').primaryKey(), card: text('card').notNull() })
    const Db = bind(Wall, {
      Board: { table: boards },
      Card: { table: cards, relations: { board: { field: cards.board } } },
      Pin: { table: pins, relations: { card: { field: pins.card } } },
    })
    const DeleteBoard = Mutation.write(
      'DeleteBoard',
      Write.delete(Entity.input(Wall.Board, Schema.Struct({ id: Schema.String })), { id: 'id' }),
    )
    expect(() => RemoteServer.write(DeleteBoard, writer(Db.Board))).toThrow(
      /cascade takes Card rows, which Pin\.card restricts/,
    )
  })

  it.each([
    ['cascade', /whose foreign key cascades on delete/],
    [
      'set null',
      /declared onDelete: 'restrict', but the foreign key on "topic_id" says on delete set null/,
    ],
  ] as const)(
    'refuses a foreign key that would %s what the domain restricts',
    (action, refused) => {
      const topics = pgTable('topics', {
        id: pgText('id').primaryKey(),
        name: pgText('name').notNull(),
      })
      // On the table, not the column: Drizzle hands back copies of the table's columns.
      const notes = pgTable(
        'notes',
        { id: pgText('id').primaryKey(), topicId: pgText('topic_id').notNull() },
        table => [
          foreignKey({ columns: [table.topicId], foreignColumns: [topics.id] }).onDelete(action),
        ],
      )
      expect(() =>
        bind(
          { Topic, Note },
          {
            Topic: { table: topics },
            Note: { table: notes, relations: { topic: { field: notes.topicId } } },
          },
        ),
      ).toThrow(refused)
    },
  )
})
