# writes-domain

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

The model runs on `Domain.InMemory`; nothing is deployed.
