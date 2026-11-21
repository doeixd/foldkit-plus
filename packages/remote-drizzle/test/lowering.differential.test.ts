/**
 * The differential test of the SQL lowering (step 8 of the kernel convergence
 * note): every entity conformance case run through the SQL a binding compiles,
 * on a real SQLite and a real Postgres (PGlite), and through metakit's
 * evaluator over the translation of the same body and the same rows. The
 * three answers (both dialects, and memory) must be one list of ids in one
 * order; a case where they part is either named in `differences`, with why, or
 * a bug.
 */
import { postgres } from '../src/pg.js'
import { PGlite } from '@electric-sql/pglite'
import { ne } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { drizzle as drizzlePg } from 'drizzle-orm/pglite'
import { integer as pgInteger, pgTable, text as pgText } from 'drizzle-orm/pg-core'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect } from 'effect'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Held, Operators, Query as Body, type AnyEntity, type HeldRows } from 'foldkit-entity'
import { envOf, foreignOf, lower } from 'foldkit-entity/lowering'
import {
  Relational,
  Subject,
  Variant,
  cases,
  heldWorlds,
  primitiveCases,
  primitiveRefusals,
  refusals,
  relationalCases,
  relationalContext,
  relationalTables,
  rows,
  variantCases,
  variantRows,
  type ConformanceCase,
} from 'foldkit-entity/conformance'
import { Query } from 'foldkit-remote'
import { Node, Str } from 'metakit'
import { evalNode } from 'metakit/build'
import { bind, databaseLayer, entity, entityChecks, query } from '../src/index.js'

postgres()

type Dialect = 'sqlite' | 'postgres'

// --- the three tables of data, in each dialect ---

const sqliteSubjects = sqliteTable('conformance_rows', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  rank: integer('rank').notNull(),
  tag: text('tag'),
  at: text('at').notNull(),
})
const pgSubjects = pgTable('conformance_rows', {
  id: pgText('id').primaryKey(),
  label: pgText('label').notNull(),
  rank: pgInteger('rank').notNull(),
  tag: pgText('tag'),
  at: pgText('at').notNull(),
})

const sqliteVariants = sqliteTable(
  'variant_rows',
  {
    _tag: text('_tag').notNull(),
    id: text('id').primaryKey(),
    label: text('label').notNull(),
    cents: integer('cents'),
    until: text('until'),
  },
  t => entityChecks(Variant, t),
)
const pgVariants = pgTable(
  'variant_rows',
  {
    _tag: pgText('_tag').notNull(),
    id: pgText('id').primaryKey(),
    label: pgText('label').notNull(),
    cents: pgInteger('cents'),
    until: pgText('until'),
  },
  t => entityChecks(Variant, t),
)

const relationalCreate = [
  'create table rel_teams (id text primary key, name text not null, region text)',
  'create table rel_members (id text primary key, handle text not null, rank integer not null, team_id text)',
  'create table rel_badges (id text primary key, kind text not null, member_id text not null)',
  'create table rel_pins (id text primary key, label text not null, team_id text not null)',
]
const relationalColumns: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
  ['rel_teams', ['id', 'name', 'region']],
  ['rel_members', ['id', 'handle', 'rank', 'team']],
  ['rel_badges', ['id', 'kind', 'member']],
  ['rel_pins', ['id', 'label', 'team']],
]
const relationalInserts = relationalTables.flatMap((table, index) => {
  const [name, keys] = relationalColumns[index]!
  return [...table.visible, ...table.hidden].map(
    row => [name, keys.map(key => row[key] ?? null)] as const,
  )
})

const sqliteRelational = (() => {
  const teams = sqliteTable('rel_teams', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    region: text('region'),
  })
  const members = sqliteTable('rel_members', {
    id: text('id').primaryKey(),
    handle: text('handle').notNull(),
    rank: integer('rank').notNull(),
    teamId: text('team_id'),
  })
  const badges = sqliteTable('rel_badges', {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    memberId: text('member_id').notNull(),
  })
  const pins = sqliteTable('rel_pins', {
    id: text('id').primaryKey(),
    label: text('label').notNull(),
    teamId: text('team_id').notNull(),
  })
  return bind(Relational, {
    Team: { table: teams, visible: () => ne(teams.name, 'Hidden') },
    Member: { table: members, relations: { team: { field: members.teamId } } },
    Badge: {
      table: badges,
      visible: () => ne(badges.kind, 'secret'),
      relations: { member: { field: badges.memberId } },
    },
    Pin: { table: pins, relations: { team: { field: pins.teamId } } },
  })
})()
const pgRelational = (() => {
  const teams = pgTable('rel_teams', {
    id: pgText('id').primaryKey(),
    name: pgText('name').notNull(),
    region: pgText('region'),
  })
  const members = pgTable('rel_members', {
    id: pgText('id').primaryKey(),
    handle: pgText('handle').notNull(),
    rank: pgInteger('rank').notNull(),
    teamId: pgText('team_id'),
  })
  const badges = pgTable('rel_badges', {
    id: pgText('id').primaryKey(),
    kind: pgText('kind').notNull(),
    memberId: pgText('member_id').notNull(),
  })
  const pins = pgTable('rel_pins', {
    id: pgText('id').primaryKey(),
    label: pgText('label').notNull(),
    teamId: pgText('team_id').notNull(),
  })
  return bind(Relational, {
    Team: { table: teams, visible: () => ne(teams.name, 'Hidden') },
    Member: { table: members, relations: { team: { field: members.teamId } } },
    Badge: {
      table: badges,
      visible: () => ne(badges.kind, 'secret'),
      relations: { member: { field: badges.memberId } },
    },
    Pin: { table: pins, relations: { team: { field: pins.teamId } } },
  })
})()

