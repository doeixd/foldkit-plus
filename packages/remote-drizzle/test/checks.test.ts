// @vitest-environment node
/**
 * The CHECKs an Entity's rules compile to (#259). The law: for every value of
 * a field's kind, the database accepts it exactly when the field's Schema does,
 * on SQLite and on Postgres. Then what stays the server's, and `bind` refusing
 * a table whose own checks say something else.
 */
import { DatabaseSync } from 'node:sqlite'
import { PGlite } from '@electric-sql/pglite'
import { sql, type SQL } from 'drizzle-orm'
import {
  doublePrecision,
  getTableConfig as pgTableConfig,
  PgDialect,
  real as pgReal,
  pgTable,
  text as pgText,
} from 'drizzle-orm/pg-core'
import {
  check,
  getTableConfig as sqliteTableConfig,
  real,
  SQLiteDialect,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'
import { Schema } from 'effect'
import { Entity, Expr } from 'foldkit-entity'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bind, checkConstraints, entityChecks } from '../src/index.js'

const Rule = Entity.define(
  'Rule',
  Schema.Struct({
    id: Schema.String,
    // A length in UTF-16 units is exact beside a pattern of ASCII alone.
    handle: Schema.String.check(
      Schema.isPattern(/^[a-z0-9_]+$/),
      Schema.isMinLength(3),
      Schema.isMaxLength(15),
    ),
    code: Schema.String.check(Schema.isPattern(/^[A-Z\d-]{2,4}$/)),
    words: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxCodePoints(6)),
    span: Schema.String.check(Schema.isBetweenCodePoints(2, 4)),
    kind: Schema.Literals(['draft', "it's"]),
    level: Schema.Literals([0, 1, 2]),
    amount: Schema.Finite.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(100)),
    ratio: Schema.Finite.check(
      Schema.isBetween({ minimum: 0, maximum: 1, exclusiveMaximum: true }),
    ),
    floor: Schema.Finite.check(Schema.isGreaterThanOrEqualTo(-5), Schema.isLessThan(5)),
    // Effect's upper bound accepts NaN and its lower bound refuses it.
    cap: Schema.Number.check(Schema.isLessThanOrEqualTo(10)),
    least: Schema.Number.check(Schema.isGreaterThan(0)),
    scale: Schema.Finite,
    bio: Schema.NullOr(Schema.String.check(Schema.isMaxCodePoints(3))),
  }),
)
/** Bounds over a field that may be NaN, which SQLite cannot hold: Postgres' alone. */
const nanBounded = new Set(['cap', 'least'])

const valid = {
  handle: 'ada',
  code: 'AB',
  words: 'hi',
  span: 'ok',
  kind: 'draft',
  level: 1,
  amount: 1,
  ratio: 0.5,
  floor: 0,
  cap: 1,
  least: 1,
  scale: 1,
  bio: null,
}
type Field = keyof typeof valid
const fields = Object.keys(valid) as ReadonlyArray<Field>

const sqliteRules = sqliteTable(
  'rules',
  {
    id: text('id').primaryKey(),
    handle: text('handle').notNull(),
    code: text('code').notNull(),
    words: text('words').notNull(),
    span: text('span').notNull(),
    kind: text('kind').notNull(),
    level: real('level').notNull(),
    amount: real('amount').notNull(),
    ratio: real('ratio').notNull(),
    floor: real('floor').notNull(),
    cap: real('cap').notNull(),
    least: real('least').notNull(),
    scale: real('scale').notNull(),
    bio: text('bio'),
  },
  t => entityChecks(Rule, t),
)
const pgRules = pgTable(
  'rules',
  {
    id: pgText('id').primaryKey(),
    handle: pgText('handle').notNull(),
    code: pgText('code').notNull(),
    words: pgText('words').notNull(),
    span: pgText('span').notNull(),
    kind: pgText('kind').notNull(),
    level: doublePrecision('level').notNull(),
    amount: doublePrecision('amount').notNull(),
    ratio: doublePrecision('ratio').notNull(),
    floor: doublePrecision('floor').notNull(),
    cap: doublePrecision('cap').notNull(),
    least: doublePrecision('least').notNull(),
    scale: doublePrecision('scale').notNull(),
    bio: pgText('bio'),
  },
  t => entityChecks(Rule, t),
)

