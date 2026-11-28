// @vitest-environment node
/**
 * What a restriction needs of Postgres is true of a real server: a delete of a
 * topic and notes linked to it, sent at once, never leave a note pointing at a
 * topic that is gone. At read committed the table's foreign key holds the
 * link (the writer declares it `constraint`); with no foreign key the server
 * runs serializable, where the link's insert reads the topic the delete
 * removes, so one of them fails. Either way a write may fail as a database
 * error rather than a refusal, and no orphan is left. It needs a server with
 * many connections, which PGlite (one) cannot be, and runs when
 * `FOLDKIT_LOCALE_PG` names one, as CI does. SQLite and D1 race in
 * `restrict.test.ts`.
 */
import { postgres } from '../src/pg.js'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { foreignKey, pgTable, text } from 'drizzle-orm/pg-core'
import { Effect, Schema } from 'effect'
import { Entity, Relation, Write } from 'foldkit-entity'
import { Mutation } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bind, databaseLayer, writer, type DrizzleDatabase } from '../src/index.js'

postgres()

const TopicFields = Entity.define('Topic', Schema.Struct({ id: Schema.String }))
const NoteFields = Entity.define('Note', Schema.Struct({ id: Schema.String }))
const { Topic, Note } = Entity.relate(
  { Topic: TopicFields, Note: NoteFields },
  { Note: { topic: Relation.one(TopicFields, { onDelete: 'restrict' }) } },
)
const DeleteTopic = Mutation.write(
  'DeleteTopic',
  Write.delete(Entity.input(Topic, Schema.Struct({ id: Schema.String })), { id: 'id' }),
)
const AddNote = Mutation.write(
  'AddNote',
  Write.insert(
    Entity.input(Note, Schema.Struct({ id: Schema.String, topic: Schema.String }), {
      topic: Relation.input(Note.relations.topic),
    }),
    { id: 'id' },
  ),
)

const topics = pgTable('restrict_race_topics', { id: text('id').primaryKey() })
const keyedNotes = pgTable(
  'restrict_race_notes',
  { id: text('id').primaryKey(), topicId: text('topic_id').notNull() },
  table => [foreignKey({ columns: [table.topicId], foreignColumns: [topics.id] })],
)
const notes = pgTable('restrict_race_notes', {
  id: text('id').primaryKey(),
  topicId: text('topic_id').notNull(),
})

const ROUNDS = 30
const pg = process.env.FOLDKIT_LOCALE_PG
const ids = Schema.decodeUnknownSync(Schema.Array(Schema.Struct({ id: Schema.String })))

/** `pg`, each connection running its transactions serializable. */
const serializable = (url: string) => {
  const at = new URL(url)
  at.searchParams.set('options', '-c default_transaction_isolation=serializable')
  return at.toString()
}

const racing = (
  name: string,
  url: () => string,
  keyed: boolean,
  options: { readonly isolation?: 'serializable' },
) =>
  describe.skipIf(pg === undefined)(name, () => {
    const database = drizzle(pg === undefined ? 'postgres://unnamed' : url())
    const rows = async (query: string) => ids((await database.execute(sql.raw(query))).rows)
    beforeAll(async () => {
      await database.execute(
        sql.raw('drop table if exists restrict_race_notes, restrict_race_topics'),
      )
      await database.execute(sql.raw('create table restrict_race_topics (id text primary key)'))
      await database.execute(
        sql.raw(
          `create table restrict_race_notes (id text primary key, topic_id text not null${
            keyed ? ' references restrict_race_topics (id)' : ''
          })`,
        ),
      )
    }, 60_000)
    afterAll(async () => {
      await database.execute(
        sql.raw('drop table if exists restrict_race_notes, restrict_race_topics'),
      )
      await database.$client.end()
    })

    it('never leaves a note pointing at a topic that is gone', async () => {
      const Db = bind(
        { Topic, Note },
        {
          Topic: { table: topics },
          Note: {
            table: keyed ? keyedNotes : notes,
            relations: { topic: { field: (keyed ? keyedNotes : notes).topicId } },
          },
        },
      )
      const handlers = RemoteServer.handlers(
        RemoteServer.make<string, DrizzleDatabase>({
          entities: [],
          mutations: [
            RemoteServer.write(DeleteTopic, writer(Db.Topic, options)),
            RemoteServer.write(AddNote, writer(Db.Note, options)),
          ],
        }),
        'ada',
      )
      let requests = 0
      const send = (mutation: string, input: unknown) =>
        Effect.runPromise(
          handlers
            .FoldkitRemoteMutate({ requestId: `race${++requests}`, mutation, input })
            .pipe(Effect.result, Effect.provide(databaseLayer(database))),
        )
      for (let round = 0; round < ROUNDS; round++) {
        await database.execute(sql`insert into restrict_race_topics values (${`r${round}`})`)
        await Promise.all([
          send('AddNote', { id: `r${round}a`, topic: `r${round}` }),
          send('DeleteTopic', { id: `r${round}` }),
          send('AddNote', { id: `r${round}b`, topic: `r${round}` }),
        ])
        expect(
          await rows(
            'select id from restrict_race_notes where topic_id not in (select id from restrict_race_topics)',
          ),
          `round ${round}`,
        ).toEqual([])
      }
    }, 120_000)
  })

racing(
  'A restricted delete racing links on read-committed Postgres, held by the foreign key',
  () => pg!,
  true,
  {},
)
racing(
  'A restricted delete racing links on serializable Postgres, with no foreign key',
  () => serializable(pg!),
  false,
  { isolation: 'serializable' },
)
