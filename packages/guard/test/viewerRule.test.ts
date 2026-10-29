// @vitest-environment node
/**
 * Rules over who asks: a guard set names the Entity its principals are rows
 * of (`viewer`), so a rule compares a link with `Expr.viewer`, and a Read rule
 * compares a field with a path from the viewer, compiled to SQL on SQLite and
 * Postgres (PGlite). A rule judged over one row (a write's, a member's) may
 * not reach another row. operations-phase5-DESIGN §2.
 */
import { DatabaseSync } from 'node:sqlite'
import { PGlite } from '@electric-sql/pglite'
import { sql, type SQL } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { drizzle as drizzlePg } from 'drizzle-orm/pglite'
import { pgTable, text as pgText } from 'drizzle-orm/pg-core'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Option, Schema } from 'effect'
import { Entity, Expr, Relation } from 'foldkit-entity'
import { bind } from 'foldkit-remote-drizzle'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Condition, Guards } from '../src/index.js'
import { GuardDrizzle } from '../src/drizzle.js'

const Fields = {
  Team: Entity.define('Team', Schema.Struct({ id: Schema.String, orgId: Schema.String })),
  Member: Entity.define('Member', Schema.Struct({ id: Schema.String })),
  Note: Entity.define('Note', Schema.Struct({ id: Schema.String, orgId: Schema.String })),
}
const Related = Entity.relate(Fields, {
  Member: { team: Relation.one(Fields.Team, { optional: true }) },
  Note: { author: Relation.one(Fields.Member) },
})
const orgOfViewer = Expr.path(
  Expr.viewer(Related.Member),
  Expr.path(Related.Member.relations.team, Related.Team.fields.orgId),
)

const User = Schema.Struct({ id: Schema.String })
const G = Guards.declare(
  'Notes',
  User,
  guard => ({
    isAuthor: guard.row(Related.Note, () =>
      Expr.eq(Related.Note.relations.author, Expr.viewer(Related.Member)),
    ),
    inOrg: guard.row(Related.Note, () => Expr.eq(Related.Note.fields.orgId, orgOfViewer)),
  }),
  { key: user => user.id, unguarded: 'deny', viewer: Related.Member },
)
const Note = Related.Note.pipe(Guards.attach(G, { row: { Read: [G.inOrg], Update: [G.isAuthor] } }))
const Policy = G.implement({})
const ada = Option.some({ id: 'ada' })

describe('a rule over Expr.viewer', () => {
  const mayUpdate = (principal: Option.Option<{ readonly id: string }>, author: string) =>
    Effect.runSync(
      Effect.map(Policy.writable(Note, principal, 'Update'), ({ condition }) =>
        Condition.holds(
          condition,
          { id: 'n1', author: `Member:${author}` },
          Policy.inputOf(principal),
          () => false,
          Policy.operators,
        ),
      ),
    )

  it('reads the principal as a row of the set’s viewer Entity, by key', () => {
    expect(mayUpdate(ada, 'ada')).toBe(true)
    expect(mayUpdate(ada, 'bo')).toBe(false)
    expect(mayUpdate(Option.none(), 'ada')).toBe(false)
    expect(Policy.viewer(ada)).toEqual(Option.some({ entity: 'Member', id: 'ada' }))
    expect(Policy.viewer(Option.none())).toEqual(Option.none())
  })

  it('is refused in a set that names no viewer, and Expr.now in any rule', () => {
    expect(() =>
      Guards.declare(
        'Blind',
        User,
        guard => ({
          isAuthor: guard.row(Related.Note, () =>
            Expr.eq(Related.Note.relations.author, Expr.viewer(Related.Member)),
          ),
        }),
        { key: user => user.id, unguarded: 'deny' },
      ),
    ).toThrow('reads Expr.viewer, but the set names no viewer Entity')
    const Dated = Entity.define('Dated', Schema.Struct({ id: Schema.String, at: Schema.Number }))
    expect(() =>
      Guards.declare(
        'Clocked',
        User,
        guard => ({ recent: guard.row(Dated, () => Expr.lt(Dated.fields.at, Expr.now)) }),
        { key: user => user.id, unguarded: 'deny' },
      ),
    ).toThrow('reads Expr.now')
  })

  it('reaches another row only on a row’s Read, Update and Delete, which SQL judges', () => {
    expect(() =>
      Related.Note.pipe(Guards.attach(G, { row: { Update: [G.inOrg], Delete: [G.inOrg] } })),
    ).not.toThrow()
    expect(() => Related.Note.pipe(Guards.attach(G, { row: { Write: [G.inOrg] } }))).toThrow(
      'Write names inOrg, which reads another row',
    )
    expect(() => Related.Note.pipe(Guards.attach(G, { row: { Create: [G.inOrg] } }))).toThrow(
      'Create names inOrg, which reads another row',
    )
    expect(() =>
      Related.Note.pipe(Guards.attach(G, { members: { orgId: { Read: [G.inOrg] } } })),
    ).toThrow('orgId.Read names inOrg, which reads another row')
    expect(() => Related.Note.pipe(Guards.attach(G, { always: [G.inOrg] }))).toThrow(
      'always names inOrg, which reads another row',
    )
  })
})

