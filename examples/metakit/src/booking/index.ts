/**
 * Example 3: Hotel Booking & Cancellation Engine
 *
 * Exercises:
 * - `Domain.CalendarDay` & `Time.*` (`Time.daysBetween`, `Time.overlaps`)
 * - `Schema.optional` & `Schema.NullOr` guarded SQL `CHECK` constraints (#641)
 * - `Relation.make` + `Relation.any` / `Relation.count` -> Postgres correlated subqueries in PGlite
 * - `Policy.make` + `Prove.policyImplies` / `Prove.policyConsistent`
 * - `Graph.queryReadiness`
 */
import { Schema } from 'effect'
import { Bool, Eq, Expr, Null, Num, Str, Time } from 'metakit'
import { CalendarDay, Money } from 'metakit/domain'
import * as Policy from 'metakit/policy'
import * as Relation from 'metakit/relation'

export const Usd = Money.make('USD')

const NonEmptyCode = Schema.String.pipe(
  Expr.refine($ => Num.gt(Str.len($), 0), { message: 'promo code must not be empty' }),
)

export const Room = Schema.Struct({
  id: Schema.String,
  roomNumber: Schema.Int.check(Schema.isGreaterThan(0)),
  nightlyRate: Usd.check(Schema.isGreaterThan(0)),
  active: Schema.Boolean,
})
export type Room = typeof Room.Type

export const Reservation = Schema.Struct({
  id: Schema.String,
  roomId: Schema.String,
  checkIn: CalendarDay.schema,
  checkOut: CalendarDay.schema,
  status: Schema.Literals(['confirmed', 'cancelled']),
  promoCode: Schema.optional(NonEmptyCode),
  refundCents: Schema.NullOr(Usd.check(Schema.isGreaterThanOrEqualTo(0))),
}).pipe(
  Expr.refine(
    $ =>
      Expr.all(Num.gt($.checkOut, $.checkIn), Num.lte(Time.daysBetween($.checkOut, $.checkIn), 30)),
    { message: 'stay must be between 1 and 30 nights' },
  ),
)
export type Reservation = typeof Reservation.Type

export const RoomReservations = Relation.make('Reservation.roomId', Reservation)

/** Predicate: room is active and has no overlapping confirmed reservation in `[start, end)`. */
export const roomAvailableFor = Expr.in(
  {
    row: Room,
    window: Schema.Struct({ start: CalendarDay.schema, end: CalendarDay.schema }),
  },
  ({ row, window }) =>
    Expr.all(
      row.active,
      Bool.not(
        Relation.any(row, RoomReservations, res =>
          Expr.all(
            Eq.is(res.status, 'confirmed'),
            Time.overlaps(res.checkIn, res.checkOut, window.start, window.end),
          ),
        ),
      ),
    ),
)

/** Predicate: room currently has at least `minBookings` confirmed reservations. */
export const popularRoom = Expr.in(
  { row: Room, filter: Schema.Struct({ minBookings: Schema.Int }) },
  ({ row, filter }) =>
    Num.gte(
      Relation.count(row, RoomReservations, res => Eq.is(res.status, 'confirmed')),
      filter.minBookings,
    ),
)

export const GuestPrincipal = Schema.Struct({
  tier: Schema.Literals(['standard', 'vip']),
  today: CalendarDay.schema,
})

/** Tiered cancellation refund policy over `{ row: Reservation, principal: GuestPrincipal }`. */
export const CancellationPolicy = Policy.make({
  row: Reservation,
  principal: GuestPrincipal,
  rules: ({ row, principal }) => {
    const daysNotice = Time.daysBetween(row.checkIn, principal.today)
    const isConfirmed = Eq.is(row.status, 'confirmed')
    return {
      fullRefund: Expr.all(
        isConfirmed,
        Expr.any(
          Num.gte(daysNotice, 7),
          Expr.all(Eq.is(principal.tier, 'vip'), Num.gte(daysNotice, 1)),
        ),
      ),
      anyRefund: Expr.all(isConfirmed, Num.gte(daysNotice, 1)),
      /** Deliberately unreachable tier: requires both >= 7 days notice and < 3 days notice. */
      impossibleTier: Expr.all(isConfirmed, Num.gte(daysNotice, 7), Num.lt(daysNotice, 3)),
      hasPromo: Expr.all(isConfirmed, Null.isNotNull(row.promoCode)),
    }
  },
})
