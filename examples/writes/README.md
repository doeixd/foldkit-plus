# Declared writes that hold where they commit

Four writes to one product, each declared as data and checked in the statement
that lands it: a **guarded rename**, a **transition** that makes sense from one
state only, and two computed writes a retry cannot apply twice: a **restock**
that expects a revision, and a **sale** recorded in a ledger. Under all four, an
**invariant**: no product holds more reserved than it has in stock.

```text
domain.ts   Product · who may change it (Shop) · what every row holds (an invariant)
            Rename · Publish · Restock · Sell (data: no query, no table)
server.ts   products table, its invariant as a CHECK · GuardServer.writer(…, { revision })
            RemoteServer.write
demo.ts     each write sent as a client sends it, and what the server answered
```

## Who owns what

- **The rules** (`foldkit-guard`) decide who may change a product: its owner.
  They are declared once on the domain and decided in SQL.
- **The write** (`foldkit-entity`'s `Write`) says what changes, and when the
  change makes sense (`when`) or how it is computed (`increment`).
- **The invariant** (`Entity.invariant`) says what every product holds,
  whoever writes it: `reserved <= stock`. It is not a rule, so being the owner
  does not excuse a row that breaks it.
- **The writer** (`foldkit-remote-drizzle`) lands it in one `update` statement,
  where the revision, the precondition, the increment and the invariant are all
  checked or computed against the row the statement changes.

Nothing reads the row and then writes it in a second statement, so nothing
another request does in between can be written over.

## The mental model

```text
rules over the row read  ->  update … where id = ? and revision = ? [and when]
                              set … [, field = field + amount], revision = revision + 1
                                   |
          no row changed  <--------+--------> the row as written
             |
   gone · moved on (Conflict) · does not hold `when` (Unmet)
```

## Run it

```bash
pnpm --filter foldkit-example-writes demo
```

```text
rename by its owner: written {"id":"p1","name":"Bolt, M6","revision":2}
rename by another: Forbidden
publish the draft: written {"id":"p1","status":"published","revision":3}
publish it again: written {"id":"p1","status":"published","revision":3}
publish an archived product: Unmet
restock 5 at revision 3: written {"id":"p1","stock":15,"revision":4}
the same restock again, its answer lost: Conflict
sell 2, from the read at revision 4: written {"id":"p1","stock":13,"revision":5}
sell 3, from the same read: written {"id":"p1","stock":10,"revision":6}
the first sale again, its answer lost: written {"id":"p1","stock":10,"revision":6}
sell 9 of the 10, 2 of them reserved: Invalid
row: {"name":"Bolt, M6","status":"published","stock":10,"reserved":2,"revision":6}
```

## What each line means

- **A guarded rename.** `Rename` is a plain `Write.update`. Its guard, built with
  `{ revision: 'revision' }`, writes only the revision its rules were decided
  over, and the revision moves on with the write (1 to 2). Had the owner changed
  between the check and the write, the write would miss and be decided again
  against the new owner. Grace is not the owner: `Forbidden`, nothing written.
- **A conditional transition.** `Publish` has `when: () => Expr.eq(status,
  'draft')`, compiled into the statement's `WHERE`. The draft is published. An
  archived product does not hold it: `Unmet`. Publishing the published product
  again is answered as written and changes nothing (the revision stays 3): a row
  already holding everything a write sets is how a retry of a write that landed
  looks, so the writer cannot tell a repeat from a retry, and does not need to.
- **A computed restock.** `Restock` has `increment: { stock: 'quantity' }`: the
  statement adds the quantity to the stored stock, so a concurrent change is
  never lost. It must `expect` a revision. Sent again after its answer was lost,
  the same request finds the row a revision on: `Conflict`, and the stock moved
  once (10 to 15). The client cannot tell "mine landed" from "someone else's
  did", so it re-reads the product, as after any conflict.
- **A sale over a ledger.** `Sell` increments the stock too, but expects no
  revision: its writer keeps a ledger (`writer(binding, { ledger })`), which
  records each update under the client's operation id in the transaction that
  writes it. Two sales made from one read both land (15, 13, 10), which a
  revision would have refused. Sent again after its answer was lost, the first
  sale is found in the ledger and not written again: the stock stays 10, and the
  answer is the row as it now is.
- **An invariant.** Selling 9 of 10 with 2 reserved would leave 1 in stock and 2
  reserved. The writer judges the invariant over the row the sale would leave
  (`reserved <= stock + -9`) in the same statement, and refuses it as `Invalid`,
  naming `reservedWithinStock` and its path, `reserved`, for a form to show it
  there. The table also holds it as a `CHECK` (`invariantChecks`), so raw SQL
  cannot break it either.

`GuardServer.validate` runs at startup in `server.ts`. It refuses a write that
lands through no guarded writer, or whose `when` or `expect` reads a member its
writer may not read, and warns of a guarded writer with no `revision`.

## Limits

- Only an increment is computed; other arithmetic, and copying one field into
  another, are not offered.
- The revision pin sees only writes that move the revision: a handler or raw SQL
  that changes the row without moving it is not seen, unless the table has
  `revisionTrigger`'s trigger, which moves it for them.
- Without a ledger, a retried increment is a conflict: "it landed and the
  answer was lost" reads like any conflict. With one, a retry later than its
  record's retention (a day) is a new operation.

On the client, `Data.mutate` shows a pending restock or sale as a predicted sum
over the stock it holds, re-added as that stock changes, until the answer.

The guide is [Declared writes](../../docs/declared-writes.md); see also the [precondition](../../docs/design/write-precondition-DESIGN.md),
[increment](../../docs/design/write-increment-DESIGN.md) and
[revision pin](../../docs/design/guard-atomic-DESIGN.md) designs.
