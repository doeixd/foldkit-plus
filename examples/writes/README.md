# Declared writes that hold where they commit

Three writes to one product, each declared as data and checked in the statement
that lands it: a **guarded rename**, a **transition** that makes sense from one
state only, and a **computed restock** a retry cannot apply twice.

```text
domain.ts   Product · who may change it (Shop) · Rename · Publish · Restock
            (data: no query, no table)
server.ts   products table · GuardServer.writer(…, { revision }) · RemoteServer.write
demo.ts     each write sent as a client sends it, and what the server answered
```

## Who owns what

- **The rules** (`foldkit-guard`) decide who may change a product: its owner.
  They are declared once on the domain and decided in SQL.
- **The write** (`foldkit-entity`'s `Write`) says what changes, and when the
  change makes sense (`when`) or how it is computed (`increment`).
- **The writer** (`foldkit-remote-drizzle`) lands it in one `update` statement,
  where the revision, the precondition and the increment are all checked or
  computed against the row the statement changes.

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
row: {"name":"Bolt, M6","status":"published","stock":15,"revision":4}
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

`GuardServer.validate` runs at startup in `server.ts`. It refuses a write that
lands through no guarded writer, or whose `when` or `expect` reads a member its
writer may not read, and warns of a guarded writer with no `revision`.

## Limits

- Only an increment is computed; other arithmetic, and copying one field into
  another, are not offered.
- The revision pin sees only writes that move the revision: a handler or raw SQL
  that changes the row without moving it is not seen.
- A retried increment is a conflict, not deduplicated: there is no table of
  request ids, so "it landed and the answer was lost" reads like any conflict.

See the [precondition](../../docs/design/write-precondition-DESIGN.md),
[increment](../../docs/design/write-increment-DESIGN.md) and
[revision pin](../../docs/design/guard-atomic-DESIGN.md) designs.
