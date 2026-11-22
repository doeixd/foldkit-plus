// @vitest-environment node
/**
 * Every reader of a row guard answers alike: the server's judge in memory
 * (`Condition.holds`, which a write's check and `GuardServer.memory` run),
 * the SQL a binding's `visible` filter compiles, on SQLite and on Postgres
 * (PGlite), and the page's hint (`Condition.judge`) wherever it decides. Each
 * guard is asked alone as a row's Read rule, and in the combinations a set
 * writes, of each asker over each row: nulls, text the case fold meets, an
 * integer sum, a principal whose id holds a NUL.
 */
import { DatabaseSync } from 'node:sqlite'
import { PGlite } from '@electric-sql/pglite'
import { sql, type SQL } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { drizzle as drizzlePg } from 'drizzle-orm/pglite'
import {
  bigint as pgBigint,
  integer as pgInteger,
  pgTable,
  text as pgText,
} from 'drizzle-orm/pg-core'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Option, Result, Schema } from 'effect'
import { Entity, Expr, Held, Relation, type AnyEntity } from 'foldkit-entity'
import { bind } from 'foldkit-remote-drizzle'
import { postgres } from 'foldkit-remote-drizzle/pg'
import { Verdict } from 'metakit'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { GuardDrizzle } from '../src/drizzle.js'
import { Condition, Guards } from '../src/index.js'

postgres()

const Fields = {
  User: Entity.define('User', Schema.Struct({ id: Schema.String })),
  Doc: Entity.define(
    'Doc',
    Schema.Struct({
      id: Schema.String,
      ownerId: Schema.String,
      title: Schema.String,
      rank: Schema.Int,
      score: Schema.NullOr(Schema.Int),
    }),
  ),
}
const Related = Entity.relate(Fields, { Doc: { author: Relation.one(Fields.User) } })
const Doc = Related.Doc
const { ownerId, title, rank, score } = Doc.fields

const Principal = Schema.Struct({
  id: Schema.String,
  rank: Schema.Int,
  names: Schema.Array(Schema.String),
})
type Principal = typeof Principal.Type

const G = Guards.declare(
  'Differential',
  Principal,
  guard => ({
    isRoot: guard.principal(),
    isOwner: guard.row(Doc, p => Expr.eq(ownerId, p.id)),
    isAuthor: guard.row(Doc, () => Expr.eq(Doc.relations.author, Expr.viewer(Related.User))),
    titled: guard.row(Doc, () => Expr.eq(title, 'open')),
    outranks: guard.row(Doc, p => Expr.gte(rank, p.rank)),
    named: guard.row(Doc, p => Expr.in(ownerId, p.names)),
    mentions: guard.row(Doc, () => Expr.contains(title, 'PE')),
    unscored: guard.row(Doc, () => Expr.isNull(score)),
    scoredHigh: guard.row(Doc, () => Expr.gt(score, 5)),
    notMine: guard.row(Doc, p => Expr.not(Expr.eq(ownerId, p.id))),
    doubled: guard.row(Doc, () => Expr.gt(Expr.add(rank, rank), 10)),
    mixed: guard.row(Doc, p =>
      Expr.or(Expr.and(Expr.eq(title, 'open'), Expr.gte(rank, p.rank)), Expr.isNull(score)),
    ),
  }),
  { key: user => user.id, unguarded: 'deny', viewer: Related.User },
)
const Policy = G.implement({
  isRoot: principal => Option.exists(principal, user => user.id === 'root'),
})

const rowGuards = [
  G.isOwner,
  G.isAuthor,
  G.titled,
  G.outranks,
  G.named,
  G.mentions,
  G.unscored,
  G.scoredHigh,
  G.notMine,
  G.doubled,
  G.mixed,
]
const rules = [
  ...rowGuards.map(guard => ({ name: guard.name, read: [guard] })),
  { name: 'isOwner or titled', read: [G.isOwner, G.titled] },
  { name: 'all of outranks and unscored', read: [Guards.all(G.outranks, G.unscored)] },
  { name: 'isRoot or scoredHigh', read: [G.isRoot, G.scoredHigh] },
  { name: 'isAuthor or doubled', read: [G.isAuthor, G.doubled] },
]