/**
 * What `drizzle-kit` would write for a table: its columns, and each check as the
 * table holds it. `kind` collates without case on SQLite, so a literal compared
 * under the column's own collation would let `DRAFT` in.
 */
const createTable = (
  checks: ReadonlyArray<{ readonly name: string; readonly value: SQL }>,
  dialect: SQLiteDialect | PgDialect,
  kinds: { readonly text: string; readonly number: string; readonly kind: string },
) => {
  const number = new Set<string>(['level', 'amount', 'ratio', 'floor', 'cap', 'least', 'scale'])
  const columns = fields.map(field =>
    field === 'kind'
      ? `kind ${kinds.kind} not null`
      : `${field} ${number.has(field) ? kinds.number : kinds.text}${field === 'bio' ? '' : ' not null'}`,
  )
  const constraints = checks.map(
    ({ name, value }) => `constraint "${name}" check (${dialect.sqlToQuery(value).sql})`,
  )
  return `create table rules (id text primary key, ${[...columns, ...constraints].join(', ')})`
}

const SqliteDb = bind({ Rule }, { Rule: { table: sqliteRules } })
const PgDb = bind({ Rule }, { Rule: { table: pgRules } })

/** A small seeded generator, so a failure names the same values every run. */
const random = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) % 2 ** 31
  return seed / 2 ** 31
}
const next = random(259)
const NUL = String.fromCharCode(0)
const BACKSLASH = String.fromCharCode(92)
/** How SQLite counts a column's code points, a NUL among them. */
const nulSafeLength = (column: string) =>
  `length(json_extract(replace(replace(json_quote(${column}), '${BACKSLASH}${BACKSLASH}', '${BACKSLASH}u005c'), '${BACKSLASH}u0000', ' '), '$'))`
const ALPHABET = [
  'a',
  'b',
  'z',
  'A',
  'Q',
  'Z',
  '0',
  '5',
  '9',
  '_',
  '-',
  '.',
  ' ',
  'é',
  '😀',
  "'",
  '\n',
]
const texts = [
  '',
  'ab',
  'abc',
  'abcdefghijklmno',
  'abcdefghijklmnop',
  '😀',
  '😀😀😀',
  '😀😀😀😀😀😀😀',
  'draft',
  'DRAFT',
  "it's",
  'A-',
  '-9Z1',
  'AB-C9',
  // SQLite's GLOB and length stop at a NUL; the Schema reads past it.
  ...[
    ['ab', 'XY!'],
    ['abc', ''],
    ['ab', 'cdefg'],
    ['a', ''],
    ['', ''],
    ['', 'ab'],
    ['😀', '😀'],
  ].map(([before, after]) => `${before}${NUL}${after}`),
  // The six characters JSON writes for a NUL, as text: not a NUL.
  `${BACKSLASH}u0000`,
  ...Array.from({ length: 250 }, () =>
    Array.from(
      { length: Math.floor(next() * 18) },
      () => ALPHABET[Math.floor(next() * ALPHABET.length)],
    ).join(''),
  ),
]
const numbers = [
  -10,
  -5.000001,
  -5,
  -4.999,
  -0,
  0,
  1e-9,
  0.5,
  0.999999,
  1,
  2,
  3,
  4.999,
  5,
  10,
  10.5,
  99.5,
  100,
  100.000001,
  1e9,
  Infinity,
  -Infinity,
  NaN,
]

/** Each field's candidates: every value of its kind, and `null` where the field admits it. */
const candidates = (field: Field): ReadonlyArray<unknown> =>
  typeof valid[field] === 'number' ? numbers : field === 'bio' ? [...texts, null] : texts

