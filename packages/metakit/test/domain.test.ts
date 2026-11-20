import { PGlite } from '@electric-sql/pglite'
import { Effect, Option, Result, Schema } from 'effect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Abstract, Eq, Expr, Ord, Path, Transition, Verdict } from 'metakit'
import { CalendarDay, Decimal, Domain, Money, OrderedEnum } from 'metakit/domain'
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
    const PositiveUsd = Usd.pipe(Expr.refine($ => Money.gt($, Money.minor('USD', 0))))
    expect(Domain.domainOf(PositiveUsd)).toEqual(
      Option.some({ kind: 'money', currency: 'USD', scale: 2 }),
    )
    expect(Money.format(Money.minor('USD', 1250), 'USD')).toBe('12.50 USD')
    expect(() => Money.minor('USD', 12.5)).toThrow(/integer/)
    expect(() => Money.make('USD', { scale: -1 })).toThrow(/scale/)
    expect(() => Money.make('')).toThrow(/currency/)

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

    // Tier 3 Match case-splitting proves OrderedEnum monotonicity synchronously without Z3!
    const $ = Path.forSchema(Booking)
    const goal = Expr.implies(
      OrderStatus.gte($.status, 'paid'),
      Expr.all(Eq.isNot($.status, 'draft'), OrderStatus.gt($.status, 'draft')),
    )
    const tier3Verdict = Abstract.checkInvariant(Booking, goal)
    expect(Verdict.isTrue(tier3Verdict)).toBe(true)
    if (Verdict.isTrue(tier3Verdict)) {
      expect(Option.isSome(tier3Verdict.evidence)).toBe(true)
      if (Option.isSome(tier3Verdict.evidence)) {
        expect(['interval', 'zone']).toContain(tier3Verdict.evidence.value.tier)
      }
    }

    // Prove.invariant returns the synchronous Tier 3 proof without booting Z3
    const proveVerdict = await Effect.runPromise(Prove.invariant(Booking, goal))
    expect(Verdict.isTrue(proveVerdict)).toBe(true)
    if (Verdict.isTrue(proveVerdict) && Option.isSome(proveVerdict.evidence)) {
      expect(proveVerdict.evidence.value.tier).not.toBe('z3')
    }

    // Piecewise pricing table via Match proved synchronously in Tier 3
    const Plan = Schema.Struct({ tier: Schema.Literals(['free', 'pro', 'enterprise']) })
    const $p = Path.forSchema(Plan)
    const Price = Expr.match($p.tier, { free: 0, pro: 29, enterprise: 99 })
    expect(Verdict.isTrue(Abstract.checkInvariant(Plan, Ord.between(Price, 0, 100)))).toBe(true)

    // Broken rule over Match is NOT proved True
    const broken = Expr.implies(OrderStatus.gte($.status, 'pending'), Eq.is($.status, 'paid'))
    expect(Verdict.isTrue(Abstract.checkInvariant(Booking, broken))).toBe(false)

    // Soundness: nullable enum MUST NOT drop the `null` branch during Match case-splitting
    const NullablePlan = Schema.Struct({
      tier: Schema.NullOr(Schema.Literals(['free', 'pro'])),
    })
    const $np = Path.forSchema(NullablePlan)
    const missingNullArm = Expr.match(
      $np.tier as unknown as Path.Path<typeof NullablePlan.Type, 'free' | 'pro'>,
      {
        free: 0,
        pro: 29,
      },
    )
    expect(Verdict.isTrue(Abstract.checkInvariant(NullablePlan, Ord.gte(missingNullArm, 0)))).toBe(
      false,
    )
    // With `otherwise`, the null branch IS covered and Tier 3 proves it soundly
    const coveredNullArm = Expr.matchOrElse($np.tier, { free: 0, pro: 29 }, 10)
    expect(Verdict.isTrue(Abstract.checkInvariant(NullablePlan, Ord.gte(coveredNullArm, 0)))).toBe(
      true,
    )
  }, 30_000)

  it('Decimal: fixed-scale integer parsing, formatting, pinned half-even rounding, and Zone proof', () => {
    const Dec2 = Decimal.make({ scale: 2 })
    expect(Domain.domainOf(Dec2)).toEqual(Option.some({ kind: 'decimal', scale: 2 }))
    expect(() => Decimal.make({ scale: -1 })).toThrow(/between 0 and 12/)
    expect(() => Decimal.make({ scale: 13 })).toThrow(/between 0 and 12/)

    expect(Decimal.parse('12.50', { scale: 2 })).toEqual(Result.succeed(Decimal.units(1250, 2)))
    expect(Decimal.parse('-0.05', { scale: 2 })).toEqual(Result.succeed(Decimal.units(-5, 2)))
    expect(Decimal.parse('0.1', { scale: 2 })).toEqual(Result.succeed(Decimal.units(10, 2)))
    expect(Result.isFailure(Decimal.parse('1.234', { scale: 2 }))).toBe(true)
    expect(Result.isFailure(Decimal.parse('abc', { scale: 2 }))).toBe(true)

    expect(Decimal.format(Decimal.units(1250, 2), { scale: 2 })).toBe('12.50')
    expect(Decimal.format(Decimal.units(-5, 2), { scale: 2 })).toBe('-0.05')
    expect(Decimal.format(Decimal.units(42, 0), { scale: 0 })).toBe('42')

    // Pinned half-even (banker's) rounding across positive & negative ties
    const ties: ReadonlyArray<readonly [number, number, number]> = [
      [5, 2, 2],
      [7, 2, 4],
      [-5, 2, -2],
      [-7, 2, -4],
      [-50, 100, 0],
      [50, 100, 0],
      [150, 100, 2],
      [-150, 100, -2],
      [250, 100, 2],
      [350, 100, 4],
      [149, 100, 1],
      [151, 100, 2],
      [-149, 100, -1],
      [-151, 100, -2],
    ]
    for (const [n, d, expected] of ties) {
      expect(Decimal.roundHalfEven(n, d)).toBe(expected)
    }

    // Tier 3 Zone proves a Decimal discount transition preserves 0 <= discount <= subtotal
    const Order = Schema.Struct({
      subtotal: Dec2,
      discount: Dec2,
    }).pipe(
      Expr.refine($ =>
        Expr.all(
          Decimal.gte($.subtotal, Decimal.units(0, 2)),
          Decimal.gte($.discount, Decimal.units(0, 2)),
          Decimal.lte($.discount, $.subtotal),
        ),
      ),
    )
    const ApplyExtraDiscount = Transition.make({
      state: Order,
      input: Schema.Struct({ extra: Dec2 }),
      when: ({ state, input }) =>
        Expr.all(
          Decimal.gte(input.extra, Decimal.units(0, 2)),
          Decimal.lte(Decimal.add(state.discount, input.extra), state.subtotal),
        ),
      apply: ({ state, input }) => [
        Transition.set(state.discount, Decimal.add(state.discount, input.extra)),
      ],
    })
    expect(Verdict.isTrue(Abstract.checkTransition(Order, ApplyExtraDiscount))).toBe(true)
  })
})
