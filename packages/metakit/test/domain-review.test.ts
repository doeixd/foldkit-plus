import { Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Expr } from 'metakit'
import { CalendarDay, Decimal, Money } from 'metakit/domain'
import * as Sql from 'metakit/sql'

/** A small seeded generator (mulberry32), so a failing case reproduces. */
const seeded = (seed: number) => {
  let state = seed >>> 0
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const decodeDay = Schema.decodeUnknownSync(CalendarDay.schema)

/** Days since 1970-01-01 to a civil date, without `Date` (Howard Hinnant's algorithm). */
const civilFromDays = (days: number): string => {
  const z = days + 719468
  const era = Math.floor(z / 146097)
  const doe = z - era * 146097
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  )
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100))
  const mp = Math.floor((5 * doy + 2) / 153)
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1
  const m = mp < 10 ? mp + 3 : mp - 9
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0)
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

describe('CalendarDay: years 0001 to 9999', () => {
  it('parses and formats the first years and the bounds', () => {
    expect(CalendarDay.fromIso('0001-01-01')).toEqual(Result.succeed(CalendarDay.earliest))
    expect(CalendarDay.fromIso('9999-12-31')).toEqual(Result.succeed(CalendarDay.latest))
    expect(Result.isSuccess(CalendarDay.fromIso('0099-12-31'))).toBe(true)
    expect(Result.isSuccess(CalendarDay.fromIso('0004-02-29'))).toBe(true)
    expect(Result.isFailure(CalendarDay.fromIso('0100-02-29'))).toBe(true)
    expect(Result.isFailure(CalendarDay.fromIso('0000-01-01'))).toBe(true)
    expect(CalendarDay.toIso(CalendarDay.earliest)).toEqual(Result.succeed('0001-01-01'))
    expect(CalendarDay.toIso(CalendarDay.latest)).toEqual(Result.succeed('9999-12-31'))
  })

  it('refuses a day outside the range or not an integer, never giving malformed text', () => {
    for (const day of [-800_000, CalendarDay.earliest - 1, CalendarDay.latest + 1]) {
      expect(Result.isFailure(CalendarDay.toIso(decodeDay(day)))).toBe(true)
    }
    // @ts-expect-error a plain number is not a CalendarDayValue
    expect(Result.isFailure(CalendarDay.toIso(Number.NaN))).toBe(true)
    // @ts-expect-error a plain number is not a CalendarDayValue
    expect(Result.isFailure(CalendarDay.toIso(1.5))).toBe(true)
  })

  it('round-trips seeded days across the whole range and agrees with a reference calendar', () => {
    const random = seeded(601)
    const span = CalendarDay.latest - CalendarDay.earliest
    const days = [CalendarDay.earliest, CalendarDay.latest, 0, -1, 59, -719_103]
    for (let i = 0; i < 5_000; i++)
      days.push(CalendarDay.earliest + Math.floor(random() * (span + 1)))
    for (const raw of days) {
      const day = decodeDay(raw)
      const iso = CalendarDay.toIso(day)
      expect(iso).toEqual(Result.succeed(civilFromDays(raw)))
      if (Result.isSuccess(iso))
        expect(CalendarDay.fromIso(iso.success)).toEqual(Result.succeed(day))
    }
  })
})

