/**
 * Bug-Hunting Sweep 5A: Complex Drizzle (PGlite) + Relation + Custom Language
 * integration AND `Schema.Option` / `Schema.OptionFromNullOr` end-to-end across
 * `Path`, `Transition`, `Expr.rulesOf`, `Inspect`, and `Abstract`.
 */
import { PGlite } from '@electric-sql/pglite'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { boolean, integer, pgTable, text } from 'drizzle-orm/pg-core'
import { Option, Result, Schema } from 'effect'
import { Abstract, Eq, Expr, Null, Num, Path, Str, Transition, Verdict } from 'metakit'
import * as Drizzle from 'metakit/drizzle'
import * as Inspect from 'metakit/inspect'
import * as Relation from 'metakit/relation'
import { describe, expect, it } from 'vitest'
import {
  FeatureFlag,
  FlagRules,
  flagActiveFor,
  highestRulePriority,
  rolloutPgSql,
} from '../src/flags/index.js'

const flagsTable = pgTable('flags', {
  key: text('key').primaryKey(),
  salt: text('salt').notNull(),
  percent: integer('percent').notNull(),
  minAppVersion: text('minAppVersion').notNull(),
  env: text('env').notNull(),
})

const flagRulesTable = pgTable('flag_rules', {
  id: text('id').primaryKey(),
  flagKey: text('flagKey').notNull(),
  enabled: boolean('enabled').notNull(),
  priority: integer('priority').notNull(),
})

