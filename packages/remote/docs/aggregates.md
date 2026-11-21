# Show a total over a list you already loaded

An invoices page shows the list and, above it, "Unpaid: $1,240.00". Working
that out in the view means adding up every row on every render, so a page of
ten thousand invoices adds ten thousand numbers each time anyone types,
whether or not an invoice changed. `aggregated`, from
`foldkit-remote/aggregate`, gives you the same number and keeps it between
renders: when one invoice changes, it moves the total by that invoice's
difference instead of adding everything up again.

It works on a list the page has already loaded with `Data.query`, so it asks
the server nothing. The aggregate itself (the rule "add up the cents") is
written with `metakit`, this repository's library of inspectable expressions,
whose `metakit/aggregates` entry has the six kinds this guide uses.

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
unpaid.value // 124000
unpaid.complete // true
```

`invoices` is the list the page shows (`Data.query(AllInvoices, …)`), and
`Unpaid` is a registered query whose body picks the unpaid rows: the same pair
`filtered` takes, and `aggregated` counts exactly the rows `filtered` would
return. Leave the last argument out to count every row of the list.

`complete` is `true` when the answer is about the whole list: every row could
be judged by `Unpaid`, every counted row holds the fields the list selects, and
the list has no more pages on either side and no gap between its pages. When it is `false`, `value` is the
total of the rows that could be counted, so a view can say "at least
$1,240.00" or ask for the rest.

## The six kinds, and what each gives

| Aggregate | `value` | When the list has no rows |
| --- | --- | --- |
| `Rows.sum(Row, $ => $.cents)` | a number | `0` |
| `Rows.count(Row)`, or `Rows.count(Row, $ => …)` for rows a condition holds of | a number | `0` |
| `Rows.min(Row, $ => $.due)`, `Rows.max(…)` | an `Option` of a number: none when no row has a value | `Option.none()` |
| `Rows.every(Row, $ => …)` | a boolean | `true` |
| `Rows.any(Row, $ => …)` | a boolean | `false` |

`Rows.sum` takes only whole-number contributions (a `Schema.Int`, `Money` or
`Decimal` field, and `+`, `-`, `*` over them) and throws where it is defined
otherwise: adding and taking away decimals drifts, so a total kept by
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
`Expr.path` through a relation) or the list's Selection joins one, on any
change to the store, since a write to any row can then move which rows count.

Define each aggregate once, at module level. The kept total belongs to the
aggregate value, the domain, the list and the query, so an aggregate made
inside the view is a new one each render and is added up from nothing each
time.

## What it is not

It counts the rows of a list you loaded, never the rows the server has: a
total over the first 50 invoices is a total over 50 invoices, with
`complete: false` while the list has another page. It includes what a pending
write shows, as the list does, and moves back when the write fails. For
"which rows" rather than "how much",
use [`filtered`](../README.md#filtering-a-loaded-list-without-asking-the-server).