describe('Decimal and Money: scale, range and one formatter', () => {
  it('formats at the scale the value carries', () => {
    expect(Decimal.format(Decimal.units(12345, 4), { scale: 4 })).toBe('1.2345')
    expect(Decimal.format(Decimal.units(-5, 3), { scale: 3 })).toBe('-0.005')
    expect(Money.format(Money.minor('USD', 12345, 3), 'USD', { scale: 3 })).toBe('12.345 USD')
    expect(Money.format(Money.minor('JPY', -500, 0), 'JPY', { scale: 0 })).toBe('-500 JPY')
  })

  it('refuses to format a value that is not a safe integer', () => {
    // @ts-expect-error a plain number is not a DecimalValue
    expect(() => Decimal.format(0.5, { scale: 2 })).toThrow(/safe integer/)
    // @ts-expect-error a plain number is not a DecimalValue
    expect(() => Decimal.format(Number.NaN, { scale: 2 })).toThrow(/safe integer/)
  })

  it('refuses unsafe integers where a value is made or rounded', () => {
    expect(() => Decimal.units(1e20)).toThrow(/safe integer/)
    expect(() => Money.minor('USD', 1e20)).toThrow(/safe integer/)
    expect(() => Decimal.roundHalfEven(1e20, 3)).toThrow(/safe integer/)
    expect(() => Decimal.roundHalfEven(10, 1e20)).toThrow(/safe integer/)
    expect(Decimal.roundHalfEven(Number.MAX_SAFE_INTEGER, 2)).toBe(4_503_599_627_370_496)
    expect(Decimal.units(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER)
  })

  it('formats money in integers, as Decimal does, where float division drifts', () => {
    const amount = 6_033_887_241_795_942
    expect(Money.format(Money.minor('USD', amount, 1), 'USD', { scale: 1 })).toBe(
      '603388724179594.2 USD',
    )
    expect(Decimal.format(Decimal.units(amount, 1), { scale: 1 })).toBe('603388724179594.2')
    expect(Money.parse('USD', '603388724179594.2', { scale: 1 })).toEqual(
      Result.succeed(Money.minor('USD', amount, 1)),
    )
  })

  it('gives Money and Decimal the same operation set', () => {
    const Usd = Money.make('USD')
    const Dec = Decimal.make({ scale: 2 })
    const Pair = Schema.Struct({ a: Usd, b: Usd, x: Dec, y: Dec })
    const row = {
      a: Money.minor('USD', 500),
      b: Money.minor('USD', 700),
      x: Decimal.units(-3, 2),
      y: Decimal.units(4, 2),
    }
    const run = <A>(expr: Expr.Expr<{ readonly row: typeof Pair.Type }, A>): A =>
      Expr.eval(expr, { row })
    expect(run(Expr.in({ row: Pair }, ({ row: r }) => Money.isNot(r.a, r.b)))).toBe(true)
    expect(run(Expr.in({ row: Pair }, ({ row: r }) => Money.isNot(r.a, r.a)))).toBe(false)
    expect(run(Expr.in({ row: Pair }, ({ row: r }) => Money.min(r.a, r.b)))).toBe(500)
    expect(run(Expr.in({ row: Pair }, ({ row: r }) => Money.max(r.a, r.b)))).toBe(700)
    expect(run(Expr.in({ row: Pair }, ({ row: r }) => Decimal.min(r.x, r.y)))).toBe(-3)
    expect(run(Expr.in({ row: Pair }, ({ row: r }) => Decimal.max(r.x, r.y)))).toBe(4)
  })
})

describe('Decimal.mul and Money.mul: exact half-even products', () => {
  const Line = Schema.Struct({
    price: Decimal.make({ scale: 2 }),
    rate: Decimal.make({ scale: 4 }),
    maybe: Schema.NullOr(Decimal.make({ scale: 4 })),
  })
  const Taxed = Expr.in({ row: Line }, ({ row }) =>
    Decimal.mul(row.price, row.rate, { leftScale: 2, rightScale: 4, scale: 2 }),
  )

  /** Reference: round `n / 10^k` half-even by comparing twice the remainder (BigInt, floor-based). */
  const reference = (a: number, b: number, k: number): bigint => {
    const n = BigInt(a) * BigInt(b)
    const d = 10n ** BigInt(k)
    const floor = n >= 0n ? n / d : -((-n + d - 1n) / d)
    const rest = n - floor * d
    if (2n * rest < d) return floor
    if (2n * rest > d) return floor + 1n
    return floor % 2n === 0n ? floor : floor + 1n
  }

  it('matches a BigInt reference over seeded operands, ties included', () => {
    const random = seeded(4242)
    const cases: Array<readonly [number, number]> = [
      [125, 5000],
      [-125, 5000],
      [135, 5000],
      [-135, 5000],
      [1, 5000],
      [3, 5000],
      [0, 9999],
    ]
    for (let i = 0; i < 3_000; i++) {
      const sign = random() < 0.5 ? -1 : 1
      cases.push([
        sign * Math.floor(random() * 10_000_000),
        Math.floor(random() * 200_000) - 100_000,
      ])
    }
    for (const [price, rate] of cases) {
      const got = Expr.eval(Taxed, {
        row: { price: Decimal.units(price, 2), rate: Decimal.units(rate, 4), maybe: null },
      })
      expect(got).toBe(Number(reference(price, rate, 4)))
    }
  })

  it('scales up when the result has more places than the product', () => {
    const Up = Expr.in({ row: Line }, ({ row }) =>
      Decimal.mul(row.price, row.price, { leftScale: 2, rightScale: 2, scale: 6 }),
    )
    const row = { price: Decimal.units(150, 2), rate: Decimal.units(0, 4), maybe: null }
    expect(Expr.eval(Up, { row })).toBe(2_250_000)
  })

  it('is null for a missing operand and for a product outside the safe range', () => {
    const Maybe = Expr.in({ row: Line }, ({ row }) =>
      Decimal.mul(row.price, row.maybe, { leftScale: 2, rightScale: 4, scale: 2 }),
    )
    expect(
      Expr.eval(Maybe, {
        row: { price: Decimal.units(100, 2), rate: Decimal.units(1, 4), maybe: null },
      }),
    ).toBe(null)
    expect(
      Expr.eval(Taxed, {
        row: {
          price: Decimal.units(Number.MAX_SAFE_INTEGER, 2),
          rate: Decimal.units(10_000, 4),
          maybe: null,
        },
      }),
    ).toBe(null)
  })

  it("refuses a stated scale that disagrees with the field's Schema", () => {
    const Loose = Schema.Struct({ rate: Decimal.make<number>({ scale: 4 }) })
    expect(() =>
      Expr.in({ row: Loose }, ({ row }) =>
        Decimal.mul(row.rate, row.rate, { leftScale: 2, rightScale: 4, scale: 2 }),
      ),
    ).toThrow(/scale 4/)
  })

  it('is evaluated in memory only: SQL lowering refuses it', () => {
    expect(
      Result.isFailure(
        Sql.toWhere(
          Expr.in({ row: Line }, ({ row }) =>
            Decimal.gt(
              Decimal.mul(row.price, row.rate, { leftScale: 2, rightScale: 4, scale: 2 }),
              Decimal.units(0, 2),
            ),
          ),
        ),
      ),
    ).toBe(true)
  })

  it('multiplies money by a decimal rate into the same currency and scale', () => {
    const Usd = Money.make('USD')
    const Bill = Schema.Struct({ net: Usd, vat: Decimal.make({ scale: 3 }) })
    const Vat = Expr.in({ row: Bill }, ({ row }) => Money.mul(row.net, row.vat, { rateScale: 3 }))
    // 12.35 USD * 0.200 = 2.470; 0.25 USD * 0.050 = 0.0125 -> 0.01 (half-even)
    expect(
      Expr.eval(Vat, { row: { net: Money.minor('USD', 1235), vat: Decimal.units(200, 3) } }),
    ).toBe(247)
    expect(
      Expr.eval(Vat, { row: { net: Money.minor('USD', 25), vat: Decimal.units(50, 3) } }),
    ).toBe(1)
    expect(
      Expr.eval(Vat, {
        row: { net: Money.minor('USD', Number.MAX_SAFE_INTEGER), vat: Decimal.units(2000, 3) },
      }),
    ).toBe(null)
  })
})
