# A collection relation read whole is bounded

Status: built (2026-10-29) in `foldkit-remote-drizzle` (`source`'s
`maxCollection`). Follows `live-limits-DESIGN.md`.

## The problem

A read may name a collection relation (`Relation.many`, `manyToMany`) without a
window: `Entity.select(Todo, { tags: true })` reads the whole list of refs. The
read handlers bound how many rows a read names (`maxIdsPerEntity`) and how many
pages of one relation it asks, but nothing bounded the children of one row read
whole. `source` selected every child row of every parent in one statement, so a
client could name a row with a million children and the server read them all.
Since `pollLive`, a live row or list that selects such a relation re-reads it
every tick.

## Decision

```text
read of a collection relation without a window
  -> at most maxCollection + 1 children of each parent are selected (ranked per parent)
  -> a parent with more than maxCollection: the read fails, naming the relation
```

1. **A bound per parent, `maxCollection` on `source`, default 100.** It is the
   most children one row may hold for a read of the relation whole. The
   statement ranks each parent's children (`row_number() over (partition by
   parent)`), as a windowed read already does, and keeps the first
   `maxCollection + 1`, so a read selects at most that many per parent however
   many there are.
2. **Over the bound is refused, not truncated.** A whole list is a bare array
   of refs with no `hasNext`, so a truncated one would read as complete and
   wrong. The read fails with `RemoteServerError` naming the Entity, the
   relation and the bound, and saying to read it with a window
   (`Entity.page`), or to raise `maxCollection` for that Source.
3. **The inverse side of a one-to-one reads one child.** It already showed only
   the first; it now selects only the first.

## Options considered

- **A default window.** Rejected: a quiet fallback. The whole-list shape cannot
  say it was cut short, so the page would show the first N as all of them.
- **Refuse every un-windowed collection relation.** Rejected: a small list read
  whole (a todo's tags) is a first-class read on the client (`true` on a
  relation, `Selection.from`), and paging it would add cursors to lists that
  never need them. A bound keeps that read and caps what it costs.
- **One bound for the whole read rather than per parent.** A page reading 50
  rows would then fail or pass by how their children happen to spread; a
  bound per parent is a rule an application can state about its data ("a todo
  has at most 100 tags").

## Not done

- `RemoteServer.memory` reads whole relations without a bound: its rows are
  in memory already, and it is a test and prototyping server.
- The bound is checked when the read runs, not when a page is designed: a list
  that grows past it starts failing then. That is the point at which the read
  would otherwise grow without limit; the error names the way out.

## What is tested

- `packages/remote-drizzle/test/collectionBound.test.ts`, on SQLite and PGlite:
  a whole relation at the bound is read whole, one past it is refused naming
  the relation, the statement selects no more than the bound plus one per
  parent, `maxCollection` raises it, a windowed read of the same relation is
  unaffected, and the inverse of a one-to-one reads its one child.
- Mutations: `collectionBound.mutations.ts`.
