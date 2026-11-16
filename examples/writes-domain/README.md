# writes-domain

[Alchemy Domain](https://alchemy.run/domain) (`@alchemy.run/domain`)
is an external event-sourcing library: Commands go to Aggregates that decide,
the Events they record are the facts, and Views fold them into rows. It is a
different authority from the SQL server the other examples use. This example
shows that a write declared once with `foldkit-entity` means the same thing
under both.

One write, decided by three backends. `ReserveStock` is declared once, over
[`examples/writes`](../writes)' `Product`, and landed by:

- **SQLite**, through the guarded, ledgered writer `examples/writes` uses;
- **memory**, through `RemoteServer.memoryWriter` behind the same guard;
- **an Alchemy Domain model**, where `Lower.write` turns the declaration into an
  aggregate that decides it through that same chain, and the page reads and
  writes it through Remote with `DomainRemote` ([`foldkit-remote-domain`](../../packages/remote-domain)).

Who owns what: the declaration owns the rules, each backend owns the row it holds,
and on the Domain side the model owns the decision and its Events while Remote
owns the page's copy, the pending write, and the receipt of a write whose View
has not caught up (a read-after token on Remote's wire). The adapter holds none of it.

It has two commands. `loop` follows one reservation all the way round, and
`demo` holds three backends to one answer.

## `loop`: one write, from the page and back

```bash
pnpm --filter foldkit-example-writes-domain loop
```

```text
1. the page reads the product through its View
  page     shows {"reserved":2,"revision":1}
  domain   {"_tag":"ProductListed","row":{"id":"p1","ownerId":"ada","name":"Bolt","status":"published","stock":10,"reserved":2,"revision":1}}
2. ada reserves 3: the page predicts before anything is sent
  page     shows {"reserved":5,"revision":1}; the write is pending
3. the adapter sends the command; the aggregate decides and records an Event
  domain   {"_tag":"StockReserved","quantity":3,"reservedAfter":5,"revisionAfter":2}
  page     shows {"reserved":5,"revision":2}; the write is applied
  remote   holds the row to the receipt "Product/p1@2"
4. a read while the View is behind keeps the row, and names it behind
  adapter  answers behind ["Product:p1"]
  page     shows {"reserved":5,"revision":2}
5. the View catches up: a read at the receipt answers, and the hold ends
  page     shows {"reserved":5,"revision":2}
  remote   holds 0 rows to a receipt
6. reserving 9 more would pass the stock: the declared invariant refuses it
  page     shows {"reserved":5,"revision":2}; the write is refused, Invalid by reservedWithinStock: Reserved stock cannot exceed the stock
  domain   was sent 2 commands; the stream holds 2 Events
7. a write at the revision read before step 3 is a conflict
  page     shows {"reserved":5,"revision":2}; the write is refused, Conflict
  domain   was sent 3 commands; the stream holds 2 Events
8. a reply is lost after the command committed, and the write is retried
  page     shows {"reserved":5,"revision":2}; the write is failed, Unreachable
  domain   was sent 4 commands; the stream holds 3 Events
  adapter  the retry carries the same commandId: true
  page     shows {"reserved":6,"revision":3}; the write is applied
  domain   was sent 5 commands; the stream holds 3 Events
```

Each line names who held what. Read it against the ownership above:

- **Step 2** is Remote's prediction, made from the declaration before anything
  is sent. It moves `reserved`, which the write sets; the revision waits for
  the answer.
- **Step 3** is the only decision. The aggregate records `StockReserved`, and
  the command answers before the View has folded it, so the page's row is the
  command's reply and Remote holds it to the receipt `Product/p1@2` (the
  stream, and how many Events it holds).
- **Steps 4 and 5** are the View catching up. Until it does, a read at the
  receipt names the row `behind` and the page keeps what it has; it never
  shows the row from before the write.
- **Steps 6 and 7** are refusals. Both commands were sent and both were
  decided by the aggregate, through the rules the declaration states; the
  stream gained no Event. The page could have asked first (`Data.can` reads
  the same declaration), but nothing here stops a write the server will refuse.
- **Step 8** is a reply lost after the command committed. The page cannot
  tell, so the write fails `Unreachable` and the prediction is taken back,
  though the stream already holds the third Event. The retry is the same
  operation, so the adapter derives the same `commandId`, and Domain answers
  it from its record: five commands were sent, three Events exist.

[`test/loop.test.ts`](test/loop.test.ts) pins this trace, and
[`test/loop.mutations.ts`](test/loop.mutations.ts) breaks the adapter and the
model to show which line each part is responsible for. The Events are read
through `Model.Internals`, which Domain marks internal: a diagnostics read
for this printout, not something an application does.

## `demo`: three backends, one answer

```bash
pnpm --filter foldkit-example-writes-domain demo
```

```text
reserving more than the stock is Invalid, naming reservedWithinStock
  sqlite: decision {"_tag":"Refused","refusal":"Invalid Product.reservedWithinStock"}; row {"reserved":2,"revision":1}; ledger []
  memory: decision {"_tag":"Refused","refusal":"Invalid Product.reservedWithinStock"}; row {"reserved":2,"revision":1}
  domain: decision {"_tag":"Refused","refusal":"Invalid Product.reservedWithinStock"}; row {"reserved":2,"revision":1}; commits 2; story "passed"
  the three agree with the scenario
```

The lines Domain's in-memory host logs about its View (`backfill run-pass …`)
are its own, as is the `ServerOnlyRules` warning the SQLite writer prints once
([`examples/writes`](../writes/README.md) explains it).

The demo runs one `Scenario` (`foldkit-remote/testing`) per decision, each from
the same values on all three, and prints what each backend said at each step it
owns: the decision, the row, the ledger (SQLite), and the committed Events and a
Domain Story (the model). A backend that disagrees with the scenario shows as a
mismatch naming the backend and the step.

## The same write, landed two ways

`src/domain.ts` declares `ReserveStock` once. The two authorities differ only
in what they wrap it in:

| | SQL (`src/sqlite.ts`) | Domain (`src/model.ts`) |
| --- | --- | --- |
| Lands the write | `RemoteServer.write(ReserveStock, GuardServer.writer(Product, Policy, writer(Db.Product, { ledger })))` | `Lower.write(ReserveStock, { policy: Policy, … })`, whose `decide` runs `RemoteServer.write` over `GuardServer.writer` over `RemoteServer.memoryWriter` on the aggregate's one row |
| The record | the row in `products`, and a ledger row per operation | `ProductListed` and `StockReserved` Events |
| You also write | the table | the two Events, `record` and `apply` between a row and an Event, the session middleware, and the View's `validate` |
| Who may read | the guard's Read rule, compiled into the read's `WHERE` | the View's `validate` (`ProductRowLive`), which restates "only the owner" by hand: a Read rule is not lowered |
| A retry | answered from the ledger | answered by Domain from the `commandId` |
| The page | `Remote.make` over a `RemoteClient` to the server | the same `Remote.make` (`src/shop.ts`) over `DomainRemote.layer` |

## What to read, in order

| File | What it shows |
| --- | --- |
| `src/domain.ts` | the write, declared once |
| `src/model.ts` | the lowering: only the Events, `record`, `apply`, who asks and how a row exists are written |
| `src/shop.ts` | the page's `Data` and the adapter over the model |
| `src/loop.ts`, `src/scenario/page.ts` | the walk above: Remote's reducer over the adapter, one delivery at a time |
| `src/scenario/` | the runners, one per backend, and `world.ts`, the hosted model with a reply that can be held or lost |
| `test/scenario/ordering.test.ts` | a reply before and after the View's frame, an older frame, a lost reply retried as one operation |
| `IMPORTED.md` | what `Imported.describe` says the Api imports, compared by a test |

The model runs on `Domain.InMemory`; nothing is deployed, and the Durable
Object host and WebSocket protocol of the library are not exercised here.

Read [`examples/writes`](../writes/README.md) first: this example reuses its
`Product`, guard and invariants.
[An event-sourced domain behind Remote](../../docs/event-sourced-domains.md)
is the guide to the idea, the
[`foldkit-remote-domain` README](../../packages/remote-domain/README.md) is the package's contract, and
[One domain declaration](../../docs/entity.md) is where the declarations
themselves are taught.
