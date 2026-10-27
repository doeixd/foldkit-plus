/**
 * A guarded write that sets a field, moves one and computes one: the row its
 * rules judge is the row the database writes (`Write.apply`, run beside the
 * SQL), so a rule over the computed field refuses exactly what would break it.
 * expr-operations-DESIGN §9.1.
 */
import { DatabaseSync } from 'node:sqlite'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Option, Schema } from 'effect'
import { Entity, Expr, Operators, Write } from 'foldkit-entity'
import { Mutation } from 'foldkit-remote'
import {
  DrizzleOperators,
  bind,
  databaseLayer,
  writer,
  type DrizzleDatabase,
} from 'foldkit-remote-drizzle'
import { RemoteServer, type EntityWriter } from 'foldkit-remote-server'
import { describe, expect, it } from 'vitest'
import { GuardDrizzle } from '../src/drizzle.js'
import { Guards } from '../src/index.js'
import { GuardServer } from '../src/server.js'

const User = Schema.Struct({ id: Schema.String })

const concat = Expr.operator('acme.concat', {
  input: [Schema.String, Schema.String],
  output: Schema.String,
})
const operators = {
  memory: Operators.memory(Operators.implement(concat, (left, right) => `${left}${right}`)),
  sql: DrizzleOperators.make(
    DrizzleOperators.implement(concat, ({ args: [left, right] }) => sql`(${left} || ${right})`),
  ),
}

const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  title: text('title').notNull(),
  label: text('label').notNull(),
  stock: integer('stock').notNull(),
  revision: integer('revision').notNull(),
})
const Fields = Entity.define(
  'Tag',
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    title: Schema.String,
    label: Schema.String,
    stock: Schema.Int,
    revision: Schema.Int,
  }),
)
const G = Guards.declare(
  'Tags',
  User,
  guard => ({
    // Over the row as it would be: a label the write computes, and a stock it moves.
    anyone: guard.principal(),
    labeler: guard.principal(),
    fit: guard.row(Fields, () =>
      Expr.and(Expr.not(Expr.eq(Fields.fields.label, 'banned')), Expr.gte(Fields.fields.stock, 0)),
    ),
  }),
  { key: user => user.id, unguarded: 'allow' },
)
const Tag = Fields.pipe(
  Guards.attach(G, {
    row: { Read: [G.anyone], Update: [G.fit] },
    // A computed field is written as surely as a set one: its Update rule holds.
    members: { label: { Update: [G.labeler] } },
  }),
)
const Policy = G.implement(
  {
    anyone: () => true,
    labeler: principal => Option.exists(principal, user => user.id === 'mo'),
  },
  { operators: operators.memory },
)
const Db = bind(
  { Tag },
  {
    Tag: {
      table: tags,
      visible: GuardDrizzle.visible(Policy, [Tag], { operators: operators.sql }).Tag,
    },
  },
  { operators },
)

const Retag = Mutation.write(
  'Retag',
  Write.update(
    Entity.input(
      Tag,
      Schema.Struct({
        id: Schema.String,
        revision: Schema.Int,
        title: Schema.String,
        prefix: Schema.String,
        by: Schema.Int,
      }),
      { prefix: Entity.unmapped, by: Entity.unmapped },
    ),
    {
      id: 'id',
      expect: 'revision',
      increment: { stock: 'by' },
      // Reads `name`, which no rule does: the guard reads it to work the label out.
      compute: { label: ({ row, input }) => concat(input.prefix, row.name) },
    },
  ),
)