/** 2^52: twice it is past the safe integer range, which metakit refuses. */
const huge = 4503599627370496
const docs = [
  { id: 'd1', ownerId: 'ada', author: 'ada', title: 'open', rank: 3, score: null },
  { id: 'd2', ownerId: 'bo', author: 'bo', title: 'Pending', rank: 7, score: 9 },
  { id: 'd3', ownerId: 'cy', author: 'ada', title: 'closed', rank: 0, score: 2 },
  { id: 'd4', ownerId: 'ada', author: 'bo', title: 'OPEN', rank: huge, score: null },
  { id: 'd5', ownerId: '', author: 'cy', title: '', rank: -4, score: 5 },
] as const
const users = ['ada', 'bo', 'cy']

const askers: ReadonlyArray<{
  readonly who: string
  readonly principal: Option.Option<Principal>
}> = [
  { who: 'a visitor', principal: Option.none() },
  { who: 'ada', principal: Option.some({ id: 'ada', rank: 3, names: ['bo', 'cy'] }) },
  { who: 'root', principal: Option.some({ id: 'root', rank: 0, names: [] }) },
  { who: 'bo', principal: Option.some({ id: 'bo', rank: 100, names: ['', 'ada'] }) },
  { who: 'a NUL', principal: Option.some({ id: 'a\u0000', rank: 1, names: ['a\u0000'] }) },
]

const create = [
  'create table users (id text primary key)',
  'create table docs (id text primary key, owner_id text not null, author_id text not null, title text not null, rank bigint not null, score integer)',
]
const seed = [
  `insert into users values ${users.map(id => `('${id}')`).join(', ')}`,
  `insert into docs values ${docs
    .map(
      doc =>
        `('${doc.id}', '${doc.ownerId}', '${doc.author}', '${doc.title}', ${doc.rank}, ${doc.score ?? 'null'})`,
    )
    .join(', ')}`,
]

const sqliteDocs = sqliteTable('docs', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  authorId: text('author_id').notNull(),
  title: text('title').notNull(),
  rank: integer('rank').notNull(),
  score: integer('score'),
})
const sqliteUsers = sqliteTable('users', { id: text('id').primaryKey() })
const pgDocs = pgTable('docs', {
  id: pgText('id').primaryKey(),
  ownerId: pgText('owner_id').notNull(),
  authorId: pgText('author_id').notNull(),
  title: pgText('title').notNull(),
  rank: pgBigint('rank', { mode: 'number' }).notNull(),
  score: pgInteger('score'),
})
const pgUsers = pgTable('users', { id: pgText('id').primaryKey() })

/** One rule's Doc, and the `visible` filter its binding applies. */
const cases = rules.map(({ name, read }) => {
  const Ruled = Doc.pipe(Guards.attach(G, { row: { Read: read } }))
  return { name, Ruled, visible: GuardDrizzle.visible(Policy, [Ruled]).Doc }
})

/** The rows `visible` lets an asker read, by id; none where it refuses to compile. */
const sqlFilter = (
  visible: (typeof cases)[number]['visible'],
  binding: Parameters<(typeof cases)[number]['visible']>[1],
  principal: Option.Option<Principal>,
): Result.Result<SQL, unknown> => {
  const made = visible(principal, binding)
  return Effect.runSync(Effect.result(Effect.isEffect(made) ? made : Effect.succeed(made))).pipe(
    Result.map(filter => filter ?? sql`1 = 1`),
  )
}

/** What the server's judge in memory makes of each row: the ids it lets the asker read. */
const inMemory = (Ruled: AnyEntity, principal: Option.Option<Principal>) => {
  const condition = Effect.runSync(Policy.readable(Ruled, principal))
  return docs
    .filter(doc =>
      Condition.holds(
        condition,
        { ...doc, author: `User:${doc.author}` },
        Policy.inputOf(principal),
        () => false,
        Policy.operators,
      ),
    )
    .map(doc => doc.id)
}

const held = Held.rows([
  { entity: Related.User, rows: users.map(id => ({ id })) },
  { entity: Doc, rows: docs.map(({ author, ...doc }) => ({ ...doc, author })) },
])

