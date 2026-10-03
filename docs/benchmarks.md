# Benchmarks

`pnpm bench` runs the Vitest benchmarks in `packages/sync/bench` and
`packages/remote/bench` and prints
hz/mean/p99 per scenario; `pnpm bench:storage` appends a fixed number of
operations to a file-backed durable journal and prints a bytes-per-operation
reading. A weekly [Bench workflow](../.github/workflows/bench.yml) runs both and
prints to the job log; it is not a gate, because shared runners are too noisy to
fail a build on a timing regression.

## Recorded run

- Windows 11, Node 22.21.1 (the workspace runtime, via pnpm), pnpm 10.32.1.
- Committed model of 100 todos; an outbox of `p` local `CreatedTodo`s.
- Treat the numbers as order-of-magnitude. Re-run locally for your machine.

## What was measured, and the one change it drove

The optimistic projection (`replica.shared`) replays the pending outbox over the
committed state. It used to run on every read, and an append-heavy replay is
quadratic in the outbox, so every read paid for the whole backlog.

| outbox | `shared` read, before | `shared` read, after |
| ---: | ---: | ---: |
| 0 | 0.7 µs | 1.0 µs |
| 100 | 246 µs | 1.0 µs |
| 1000 | 6.3 ms | 1.0 µs |
| 5000 | 102 ms | 1.0 µs |

`shared` now caches the projection against the immutable state object and reuses
it until a write replaces that object, so repeated reads are O(1) and the
projection runs once per write instead of once per read. `sync.test.ts` pins this
by counting `replay` calls; a cache that ignores the state identity returns a
stale projection and the test fails.

`openReplica` still decodes and validates the whole outbox at startup, which the
outbox identity checks need:

| outbox | startup |
| ---: | ---: |
| 0 | 0.12 ms |
| 100 | 0.64 ms |
| 1000 | 5.6 ms |
| 5000 | 28 ms |

Reconnect/rebase (open a replica with a 100-op outbox, then adopt a committed
batch) costs about 1.5 ms for 100 commits and 10 ms for 1000.

## Durable append and storage

`pnpm bench:storage` appends a fixed number of operations to a file-backed
journal, prints bytes per operation, then compacts every payload and prints the
size again. Recorded on the same Windows/Node 22 machine:

| | |
| --- | --- |
| operations | 5,000 |
| append | 5.0 ms/op (synchronous; dominated by Windows fsync) |
| storage | 104 B/op |
| after compacting all payloads | unchanged (520,192 bytes) |
| heap / rss | 36 MB / 158 MB |

A second scenario appends 500 edits to a 2,000-item snapshot through a real Schema
codec (Linux, Node 22, in this repository's container; these numbers came from
different hardware than the table above, so compare within the scenario):

| | ms/op |
| --- | --- |
| before the in-memory snapshot (decode + encode per append) | 2.99 |
| snapshot kept in memory, written every commit | 1.95 |
| snapshot kept in memory, written every 50 commits (`snapshotEvery: 50`) | 0.91 |

