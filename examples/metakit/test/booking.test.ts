import { PGlite } from '@electric-sql/pglite'
import { Effect, Option, Result } from 'effect'
import { describe, expect, it } from 'vitest'
import { Expr, Verdict } from 'metakit'
import { CalendarDay, Money } from 'metakit/domain'
import * as Graph from 'metakit/graph'
import * as Prove from 'metakit/prove'
import * as Relation from 'metakit/relation'
import * as Sql from 'metakit/sql'
import {
  CancellationPolicy,
  Reservation,
  RoomReservations,
  popularRoom,
  roomAvailableFor,
} from '../src/booking/index.js'

const day = (iso: string) => Result.getOrThrow(CalendarDay.fromIso(iso))

describe('Example 3: Hotel Booking & Cancellation Engine', () => {
  it('enforces guarded optional/NullOr SQL CHECKs and runs Relation subqueries in PGlite', async () => {
    const db = new PGlite()
    const check = Result.getOrThrow(Sql.toCheck(Reservation, { dialect: 'postgres' }))
    expect(check).toContain('"promoCode" IS NULL')
    expect(check).toContain('"refundCents" IS NULL')

    await db.exec(`
      CREATE TABLE rooms (
        id TEXT PRIMARY KEY,
        "roomNumber" INTEGER NOT NULL,
        "nightlyRate" INTEGER NOT NULL,
        active BOOLEAN NOT NULL
      );
      CREATE TABLE reservations (
        id TEXT PRIMARY KEY,
        "roomId" TEXT NOT NULL REFERENCES rooms(id),
        "checkIn" INTEGER NOT NULL,
        "checkOut" INTEGER NOT NULL,
        status TEXT NOT NULL,
        "promoCode" TEXT,
        "refundCents" INTEGER,
        ${check}
      );
    `)

    await db.query(
      `INSERT INTO rooms (id, "roomNumber", "nightlyRate", active) VALUES
       ('r1', 101, 20000, true),
       ('r2', 102, 25000, true),
       ('r3', 103, 30000, false)`,
    )

    // Valid reservation with NULL promoCode & NULL refundCents passes guarded CHECK
    await db.query(
      `INSERT INTO reservations (id, "roomId", "checkIn", "checkOut", status, "promoCode", "refundCents")
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      ['b1', 'r1', day('2026-06-10'), day('2026-06-15'), 'confirmed', null, null],
    )
    // Cancelled reservation in r2 does not block availability
    await db.query(
      `INSERT INTO reservations (id, "roomId", "checkIn", "checkOut", status, "promoCode", "refundCents")
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      ['b2', 'r2', day('2026-06-10'), day('2026-06-15'), 'cancelled', 'SUMMER', 5000],
    )
    // Empty promoCode violates guarded Schema.optional(NonEmptyCode) CHECK
    await expect(
      db.query(
        `INSERT INTO reservations (id, "roomId", "checkIn", "checkOut", status, "promoCode", "refundCents")
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        ['b-bad', 'r2', day('2026-07-01'), day('2026-07-03'), 'confirmed', '', null],
      ),
    ).rejects.toThrow()
    // Negative refundCents violates guarded Schema.NullOr(>= 0) CHECK
    await expect(
      db.query(
        `INSERT INTO reservations (id, "roomId", "checkIn", "checkOut", status, "promoCode", "refundCents")
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        ['b-neg', 'r2', day('2026-07-01'), day('2026-07-03'), 'cancelled', null, -10],
      ),
    ).rejects.toThrow()
    // 31-night stay violates Time.daysBetween(checkOut, checkIn) <= 30 CHECK
    await expect(
      db.query(
        `INSERT INTO reservations (id, "roomId", "checkIn", "checkOut", status, "promoCode", "refundCents")
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        ['b-long', 'r2', day('2026-07-01'), day('2026-08-01'), 'confirmed', null, null],
      ),
    ).rejects.toThrow()

    // Query available rooms for June 12–14 via correlated NOT EXISTS subquery
    const availWhere = Result.getOrThrow(
      Sql.toWhere(roomAvailableFor, {
        dialect: 'postgres',
        table: 'rooms',
        relations: { 'Reservation.roomId': { table: 'reservations', foreignKey: 'roomId' } },
        env: { window: { start: day('2026-06-12'), end: day('2026-06-14') } },
      }),
    )
    const availRows = await db.query<{ id: string }>(
      `SELECT id FROM rooms WHERE ${availWhere.text} ORDER BY id`,
      [...availWhere.params],
    )
    expect(availRows.rows).toEqual([{ id: 'r2' }])

    // Query popular rooms (>= 1 confirmed reservation) via correlated COUNT subquery
    const popWhere = Result.getOrThrow(
      Sql.toWhere(popularRoom, {
        dialect: 'postgres',
        table: 'rooms',
        relations: { 'Reservation.roomId': { table: 'reservations', foreignKey: 'roomId' } },
        env: { filter: { minBookings: 1 } },
      }),
    )
    const popRows = await db.query<{ id: string }>(
      `SELECT id FROM rooms WHERE ${popWhere.text} ORDER BY id`,
      [...popWhere.params],
    )
    expect(popRows.rows).toEqual([{ id: 'r1' }])

    await db.close()
  })

  it('proves cancellation policy implications and detects unreachable tiers in Z3', async () => {
    // Every full-refund case implies any-refund
    const imp = await Effect.runPromise(
      Prove.policyImplies(CancellationPolicy, 'fullRefund', 'anyRefund'),
    )
    expect(Verdict.isTrue(imp)).toBe(true)

    // Whole-policy consistency report detects unreachable impossibleTier in one call
    const report = await Effect.runPromise(Prove.policyAllConsistent(CancellationPolicy))
    expect(report.ok).toBe(false)
    expect(report.unreachable).toEqual(['impossibleTier'])
    expect(Verdict.isTrue(report.verdicts.fullRefund)).toBe(true)
  })

  it('reports queryReadiness before and after binding window parameters', () => {
    const unread = Graph.queryReadiness(roomAvailableFor, {})
    expect(unread.ready).toBe(false)
    if (!unread.ready) {
      expect(unread.missing).toEqual(
        Option.some([
          ['window', 'start'],
          ['window', 'end'],
        ]),
      )
    }

    const ready = Graph.queryReadiness(
      roomAvailableFor,
      { window: { start: day('2026-06-12'), end: day('2026-06-14') } },
      {
        prepare: expr =>
          Sql.toWhere(expr, {
            dialect: 'postgres',
            table: 'rooms',
            relations: { 'Reservation.roomId': { table: 'reservations', foreignKey: 'roomId' } },
          }),
      },
    )
    expect(ready.ready).toBe(true)

    // In-memory evaluation of Relation.any via typed Relation.withRows agrees with SQL
    const roomWithBooking = Relation.withRows(
      { id: 'r1', roomNumber: 101, nightlyRate: Money.minor('USD', 20000), active: true },
      RoomReservations,
      [
        {
          id: 'b1',
          roomId: 'r1',
          checkIn: day('2026-06-10'),
          checkOut: day('2026-06-15'),
          status: 'confirmed',
          refundCents: null,
        },
      ],
    )
    expect(
      Expr.holds(roomAvailableFor, {
        row: roomWithBooking,
        window: { start: day('2026-06-12'), end: day('2026-06-14') },
      }),
    ).toBe(false)
  })
})