const seeded = () => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    create table tags (id text primary key, name text not null, title text not null, label text not null, stock integer not null, revision integer not null);
    insert into tags values ('t1', 'ned', 'Old', 'plain', 2, 1);
  `)
  return sqlite
}

type Guarded = EntityWriter<Option.Option<typeof User.Type>, DrizzleDatabase>

const open = (
  guarded: Guarded = GuardServer.writer(Tag, Policy, writer(Db.Tag), { revision: 'revision' }),
) => {
  const sqlite = seeded()
  const server = RemoteServer.make<Option.Option<typeof User.Type>, DrizzleDatabase>({
    entities: [],
    mutations: [RemoteServer.write(Retag, guarded)],
  })
  const retag = (input: unknown, by = 'mo') =>
    Effect.runPromise(
      RemoteServer.handlers(server, Option.some({ id: by }))
        .FoldkitRemoteMutate({ requestId: 'r', mutation: 'Retag', input })
        .pipe(Effect.result, Effect.provide(databaseLayer(drizzle({ client: sqlite })))),
    )
  const row = () => sqlite.prepare('select title, label, stock, revision from tags').get()
  return { retag, row }
}

/** The guarded writer called as a caller that registers nothing would call it. */
const direct = (guarded: Guarded) => {
  const sqlite = seeded()
  const update = (prefix: string) => {
    const bound = Write.bind(Retag.write, { id: 't1', revision: 1, title: 'New', prefix, by: 0 })
    return Effect.runPromise(
      guarded
        .update({
          ...bound,
          operation: Option.none(),
          expect: Option.some({ field: 'revision', revision: 1 }),
          when: Option.none(),
          principal: Option.some({ id: 'mo' }),
        })
        .pipe(Effect.result, Effect.provide(databaseLayer(drizzle({ client: sqlite })))),
    )
  }
  const row = () => sqlite.prepare('select title, label, stock, revision from tags').get()
  return { update, row }
}

describe('A guarded write that sets, moves and computes', () => {
  it('writes the row its rules judged', async () => {
    const { retag, row } = open()
    expect(await retag({ id: 't1', revision: 1, title: 'New', prefix: 'o', by: -1 })).toMatchObject(
      { _tag: 'Success' },
    )
    expect(row()).toEqual({ title: 'New', label: 'oned', stock: 1, revision: 2 })
  })

  it('refuses a computed value its rule forbids, and writes nothing', async () => {
    const { retag, row } = open()
    // 'ban' before 'ned' is 'banned': judged over the label the statement would write.
    expect(
      await retag({ id: 't1', revision: 1, title: 'New', prefix: 'ban', by: 0 }),
    ).toMatchObject({ _tag: 'Failure', failure: { _tag: 'Forbidden' } })
    expect(row()).toEqual({ title: 'Old', label: 'plain', stock: 2, revision: 1 })
  })

  it('needs the computed member’s Update rule', async () => {
    const { retag, row } = open()
    expect(
      await retag({ id: 't1', revision: 1, title: 'New', prefix: 'o', by: 0 }, 'ada'),
    ).toMatchObject({ _tag: 'Failure', failure: { _tag: 'Forbidden' } })
    expect(row()).toEqual({ title: 'Old', label: 'plain', stock: 2, revision: 1 })
  })

  it('pins the row it reads only where it has a revision to pin by', () => {
    expect(GuardServer.writer(Tag, Policy, writer(Db.Tag), { revision: 'revision' }).pins).toBe(
      true,
    )
    expect(GuardServer.writer(Tag, Policy, writer(Db.Tag)).pins).toBeUndefined()
  })

  it("judges the value the writer computes, by the writer's table, whatever the policy's", async () => {
    // The policy runs no concat; the writer does, and its value is what is judged.
    const Blind = G.implement({ anyone: () => true, labeler: () => true }, {})
    const { retag, row } = open(
      GuardServer.writer(Tag, Blind, writer(Db.Tag), { revision: 'revision' }),
    )
    expect(
      await retag({ id: 't1', revision: 1, title: 'New', prefix: 'ban', by: 0 }),
    ).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'Forbidden' },
    })
    expect(row()).toEqual({ title: 'Old', label: 'plain', stock: 2, revision: 1 })
  })

  it('is refused where registered when nothing it holds can work the computed value out', () => {
    // A writer naming no table: its rules would judge the label as it was.
    const Blind = G.implement({ anyone: () => true, labeler: () => true }, {})
    const tableless = { ...writer(Db.Tag), operators: undefined }
    expect(() =>
      RemoteServer.write(
        Retag,
        GuardServer.writer(Tag, Blind, tableless, { revision: 'revision' }),
      ),
    ).toThrow('its assignment to "label" calls acme.concat, which the guard cannot work out')
  })

  it('refuses, called directly, a computed value it cannot work out, rather than judge the old one', async () => {
    const Blind = G.implement({ anyone: () => true, labeler: () => true }, {})
    const tableless = { ...writer(Db.Tag), operators: undefined }
    const { update, row } = direct(
      GuardServer.writer(Tag, Blind, tableless, { revision: 'revision' }),
    )
    expect(await update('ban')).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'RemoteServerError' },
    })
    expect(row()).toEqual({ title: 'Old', label: 'plain', stock: 2, revision: 1 })
  })

  it('answers an operator refusing its input as the writer would, not as a defect', async () => {
    const { retag, row } = open()
    const answer = await retag({
      id: 't1',
      revision: 1,
      title: 'New',
      prefix: `o${String.fromCharCode(0)}`,
      by: 0,
    })
    // A fixed message: an implementation's own may say anything.
    expect(answer).toMatchObject({
      _tag: 'Failure',
      failure: {
        _tag: 'RemoteMutationError',
        message: "Tag's write could not be worked out to judge its rules",
      },
    })
    expect(row()).toEqual({ title: 'Old', label: 'plain', stock: 2, revision: 1 })
  })

  it('refuses a writer its rules refuse before working out what it would compute', async () => {
    const { retag } = open()
    const answer = await retag(
      { id: 't1', revision: 1, title: 'New', prefix: `o${String.fromCharCode(0)}`, by: 0 },
      'ada',
    )
    expect(answer).toMatchObject({ _tag: 'Failure', failure: { _tag: 'Forbidden' } })
  })

  it('refuses a sum its rule forbids beside a computed value it allows', async () => {
    const { retag, row } = open()
    expect(await retag({ id: 't1', revision: 1, title: 'New', prefix: 'o', by: -3 })).toMatchObject(
      { _tag: 'Failure', failure: { _tag: 'Forbidden' } },
    )
    expect(row()).toEqual({ title: 'Old', label: 'plain', stock: 2, revision: 1 })
  })
})
