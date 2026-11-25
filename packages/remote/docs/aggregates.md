# Show a total over a list you already loaded

An invoices page shows the list and, above it, "Unpaid: $1,240.00". Working
that out in the view means adding up every row on every render, so a page of
ten thousand invoices adds ten thousand numbers each time anyone types,
whether or not an invoice changed. `Maintained.value` from
`foldkit-remote/maintained` keeps the total between renders and updates it
from the invoices that changed.

It works on a list the page has already loaded into its Model with
`Data.query`, so it asks the server nothing. In the example below, `Data` is
your Remote domain (the value `Remote.make` returns), `model` is your
application's Model and `invoices` is a list read from `Data`, all set up as
the [Remote page](../README.md) shows. The aggregate itself (the
rule "add up the cents") is written with `metakit`, a package that keeps rules
as data (`pnpm add metakit`), whose `metakit/aggregates` entry has the six
kinds this guide uses.

`Unpaid` is the registered query that selects unpaid invoices. The example
assumes you have loaded all pages of `invoices` and the fields `Unpaid` reads.

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
import { Maintained } from 'foldkit-remote/maintained'

// What the list decodes each invoice to, and the sum of its cents.
const Row = Schema.Struct({ cents: Schema.Int, status: Schema.String })
const UnpaidCents = Rows.sum(Row, $ => $.cents)

const unpaid = Maintained.value(Data, model, invoices, UnpaidCents, { where: Unpaid, input: {} })
unpaid.value // 124000, the unpaid invoices' cents: $1,240.00
unpaid.complete // true
```

`Maintained.value` adds `cents` over the invoices `Unpaid` picks and returns
the total as `value`. It reads all loaded pages for the connection.
`Row` describes the fields the sum can read, and `$` gives access to those
fields. Call `Maintained.value` again with a changed Model to update the total.

`invoices` is the list the page shows (`Data.query(AllInvoices, …)`).
`input` holds the arguments to `Unpaid`, which takes none here. Leave out
`{ where, input }` to count every loaded row whose selected fields are available.

"The list" here is every row the page has loaded for that query and input,
which can be more than one read of it shows. `invoices` asks for `first: 50`;
if another part of the page loaded 120 rows of the same query, the aggregate
is over the 120, though `invoices` itself shows 50 and says it has a next
page. The [`filtered` read](../README.md#filtering-a-loaded-list-without-asking-the-server)
uses the same population to find matching rows.

`complete` is `true` when the answer is about everything the server has for
the query: every loaded row could be judged by `Unpaid`, every counted row
holds the fields the list selects, the server has said there is no page before
the first loaded row or after the last, and no gap lies between the loaded
pages. It is `false` when any of those fails. `value` is then the total of the
rows that could be counted, so a view can label the total as partial or ask for
the rest. With 120 rows loaded to
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

When it cannot trace the changes to rows, it reads the loaded list again and
updates the aggregate from the differences. This can happen after restoring a
snapshot, changing the viewer, passing an older Model, or leaving more than a
thousand store writes between reads. The same applies when a filter or selection
reads related rows and the store changes. If a sum temporarily overflows while
applying changes, it evaluates the final rows to check whether the total fits.

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

## Keep the rows for display

Pass `Maintained.list` to keep the selected rows in the loaded connection's
order. The array keeps its identity while the result rows and their order
stay the same. `where` picks which rows to keep.

<!-- docs-check standalone use invoices -->

```ts
import { Maintained } from 'foldkit-remote/maintained'

const unpaidRows = Maintained.value(Data, model, invoices, Maintained.list, { where: Unpaid, input: {} })
unpaidRows.value // the loaded unpaid invoice rows
```
