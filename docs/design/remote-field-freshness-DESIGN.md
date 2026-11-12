# Remote: a row is as fresh as its oldest field

Status: decided 2026-11-09; built with this note.

## The problem

Each entry in Remote's entity store keeps one `updatedAt`, and every write
moves it to the write's time. A write of one field (a mutation's answer, a
live patch, a read of a narrower projection) therefore dates the whole row, so
a field written an hour ago looks as fresh as the one written now. Under
stale-while-revalidate it is read again up to one freshness period late.

An expired row was believed to be read again whole; it is not (#512): `plan`
asks only the fields the requirement names, so a row holding more than a page
reads never became whole again, and its date never moved.

## Two meanings in one date

`updatedAt` is read for two things:

- **Freshness.** `plan`'s expiry, `deadlineOf` (when to plan again), and
  persistence's keep-until (`rows.set(key, updatedAt + maxAge)`).
- **Order.** `countedIn` (#457) reads it as "this row was read no earlier
  than the write", to decide whether a count still takes a pending increment.
  `metaOf` reports it as the newest write shown, and the inspector shows it.

Order needs the newest write; freshness needs the oldest field. Moving the one
date to either meaning breaks the other: dating a partial write by the older
time makes a count re-read after a write look older than the write, and take
the increment twice.

## Decision: two dates

The entry keeps `updatedAt`, unchanged in meaning (the newest write), and
gains `oldestAt`, which freshness reads:

- A write that covers every field the row holds (a whole-row read, which is
  what expiry plans) sets `oldestAt` to the write's time.
- A write of some fields leaves it where it was (or moves it earlier, for a
  write dated earlier than it).
- An empty row, or a tombstone, takes the write's time.

`oldestAt` is never later than the oldest field's true date, so a row can be
read again early, by at most the gap between its partial writes, and never
late. The read it plans is whole, so it ends the gap.

## Amendment (#512): the fields asked date the row

Expiry plans the fields a read asks, not the row, so a whole-row write cannot
be what dates it. The entry also keeps `fieldAt`, the write date of each field
written since the row was last written whole (in memory only), and freshness
reads the oldest of the fields asked: `oldestOf` in `store.ts`, used by
`isExpired` and `deadlineOf`. A field `fieldAt` does not name has `oldestAt`,
which is never later than its true date, so the bound holds: a field is read
early, never late. A pending write keeps the dates of the row under it.
`oldestAt` stays row-level for persistence, which keeps a row until its oldest
field's age runs out.

## Considered and rejected

- **A persisted `writtenAt` per field.** It costs a record per row in
  persisted entries and in the resume payload a server writes into every page.
  The in-memory `fieldAt` below gives freshness the same answer where it is
  read; a restored row falls back to `oldestAt`.
- **`Data.fetchedAt(model, projection)`**, also proposed, is a reader with no
  caller yet. Left out until one asks.

## Compatibility

A persisted or resumed entry written before `oldestAt` reads it as its
`updatedAt`, which is what every reader meant before.

## Checks

- A partial write leaves a row due when its oldest field is: `plan` reads it
  again and `deadlineOf` names that time.
- A whole-row write makes it fresh again.
- Persistence keeps a row until its oldest field's age runs out.
- `countedIn`'s tests (#457, `restoredCount.test.ts`) stay green, and a
  partial write still dates the row's order by the newest write.
- An entry stored without `oldestAt` decodes with its `updatedAt`.
