import { PGlite } from '@electric-sql/pglite'
import { Effect, Option, Result, Schema } from 'effect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Abstract, Eq, Expr, Path, Transition, Verdict } from 'metakit'
import { CalendarDay, Domain, Money, OrderedEnum } from 'metakit/domain'
import * as Prove from 'metakit/prove'
import * as Sql from 'metakit/sql'

const Usd = Money.make('USD')
const OrderStatus = OrderedEnum.make(['draft', 'pending', 'paid', 'refunded'] as const)

const Wallet = Schema.Struct({
  id: Schema.String,
  balance: Usd,
  reserved: Usd,
}).pipe(
  Expr.refine($ =>
    Expr.all(
      Money.gte($.balance, Money.minor('USD', 0)),
      Money.gte($.reserved, Money.minor('USD', 0)),
      Money.lte($.reserved, $.balance),
    ),
  ),
)

const DebitWallet = Transition.make({
  state: Wallet,
  input: Schema.Struct({
    amount: Usd.pipe(Expr.refine($ => Money.gt($, Money.minor('USD', 0)))),
  }),
  when: ({ state, input }) => Money.lte(input.amount, Money.sub(state.balance, state.reserved)),
  apply: ({ state, input }) => [
    Transition.set(state.balance, Money.sub(state.balance, input.amount)),
  ],
})

const Booking = Schema.Struct({
  id: Schema.String,
  start: CalendarDay.schema,
  end: CalendarDay.schema,
  status: OrderStatus.schema,
}).pipe(Expr.refine($ => CalendarDay.onOrBefore($.start, $.end)))

let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  const check = Sql.toCheck(Booking)
  if (Result.isFailure(check)) throw new Error(check.failure.reason)
  await db.exec(`
    CREATE TABLE "bookings" (
      "id" TEXT PRIMARY KEY,
      "start" INTEGER NOT NULL,
      "end" INTEGER NOT NULL,
      "status" TEXT NOT NULL,
      ${check.success}
    );
  `)
})

afterAll(async () => {
  await db.close()
})

describe('metakit/domain', () => {
  it('Money: proves Wallet debit in Tier 3 Zone without Z3 and exposes domain metadata', () => {
    expect(Domain.domainOf(Usd)).toEqual(Option.some({ kind: 'money', currency: 'USD', scale: 2 }))
    expect(Money.format(Money.minor('USD', 1250), 'USD')).toBe('12.50 USD')
    expect(() => Money.minor('USD', 12.5)).toThrow(/integer/)

    const verdict = Abstract.checkTransition(Wallet, DebitWallet)
    expect(Verdict.isTrue(verdict)).toBe(true)
    if (Verdict.isTrue(verdict)) {
      expect(verdict.evidence).toEqual(Option.some(Verdict.Proved('zone')))
    }
  })

  it('CalendarDay: round-trips ISO dates, rejects invalid dates, and proves trial rules in Tier 3 Zone', () => {
    expect(Domain.domainOf(CalendarDay.schema)).toEqual(Option.some({ kind: 'calendarDay' }))
    const d1 = CalendarDay.parseIsoUnsafe('2026-11-20')
    expect(CalendarDay.toIso(d1)).toBe('2026-11-20')
    expect(Result.isFailure(CalendarDay.fromIso('2026-02-30'))).toBe(true)
    expect(Result.isFailure(CalendarDay.fromIso('not-a-date'))).toBe(true)

    // Extending a booking by >= 1 day preserves start <= end in Tier 3 Zone
    const ExtendBooking = Transition.make({
      state: Booking,
      input: Schema.Struct({ days: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)) }),
      apply: ({ state, input }) => [
        Transition.set(state.end, CalendarDay.addDays(state.end, input.days)),
      ],
    })
    const v = Abstract.checkTransition(Booking, ExtendBooking)
    expect(Verdict.isTrue(v)).toBe(true)
  })

  it('OrderedEnum: lowers to SQL CASE WHEN and proves monotonic status transitions in Z3', async () => {
    expect(Domain.domainOf(OrderStatus.schema)).toEqual(
      Option.some({ kind: 'orderedEnum', order: ['draft', 'pending', 'paid', 'refunded'] }),
    )
    expect(() => OrderedEnum.make(['a', 'a'] as const)).toThrow(/duplicate/)

    const d1 = CalendarDay.parseIsoUnsafe('2026-11-01')
    const d2 = CalendarDay.parseIsoUnsafe('2026-11-10')
    await db.query(
      `INSERT INTO "bookings" ("id", "start", "end", "status") VALUES ($1, $2, $3, $4)`,
      ['b1', d1, d2, 'draft'],
    )
    await db.query(
      `INSERT INTO "bookings" ("id", "start", "end", "status") VALUES ($1, $2, $3, $4)`,
      ['b2', d1, d2, 'paid'],
    )
    // CHECK refuses end < start
    await expect(
      db.query(`INSERT INTO "bookings" ("id", "start", "end", "status") VALUES ($1, $2, $3, $4)`, [
        'bad',
        d2,
        d1,
        'draft',
      ]),
    ).rejects.toThrow()

    const PaidOrLater = Expr.in({ row: Booking }, ({ row }) => OrderStatus.gte(row.status, 'paid'))
    const where = Sql.toWhere(PaidOrLater)
    expect(Result.isSuccess(where)).toBe(true)
    if (Result.isSuccess(where)) {
      const res = await db.query<{ id: string }>(
        `SELECT "id" FROM "bookings" WHERE ${where.success.text}`,
        [...where.success.params],
      )
      expect(res.rows.map(r => r.id)).toEqual(['b2'])
    }

    // Z3 proves: if status >= 'paid', then status != 'draft' and status > 'draft'
    const $ = Path.forSchema(Booking)
    const goal = Expr.implies(
      OrderStatus.gte($.status, 'paid'),
      Expr.all(Eq.isNot($.status, 'draft'), OrderStatus.gt($.status, 'draft')),
    )
    const z3Verdict = await Effect.runPromise(Prove.invariant(Booking, goal))
    expect(Verdict.isTrue(z3Verdict)).toBe(true)
  }, 30_000)
})