const bindings = {
  sqlite: {
    subject: entity('Subject', sqliteSubjects),
    variant: bind({ Variant }, { Variant: { table: sqliteVariants } }).Variant,
    relational: sqliteRelational,
  },
  postgres: {
    subject: entity('Subject', pgSubjects),
    variant: bind({ Variant }, { Variant: { table: pgVariants } }).Variant,
    relational: pgRelational,
  },
}

const subjectCreate =
  'create table conformance_rows (id text primary key, label text not null, rank integer not null, tag text, at text not null)'

// --- the SQL side ---

type Database = {
  readonly layer: ReturnType<typeof databaseLayer>
  readonly dialect: Dialect
}

/** The ids a body's query answers with through a binding, or 'refused' where compiling or running it throws. */
const sqlIds = async (
  body: ConformanceCase['body'],
  input: ConformanceCase['input'],
  target: Parameters<typeof query>[1]['entity'],
  database: Database,
  viewer?: ReturnType<typeof relationalContext>['viewer'],
): Promise<ReadonlyArray<string> | 'refused'> => {
  const descriptor = {
    ...Query.make('Differential', { Input: {}, Result: Query.connection(body.entity) }),
    body,
  }
  try {
    return await Effect.runPromise(
      query(descriptor, { entity: target })
        .run({
          input,
          window: { first: 50 },
          principal: null,
          ...(viewer === undefined ? {} : { viewer }),
        })
        .pipe(
          Effect.map(page => page.edges.map(edge => edge.id)),
          Effect.provide(database.layer),
        ),
    )
  } catch (error) {
    // A body the database or the compiler refuses for the value it holds; any other failure is a bug.
    if (
      !/NUL|NaN|non-finite|safe integer/.test(
        JSON.stringify(error, Object.getOwnPropertyNames(error)),
      )
    ) {
      throw error
    }
    return 'refused'
  }
}

// --- the memory side: metakit's evaluator over the translation ---

const idOf = (row: ReturnType<HeldRows['rows']>[number]): string =>
  Held.match(row.field('id'), { onHeld: String, onUnheld: () => '?' })

/** The ids the translation keeps, in the order the translated keys give. */
const memoryIds = (
  c: { readonly body: ConformanceCase['body']; readonly input: ConformanceCase['input'] },
  holder: HeldRows,
  context?: ReturnType<typeof relationalContext>,
): ReadonlyArray<string> | 'refused' => {
  const terms = Body.orderFor(c.body, c.input)
  const lowered = lower(c.body.where, terms)
  const foreign = foreignOf(lowered, Operators.kernel)
  const kept: Array<{ readonly id: string; readonly keys: ReadonlyArray<unknown> }> = []
  for (const row of holder.rows(c.body.entity)) {
    const env = envOf(lowered, {
      row,
      owner: c.body.entity.identity,
      input: c.input,
      context,
      rows: holder,
    })
    const answers = lowered.nodes.map(node => evalNode(node, env, foreign))
    if (answers.some(Node.isRefusal)) return 'refused'
    if (answers.every(answer => answer === true)) {
      kept.push({ id: idOf(row), keys: lowered.keys.map(key => evalNode(key, env, foreign)) })
    }
  }
  const order = (left: unknown, right: unknown, index: number): number => {
    const term = terms[index]!
    if (left === null || right === null) {
      if (left === right) return 0
      return (left === null) === (term.nulls === 'first') ? -1 : 1
    }
    const sign =
      typeof left === 'string' && typeof right === 'string'
        ? Str.byCodePoint(left, right)
        : Number(left) - Number(right)
    return term.direction === 'asc' ? sign : -sign
  }
  return kept
    .sort((left, right) => {
      for (const index of terms.keys()) {
        const sign = order(left.keys[index], right.keys[index], index)
        if (sign !== 0) return sign
      }
      return 0
    })
    .map(({ id }) => id)
}

// --- the cases ---

interface Probe {
  readonly what: string
  readonly c: { readonly body: ConformanceCase['body']; readonly input: ConformanceCase['input'] }
  readonly kind: 'subject' | 'variant' | 'relational'
  /** The ids `expected` names, or `refused`. */
  readonly expected: ReadonlyArray<string> | 'refused'
  readonly context?: ReturnType<typeof relationalContext>
}

