import { PGlite } from '@electric-sql/pglite'
import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { integer, pgTable, text } from 'drizzle-orm/pg-core'
import { Option, Result, Schema } from 'effect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Eq, Expr, Num, Ord, Transition, Verdict } from 'metakit'
import { CalendarDay, Money, OrderedEnum } from 'metakit/domain'
import * as Drizzle from 'metakit/drizzle'
import * as Inspect from 'metakit/inspect'
import * as Machine from 'metakit/machine'

const accountsTable = pgTable('accounts', {
  id: text('id').primaryKey(),
  balance: integer('balance').notNull(),
  reserved: integer('reserved').notNull(),
  status: text('status').notNull(),
})

const Account = Schema.Struct({
  id: Schema.String,
  balance: Schema.Int,
  reserved: Schema.Int,
  status: Schema.Literals(['open', 'frozen']),
}).pipe(
  Expr.refine($ =>
    Expr.all(Ord.gte($.balance, 0), Ord.gte($.reserved, 0), Ord.lte($.reserved, $.balance)),
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

const Withdraw = Transition.make({
  state: Account,
  input: Schema.Struct({ amount: Schema.Int.pipe(Expr.refine($ => Ord.gt($, 0))) }),
  when: ({ state, input }) =>
    Expr.all(
      Eq.is(state.status, 'open'),
      Ord.lte(input.amount, Num.sub(state.balance, state.reserved)),
    ),
  apply: ({ state, input }) => [
    Transition.set(state.balance, Num.sub(state.balance, input.amount)),
  ],
  emits: ({ state, input }) => ({
    _tag: 'Debited' as const,
    id: state.id,
    amount: input.amount,
  }),
})

const Freeze = Transition.make({
  state: Account,
  input: Schema.Struct({}),
  when: ({ state }) => Eq.is(state.status, 'open'),
  apply: ({ state }) => [Transition.set(state.status, 'frozen')],
})

const Unfreeze = Transition.make({
  state: Account,
  input: Schema.Struct({}),
  when: ({ state }) => Eq.is(state.status, 'frozen'),
  apply: ({ state }) => [Transition.set(state.status, 'open')],
})

let client: PGlite

beforeAll(async () => {
  client = new PGlite()
  await client.exec(`
    CREATE TABLE "accounts" (
      "id" TEXT PRIMARY KEY,
      "balance" INTEGER NOT NULL,
      "reserved" INTEGER NOT NULL,
      "status" TEXT NOT NULL
    );
    INSERT INTO "accounts" ("id", "balance", "reserved", "status") VALUES
      ('u1', 100, 20, 'open'),
      ('u2', 50, 10, 'frozen');
  `)
})

afterAll(async () => {
  await client.close()
})

describe('Phase 3: metakit/drizzle against PGlite', () => {
  it('executes Drizzle.toWhere and guarded Drizzle.toUpdate end to end', async () => {
    const db = drizzle({ client })

    const checkRes = Drizzle.toCheck(Account, accountsTable)
    expect(Result.isSuccess(checkRes)).toBe(true)

    const whereRes = Drizzle.toWhere(CanWithdraw, accountsTable, {
      env: { principal: { userId: 'u1', role: 'owner' } },
    })
    expect(Result.isSuccess(whereRes)).toBe(true)
    if (Result.isFailure(whereRes)) return

    const rows = await db.select().from(accountsTable).where(whereRes.success)
    expect(rows.map(r => r.id)).toEqual(['u1'])

    const updRes = Drizzle.toUpdate(Withdraw, { amount: 30 }, accountsTable)
    expect(Result.isSuccess(updRes)).toBe(true)
    if (Result.isFailure(updRes)) return

    const updated = await db
      .update(accountsTable)
      .set(updRes.success.set)
      .where(and(eq(accountsTable.id, 'u1'), updRes.success.where))
      .returning()
    expect(updated.length).toBe(1)
    expect(updated[0]!.balance).toBe(70)

    // Guard prevents overdraft
    const badUpd = Drizzle.toUpdate(Withdraw, { amount: 60 }, accountsTable)
    expect(Result.isSuccess(badUpd)).toBe(true)
    if (Result.isSuccess(badUpd)) {
      const none = await db
        .update(accountsTable)
        .set(badUpd.success.set)
        .where(and(eq(accountsTable.id, 'u1'), badUpd.success.where))
        .returning()
      expect(none.length).toBe(0)
    }

    // Missing column on target table fails loudly with SqlUnsupportedError
    const missingCol = Drizzle.toUpdate(Withdraw, { amount: 10 }, {})
    expect(Result.isFailure(missingCol)).toBe(true)
  })
})

describe('Phase 3: metakit/machine (TEA / Sync host)', () => {
  const AccountMachine = Machine.make({
    state: Account,
    transitions: { Withdraw, Freeze, Unfreeze },
  })

  it('derives affordances, footprints, and preserves identity on refused update', () => {
    const open: Account = { id: 'u1', balance: 100, reserved: 20, status: 'open' }
    const frozen: Account = { id: 'u1', balance: 100, reserved: 20, status: 'frozen' }

    expect(AccountMachine.affordances(open)).toEqual({
      available: ['Freeze'],
      disabled: ['Unfreeze'],
      pending: ['Withdraw'],
    })
    expect(AccountMachine.affordances(frozen)).toEqual({
      available: ['Unfreeze'],
      disabled: ['Withdraw', 'Freeze'],
      pending: [],
    })
    expect(
      Verdict.isTrue(
        AccountMachine.canDispatch('Withdraw', { state: open, input: { amount: 50 } }),
      ),
    ).toBe(true)

    expect(AccountMachine.footprints.Freeze.writes).toEqual([['status']])

    const [next, emit] = AccountMachine.update(open, { _tag: 'Withdraw', input: { amount: 25 } })
    expect(next.balance).toBe(75)
    expect(emit).toEqual(Option.some({ _tag: 'Debited', id: 'u1', amount: 25 }))

    // Refused update returns the exact same state reference
    const [same, noEmit] = AccountMachine.update(frozen, {
      _tag: 'Withdraw',
      input: { amount: 10 },
    })
    expect(same).toBe(frozen)
    expect(Option.isNone(noEmit)).toBe(true)
  })
})

describe('Phase 4: metakit/inspect (Forms & Agent JSON Schema)', () => {
  it('extracts field specs, Expr.refine bounds, domain metadata, and JSON Schema', () => {
    const OrderStatus = OrderedEnum.make(['draft', 'paid'] as const)
    const Invoice = Schema.Struct({
      amount: Money.make('USD'),
      dueDate: CalendarDay.schema,
      status: OrderStatus.schema,
      memo: Schema.NullOr(Schema.String),
    }).pipe(Expr.refine($ => Money.gte($.amount, Money.minor('USD', 0))))

    const specs = Inspect.fieldSpecs(Invoice)
    const amountSpec = specs.find(s => s.name === 'amount')!
    expect(amountSpec.min).toEqual(Option.some(0))
    expect(amountSpec.domain).toEqual(Option.some({ kind: 'money', currency: 'USD', scale: 2 }))

    const json = Inspect.toJsonSchema(Invoice) as {
      readonly properties: Readonly<Record<string, Readonly<Record<string, unknown>>>>
    }
    expect(json.properties['amount']!['minimum']).toBe(0)
    expect(json.properties['dueDate']).toEqual({
      type: 'integer',
      'x-metakit-domain': { kind: 'calendarDay' },
    })
    expect(json.properties['status']!['enum']).toEqual(['draft', 'paid'])
    expect(json.properties['memo']!['type']).toEqual(['string', 'null'])

    const aff = Inspect.affordances(
      { Freeze, Unfreeze },
      { id: 'u1', balance: 100, reserved: 0, status: 'open' },
    )
    expect(aff).toEqual({ available: ['Freeze'], disabled: ['Unfreeze'], unknown: [] })
  })
})
