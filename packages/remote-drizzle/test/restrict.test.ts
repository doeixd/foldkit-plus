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
const NoteOnTopic = Entity.input(Note, Schema.Struct({ id: Schema.String, topic: Schema.String }), {
  topic: Relation.input(Note.relations.topic),
})
/** A note on a topic: only while the topic is there, since it restricts deleting the topic. */
const AddNote = Mutation.write('AddNote', Write.insert(NoteOnTopic, { id: 'id' }))
const MoveNote = Mutation.write('MoveNote', Write.update(NoteOnTopic, { id: 'id' }))

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
  /** The ids a query selects: every row of a table, or the `ORPHANS`. */
  readonly ids: (table: 'topics' | 'notes' | typeof ORPHANS) => Promise<ReadonlyArray<string>>
  readonly Db: ReturnType<typeof bindOn>
  readonly exec: (statement: string) => Promise<void>
  /** What the writer is told of the database: Postgres here runs serializable. */
  readonly writing: { readonly isolation?: 'serializable' }
}

/** The notes pointing at a topic that is not there. */
const ORPHANS = 'select id from notes where topic_id not in (select id from topics) order by id'
const selecting = (table: 'topics' | 'notes' | typeof ORPHANS) =>
  table === ORPHANS ? ORPHANS : `select id from ${table} order by id`

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
            .prepare(selecting(table))
            .all()
            .map(row => String(row['id'])),
        Db: bindOn(sqliteTables),
        exec: async statement => void sqlite.exec(statement),
        writing: {},
      }
    },
  ],
  [
    'Postgres',
    async () => {
      // Without a foreign key, only serializable Postgres holds a restriction (#521).
      await pglite.exec("set default_transaction_isolation to 'serializable'")
      await pglite.exec('drop table if exists topics, notes')
      for (const statement of SCHEMA) await pglite.exec(statement)
      return {
        layer: databaseLayer(drizzlePg({ client: pglite })),
        ids: async table =>
          (await pglite.query<{ id: string }>(selecting(table))).rows.map(row => row.id),
        Db: bindOn(pgTables),
        exec: async statement => void (await pglite.exec(statement)),
        writing: { isolation: 'serializable' },
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
          (await db.prepare(selecting(table)).all<{ id: string }>()).results.map(row => row.id),
        Db: bindOn(sqliteTables),
        exec: async statement => void (await db.prepare(statement).run()),
        writing: {},
      }
    },
  ],
]

const serverOf = ({ Db, writing }: Backend) =>
  RemoteServer.make<string, DrizzleDatabase>({
    entities: [source(Db.Topic), source(Db.Note)],
    mutations: [
      RemoteServer.write(DeleteTopic, writer(Db.Topic, writing)),
      RemoteServer.write(DeleteDraft, writer(Db.Topic, writing)),
      RemoteServer.write(DeleteNote, writer(Db.Note, writing)),
      RemoteServer.write(AddNote, writer(Db.Note, writing)),
      RemoteServer.write(MoveNote, writer(Db.Note, writing)),
    ],
  })

const sent = (backend: Backend, mutation: string, input: unknown) =>
  Effect.runPromise(
    RemoteServer.handlers(serverOf(backend), 'ada')
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
      RemoteServer.answer(RemoteServer.handlers(serverOf(backend), 'ada'), {
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

  it('writes a link only to a topic that is there', async () => {
    const backend = await open()
    expect(await sent(backend, 'AddNote', { id: 'n3', topic: 't2' })).toMatchObject({
      _tag: 'Success',
    })
    const refused = { _tag: 'Invalid', path: ['topic'] }
    expect(refusalOf(await sent(backend, 'AddNote', { id: 'n4', topic: 'gone' }))).toMatchObject(
      refused,
    )
    expect(refusalOf(await sent(backend, 'MoveNote', { id: 'n1', topic: 'gone' }))).toMatchObject(
      refused,
    )
    expect(await sent(backend, 'MoveNote', { id: 'n1', topic: 't3' })).toMatchObject({
      _tag: 'Success',
    })
    // A taken id is still answered as taken, whichever topic it names.
    expect(refusalOf(await sent(backend, 'AddNote', { id: 'n2', topic: 't3' }))).toMatchObject({
      _tag: 'Taken',
    })
    expect(await backend.ids('notes')).toEqual(['n1', 'n2', 'n3'])
    expect(await backend.ids(ORPHANS)).toEqual([])
  })
})

describe.each(backends.filter(([name]) => name !== 'Postgres'))(
  'A delete racing links to its row, on %s',
  (_, open) => {
    it('never leaves a note pointing at a topic that is gone, in either order', async () => {
      const backend = await open()
      const handlers = RemoteServer.handlers(serverOf(backend), 'ada')
      let requests = 0
      const send = (mutation: string, input: unknown) =>
        Effect.runPromise(
          handlers
            .FoldkitRemoteMutate({ requestId: `race${++requests}`, mutation, input })
            .pipe(Effect.result, Effect.provide(backend.layer)),
        )
      // A fixed walk of head starts, so a failure names its round: each write waits a
      // few turns of the event loop before it is sent, and the others run meanwhile.
      let seed = 7
      const turns = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) % 6
      const later = async (wait: number, write: () => ReturnType<typeof send>) => {
        for (let turn = 0; turn < wait; turn++) await new Promise(setImmediate)
        return write()
      }
      const outcomes = { deleted: 0, kept: 0 }
      for (let round = 0; round < 24; round++) {
        await backend.exec(`insert into topics values ('r${round}', 'draft')`)
        const answers = await Promise.all([
          later(turns(), () => send('AddNote', { id: `r${round}a`, topic: `r${round}` })),
          later(turns(), () => send('DeleteTopic', { id: `r${round}` })),
          later(turns(), () => send('AddNote', { id: `r${round}b`, topic: `r${round}` })),
        ])
        const deleted = !(await backend.ids('topics')).includes(`r${round}`)
        outcomes[deleted ? 'deleted' : 'kept'] += 1
        for (const answer of answers) {
          if (answer._tag === 'Success') continue
          expect(refusalOf(answer), `round ${round}`).toMatchObject({
            _tag: deleted ? 'Invalid' : 'Referenced',
          })
        }
        expect(await backend.ids(ORPHANS), `round ${round}`).toEqual([])
      }
      // Both orders were met: the walk reached the delete landing first, and last.
      expect(outcomes.deleted).toBeGreaterThan(0)
      expect(outcomes.kept).toBeGreaterThan(0)
    }, 120_000)
  },
)

