import { PGlite } from '@electric-sql/pglite'
import { Effect, Result, Schema } from 'effect'
import { Abstract, Arr, Eq, Expr, Ord, Path, Str, Verdict } from 'metakit'
import * as Prove from 'metakit/prove'
import * as Sql from 'metakit/sql'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const Item = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  tags: Schema.Array(Schema.String),
})
type Item = typeof Item.Type

describe('Str and Arr core ops across eval, residualize, SQL/PGlite, Zone, and Z3', () => {
  let db: PGlite

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      CREATE TABLE "items" (
        "id" TEXT PRIMARY KEY,
        "name" TEXT NOT NULL,
        "tags" TEXT[] NOT NULL
      );
    `)
    const rows: ReadonlyArray<Item> = [
      { id: '1', name: '🚀', tags: [] },
      { id: '2', name: 'café', tags: ['hot', 'drink'] },
      { id: '3', name: '100%_test\\ok', tags: ['promo'] },
      { id: '4', name: '', tags: ['a', 'b', 'c'] },
      { id: '5', name: '🚀ab_extra', tags: [] },
    ]
    for (const r of rows) {
      await db.query(`INSERT INTO "items" ("id", "name", "tags") VALUES ($1, $2, $3)`, [
        r.id,
        r.name,
        r.tags,
      ])
    }
  })

  afterAll(async () => {
    await db.close()
  })

  it('evaluates Unicode code-point length, startsWith, contains, arr.count, and arr.isEmpty', () => {
    const $ = Path.from(Item)
    // '🚀' is 1 Unicode code point (UTF-16 .length would be 2!)
    expect(Expr.eval(Str.len($.name), { id: '1', name: '🚀', tags: [] })).toBe(1)
    expect(Expr.eval(Str.len($.name), { id: '2', name: 'café', tags: [] })).toBe(4)
    expect(Expr.eval(Str.isEmpty($.name), { id: '4', name: '', tags: [] })).toBe(true)
    expect(
      Expr.eval(Str.startsWith($.name, '100%_'), { id: '3', name: '100%_test\\ok', tags: [] }),
    ).toBe(true)
    expect(
      Expr.eval(Str.contains($.name, '_test\\'), { id: '3', name: '100%_test\\ok', tags: [] }),
    ).toBe(true)
    expect(Expr.eval(Arr.count($.tags), { id: '2', name: 'café', tags: ['hot', 'drink'] })).toBe(2)
    expect(Expr.eval(Arr.isEmpty($.tags), { id: '1', name: '🚀', tags: [] })).toBe(true)
    expect(Expr.eval(Arr.nonEmpty($.tags), { id: '2', name: 'café', tags: ['hot'] })).toBe(true)
  })

  it('folds absorbing empty-string laws in residualize even when target is Unknown', () => {
    const $ = Path.from(Item)
    expect(Verdict.isTrue(Expr.judge(Str.startsWith($.name, ''), {}))).toBe(true)
    expect(Verdict.isTrue(Expr.judge(Str.contains($.name, ''), {}))).toBe(true)
  })

  it('matches JS Expr.eval row-for-row against Postgres (PGlite) including emoji, LIKE wildcards, and text[]', async () => {
    const allRows = (await db.query<Item>(`SELECT * FROM "items" ORDER BY "id"`)).rows
    const predicates = [
      Expr.in({ row: Item }, ({ row }) => Eq.is(Str.len(row.name), 1)),
      Expr.in({ row: Item }, ({ row }) => Ord.gte(Str.len(row.name), 4)),
      Expr.in({ row: Item }, ({ row }) => Str.startsWith(row.name, '100%_')),
      Expr.in({ row: Item }, ({ row }) => Str.contains(row.name, '_test\\')),
      Expr.in({ row: Item }, ({ row }) => Str.startsWith(row.name, '')),
      Expr.in({ row: Item }, ({ row }) => Arr.isEmpty(row.tags)),
      Expr.in({ row: Item }, ({ row }) => Ord.gte(Arr.count(row.tags), 2)),
    ]

    for (const pred of predicates) {
      const where = Result.getOrThrow(
        Sql.toWhere(pred, { dialect: 'postgres', rowPrefix: ['row'] }),
      )
      const pgIds = (
        await db.query<{ id: string }>(
          `SELECT "id" FROM "items" WHERE ${where.text} ORDER BY "id"`,
          [...where.params],
        )
      ).rows.map(r => r.id)
      const jsIds = allRows.filter(row => Expr.eval(pred, { row })).map(r => r.id)
      expect(pgIds).toEqual(jsIds)
    }

    // SQLite dialect binds TWO `?` placeholders and TWO params for startsWith
    const sqliteStarts = Result.getOrThrow(
      Sql.toWhere(
        Expr.in({ row: Item }, ({ row }) => Str.startsWith(row.name, 'pre')),
        { dialect: 'sqlite', rowPrefix: ['row'] },
      ),
    )
    expect(sqliteStarts.text).toContain('substr("name", 1, length(?)) = ?')
    expect(sqliteStarts.params).toEqual(['pre', 'pre'])
  })

  it('proves string length and array emptiness implications in Tier 3 Zone and Tier 4 Z3', async () => {
    const $ = Path.from(Item)

    // str.len >= 0 and arr.count >= 0 synchronously at Tier 3
    expect(Verdict.isTrue(Abstract.checkInvariant(Item, Ord.gte(Str.len($.name), 0)))).toBe(true)
    expect(Verdict.isTrue(Abstract.checkInvariant(Item, Ord.gte(Arr.count($.tags), 0)))).toBe(true)

    // startsWith('🚀ab') => str.len >= 3 (code-point length!) synchronously at Tier 3
    expect(
      Verdict.isTrue(
        Abstract.checkInvariant(
          Item,
          Expr.implies(Str.startsWith($.name, '🚀ab'), Ord.gte(Str.len($.name), 3)),
        ),
      ),
    ).toBe(true)

    // nonEmpty(tags) => arr.count(tags) >= 1 and isEmpty(tags) => arr.count(tags) === 0
    expect(
      Verdict.isTrue(
        Abstract.checkInvariant(
          Item,
          Expr.implies(Arr.nonEmpty($.tags), Ord.gte(Arr.count($.tags), 1)),
        ),
      ),
    ).toBe(true)
    expect(
      Verdict.isTrue(
        Abstract.checkInvariant(
          Item,
          Expr.implies(Arr.isEmpty($.tags), Eq.is(Arr.count($.tags), 0)),
        ),
      ),
    ).toBe(true)

    // Soundness: startsWith('ab') does NOT imply str.len >= 5 (Unknown, never bogus True)
    const tooStrong = Expr.implies(Str.startsWith($.name, 'ab'), Ord.gte(Str.len($.name), 5))
    expect(Verdict.isTrue(Abstract.checkInvariant(Item, tooStrong))).toBe(false)
    const z3TooStrong = await Effect.runPromise(Prove.invariant(Item, tooStrong))
    expect(Verdict.isTrue(z3TooStrong)).toBe(false)
  }, 30_000)
})
