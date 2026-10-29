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
  -> each parent asked for its first maxCollection + 1 children (a limit per parent)
  -> a parent with more than maxCollection: the read fails, naming the relation
```

1. **A bound per parent, `maxCollection` on `source`, default 100.** It is the
   most children one row may hold for a read of the relation whole. The
   statement asks each parent for its first `maxCollection + 1` children with
   a `limit` of its own, as a windowed read asks for its page, so a read
   selects at most that many per parent however many there are. See "The
   work, not only the rows" for how.
2. **Over the bound is refused, not truncated.** A whole list is a bare array
   of refs with no `hasNext`, so a truncated one would read as complete and
   wrong. The read fails with `RemoteServerError` naming the Entity, the
   relation and the bound, and saying to read it with a window
   (`Entity.page`), or to raise `maxCollection` for that Source.
3. **The inverse side of a one-to-one reads one child.** It already showed only
   the first; it now selects only the first.

## The work, not only the rows (#283)

The first version ranked every child of each parent (`row_number() over
(partition by parent order by …)`) and kept the first `maxCollection + 1`.
That bounded the rows sent, not the work: the database still visited and
ranked the whole partition, so a client polling a parent with 200,000
children cost about 600 ms a read on SQLite while it returned 101 rows.

Each parent is now asked for its children with its own `limit`, in one
statement for every parent:

```text
parents = select parentKey as p from <owner table> where parentKey in (…)
select parents.p, child from parents, <child table>
            where parent = parents.p
              and child in (select child from … where parent = parents.p
                            order by … limit keep)
```

Both databases take this form. A Postgres `cross join lateral` was the
first version; a mutation replacing it with the correlated `in` survived
(PGlite visits as few rows either way), so it was deleted. SQLite has no
lateral join; its planner runs the correlated `in` once per
parent and looks the children up by id, which `EXPLAIN QUERY PLAN` shows as
`CORRELATED LIST SUBQUERY` over `SEARCH … USING INDEX (parent=?)`. With an
index on the parent column followed by the order, each parent's walk stops
after `keep` rows. A through table is ordered by its own column for the
child (equal to the target's id across the join): SQLite does not carry the
join's equality into an order, and ordering by the target's id sorted every
link of the parent. Windows use the same statement, so a page of a large
collection is bounded the same way.

Without such an index the database still reads and sorts every child of the
parent; no statement can find the first `keep` in an order no index holds.
The README says to index the relation.

Coarse timing, 200,000 children under one parent and 101 under another, an
index on `(parent, id)`, reading both with a bound of 100 (a laptop, one
run each; the shape matters, not the digits):

| | ranked | a limit per parent |
| --- | --- | --- |
| SQLite (`node:sqlite`) | 597 ms | 1.3 ms |
| PGlite | 199 ms | 3.7 ms |

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
- `packages/remote-drizzle/test/collectionWork.test.ts`, on SQLite and
  PGlite: the database visits as many child rows for a parent of 20,000 as
  for one of 5,000, read whole (and refused) or through a window, by a
  foreign key or a through table. SQLite counts the rows its views pass;
  Postgres counts them from `explain analyze`, with no timing. Below a few
  thousand rows Postgres may prefer a sequential scan, so the test compares
  two sizes past that.
- Mutations: `collectionBound.mutations.ts`.