describe('What a restriction needs of its store', () => {
  const Pg = bindOn(pgTables)
  const Lite = bindOn(sqliteTables)
  const refusedOn = (register: () => unknown, rule: string) => {
    expect(register).toThrow(
      'store "Postgres" (read-committed per transaction, does not lock the parent row) cannot hold',
    )
    expect(register).toThrow(
      `"${rule}" needs parent-serialized (writers of the rows under one parent run one at a time)`,
    )
  }

  it('refuses a restricted delete and a link to its row on read-committed Postgres', () => {
    refusedOn(
      () => RemoteServer.write(DeleteTopic, writer(Pg.Topic)),
      'DeleteTopic restrict Note.topic',
    )
    refusedOn(() => RemoteServer.write(AddNote, writer(Pg.Note)), 'AddNote link Note.topic')
    refusedOn(() => RemoteServer.write(MoveNote, writer(Pg.Note)), 'MoveNote link Note.topic')
  })

  it("holds a link the write's context sets as it holds one the input gives", () => {
    const MemberFields = Entity.define('Member', Schema.Struct({ id: Schema.String }))
    const MarkFields = Entity.define('Mark', Schema.Struct({ id: Schema.String }))
    const Marks = Entity.relate(
      { Member: MemberFields, Mark: MarkFields },
      { Mark: { member: Relation.one(MemberFields, { onDelete: 'cascade' }) } },
    )
    const Mark = Marks.Mark.pipe(
      Entity.sets({ member: Expr.viewer(MemberFields) }, { on: 'create' }),
    )
    const members = pgTable('members', { id: pgText('id').primaryKey() })
    const marks = pgTable('marks', {
      id: pgText('id').primaryKey(),
      memberId: pgText('member_id').notNull(),
    })
    const Db = bind(
      { Member: Marks.Member, Mark },
      {
        Member: { table: members },
        Mark: { table: marks, relations: { member: { field: marks.memberId } } },
      },
    )
    const AddMark = Mutation.write(
      'AddMark',
      Write.insert(Entity.input(Mark, Schema.Struct({ id: Schema.String })), { id: 'id' }),
    )
    refusedOn(() => RemoteServer.write(AddMark, writer(Db.Mark)), 'AddMark link Mark.member')
  })

  it('a delete of a note restricts nothing, and needs nothing of the store', () => {
    expect(() => RemoteServer.write(DeleteNote, writer(Pg.Note))).not.toThrow()
  })

  it('holds them on SQLite, which D1 shares, and on serializable Postgres', () => {
    for (const [Db, writing] of [
      [Lite, {}],
      [Pg, { isolation: 'serializable' }],
    ] as const) {
      expect(() => RemoteServer.write(DeleteTopic, writer(Db.Topic, writing))).not.toThrow()
      expect(() => RemoteServer.write(AddNote, writer(Db.Note, writing))).not.toThrow()
      expect(() => RemoteServer.write(MoveNote, writer(Db.Note, writing))).not.toThrow()
    }
  })

  it("holds them on read-committed Postgres where the table's foreign key holds the link", () => {
    const topics = pgTable('topics', {
      id: pgText('id').primaryKey(),
      name: pgText('name').notNull(),
    })
    const notes = pgTable(
      'notes',
      { id: pgText('id').primaryKey(), topicId: pgText('topic_id').notNull() },
      table => [foreignKey({ columns: [table.topicId], foreignColumns: [topics.id] })],
    )
    const Keyed = bind(
      { Topic, Note },
      {
        Topic: { table: topics },
        Note: { table: notes, relations: { topic: { field: notes.topicId } } },
      },
    )
    expect(() => RemoteServer.write(DeleteTopic, writer(Keyed.Topic))).not.toThrow()
    expect(() => RemoteServer.write(AddNote, writer(Keyed.Note))).not.toThrow()
    // The foreign key holds the link, so a writer that does not check it may write one.
    const { checksTargets: _, ...unchecking } = writer(Keyed.Note)
    expect(() => RemoteServer.write(AddNote, unchecking)).not.toThrow()
  })

  it('refuses a link through a writer that does not check its row is there', () => {
    // SQLite enforces a foreign key only under a pragma, so one on its table holds nothing.
    const topics = sqliteTable('topics', {
      id: text('id').primaryKey(),
      name: text('name').notNull(),
    })
    const notes = sqliteTable('notes', {
      id: text('id').primaryKey(),
      topicId: text('topic_id')
        .notNull()
        .references(() => topics.id),
    })
    const Keyed = bind(
      { Topic, Note },
      {
        Topic: { table: topics },
        Note: { table: notes, relations: { topic: { field: notes.topicId } } },
      },
    )
    for (const Db of [Lite, Keyed]) {
      const { checksTargets: _, ...unchecking } = writer(Db.Note)
      expect(() => RemoteServer.write(AddNote, unchecking)).toThrow(
        /links Note\.topic, declared onDelete, but its writer for Note .*\(checksTargets\)/,
      )
    }
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