Compaction drops payloads but does not shrink the file: SQLite keeps the pages
they occupied. `journal.vacuum()` rebuilds the file and gives that space back,
and `pnpm bench:storage` prints the size after it too. Identity rows remain
either way, so storage tracks the number of operations, not the payload bytes
compacted away. That matches the [retention policy](../packages/durable/README.md#retention). Append is a synchronous
transaction, so the per-op time is the platform's fsync; CI's `ubuntu` runner is
faster than this laptop.

A long offline outbox is also exercised deterministically in CI: `sync.test.ts`'s
`recovers a long offline outbox and converges on the committed order` submits 500
operations offline and reconciles them in one exchange.

## foldkit-richtext: pasting many blocks

`packages/richtext/bench/replicated.bench.ts` pastes `n` paragraphs into the middle of a
100-paragraph document: `RichText.run` for the `Paste`, `Replicated.translate` for its
transaction, and `Replicated.applyOps` for the ops. Medians on Linux, Node 22.22.2:

| blocks | `run`, before | `run`, after | `translate`, before | `translate`, after | `applyOps`, before | `applyOps`, after |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 500 | 73 ms | 10 ms | 64 ms | 7 ms | 1.6 ms | 1.5 ms |
| 1000 | 214 ms | 11 ms | 211 ms | 11 ms | 8.4 ms | 2.2 ms |
| 2000 | 801 ms | 26 ms | 841 ms | 24 ms | 17 ms | 6.9 ms |
| 4000 | 3053 ms | 60 ms | 3004 ms | 44 ms | 66 ms | 10 ms |

A paste is one `InsertNode` per block, and `apply` indexed the whole document again after
each, so a paste was quadratic in its blocks; `translate` replays the transaction through
`apply`, so it paid the same again. `apply` now indexes only the inserted block and the
siblings after it, and keeps its copy of the container across a run of inserts rather than
folding it back and copying it for each. `applyOps` looked up each `InsertBlock`'s sibling
anchor with a scan of the list; it now tries the place of the previous insert first. The
results are unchanged: the Replicated and transaction tests pass as before.

## Initial supported limits

With one replica per document, from the recorded run:

- **Outbox.** Up to ~1,000 pending operations keeps startup in single-digit
  milliseconds and every `shared` read near 1 µs. Past that, startup grows
  linearly; an application expecting a multi-thousand-operation offline backlog
  should checkpoint its own work rather than rely on the outbox alone.
- **Reconcile batch.** A 1,000-commit batch reconciles in ~10 ms. Larger batches
  should be paginated by the transport.
- **Durable storage.** ~104 B per operation on the recorded run, and the file
  does not shrink on compaction, so storage grows with the number of operations.
  Rotate the journal per its [retention policy](../packages/durable/README.md#retention).
- These are `foldkit-sync`'s local costs and one `foldkit-durable` append/storage
  reading.

## The page builder over 1,000 nodes

How long a hover, a selection and a keystroke in the inspector take to reach
the screen, in headless Chromium, as medians:

```sh
VITE_MEASURE=1 pnpm exec vitest run --project browser examples/cms/test/builder.browser.test.ts
```

It is skipped without `VITE_MEASURE`, since a timing is not a gate. The results,
and what memoizing the editor changed, are in
[pagebuilder-DESIGN.md](./design/pagebuilder-DESIGN.md) §25.

## foldkit-data-grid: 100,000 rows

`packages/data-grid/bench/window.bench.ts` holds a grid of 100,000 rows and 40
columns, one pinned. The design's rule is that nothing run per scroll frame or
per key walks the rows; indexing the rows by key, once per change of the rows
array, may.

```sh
pnpm exec vitest bench --run --reporter=verbose packages/data-grid/bench
```

Means in Node 26.5 on Windows 11, 2026-10-03, order of magnitude only:

| Scenario | Mean |
| --- | ---: |
| The window for one viewport, with overscan | 1 µs |
| 1,000 scroll frames, one window each | 0.93 ms |
| A projection from a layout | 5.7 µs |
| A move from the middle row | 0.1 µs |
| A cell's position | 0.2 µs |
| Revealing a cell far below | 2.1 µs |
| Indexing 100,000 rows by key | 17 ms |

The window costs the column count, not the row count: rows are one height, so
their window is arithmetic, and the center columns' edges are summed per call
and searched. The 17 ms is why `RowModel.fromArray` caches per array.

## foldkit-bundle: type-checking cost of placements

A generated parent with `n` placements of one bundle, each with its own
wrapper and Model field, one `Bundle.assemble`, a view rendering every
placement, and `assembly.complete`. Measured with `tsc --extendedDiagnostics`
on the same machine; check time is noisy, instantiation counts are not.

| placements | instantiations | check time |
| ---: | ---: | ---: |
| 1, before | 201,400 | 1.8 s |
| 30, before | 250,280 | 4.9 s |
| 100, before | 368,230 | 6.6 s |
| 100, after | 264,947 | 2.0 s |

At 100 placements, `at` and `assemble` together cost about 17,000
instantiations and `complete` about 10,000. The views cost the rest: a placed
view inferred the parent's Message through `HtmlBuilder<M>`, about 2,300
instantiations per call. The view now infers the builder type itself and
extracts its Message with one conditional, which halved the view cost and
brought the 100-placement check from 6.6 s to 2.0 s. Growth is linear in the
number of placements.

### The parent scope

The same 100 placements written with `Bundle.parent` and `Bundle.declare`
(no type arguments) against the curried form, both using `update()` and
`onOut: Bundle.ignore`:

| 100 placements | instantiations | check time |
| --- | ---: | ---: |
| `Link.field<Model>()` + `Bundle.assemble<Model, Message>()` | 289,148 | 2.02 s |
| `Bundle.parent` + `declare` + `Page.at` | 369,245 | 2.23 s |

Inferring from the scope costs about 800 more instantiations per placement and
10% more check time, inside the 25% budget the DX plan set.