const probes: ReadonlyArray<Probe> = [
  ...[...cases, ...primitiveCases].map((c): Probe => ({
    what: c.what,
    c,
    kind: 'subject',
    expected: c.expected,
  })),
  ...[...refusals, ...primitiveRefusals].map((c): Probe => ({
    what: c.what,
    c,
    kind: 'subject',
    expected: 'refused',
  })),
  ...variantCases.map((c): Probe => ({ what: c.what, c, kind: 'variant', expected: c.expected })),
  ...relationalCases.map((c): Probe => ({
    what: c.what,
    c,
    kind: 'relational',
    expected: c.expected,
    context: relationalContext(c),
  })),
]

const holderOf = (probe: Probe): HeldRows => {
  const entityOf: AnyEntity = probe.c.body.entity
  switch (probe.kind) {
    case 'subject':
      return Held.rows([{ entity: entityOf, rows }])
    case 'variant':
      return Held.rows([{ entity: entityOf, rows: variantRows }])
    case 'relational':
      return Held.rows(heldWorlds[0]!.tables)
  }
}

/**
 * Where SQL and memory part, by case, with why: the meanings the kernel
 * convergence note settles ("Where do the two languages disagree"), seen from
 * the database. None today; a case added here names the dialects it parts on.
 */
const differences: ReadonlyArray<{
  readonly what: string
  readonly dialect: Dialect | 'both'
  readonly sql: ReadonlyArray<string> | 'refused'
  readonly memory: ReadonlyArray<string> | 'refused'
  readonly why: string
}> = []

const settle = (what: string, dialect: Dialect) =>
  differences.find(
    each => each.what === what && (each.dialect === dialect || each.dialect === 'both'),
  )

const agreement = { agreed: 0, listed: 0 }

const run = (dialect: Dialect, database: () => Database) =>
  describe(`SQL on ${dialect} against metakit's evaluation of the translation`, () => {
    it.each(probes.map(probe => ({ probe, name: probe.what })))('$name', async ({ probe }) => {
      const holder = holderOf(probe)
      const memory = memoryIds(probe.c, holder, probe.context)
      const target =
        probe.kind === 'subject'
          ? bindings[dialect].subject
          : probe.kind === 'variant'
            ? bindings[dialect].variant
            : Object.values(bindings[dialect].relational).find(
                each => each.name === probe.c.body.entity.name,
              )!
      const database_ = database()
      const answered = await sqlIds(
        probe.c.body,
        probe.c.input,
        target,
        database_,
        probe.context?.viewer,
      )
      const listed = settle(probe.what, dialect)
      if (listed === undefined) {
        expect(answered).toEqual(memory)
        expect(memory).toEqual(probe.expected)
        agreement.agreed++
      } else {
        expect({ sql: answered, memory }).toEqual({ sql: listed.sql, memory: listed.memory })
        agreement.listed++
      }
    })
  })

describe('every conformance case, the compiled SQL against the translation in memory', () => {
  let sqlite: DatabaseSync
  let pglite: PGlite
  beforeAll(async () => {
    sqlite = new DatabaseSync(':memory:')
    pglite = await PGlite.create()
    const variantCreate =
      'create table variant_rows (_tag text not null, id text primary key, label text not null, cents integer, until text)'
    for (const statement of [subjectCreate, variantCreate, ...relationalCreate]) {
      sqlite.exec(statement)
      await pglite.exec(statement)
    }
    for (const row of rows) {
      const values = [row.id, row.label, row.rank, row.tag, row.at]
      sqlite
        .prepare('insert into conformance_rows values (?, ?, ?, ?, ?)')
        .run(...(values as Array<string | number | null>))
      await pglite.query('insert into conformance_rows values ($1, $2, $3, $4, $5)', values)
    }
    for (const row of variantRows) {
      const values = [row._tag, row.id, row.label, row.cents, row.until]
      sqlite
        .prepare('insert into variant_rows values (?, ?, ?, ?, ?)')
        .run(...(values as Array<string | number | null>))
      await pglite.query('insert into variant_rows values ($1, $2, $3, $4, $5)', values)
    }
    for (const [name, values] of relationalInserts) {
      sqlite
        .prepare(`insert into ${name} values (${values.map(() => '?').join(', ')})`)
        .run(...(values as Array<string | number | null>))
      await pglite.query(
        `insert into ${name} values (${values.map((_, index) => `$${index + 1}`).join(', ')})`,
        [...values],
      )
    }
  }, 60_000)
  afterAll(async () => {
    sqlite.close()
    await pglite.close()
  })

  run('sqlite', () => ({ layer: databaseLayer(drizzle({ client: sqlite })), dialect: 'sqlite' }))
  run('postgres', () => ({
    layer: databaseLayer(drizzlePg({ client: pglite })),
    dialect: 'postgres',
  }))

  it('ran every case on both dialects', () => {
    expect(agreement.agreed + agreement.listed).toBe(probes.length * 2)
    // eslint-disable-next-line no-console
    console.log(
      `differential: ${probes.length} cases x 2 dialects, ${agreement.agreed} identical, ${agreement.listed} listed differences`,
    )
  })
})
