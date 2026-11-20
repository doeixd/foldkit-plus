import { PGlite } from '@electric-sql/pglite'
import { Result, Schema } from 'effect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Eq, Expr, Num, Str, Transition } from 'metakit'
import * as Sql from 'metakit/sql'

const Account = Schema.Struct({
  id: Schema.String,
  balance: Schema.Int,
  reserved: Schema.Int,
  status: Schema.Literals(['open', 'frozen']),
  note: Schema.NullOr(Schema.String),
}).pipe(
  Expr.refine($ =>
    Expr.all(Num.gte($.balance, 0), Num.gte($.reserved, 0), Num.lte($.reserved, $.balance)),
  ),
)
type Account = typeof Account.Type

const Principal = Schema.Struct({
  userId: Schema.String,
  role: Schema.Literals(['owner', 'admin', 'guest']),
})

const CanWithdraw = Expr.in({ row: Account, principal: Principal }, ({ row, principal }) =>
  Expr.all(
    Eq.is(row.status, 'open'),
    Expr.any(Eq.is(principal.role, 'admin'), Eq.is(row.id, principal.userId)),
  ),
)

const WithdrawInput = Schema.Struct({
  amount: Schema.Int.pipe(Expr.refine($ => Num.gt($, 0))),
})

const Withdraw = Transition.make({
  state: Account,
  input: WithdrawInput,
  when: ({ state, input }) =>
    Expr.all(
      Eq.is(state.status, 'open'),
      Num.lte(input.amount, Num.sub(state.balance, state.reserved)),
    ),
  apply: ({ state, input }) => [
    Transition.set(state.balance, Num.sub(state.balance, input.amount)),
  ],
})

let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  const check = Sql.toCheck(Account)
  if (Result.isFailure(check)) throw new Error(check.failure.reason)
  await db.exec(`
    CREATE TABLE "accounts" (
      "id" TEXT PRIMARY KEY,
      "balance" INTEGER NOT NULL,
      "reserved" INTEGER NOT NULL,
      "status" TEXT NOT NULL,
      "note" TEXT,
      ${check.success}
    );
  `)
})

afterAll(async () => {
  await db.close()
})

