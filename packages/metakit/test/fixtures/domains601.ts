/**
 * The three domains of #601 §2: a bank account with a monthly fee, a booking
 * with a trial/cycle, and an order with a discount and tax. Used as consumers
 * for the standard library operations across memory, SQLite, PGlite, Abstract
 * and Z3.
 */
import { Schema } from 'effect'
import { Num, Ord, Path } from '../../src/index.js'

const Cents = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1_000_000 }))
const SignedCents = Schema.Int.check(Schema.isBetween({ minimum: -1_000_000, maximum: 1_000_000 }))
const MilliCents = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100_000_000 }))

export const BankAccount = Schema.Struct({
  balance: Cents,
  correction: SignedCents,
  rawFee: MilliCents,
})

const $bank = Path.forSchema(BankAccount)
/** Size of a correction: always >= 0. */
export const bankCorrectionSize = Num.abs($bank.correction)
/** Monthly fee rounded from 4 decimal places (milli-cents) to 2 decimal places (cents), half-even. */
export const bankMonthlyFee = Num.round($bank.rawFee, {
  fromScale: 4,
  toScale: 2,
  rounding: 'half-even',
})

export const Booking = Schema.Struct({
  dayNumber: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 365 })),
})

const $booking = Path.forSchema(Booking)
/** Day within a 30-day billing cycle: always in [0, 29]. */
export const bookingCycleDay = Num.rem($booking.dayNumber, 30)

export const Order = Schema.Struct({
  totalCents: Cents,
  lines: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 })),
  rawDiscount: Cents,
  maxDiscount: Cents,
  unitDollars: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 10_000 })),
})

const $order = Path.forSchema(Order)
/** Price split evenly across 4 lines, rounded half-even. */
export const orderQuarterSplit = Num.div($order.totalCents, 4, { rounding: 'half-even' })
/** Price split across a dynamic line count (`onZero: 'null'`). */
export const orderDynamicSplit = Num.div($order.totalCents, $order.lines, {
  rounding: 'half-even',
  onZero: 'null',
})
/** Discount capped at the order's limit. */
export const orderCappedDiscount = Num.min($order.rawDiscount, $order.maxDiscount)
/** Whole dollars converted to scale-2 cents (`* 100`), exact. */
export const orderUnitCents = Num.toDecimal($order.unitDollars, 2)
/** Total cents rounded to whole dollars, half-away-from-zero. */
export const orderWholeDollars = Num.toInt($order.totalCents, {
  scale: 2,
  rounding: 'half-away-from-zero',
})

export const orderSplitWithinTotal = Ord.lte(orderQuarterSplit, $order.totalCents)
export const bookingCycleInRange = Ord.lt(bookingCycleDay, 30)
export const bankCorrectionNonNegative = Ord.gte(bankCorrectionSize, 0)
