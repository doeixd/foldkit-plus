// @vitest-environment node
/**
 * A descriptor of a guarded Entity that does not carry the guards, such as
 * the one `Guards.attach` was given (#539). Every reader that enforces guards
 * refuses it by name where it is built: it holds none of the rules, so it
 * would serve the Entity as if no one had guarded it.
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Option, Schema } from 'effect'
import { Entity, Expr, Write } from 'foldkit-entity'
import { Mutation } from 'foldkit-remote'
import { bind, databaseLayer, source, writer, type DrizzleDatabase } from 'foldkit-remote-drizzle'
import { RemoteServer } from 'foldkit-remote-server'
import { describe, expect, it } from 'vitest'
import { GuardDrizzle } from '../src/drizzle.js'
import { Guards } from '../src/index.js'
import { GuardServer } from '../src/server.js'
import { GuardSync } from '../src/sync.js'

const User = Schema.Struct({ id: Schema.String })

const NoteFields = Entity.define(
  'Note',
  Schema.Struct({ id: Schema.String, authorId: Schema.String, body: Schema.String }),
)
const G = Guards.declare(
  'Notes',
  User,
  guard => ({
    isAuthor: guard.row(NoteFields, p => Expr.eq(NoteFields.fields.authorId, p.id)),
  }),
  // Open by default: a bare descriptor, read as unguarded, would let anyone in.
  { key: user => user.id, unguarded: 'allow' },
)
// Anyone may read a note, so the binding's Read rule hides none: only its writer refuses.
const Note = NoteFields.pipe(
  Guards.attach(G, { row: { Read: [Guards.anyone], Write: [G.isAuthor] } }),
)
const Policy = G.implement({})

// Never guarded: its bare descriptor is the only one, and is served as it is.
const Tag = Entity.define('Tag', Schema.Struct({ id: Schema.String, name: Schema.String }))

const notes = sqliteTable('notes', {
  id: text('id').primaryKey(),
  authorId: text('author_id').notNull(),
  body: text('body').notNull(),
})
const tags = sqliteTable('tags', { id: text('id').primaryKey(), name: text('name').notNull() })

const visible = GuardDrizzle.visible(Policy, [Note, Tag])
const Db = bind(
  { Note, Tag },
  { Note: { table: notes, visible: visible.Note }, Tag: { table: tags, visible: visible.Tag } },
)

const Edit = Mutation.write(
  'EditNote',
  Write.update(
    Entity.input(NoteFields, Schema.Struct({ id: Schema.String, body: Schema.String })),
    { id: 'id' },
  ),
)

const named = 'Note carries guards on another descriptor of it; pass the one Guards.attach returned'

describe('A bare descriptor of a guarded Entity', () => {
  // Built from `NoteFields` before #539, the same server let ada overwrite grace's note.
  it('leaves the rules to the descriptor that carries them: ada may not edit grace’s note', async () => {
    const server = RemoteServer.make<Option.Option<typeof User.Type>, DrizzleDatabase>({
      entities: [],
      mutations: [RemoteServer.write(Edit, GuardServer.writer(Note, Policy, writer(Db.Note)))],
    })
    const sqlite = new DatabaseSync(':memory:')
    sqlite.exec(`
      create table notes (id text primary key, author_id text not null, body text not null);
      insert into notes values ('n1', 'grace', 'Hers');
    `)
    const refused = await Effect.runPromise(
      RemoteServer.handlers(server, Option.some({ id: 'ada' }))
        .FoldkitRemoteMutate({
          requestId: 'r1',
          mutation: 'EditNote',
          input: { id: 'n1', body: 'Taken' },
        })
        .pipe(Effect.result, Effect.provide(databaseLayer(drizzle({ client: sqlite })))),
    )
    expect(refused).toMatchObject({ _tag: 'Failure', failure: { _tag: 'Forbidden' } })
    expect(sqlite.prepare('select body from notes').get()).toEqual({ body: 'Hers' })
  })

  it.each([
    ['GuardServer.writer', () => GuardServer.writer(NoteFields, Policy, writer(Db.Note))],
    ['GuardServer.filter', () => GuardServer.filter(NoteFields, Policy)],
    ['GuardServer.memory', () => GuardServer.memory(Policy, [NoteFields])],
    [
      'GuardServer.mutation',
      () =>
        GuardServer.mutation(
          Edit,
          {
            entity: NoteFields,
            policy: Policy,
            interaction: 'Update',
            id: input => input.id,
            source: source(Db.Note),
          },
          () => Effect.succeed({ output: {} }),
        ),
    ],
    ['GuardDrizzle.visible', () => GuardDrizzle.visible(Policy, [NoteFields])],
    [
      'GuardSync.document',
      () => GuardSync.document({ entity: NoteFields, members: ['body'] }, { readers: [] }),
    ],
  ])('is refused by %s, by name', (_, build) => {
    expect(build).toThrow(named)
  })

  it('is no fault where the guards are carried, or where no descriptor has any', () => {
    expect(GuardServer.writer(Note, Policy, writer(Db.Note)).entity).toBe('Note')
    expect(GuardServer.writer(Tag, Policy, writer(Db.Tag)).entity).toBe('Tag')
    expect(Option.isNone(Guards.attached(Tag))).toBe(true)
    expect(GuardSync.document({ entity: Tag, members: ['name'] }, { readers: [] }).entity).toBe(Tag)
  })
})