describe.each([
  {
    dialect: 'SQLite',
    // A NaN reaches SQLite as NULL, so the law there is over every other value.
    holds: (value: unknown) => !Number.isNaN(value),
    fields: fields.filter(field => !nanBounded.has(field)),
    open: async () => {
      const db = new DatabaseSync(':memory:')
      db.exec(
        createTable(sqliteTableConfig(sqliteRules).checks, new SQLiteDialect(), {
          text: 'text',
          number: 'real',
          kind: 'text collate nocase',
        }),
      )
      return async (row: Readonly<Record<string, unknown>>) => {
        const keys = Object.keys(row)
        try {
          db.prepare(
            `insert into rules (${keys.join(', ')}) values (${keys.map(() => '?').join(', ')})`,
          ).run(...keys.map(key => row[key] as string | number | null))
          return true
        } catch (error) {
          if (String(error).includes('CHECK constraint failed')) return false
          throw error
        }
      }
    },
  },
  {
    dialect: 'Postgres',
    // Postgres refuses a NUL in text before any CHECK reads it.
    holds: (value: unknown) => typeof value !== 'string' || !value.includes(NUL),
    fields,
    open: async () => {
      await pglite.exec('drop table if exists rules')
      await pglite.exec(
        createTable(pgTableConfig(pgRules).checks, new PgDialect(), {
          text: 'text',
          number: 'double precision',
          kind: 'text',
        }),
      )
      return async (row: Readonly<Record<string, unknown>>) => {
        const keys = Object.keys(row)
        try {
          await pglite.query(
            `insert into rules (${keys.join(', ')}) values (${keys.map((_, i) => `$${i + 1}`).join(', ')})`,
            keys.map(key => row[key]),
          )
          return true
        } catch (error) {
          if (String(error).includes('violates check constraint')) return false
          throw error
        }
      }
    },
  },
])('the law on $dialect', ({ open, holds, fields }) => {
  it.each(fields)(
    'accepts %s exactly when its Schema does',
    async field => {
      const insert = await open()
      const accepts = Schema.is(Schema.toType(Rule.fields[field].schema))
      let id = 0
      const disagreements: Array<unknown> = []
      for (const value of candidates(field).filter(holds)) {
        const row = { ...valid, id: `${field}-${id++}`, [field]: value }
        if ((await insert(row)) !== accepts(value)) disagreements.push(value)
      }
      expect(disagreements).toEqual([])
      // A wide run shares the machine; a few hundred inserts on PGlite can pass the default.
    },
    30_000,
  )
})

let pglite: PGlite
beforeAll(async () => {
  pglite = await PGlite.create()
}, 60_000)
afterAll(() => pglite.close())

it('Postgres holds no NUL in text, so its law has none to judge', async () => {
  await expect(pglite.query('select $1::text', [`a${NUL}`])).rejects.toThrow(
    'invalid byte sequence',
  )
})