describe('Bug-Hunting Sweep 5A: Drizzle + Relation + Foreign + Option integration', () => {
  it('runs Drizzle.toWhere with custom Language foreign ops AND Relation.reduce aggregate in PGlite', async () => {
    const client = new PGlite()
    const db = drizzle({ client })
    const check = Result.getOrThrow(
      Drizzle.toCheck(FeatureFlag, flagsTable, { dialect: 'postgres' }),
    )

    await db.execute(sql`
      CREATE TABLE flags (
        key TEXT PRIMARY KEY,
        salt TEXT NOT NULL,
        percent INTEGER NOT NULL,
        "minAppVersion" TEXT NOT NULL,
        env TEXT NOT NULL,
        CHECK (${check})
      )
    `)
    await db.execute(sql`
      CREATE TABLE flag_rules (
        id TEXT PRIMARY KEY,
        "flagKey" TEXT NOT NULL REFERENCES flags(key),
        enabled BOOLEAN NOT NULL,
        priority INTEGER NOT NULL
      )
    `)

    await db.insert(flagsTable).values([
      { key: 'f1', salt: 's1', percent: 99, minAppVersion: '2.0.0', env: 'prod' },
      { key: 'f2', salt: 's2', percent: 0, minAppVersion: '2.0.0', env: 'prod' },
      { key: 'f3', salt: 's3', percent: 99, minAppVersion: '3.0.0', env: 'prod' },
    ])
    // Drizzle.toCheck rejects out-of-range percent=100 at the DB layer
    await expect(
      db.insert(flagsTable).values({
        key: 'bad',
        salt: 's',
        percent: 100,
        minAppVersion: '1.0.0',
        env: 'prod',
      }),
    ).rejects.toThrow()
    await db.insert(flagRulesTable).values([
      { id: 'r1', flagKey: 'f1', enabled: true, priority: 80 },
      { id: 'r2', flagKey: 'f2', enabled: false, priority: 95 },
      { id: 'r3', flagKey: 'f3', enabled: true, priority: 30 },
    ])

    // 1. Drizzle.toWhere with custom Language foreign ops (bucket + semverGte)
    const activeWhere = Result.getOrThrow(
      Drizzle.toWhere(flagActiveFor, flagsTable, {
        dialect: 'postgres',
        foreign: rolloutPgSql,
        env: { ctx: { userId: 'u2', appVersion: '2.5.0', env: 'prod' } },
      }),
    )
    const activeRows = await db.select({ key: flagsTable.key }).from(flagsTable).where(activeWhere)
    expect(activeRows.map(r => r.key)).toEqual(['f1'])

    // 2. Drizzle.toWhere with Relation.reduce + custom aggregate lowering (MAX)
    const highPriorityWhere = Result.getOrThrow(
      Drizzle.toWhere(Num.gte(highestRulePriority, 50), flagsTable, {
        dialect: 'postgres',
        foreign: rolloutPgSql,
        relations: {
          [FlagRules.name]: { table: flagRulesTable, foreignKey: 'flagKey', key: 'key' },
        },
      }),
    )
    const highRows = await db
      .select({ key: flagsTable.key })
      .from(flagsTable)
      .where(highPriorityWhere)
    expect(highRows.map(r => r.key)).toEqual(['f1'])

    // 3. Drizzle.toUpdate on flagsTable
    const BumpPercent = Transition.make({
      state: FeatureFlag,
      input: Schema.Struct({
        next: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 99 })),
      }),
      when: ({ state, input }) => Num.gt(input.next, state.percent),
      apply: ({ state, input }) => [Transition.set(state.percent, input.next)],
    })
    const upd = Result.getOrThrow(
      Drizzle.toUpdate(BumpPercent, { next: 50 }, flagsTable, { dialect: 'postgres' }),
    )
    await db.update(flagsTable).set(upd.set).where(upd.where)
    const after = await db
      .select({ key: flagsTable.key, percent: flagsTable.percent })
      .from(flagsTable)
      .orderBy(flagsTable.key)
    expect(after).toEqual([
      { key: 'f1', percent: 99 },
      { key: 'f2', percent: 50 },
      { key: 'f3', percent: 99 },
    ])

    await client.close()
  })

  it('handles Schema.Option and Schema.OptionFromNullOr across Path, Transition, rulesOf, Inspect, and Abstract', () => {
    const NonEmpty = Schema.String.annotate({
      title: 'Nickname',
      description: 'Optional alias',
    }).pipe(Expr.refine($ => Num.gt(Str.len($), 0), { message: 'nickname cannot be empty' }))
    const User = Schema.Struct({
      id: Schema.String,
      nickname: Schema.Option(NonEmpty),
      score: Schema.OptionFromNullOr(
        Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100 })).annotate({
          title: 'Score',
        }),
      ),
    })
    type User = typeof User.Type

    // Path.get / Transition.set read/write Option as value | null
    const SetNickname = Transition.make({
      state: User,
      input: Schema.Struct({ nick: Schema.NullOr(Schema.String) }),
      apply: ({ state, input }) => [Transition.set(state.nickname, input.nick)],
    })
    const u0: User = { id: 'u1', nickname: Option.none(), score: Option.some(50) }
    const u1 = Result.getOrThrow(Transition.run(SetNickname, u0, { nick: 'ada' }))
    expect(u1.nickname).toEqual(Option.some('ada'))
    const u2 = Result.getOrThrow(Transition.run(SetNickname, u1, { nick: null }))
    expect(u2.nickname).toEqual(Option.none())
    // No-op preserves reference identity
    const u3 = Result.getOrThrow(Transition.run(SetNickname, u2, { nick: null }))
    expect(u3).toBe(u2)

    // Expr.rulesOf should see refinements inside Schema.Option and Schema.OptionFromNullOr
    const rules = Expr.rulesOf(User)
    expect(rules.length).toBe(3)
    for (const r of rules) {
      expect(Expr.holds(r.expr, u0)).toBe(true)
      expect(Expr.holds(r.expr, u1)).toBe(true)
    }
    expect(Expr.holds(rules[0]!.expr, { ...u0, nickname: Option.some('') })).toBe(false)

    // Inspect should unwrap Option & OptionFromNullOr as nullable with inner kind/bounds/title
    const specs = Inspect.fieldSpecs(User)
    const nickSpec = specs.find(s => s.name === 'nickname')
    const scoreSpec = specs.find(s => s.name === 'score')
    expect(nickSpec?.kind).toBe('string')
    expect(nickSpec?.nullable).toBe(true)
    expect(nickSpec?.title).toEqual(Option.some('Nickname'))
    expect(scoreSpec?.kind).toBe('integer')
    expect(scoreSpec?.nullable).toBe(true)
    expect(scoreSpec?.min).toEqual(Option.some(0))
    expect(scoreSpec?.max).toEqual(Option.some(100))

    // Abstract.checkInvariant sees guarded OptionFromNullOr bounds
    const $ = Path.from(User)
    expect(
      Verdict.isTrue(
        Abstract.checkInvariant(User, Expr.implies(Null.isNotNull($.score), Num.gte($.score, 0))),
      ),
    ).toBe(true)
    expect(Eq.is($.id, 'u1')).toBeDefined()
    expect(Relation.withRows).toBeDefined()
  })
})