/** The rows: ada on team t1 of acme, bo on no team; one note of each org. */
const seed = [
  "insert into teams values ('t1', 'acme')",
  "insert into members values ('ada', 't1'), ('bo', null)",
  "insert into notes values ('n1', 'acme', 'ada'), ('n2', 'globex', 'bo')",
]
const create = [
  'create table teams (id text primary key, org_id text not null)',
  'create table members (id text primary key, team_id text)',
  'create table notes (id text primary key, org_id text not null, author_id text not null)',
]

const sqliteBound = (() => {
  const teams = sqliteTable('teams', {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
  })
  const members = sqliteTable('members', { id: text('id').primaryKey(), teamId: text('team_id') })
  const notes = sqliteTable('notes', {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    authorId: text('author_id').notNull(),
  })
  return bind(
    { Team: Related.Team, Member: Related.Member, Note },
    {
      Team: { table: teams },
      Member: { table: members, relations: { team: { field: members.teamId } } },
      Note: {
        table: notes,
        visible: GuardDrizzle.visible(Policy, [Note]).Note,
        relations: { author: { field: notes.authorId } },
      },
    },
  )
})()

const pgBound = (() => {
  const teams = pgTable('teams', {
    id: pgText('id').primaryKey(),
    orgId: pgText('org_id').notNull(),
  })
  const members = pgTable('members', { id: pgText('id').primaryKey(), teamId: pgText('team_id') })
  const notes = pgTable('notes', {
    id: pgText('id').primaryKey(),
    orgId: pgText('org_id').notNull(),
    authorId: pgText('author_id').notNull(),
  })
  return bind(
    { Team: Related.Team, Member: Related.Member, Note },
    {
      Team: { table: teams },
      Member: { table: members, relations: { team: { field: members.teamId } } },
      Note: {
        table: notes,
        visible: GuardDrizzle.visible(Policy, [Note]).Note,
        relations: { author: { field: notes.authorId } },
      },
    },
  )
})()

/** The rule `Note`'s binding applies for `principal`, as SQL. */
const ruleFor = (
  bound: typeof sqliteBound | typeof pgBound,
  principal: Option.Option<{ readonly id: string }>,
): SQL => {
  const visible = bound.Note.visible!(principal, bound.Note)
  return Effect.runSync(Effect.isEffect(visible) ? visible : Effect.succeed(visible))!
}

const askers = [
  { who: 'ada, of acme', principal: ada, sees: ['n1'] },
  { who: 'bo, on no team', principal: Option.some({ id: 'bo' }), sees: [] },
  { who: 'a visitor', principal: Option.none(), sees: [] },
]

describe('a Read rule over a path from the viewer, on SQLite', () => {
  const client = new DatabaseSync(':memory:')
  const db = drizzle({ client })
  beforeAll(() => {
    for (const statement of [...create, ...seed]) client.exec(statement)
  })
  afterAll(() => client.close())

  it.each(askers)('lets $who read the notes of their own organisation', ({ principal, sees }) => {
    const rows = db.all<{ id: string }>(
      sql`select id from notes where ${ruleFor(sqliteBound, principal)} order by id`,
    )
    expect(rows.map(row => row.id)).toEqual(sees)
  })
})

describe('a Read rule over a path from the viewer, on Postgres', () => {
  const pglite = new PGlite()
  const db = drizzlePg({ client: pglite })
  beforeAll(async () => {
    for (const statement of [...create, ...seed]) await db.execute(sql.raw(statement))
  }, 60_000)
  afterAll(() => pglite.close())

  it.each(askers)(
    'lets $who read the notes of their own organisation',
    async ({ principal, sees }) => {
      const { rows } = await db.execute<{ id: string }>(
        sql`select id from notes where ${ruleFor(pgBound, principal)} order by id`,
      )
      expect(rows.map(row => row.id)).toEqual(sees)
    },
  )
})