describe('checkConstraints', () => {
  it('names one CHECK per ruled column, each the clause entityChecks puts in the table', () => {
    const { constraints, serverOnly } = checkConstraints(SqliteDb.Rule)
    expect(serverOnly).toEqual([
      'Rule.cap: a value less than or equal to 10 (SQLite stores NaN as NULL; a finite field (Schema.Finite) compiles it)',
      'Rule.least: a value greater than 0 (SQLite stores NaN as NULL; a finite field (Schema.Finite) compiles it)',
    ])
    expect(constraints).toEqual(
      sqliteTableConfig(sqliteRules).checks.map(({ name, value }) => ({
        name,
        constraint: `constraint "${name}" check (${new SQLiteDialect().sqlToQuery(value).sql})`,
      })),
    )
    expect(constraints.map(each => each.name)).toEqual(
      fields.filter(field => !nanBounded.has(field)).map(field => `rules_${field}_check`),
    )
    const sqlite = new Map(constraints.map(each => [each.name, each.constraint]))
    expect(sqlite.get('rules_handle_check')).toBe(
      `constraint "rules_handle_check" check (instr("rules"."handle", char(0)) = 0 and "rules"."handle" not glob '*[^a-z0-9_]*' and length("rules"."handle") >= 1 and length("rules"."handle") >= 3 and length("rules"."handle") <= 15)`,
    )
    expect(sqlite.get('rules_span_check')).toBe(
      `constraint "rules_span_check" check (${nulSafeLength('"rules"."span"')} >= 2 and ${nulSafeLength('"rules"."span"')} <= 4)`,
    )
    const postgres = checkConstraints(PgDb.Rule)
    expect(postgres.serverOnly).toEqual([])
    const pg = new Map(postgres.constraints.map(each => [each.name, each.constraint]))
    expect(pg.get('rules_handle_check')).toBe(
      `constraint "rules_handle_check" check ("rules"."handle" !~ '[^a-z0-9_]' and length("rules"."handle") >= 1 and length("rules"."handle") >= 3 and length("rules"."handle") <= 15)`,
    )
    expect(pg.get('rules_cap_check')).toBe(
      `constraint "rules_cap_check" check (("rules"."cap" <= 10 or "rules"."cap" = 'NaN'::double precision))`,
    )
    expect(pg.get('rules_least_check')).toBe(
      `constraint "rules_least_check" check (("rules"."least" > 0 and "rules"."least" <> 'NaN'::double precision))`,
    )
  })

  it('leaves every rule over a float4 column to the server', () => {
    const Price = Entity.define(
      'Price',
      Schema.Struct({
        id: Schema.String,
        amount: Schema.Finite.check(Schema.isLessThanOrEqualTo(0.1)),
        tier: Schema.Literals([1, 2]),
      }),
    )
    const prices = pgTable('prices', {
      id: pgText('id').primaryKey(),
      amount: pgReal('amount').notNull(),
      tier: pgReal('tier').notNull(),
    })
    const { constraints, serverOnly } = checkConstraints(
      bind({ Price }, { Price: { table: prices } }).Price,
    )
    expect(constraints).toEqual([])
    const rounds = 'a float4 column holds the number rounded; double precision compiles it'
    expect(serverOnly).toEqual([
      `Price.amount: a finite number (${rounds})`,
      `Price.amount: a value less than or equal to 0.1 (${rounds})`,
      `Price.tier: one of 1, 2 (${rounds})`,
    ])
  })

  it('lists the rules inside a record and a recursive schema', () => {
    interface Tree {
      readonly label: string
      readonly children: ReadonlyArray<Tree>
    }
    const Tree: Schema.Codec<Tree> = Schema.Struct({
      label: Schema.String.check(Schema.isMaxCodePoints(5)),
      children: Schema.Array(Schema.suspend(() => Tree)),
    })
    const Tagged = Entity.define(
      'Tagged',
      Schema.Struct({
        id: Schema.String,
        tags: Schema.fromJsonString(
          Schema.Record(
            Schema.String.check(Schema.isMaxCodePoints(3)),
            Schema.Number.check(Schema.isGreaterThan(0)),
          ),
        ),
        tree: Schema.fromJsonString(Tree),
        note: Schema.suspend(() => Schema.String.check(Schema.isMaxCodePoints(4))),
      }),
    )
    const tagged = sqliteTable('tagged', {
      id: text('id').primaryKey(),
      tags: text('tags').notNull(),
      tree: text('tree').notNull(),
      note: text('note').notNull(),
    })
    expect(checkConstraints(bind({ Tagged }, { Tagged: { table: tagged } }).Tagged)).toEqual({
      constraints: [],
      serverOnly: [
        'Tagged.tags: a string with at most 3 code points',
        'Tagged.tags: a value greater than 0',
        'Tagged.tree: a string with at most 5 code points',
        'Tagged.note: a string with at most 4 code points',
      ],
    })
  })

  it('lists, by field, each rule SQL cannot say exactly, and a transition invariant', () => {
    const Loose = Entity.define(
      'Loose',
      Schema.Struct({
        id: Schema.String,
        note: Schema.String.check(Schema.isMaxLength(10)),
        name: Schema.String.check(
          Schema.isTrimmed(),
          Schema.makeFilter((name: string) => name !== 'admin', { expected: 'not "admin"' }),
        ),
        caseless: Schema.String.check(Schema.isPattern(/^[a-z]+$/i)),
        // Stored as text: a rule over the number it decodes to is not the column's.
        count: Schema.NumberFromString.check(Schema.isGreaterThan(0)),
      }),
    ).pipe(
      Entity.invariant('noteStays', ({ before, after }) => Expr.eq(after.note, before.note), {
        message: 'A note stays',
      }),
    )
    const loose = sqliteTable('loose', {
      id: text('id').primaryKey(),
      note: text('note').notNull(),
      name: text('name').notNull(),
      caseless: text('caseless').notNull(),
      count: text('count').notNull(),
    })
    const { constraints, serverOnly } = checkConstraints(
      bind({ Loose }, { Loose: { table: loose } }).Loose,
    )
    expect(constraints).toEqual([])
    expect(serverOnly).toEqual([
      'Loose.note: a value with a length of at most 10 (counted in UTF-16 units; SQL counts code points, as Schema.isMaxCodePoints does)',
      'Loose.name: a string with no leading or trailing whitespace',
      'Loose.name: not "admin"',
      'Loose.caseless: a string matching the RegExp ^[a-z]+$',
      'Loose.count: a value greater than 0',
      `Loose's invariant "noteStays": reads the row before the write`,
    ])
  })

  it('reads the stored side of a transformation', () => {
    const Profile = Entity.define(
      'Profile',
      Schema.Struct({
        id: Schema.String,
        bio: Schema.OptionFromNullOr(Schema.String.check(Schema.isMaxCodePoints(3))),
      }),
    )
    const profiles = sqliteTable('profiles', { id: text('id').primaryKey(), bio: text('bio') })
    const { constraints, serverOnly } = checkConstraints(
      bind({ Profile }, { Profile: { table: profiles } }).Profile,
    )
    expect(constraints.map(each => each.constraint)).toEqual([
      `constraint "profiles_bio_check" check (${nulSafeLength('"profiles"."bio"')} <= 3)`,
    ])
    expect(serverOnly).toEqual([])
  })
})

