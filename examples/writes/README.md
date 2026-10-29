# Declared writes that hold where they commit

Five writes to one product, each declared as data and checked in the statement
that lands it: a **guarded rename**, a **publish** that makes sense from one
state only, a **revert** the product's history forbids, and two computed writes
a retry cannot apply twice: a **restock** that expects a revision, and a
**sale** recorded in a ledger. Under all of them, an **invariant** (no product
holds more reserved than it has in stock) and a **transition invariant** (a
published product does not go back to draft).

```text
domain.ts   Product · who may change it (Shop) · what every row holds (an invariant)
            and every change (a transition invariant) · Rename · Publish · Revert · Restock · Sell
            (data: no query, no table)
server.ts   products table, its invariant as a CHECK · GuardServer.writer(…, { revision })
            RemoteServer.write · the product's Source, filtered by its rules
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
- **The transition invariant** (an `Entity.invariant` that reads `before` too)
  says what every change holds: a product published once does not go back to draft. Both rows are valid on
  their own; the change between them is not.
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
put the published product back to draft: Invalid publishedStaysPublished
restock 5 at revision 3: written {"id":"p1","stock":15,"revision":4}
the same restock again, its answer lost: Conflict
sell 2, from the read at revision 4: written {"id":"p1","stock":13,"revision":5}
sell 3, from the same read: written {"id":"p1","stock":10,"revision":6}
the first sale again, its answer lost: written {"id":"p1","stock":10,"revision":6}
sell 9 of the 10, 2 of them reserved: Invalid reservedWithinStock
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
- **A forbidden change.** `Revert` sets the status to `draft`, a value the
  state invariant and the rules both allow. The transition invariant reads the row before
  (`published`) and the row after (`draft`) in the statement that would write
  it, and refuses the change as `Invalid`, naming `publishedStaysPublished`.
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
  there. The table also holds it as a `CHECK` (`checkConstraints`), so raw SQL
  cannot break it either. The demo tells which one a refusal names with
  `Refusal.isInvalidBy(refusal, reservedWithinStock)`: `domain.ts` exports each
  invariant as declared, so no id is spelled twice.

`GuardServer.validate` runs at startup in `server.ts`. It refuses a write that
lands through no guarded writer, one whose interaction (here `Update`) has no
rule of its own, or one whose `when` or `expect` reads a member its writer may
not read, and reports an `UnpinnedWrites` diagnostic for a guarded writer with
no `revision`.

## The page agrees with the server

`test/law.test.ts` builds a page (`Remote.make` over the same domain) and runs
`Law.check` from `foldkit-remote/testing` over each write: the write goes
through the page's own `Data.mutate` and through this server, and every part
the page predicted (a renamed name, a published status, a stock computed from
an increment) must be what SQLite then holds, and a write the server refuses
for its transition invariant must be refused on the page too.

## Limits

- A transition invariant reads the row before the write, which a `CHECK`
  cannot, so only the server's declared writes hold `publishedStaysPublished`.
  The writer says so once, on its first write, as a `ServerOnlyRules`
  diagnostic: it is the warning the demo prints first.
- Only an increment is computed; other arithmetic, and copying one field into
  another, are not offered.
- The revision pin sees only writes that move the revision: a handler or raw SQL
  that changes the row without moving it is not seen, unless the table has
  `revisionTrigger`'s trigger, which moves it for them.
- Without a ledger, a retried increment is a conflict: "it landed and the
  answer was lost" reads like any conflict. With one, a retry later than its
  record's retention (a day) is a new operation.

On the client, `Data.mutate` shows a pending restock or sale as a predicted sum
over the stock it holds, re-added as that stock changes, until the answer. It
does not yet judge an invariant over that sum: a sale that would leave less in
stock than is reserved is shown and sent, and only the server refuses it.

The guide is [Declared writes](../../docs/declared-writes.md); see also the [precondition](../../docs/design/write-precondition-DESIGN.md),
[increment](../../docs/design/write-increment-DESIGN.md) and
[revision pin](../../docs/design/guard-atomic-DESIGN.md) designs.
