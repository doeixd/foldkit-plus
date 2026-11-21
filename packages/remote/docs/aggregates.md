# Show a total over a list you already loaded

An invoices page shows the list and, above it, "Unpaid: $1,240.00". Working
that out in the view means adding up every row on every render, so a page of
ten thousand invoices adds ten thousand numbers each time anyone types,
whether or not an invoice changed. `aggregated`, from
`foldkit-remote/aggregate`, gives you the same number and keeps it between
renders: when one invoice changes, it moves the total by that invoice's
difference instead of adding everything up again.

It works on a list the page has already loaded into its Model with
`Data.query`, so it asks the server nothing. In the example below, `Data` is
your Remote domain (the value `Remote.make` returns), `model` is your
application's Model and `invoices` is a list read from `Data`, all set up as
the [Remote page](../README.md) shows. The aggregate itself (the
rule "add up the cents") is written with `metakit`, a package that keeps rules
as data (`pnpm add metakit`), whose `metakit/aggregates` entry has the six
kinds this guide uses.

<!-- docs-check define invoices
import { Schema as S } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity, Expr, Order } from 'foldkit-entity'
import { Query, Remote } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'

const Invoice = Entity.define(
  'Invoice',
  S.Struct({ id: S.String, cents: S.Int, status: S.String, due: S.NullOr(S.Int) }),
)
const AllInvoices = Query.define('AllInvoices', {}, () =>
  Query.from(Invoice).pipe(Query.orderBy(Order.asc(Invoice.fields.id))),
)
const Unpaid = Query.define('Unpaid', {}, () =>
  Query.from(Invoice).pipe(
    Query.where(Expr.eq(Invoice.fields.status, 'unpaid')),
    Query.orderBy(Order.asc(Invoice.fields.id)),
  ),
)
const Model = S.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({ model: App.model.remote, entities: [Invoice], queries: [AllInvoices, Unpaid] })
const invoices = Data.query(AllInvoices, {}, {
  select: Entity.select(Invoice, { cents: true, status: true, due: true }),
  first: 50,
})
declare const model: Model
-->

<!-- docs-check standalone use invoices -->

```ts
import { Schema } from 'effect'
import * as Rows from 'metakit/aggregates'
import { aggregated } from 'foldkit-remote/aggregate'

// What the list decodes each invoice to, and the sum of its cents.
const Row = Schema.Struct({ cents: Schema.Int, status: Schema.String })
const UnpaidCents = Rows.sum(Row, $ => $.cents)

const unpaid = aggregated(Data, model, invoices, UnpaidCents, { where: Unpaid, input: {} })
unpaid.value // 124000, the unpaid invoices' cents: $1,240.00
unpaid.complete // true
```

What happened: `aggregated` added `cents` over the invoices `Unpaid` picks and
returned the total as `value`. Call it again with a changed Model and it
follows only the rows that changed.

`invoices` is the list the page shows (`Data.query(AllInvoices, …)`), and
`Unpaid` is a query you listed under `queries` in `Remote.make`, whose body
picks the unpaid rows. `input` holds that query's inputs, none here. The same
pair `filtered` takes, and `aggregated` counts exactly the rows `filtered` would
return. Leave out the final `{ where, input }` object to count every row of the
list.

"The list" here is every row the page has loaded for that query and input,
which can be more than one read of it shows. `invoices` asks for `first: 50`;
if another part of the page loaded 120 rows of the same query, the aggregate
is over the 120, though `invoices` itself shows 50 and says it has a next
page. `filtered` counts the same way.

`complete` is `true` when the answer is about everything the server has for
the query: every loaded row could be judged by `Unpaid`, every counted row
holds the fields the list selects, the server has said there is no page before
the first loaded row or after the last, and no gap lies between the loaded
pages. It is `false` when any of those fails. `value` is then the total of the
rows that could be counted, so a view can say "at least $1,240.00" or ask for
the rest. A read's own window does not enter into it: with 120 rows loaded to
both ends, `complete` is `true` beside a list that shows 50.

## The six kinds, and what each gives

| Aggregate | `value` | When the list has no rows |
| --- | --- | --- |
| `Rows.sum(Row, $ => $.cents)` | a number | `0` |
| `Rows.count(Row)` | a number | `0` |
| `Rows.min(Row, $ => $.due)` | an `Option` of a number | `Option.none()` |
| `Rows.max(Row, $ => $.due)` | an `Option` of a number | `Option.none()` |
| `Rows.every(Row, $ => …)` | a boolean | `true` |
| `Rows.any(Row, $ => …)` | a boolean | `false` |

`Rows.count(Row, $ => …)` counts only the rows a condition holds of. `min` and
`max` give `Option.none()` also when no row has a value.

`Rows.sum` takes only whole-number contributions (a `Schema.Int`, `Money` or
`Decimal` field, and `+`, `-`, `*` over them) and throws when you call
`Rows.sum`, not later, for anything else: adding and taking away decimals drifts, so a total kept by
differences would stop matching one added up afresh. `min` and `max` skip a
`null`; a condition that cannot be decided (it reads a `null`) counts as false.

`Row` may name fewer fields than the list selects, but not a field it does
not: an aggregate over `tax` on this list is a type error, since the list
never decodes one.

## What it costs, and when it adds everything up again

Each call compares what it worked from last time with the Model it is given,
and follows only the rows that changed:

- a row the server wrote, a live patch, a pending write and its rollback, or
  a row moving in or out of `Unpaid` move a sum or count by one difference,
  and an every or any by one count;
- a min or max folds a new or changed row in, and reads the counted rows again
  only when the row holding the smallest (or largest) value leaves or loses it;
- a merged page or a refetch compares the list's keys and judges only rows it
  had not judged.

It adds everything up again when it cannot tell which rows changed: a snapshot
restored into the store, a change of who is signed in, a Model older than the
last one it was given, or more than about a thousand store writes since it was
last called. It also does when `Unpaid` reads another row (an
`Expr.path` through a relation) or the list's `select` option joins one, on any
change to the store, since a write to any row can then move which rows count.

While any write in the domain is pending, each change to the store also walks
the list's keys to see which rows are shown, as the list's own read does to
place pending rows. No row is judged or added again unless it changed, so the
aggregate is handed one row; the walk itself grows with the list.

Define each aggregate once, at module level. The kept total belongs to the
aggregate value, the domain, the list and the query, so an aggregate made
inside the view is a new one each render and is added up from nothing each
time. Define the last argument once too
(`const unpaidOnly = { where: Unpaid, input: {} }`): what the list and the
query say is worked out once for each such object, and again for a new one,
though the kept total is the same.

## What it is not

It counts the rows the page has loaded, never the rows the server has: with
50 invoices loaded and more on the server, the total is over those 50, with
`complete: false` until the last page is loaded; `complete` is how you tell a
total over everything from a total over what is loaded so far. It includes what a pending
write shows, as the list does, and moves back when the write fails. For
"which rows" rather than "how much",
use [`filtered`](../README.md#filtering-a-loaded-list-without-asking-the-server).