describe('entityChecks', () => {
  const Post = Entity.define(
    'Post',
    Schema.Struct({
      id: Schema.String,
      body: Schema.String.check(Schema.isMaxCodePoints(280)),
      likes: Schema.Number,
    }),
  ).pipe(
    Entity.invariant('likesCount', ({ after }) => Expr.gte(after.likes, 0), {
      message: 'Likes count up from none',
    }),
  )

  it('holds an invariant as a CHECK that a null fails', () => {
    const posts = sqliteTable(
      'posts',
      { id: text('id').primaryKey(), body: text('body').notNull(), likes: real('likes').notNull() },
      t => entityChecks(Post, t),
    )
    expect(sqliteTableConfig(posts).checks.map(each => each.name)).toEqual([
      'posts_body_check',
      'posts_likesCount',
    ])
    const db = new DatabaseSync(':memory:')
    // `likes` admits a null here, as raw SQL could write one, for the check alone to refuse it.
    db.exec(
      `create table posts (id text primary key, body text not null, likes real, ${checkConstraints(
        bind({ Post }, { Post: { table: posts } }).Post,
      )
        .constraints.map(each => each.constraint)
        .join(', ')})`,
    )
    expect(() => db.exec("insert into posts values ('p1', 'hi', null)")).toThrow(
      'CHECK constraint failed: posts_likesCount',
    )
  })

  it('takes the column of a field stored under another key', () => {
    const posts = sqliteTable(
      'posts',
      { id: text('id').primaryKey(), text: text('body').notNull(), likes: real('likes').notNull() },
      t => entityChecks(Post, t, { fields: { body: t.text } }),
    )
    expect(sqliteTableConfig(posts).checks.map(each => each.name)).toEqual([
      'posts_body_check',
      'posts_likesCount',
    ])
  })

  it('refuses a field with no column', () => {
    const posts = sqliteTable('posts', { id: text('id').primaryKey(), text: text('body') }, t =>
      entityChecks(Post, t),
    )
    expect(() => sqliteTableConfig(posts)).toThrow(
      'field "body" on entity "Post" has no column; name one under "fields"',
    )
  })
})