/** The page's hint over each row: its decided answers, by id. */
const onPage = (
  Ruled: AnyEntity,
  principal: Option.Option<Principal>,
): ReadonlyArray<{ readonly id: string; readonly allowed: boolean }> => {
  const condition = Effect.runSync(Policy.readable(Ruled, principal))
  return docs.flatMap(doc => {
    const verdict = Condition.judge(condition, Option.getOrThrow(held.row(Doc, doc.id)), held)
    return Verdict.isUnknown(verdict) ? [] : [{ id: doc.id, allowed: Verdict.isTrue(verdict) }]
  })
}

const grid = cases.flatMap(each => askers.map(asker => ({ ...each, ...asker })))

/**
 * The one difference left, and its direction. A sum past 2^53 − 1 (`rank +
 * rank > 10` over d4, rank 2^52) is refused in memory and NULL in SQL, so
 * alone neither lets the row through. Beside a rule that holds, SQL's `OR`
 * answers true of `TRUE OR NULL` where memory refuses the whole: bo wrote d4,
 * so `isAuthor or doubled` lets bo read it in SQL and not in memory. Memory
 * is the stricter reader.
 */
const sqlAlone = (name: string, who: string): ReadonlyArray<string> =>
  name === 'isAuthor or doubled' && who === 'bo' ? ['d4'] : []

/** What SQL must read, given what memory allowed: memory's rows and the known difference. */
const sqlReads = (
  name: string,
  who: string,
  Ruled: AnyEntity,
  principal: Option.Option<Principal>,
) => [...new Set([...inMemory(Ruled, principal), ...sqlAlone(name, who)])].sort()

describe('the page’s hint, wherever it decides, is the server’s judge in memory', () => {
  it.each(grid)('$name, asked by $who', ({ Ruled, principal }) => {
    const allowed = new Set<string>(inMemory(Ruled, principal))
    for (const decided of onPage(Ruled, principal))
      expect(decided).toEqual({ id: decided.id, allowed: allowed.has(decided.id) })
  })

  it('decides some of them, so the comparison is not empty', () => {
    const decided = grid.flatMap(({ Ruled, principal }) => onPage(Ruled, principal))
    expect(decided.some(({ allowed }) => allowed)).toBe(true)
    expect(decided.some(({ allowed }) => !allowed)).toBe(true)
  })
})

describe('the SQL filter is the server’s judge in memory, on SQLite', () => {
  const client = new DatabaseSync(':memory:')
  const db = drizzle({ client })
  beforeAll(() => {
    for (const statement of [...create, ...seed]) client.exec(statement)
  })
  afterAll(() => client.close())

  it.each(grid)('$name, asked by $who', ({ name, who, Ruled, visible, principal }) => {
    const binding = bind(
      { User: Related.User, Doc: Ruled },
      {
        User: { table: sqliteUsers },
        Doc: { table: sqliteDocs, visible, relations: { author: { field: sqliteDocs.authorId } } },
      },
    ).Doc
    Result.match(sqlFilter(visible, binding, principal), {
      // A filter that cannot compile lets no one read anything, and neither does memory.
      onFailure: () => expect(inMemory(Ruled, principal)).toEqual([]),
      onSuccess: filter =>
        expect(
          db
            .all<{ id: string }>(sql`select id from docs where ${filter} order by id`)
            .map(row => row.id),
        ).toEqual(sqlReads(name, who, Ruled, principal)),
    })
  })
})

describe('the SQL filter is the server’s judge in memory, on Postgres', () => {
  let pglite: PGlite
  let db: ReturnType<typeof drizzlePg>
  beforeAll(async () => {
    pglite = await PGlite.create()
    db = drizzlePg({ client: pglite })
    for (const statement of [...create, ...seed]) await db.execute(sql.raw(statement))
  }, 60_000)
  afterAll(() => pglite.close())

  it.each(grid)('$name, asked by $who', async ({ name, who, Ruled, visible, principal }) => {
    const binding = bind(
      { User: Related.User, Doc: Ruled },
      {
        User: { table: pgUsers },
        Doc: { table: pgDocs, visible, relations: { author: { field: pgDocs.authorId } } },
      },
    ).Doc
    const compiled = sqlFilter(visible, binding, principal)
    if (Result.isFailure(compiled)) return expect(inMemory(Ruled, principal)).toEqual([])
    const { rows } = await db.execute<{ id: string }>(
      sql`select id from docs where ${compiled.success} order by id`,
    )
    expect(rows.map(row => row.id)).toEqual(sqlReads(name, who, Ruled, principal))
  })
})
