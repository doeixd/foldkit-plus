# writes-domain

[Alchemy Domain](https://github.com/alchemy-run/alchemy) (`@alchemy.run/domain`)
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

| File | What it shows |
| --- | --- |
| `src/domain.ts` | the write, declared once |
| `src/model.ts` | the lowering: only the Events, `record`, `apply`, who asks and how a row exists are written |
| `src/shop.ts` | the page's `Data` and the adapter over the model |
| `src/scenario/` | the runners, one per backend |
| `test/scenario/ordering.test.ts` | a reply before and after the View's frame, an older frame, a lost reply retried as one operation |
| `IMPORTED.md` | what `Imported.describe` says the Api imports, compared by a test |

The model runs on `Domain.InMemory`; nothing is deployed, and the Durable
Object host and WebSocket protocol of the library are not exercised here.

Read [`examples/writes`](../writes/README.md) first: this example reuses its
`Product`, guard and invariants. The package's guide is the
[`foldkit-remote-domain` README](../../packages/remote-domain/README.md), and
[One domain declaration](../../docs/entity.md) is where the declarations
themselves are taught.