describe('bind, over a table that holds checks', () => {
  const Post = Entity.define(
    'Post',
    Schema.Struct({
      id: Schema.String,
      body: Schema.String.check(Schema.isMaxCodePoints(280)),
      likes: Schema.Number,
    }),
  ).pipe(
    Entity.invariant('likesCount', ({ after }) => Expr.gte(after.likes, 0), {
      message: 'Likes count up from none',
    }),
  )
  const columns = {
    id: text('id').primaryKey(),
    body: text('body').notNull(),
    likes: real('likes').notNull(),
  }
  const bindTo = (table: ReturnType<typeof sqliteTable>) => () =>
    bind({ Post }, { Post: { table } })

  it('takes one whose checks are the Entity’s, beside checks of its own', () => {
    const posts = sqliteTable('posts', columns, t => [
      ...entityChecks(Post, t),
      check('own_short_id', sql`length(${t.id}) < 40`),
    ])
    expect(bindTo(posts)).not.toThrow()
  })

  it('takes one that holds none of them', () => {
    expect(bindTo(sqliteTable('posts', columns))).not.toThrow()
  })

  it('refuses one whose check says another rule', () => {
    const posts = sqliteTable('posts', columns, t => [
      check('posts_body_check', sql`length(${t.body}) <= 300`),
      check('posts_likesCount', sql`(${t.likes} >= 0) is true`),
    ])
    expect(bindTo(posts)).toThrow(
      `table "posts"'s CHECK "posts_body_check" says length("posts"."body") <= 300, but Post's rules say ${nulSafeLength('"posts"."body"')} <= 280`,
    )
  })

  it('takes one whose checks name their columns unqualified, as drizzle-kit pull writes them', () => {
    const posts = sqliteTable('posts', columns, () => [
      check('posts_body_check', sql.raw(`${nulSafeLength('"body"')} <= 280`)),
      check('posts_likesCount', sql.raw('("likes" >= 0) is true')),
    ])
    expect(bindTo(posts)).not.toThrow()
  })

  it('reads a qualifier inside a string literal as text', () => {
    const Tag = Entity.define(
      'Tag',
      Schema.Struct({ id: Schema.String, kind: Schema.Literals(['"tags".a']) }),
    )
    const tags = sqliteTable(
      'tags',
      { id: text('id').primaryKey(), kind: text('kind').notNull() },
      t => [check('tags_kind_check', sql`${t.kind} collate binary in ('a')`)],
    )
    expect(() => bind({ Tag }, { Tag: { table: tags } })).toThrow(
      `table "tags"'s CHECK "tags_kind_check" says "tags"."kind" collate binary in ('a')`,
    )
  })

  it('refuses one holding a column check whose rules are gone', () => {
    const posts = sqliteTable('posts', columns, t => [
      ...entityChecks(Post, t),
      check('posts_likes_check', sql`${t.likes} < 1000`),
    ])
    expect(bindTo(posts)).toThrow(
      'table "posts" holds the CHECK "posts_likes_check", but Post declares no rule a CHECK holds there',
    )
  })

  it('refuses one missing a check beside the others', () => {
    const posts = sqliteTable('posts', columns, t => entityChecks(Post, t).slice(0, 1))
    expect(bindTo(posts)).toThrow(
      'table "posts" lacks the CHECK "posts_likesCount" that Post\'s rules imply',
    )
  })
})
