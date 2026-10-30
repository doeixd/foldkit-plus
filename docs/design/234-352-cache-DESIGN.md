# Lists that age, and a cache with a size (#234, #352)

Status: design (2026-10-30).

Two issues meet in one place, retention and read planning:

- **#234** asked that a value once shown never read `Loading` again, that
  retention keep a page you leave, and that lists get stale-while-revalidate.
  Its last comment adds foldkit-domains' case: a list navigated back to inside
  its freshness window is drawn from the store and not fetched again.
- **#352** asks for a size budget on the client cache, evicting the least
  recently read first, never what an active Surface reads, with `Data.why`
  naming the eviction.

## What #234 already has

| Part | Where |
| --- | --- |
| The invariant: a list holding rows reads `Refreshing`, never `Loading`, while a row's fields arrive | 5b7b4436 |
| The property test over every Message (`heldValue.test.ts`) | c8b6128c |
| Retention keeps what the Surfaces most recently left reached; a list left is held stale | b05d5b9c |
| A reload draws the stored list in its first frame | #262, a573bd5c |
| A delete keeps a list on screen; a refresh keeps the tombstone | #263, ec11b2f3 |
| Retention forgets a placement whose list it dropped | ff2d80e3 |
| `Data.timeline` marks each change that breaks the rule (`regression`); `Trace.regressions` is that filter | #248, 6dbed945 |

Three items were open: stale-while-revalidate for lists, the `Read` product
shape, and a retention cap by held rows. The last is #352.

## Decisions on the rest of #234

### The default `grace` stays 0

The issue proposed retaining for a default grace of minutes. Departed
retention (b05d5b9c) already does what that was for: a page left keeps its
data without delaying anything. A grace delays every collection, including of
what nobody goes back to, so it stays an opt-in for routes that come straight
back.

### No `Read` product shape

`RemoteData.toRead` was optional, for a union that mixed "is there a value"
with "is a read in flight". After the invariant, `Loading` means there is no
value, and `RemoteData.render`'s `data(value, freshness)` already gives the
product: the value with `Fresh | Refreshing | Stale(error)`. A second shape
would be a second way to read the same state. Declined.

### A list ages under `staleWhileRevalidate`

A connection gets `receivedAt`, the clock reading of the page that last
answered it whole: its first page, or the page that replaced it after an
invalidation (`ConnectionMerged.now`). A later page from "load more" or a live
event does not date it, since the rows before it are as old as they were.

Under `staleWhileRevalidate({ maxAge })` the planner treats a list as it
treats a row:

```text
held, not stale, now - receivedAt <= maxAge  -> drawn from the store, no query;
                                                a deadline at receivedAt + maxAge
held, not stale, now - receivedAt  > maxAge  -> query, and read Refreshing meanwhile
stale (invalidated)                          -> query, whatever its age
failed                                       -> neither; Data.refresh asks again
```

Time reaches Remote only as a Message, as for rows: the read entry's
`expires` deadline now names lists too (`Deadline.connections`), and the
`RefreshStarted` it emits carries `connections`, which marks each held list
stale. A list the entry plans because it aged (or under `networkOnly`, which
re-queries every list) is named in `ReadDependencies.refreshing`, and the
entry's `RefreshStarted` marks it stale before the query, so it reads
`Refreshing` with its rows and the answering page replaces them. A tail page
(`Data.more`) is never in `refreshing`: it adds rows to a list that stays
current.

`refreshing` names held lists the plan re-queries whole, stale or not, so
marking them stale does not change the plan, and the entry is not restarted
by its own Message.

### A list left keeps its age

Today `RetentionChanged` marks every list it departs stale, so going back
always refetches. That is right for a list read under `cacheFirst`, which has
no other way to find out what changed while nobody watched. It is wrong under
`staleWhileRevalidate`, whose age already says when the list is due: going
back inside `maxAge` should draw the list and send nothing.

So a connection root says whether every call reading it ages it
(`ConnectionRoot.ages`, from the calls' policies). A list departed whose root
ages is held as it is; one whose root does not is held stale, as before. A
list read by two calls, one aging and one not, is held stale: the call that
does not age it would otherwise never refetch it.

"Per Surface or route" is the existing rule: a policy covers one
`Data.subscriptions` call, so a route that wants a window gets a call of its
own.

## #352: a budget, least recently read first

### What it counts

An **entry** is one row or one list the store holds. `Remote.make({ budget })`
sets the most entries retention keeps (default 1,000). The rows and lists the
active Surfaces reach, and the rows a pending write touches, are always kept,
even past the budget. What the budget evicts is the roots of Surfaces left.

A departed root costs what it adds: the rows it reaches that nothing kept
before it, and one for a list. A read whose row is already held costs one, so
the roots kept for going back stay bounded too.

### Least recently read

A root departs when a `RetentionChanged` no longer names it; the roots that
leave together leave as one **batch**, since a page left takes its list and its
reads together. `RemoteModel.recent` becomes:

```ts
{ readonly active: RetentionRoots; readonly departed: ReadonlyArray<RetentionRoots> }
```

`departed` is oldest first. A root that becomes active again leaves its batch,
and departs later in a new one. Retention admits batches newest first while
their cost fits; the first that does not fit is evicted with every older one.
`departedLimit`'s fixed counts go.

### `Data.why` names it

The roots evicted are recorded in `RemoteModel.evicted` (lists by identity,
reads by row, the newest 256 of each). `Why.List` and `Why.Fields` gain
`held: 'Evicted'`: the store does not hold it because the budget evicted it,
as opposed to `Missing`, never held or collected by plain retention. The words
say what restarts it: the read entry fetches it again while a Surface reads
it. A mark is read only while its list or row is absent, so a value fetched
again needs no clearing.

The budget reaches the pure reducer on the Message (`RetentionChanged.budget`),
since retention is the domain's: every call's retain entry sends the same one.
`Remote.retain` takes `budget` in its options for an application that wires it
by hand.

## Breaking

- `departedLimit` and `recentRoots` are gone; `RemoteModel.recent` has the
  shape above.
- `Why`'s `held` has a third literal, `Evicted`.
- A held list re-queried under `networkOnly` reads `Refreshing`, not `Ready`,
  and the page replaces it, as a row does.
- Under `staleWhileRevalidate` an active list is re-queried once it is older
  than `maxAge`, as its rows already were.

## Testing

- `heldValue.test.ts`: generators for `RefreshStarted` with connections and
  `RetentionChanged` under a small budget; the exception for retention becomes
  "evicted by the budget". A scratch run with 2,000 seeds and longer walks.
- The planner: a list inside its window plans nothing, past it plans a query;
  a tail page does not date the list; a failed list sets no deadline.
- The entry under `TestClock`: going back inside `maxAge` sends no query, past
  it sends one with the list `Refreshing`.
- Retention: the oldest batch is evicted first, an active root never is, a
  pending write's rows stay, and `Data.why` reads `Evicted`.
- Mutation specs for each rule above.

## Example

Chirp reads its profile and timeline lists under `staleWhileRevalidate`, so
going back to a profile inside the window draws it with no request.