describe('metakit/sql against PGlite', () => {
  it('enforces Schema Expr.refine invariants via generated SQL CHECK', async () => {
    await db.query(
      `INSERT INTO "accounts" ("id", "balance", "reserved", "status", "note") VALUES ($1, $2, $3, $4, $5)`,
      ['u1', 100, 20, 'open', null],
    )
    await db.query(
      `INSERT INTO "accounts" ("id", "balance", "reserved", "status", "note") VALUES ($1, $2, $3, $4, $5)`,
      ['u2', 50, 10, 'frozen', 'vip'],
    )

    // Violates balance >= 0
    await expect(
      db.query(
        `INSERT INTO "accounts" ("id", "balance", "reserved", "status", "note") VALUES ($1, $2, $3, $4, $5)`,
        ['bad1', -5, 0, 'open', null],
      ),
    ).rejects.toThrow()

    // Violates reserved <= balance
    await expect(
      db.query(
        `INSERT INTO "accounts" ("id", "balance", "reserved", "status", "note") VALUES ($1, $2, $3, $4, $5)`,
        ['bad2', 10, 20, 'open', null],
      ),
    ).rejects.toThrow()
  })

  it('matches Expr.eval on SQL WHERE including nullable columns (IS NOT DISTINCT FROM)', async () => {
    const whereOwner = Sql.toWhere(CanWithdraw, {
      env: { principal: { userId: 'u1', role: 'owner' } },
    })
    expect(Result.isSuccess(whereOwner)).toBe(true)
    if (Result.isFailure(whereOwner)) return

    const res = await db.query<{ id: string }>(
      `SELECT "id" FROM "accounts" WHERE ${whereOwner.success.text} ORDER BY "id"`,
      [...whereOwner.success.params],
    )
    expect(res.rows.map(r => r.id)).toEqual(['u1'])

    // Nullable equality: Eq.is(row.note, null) must match u1 in both SQL and Expr.eval
    const NoteIsNull = Expr.in({ row: Account }, ({ row }) => Eq.is(row.note, null))
    const whereNull = Sql.toWhere(NoteIsNull)
    expect(Result.isSuccess(whereNull)).toBe(true)
    if (Result.isFailure(whereNull)) return

    const nullRows = await db.query<Account>(
      `SELECT * FROM "accounts" WHERE ${whereNull.success.text}`,
      [...whereNull.success.params],
    )
    expect(nullRows.rows.map(r => r.id)).toEqual(['u1'])
    for (const row of nullRows.rows) {
      expect(Expr.eval(NoteIsNull, { row })).toBe(true)
    }

    // oneOf with null matches both 'vip' and NULL in PGlite and Expr.eval
    const NoteIn = Expr.in({ row: Account }, ({ row }) => Eq.oneOf(row.note, ['vip', null]))
    const whereIn = Sql.toWhere(NoteIn)
    expect(Result.isSuccess(whereIn)).toBe(true)
    if (Result.isSuccess(whereIn)) {
      const inRows = await db.query<{ id: string }>(
        `SELECT "id" FROM "accounts" WHERE ${whereIn.success.text} ORDER BY "id"`,
        [...whereIn.success.params],
      )
      expect(inRows.rows.map(r => r.id)).toEqual(['u1', 'u2'])
    }

    // String ops in SQL
    const IdPrefix = Expr.in({ row: Account }, ({ row }) =>
      Expr.all(Str.startsWith(row.id, 'u'), Str.contains(row.id, '2')),
    )
    const whereStr = Sql.toWhere(IdPrefix)
    expect(Result.isSuccess(whereStr)).toBe(true)
    if (Result.isSuccess(whereStr)) {
      const strRows = await db.query<{ id: string }>(
        `SELECT "id" FROM "accounts" WHERE ${whereStr.success.text}`,
        [...whereStr.success.params],
      )
      expect(strRows.rows.map(r => r.id)).toEqual(['u2'])
    }
  })

  it('executes guarded UPDATE from Transition.toUpdate', async () => {
    const updOk = Sql.toUpdate(
      'accounts',
      Withdraw,
      { amount: 30 },
      {
        whereId: { column: 'id', value: 'u1' },
      },
    )
    expect(Result.isSuccess(updOk)).toBe(true)
    if (Result.isFailure(updOk)) return

    const r1 = await db.query(updOk.success.text, [...updOk.success.params])
    expect(r1.affectedRows).toBe(1)

    const after = await db.query<{ balance: number }>(
      `SELECT "balance" FROM "accounts" WHERE "id" = 'u1'`,
    )
    expect(after.rows[0]?.balance).toBe(70)

    // Guard blocks overdraft (available = 70 - 20 = 50, requesting 60)
    const updRefused = Sql.toUpdate(
      'accounts',
      Withdraw,
      { amount: 60 },
      {
        whereId: { column: 'id', value: 'u1' },
      },
    )
    expect(Result.isSuccess(updRefused)).toBe(true)
    if (Result.isFailure(updRefused)) return

    const r2 = await db.query(updRefused.success.text, [...updRefused.success.params])
    expect(r2.affectedRows).toBe(0)
  })

  it('refuses Opaque expressions with SqlUnsupportedError', () => {
    const Op = Expr.in({ row: Account }, () => Expr.opaque({ name: 'custom' }, () => true))
    const res = Sql.toWhere(Op)
    expect(Result.isFailure(res)).toBe(true)
    if (Result.isFailure(res)) {
      expect(res.failure._tag).toBe('SqlUnsupportedError')
      expect(res.failure.reason).toContain('custom')
    }
  })
})
