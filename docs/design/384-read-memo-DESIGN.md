# Cheap repeated Remote reads (#384)

Status: built (2026-10-31). Results below.

## The problem

R3 (`foldkit-renderer-independence-PLAN.md` §10) left 30–60% of
domains-plus's view time in `searchViewState`, which reads all 556 names
through Remote on every render: `Data.get(Quote, name).read(model)` once per
name in `answeredOf`, and again through `readNames` and `visibleNames`, and
once more per Model change in the `visible` read entry's parameters. R3 also
took a read to hand back an equal domain as a new object, which made every
row miss its memo, and worked around it in the view by keeping listings per
name under `Equal.equals`; that copy turned out to be Foldkit's constructors,
not Remote (below).

## What a read costs today

`packages/remote/bench/byId.bench.ts` reads 556 rows by id the way
domains-plus does (Windows 11, Ryzen 7 6800U, Node 26.5, `vitest bench`,
mean of one pass of 556 reads):

| case | before |
| --- | ---: |
| same Model (the render after a menu opened) | 1.80 ms |
| same Model, each `Data.get` made once and held | 0.24 ms |
| one row changed (a price arriving), the write included | 3.72 ms |
| a row no read reaches written, the write included | 3.29 ms |
| that write alone | 0.14 ms |

A CPU profile of the same loop says where it goes:

- **Making the read, not reading.** About 1.5 of the 1.8 ms is `Data.get`
  itself: every call compiles the Selection's relation again
  (`relationOf`), writes its stable key (`stableStringify`), and builds the
  requirement metadata (`RemoteRequirements.of`, which merges through
  `mergeRequirements`). The read of an unchanged store is a memo hit,
  0.4 µs.
- **Every row assembled again after any write.** Reads are memoized per
  store snapshot (`memoRead([store], …)`), and a write makes a new store, so
  one price arriving assembles all 556 rows again (about 2 ms). Their
  decoded values survive (`decodeRow` keeps one per row while the assembled
  data is equal), but each read builds a new `RemoteData` around it: after
  one price, all 556 `RemoteData` objects are new, though 555 values are the
  objects they were.
- **Identity across a rebuilt entry is lost.** `decodeRow` keys on the
  entry's `values` object. The store keeps it across an equal refetch, but an
  optimistic layer's row is rebuilt on every write to the base store
  (`visibleStore` writes the patch over it again), and an evicted row read
  again is a new entry: both decode an equal value as a new object.
- **R3's equal-but-new domain was not Remote's.** A trace of domains-plus
  through Remote alone (search, the filter toggled, every read answered)
  kept every domain's identity. Counting in the render build found the copy
  elsewhere: Foldkit's tagged constructors rebuild a struct field through
  `Schema.make` (`foldkit/schema`: only primitive fields are copied by
  reference), so `DomainListing.Ready({ domain })` and
  `SearchViewState.Ready({ domains })` hand out copies, and a listing kept
  by a copied domain missed on every new arrangement: 48 rows drawn per
  filter toggled. The fix is in the example (below); the row memo still
  keeps identity on the Remote paths that did lose it.
- **Constant states are new objects.** `Initial`, `Loading` and `NotFound`
  are object literals made per read.

## The design

Three parts in `foldkit-remote`, one in `foldkit-surface`. Every cache is
bounded and holds nothing a store does not already reach, except the last
few thousand decoded rows per Selection.

### 1. A read handle is made once per Selection and id

`Remote.select(bound, selection)` compiles the Selection once per domain
(relation, stable key, registration check) and keeps it by the Selection's
identity (`Selection.from` already keeps a `foldkit-entity` Selection's
compilation by its identity). `(id)` then returns the projection it made for
that id last time, from a map of the most recently used ids (`recent.ts`:
two generations of 4,096, the older dropped whole when the newer fills, so
at most 8,192 per Selection and domain). `Data.get(Quote, name)` on every
render is a map lookup, and the same id gives the same Projection object,
which also lets a memo downstream key on it.

### 2. A row read is memoized by the store entries it touches

A row's read depends only on the store entries at the keys it reaches: its
own entry, and through each relation it selects, the entries of the targets
its values point at (`assemble`, `unavailableOf`, `isTombstone` and
`isFieldStale` read nothing else). The store is immutable and keeps an
entry's object while nothing writes it. So a row read keeps, per Selection
and entity key, the result it gave and the entries it touched (`[key,
entry]`, `undefined` for an absent one); the next read compares each by
identity and returns the same result when all match. A write to another
row, or to the application outside Remote, costs one comparison per entry
touched.

When an entry did change, the row is assembled again, and:

- its decoded value is the last one while the assembled data is equal
  (`sameData`). The last decoding is kept per Selection schema by entity key
  (shared by every relation the schema is read through, so a row and the
  list holding it hand out one object), so a rebuilt entry with equal data
  (an optimistic row, an evicted row read again, a resumed store) keeps its
  value; and, as `decodeRow` did, by the row's own `values` object in a weak
  map, so a Model read again after a later one (an earlier state, a confirmed
  read beside the visible one) finds its decoding too;
- its `RemoteData` is the previous object while the tag and the value are
  the same.

The memo replaces `decodedRows` and the per-store `memoRead` in `select`.
Query pages (`Data.query`) and `Data.filtered` read their rows through the
same memo, which is kept per Selection schema and relation key in the same
bounded map (4,096 × 2 rows), not per store: two domains reading one entity
key thrash it and stay correct, since a touched entry of another store is
never the same object. Eviction removes an entry from the store, which the
memo does not see; it forgets the row when the row falls out of the bounded
map, so a row evicted and read again within it gives its old value.

One version per key is the limit. Reading a Model older than the last one
read (a test reusing a fixture, devtools stepping back) gives equal values,
and the same objects only where the weak map by `values` still holds them.

### 3. Containers keep their object while their parts do

- `Initial`, `Loading` and `NotFound` are one frozen object each.
- A `Failed` over a value on screen (a refresh that failed) is kept per
  read under it and error, so it is the same object while both are.
- A query page keeps its `RemoteData` while its rows are the same objects in
  the same order, its bounds are the same and it is in the same state. The
  page is still memoized per store snapshot as before; the page compared
  with is the one read last for that connection, relation and window size
  (a hit included), in a bounded map per domain (256 × 2). A changed row
  gives a new row, a new page and a new `RemoteData`; nothing else is new.

### 4. A derivation memoized by the Model paths it reads (`foldkit-surface`)

`Projection.derive(on, derive)` is the value counterpart of
`SlotView.region`: `on` lists the field references and Projections the
derivation reads, `derive(root)` is run again only when a value at one of
their paths is a new object, and a result with the same fields as the last
(shallowly) gives the last back. It returns `{ dependencies, read }`, so a
region can be drawn from it, and `SlotView.region` is rebuilt on it, so the
two share one rule (`valueAt`, `keepAlike` and `sameFields` moved from
`foldkit-mixins` to `foldkit-surface`). It keeps one result, for the last
Model given: bounded by construction.

A Remote read declares no Model path: its data is named by its metadata,
which is how `foldkit-ssr` resumes it. A derivation over Remote reads names
the store's field (`App.model.remote`). An entry in `on` that declares no
path is refused, so `Projection.derive([Data.get(…)], f)` throws instead of
never working the value out again. Declaring the store's path on every
Remote read was tried and dropped: SSR coverage then refused every plan with
a Remote Surface as `Uncovered`, since it counts paths and metadata apart. A
region over `Projection.struct({ quote: Data.get(…), cart })` still sees
only `cart`; that is #385.

`derive` may read only what `on` names; that is the caller's promise, as it
is for `Projection.fromReader`'s `dependencies`.

## Where it is applied

- **domains-plus**: the listing per name under `Equal.equals` goes.
  `domainToReadyListing` keeps one listing per Remote domain object (a
  `WeakMap`), and the view takes the domains from Remote (a
  `Projection.derive` over the store and the query) rather than from the
  `Ready`, whose constructor copies them. A filter toggled draws no row. `searchViewState` is a `Projection.derive` over the seven
  fields it reads, so a render that changed none of them (a menu opened, the
  cart) does not work it out.
- **Chirp's timeline**: a post not being edited is drawn as a keyed lazy
  item of its row, which is now the object it was while its data is.
- **The registry grid** reads its page through `GridCrud.rows`, which keeps
  one row model per page object; the page now keeps its object across writes
  that do not reach its rows, so the row model and its rows are reused with
  no change of the example's.

## Correctness

Identity changes exactly when the value does, tested on the runtime's
reads: unchanged store, a write elsewhere, the application changed, an equal
refetch, an optimistic row over a changing base, eviction and a read again,
a changed row (new row, new page, nothing else new), a related target
changed (the row through it is new), a failure laid over a value and taken
off. `heldValue.test.ts`, the R0 conformance suite and `Law.check` run
unchanged. Each memo has a mutation spec.

## Results

**The read.** `byId.bench.ts`, same machine, mean per pass of 556 reads:

| case | before | after |
| --- | ---: | ---: |
| same Model | 1.80 ms | 0.23 ms |
| same Model, held handles | 0.24 ms | 0.21 ms |
| one row changed, the write included | 3.72 ms | 0.46 ms |
| a row no read reaches written, the write included | 3.29 ms | 0.41 ms |
| that write alone | 0.14 ms | 0.15 ms |

**The page.** `pnpm bench:render --app domains`, R1's method unchanged,
as an A/B: *before* is the tree at `4924eb6c` (before this work, R3's
per-name workaround included), built from a detached worktree; *after* is
`main` with this work. Two rounds at each throttle, alternating. The
Worker was served on port 5299 for the second rounds: another project's
`vite preview` held 5197. The first *after* round at 4× ran while other
work loaded the machine (its keystroke frame, which this work does not
change, read 29 ms against 20); it is recorded and left out of the table.
Samples: `docs/design/renderer-baseline/2026-10-31-384-{before,after}-cpu{1,4}x-{1,2}.json`.

View and patch in ms, median of each round (round 1 · round 2):

| frame's last Message | view before | view after | patch before | patch after |
| --- | ---: | ---: | ---: | ---: |
| `UpdatedSearch` (a keystroke) | 3.1 · 3.2 | 3.1 · 3.2 | 2.3 · 2.2 | 2.4 · 2.4 |
| `ReadStarted` (names checked) | 8.2 · 7.6 | 6.8 · 6.7 | 0.2 · 0.2 | 0.2 · 0.3 |
| `ReadReceived` (prices arrive) | 7.3 · 7.2 | 6.1 · 6.4 | 2.9 · 2.8 | 3.2 · 3.1 |
| `Placed` (a scroll) | 6.9 · 7.4 | 4.7 · 4.3 | 2.4 · 3.0 | 2.7 · 2.6 |
| `PressedPointerOnButton` (filter opened) | 7.5 · 9.6 | 3.7 · 3.5 | 2.1 · 2.6 | 2.4 · 2.2 |
| `SelectedItem` (filter chosen) | 7.8 · 11.2 | 5.4 · 4.5 | 1.8 · 2.3 | 2.1 · 1.8 |

With the CPU slowed four times (before: both rounds; after: round 2):

| frame's last Message | view before | view after | patch before | patch after |
| --- | ---: | ---: | ---: | ---: |
| `UpdatedSearch` | 20.5 · 20.3 | 22.1 | 17.5 · 16.3 | 18.6 |
| `ReadStarted` | 58.2 · 59.7 | 41.9 | 1.2 · 1.2 | 1.4 |
| `ReadReceived` | 57.1 · 58.1 | 45.9 | 26.9 · 25.2 | 27.0 |
| `Placed` | 48.1 · 55.3 | 35.6 | 23.6 · 20.6 | 24.2 |
| `PressedPointerOnButton` | 50.2 · 56.8 | 21.9 | 12.6 · 15.2 | 14.8 |
| `SelectedItem` | 47.7 · 56.1 | 31.6 | 10.9 · 12.3 | 12.1 |

**Reading it.**

- **A price arriving** costs about 20% less view (7.2 to 6.2 ms; 58 to
  46 ms at 4×): the 556 reads are a handle lookup and an entry comparison
  each, and the rows that did not change keep their drawing. What is left
  is the rest of the view, which runs whole.
- **A frame that changes nothing the search reads** (the filter's menu
  opened) does not work the search out at all: 7.5–9.6 to 3.6 ms, 50–57 to
  22 ms at 4×. Choosing a filter draws no row (48 before, counted), and
  costs a third less view.
- **A scroll** costs a third less view: the window's names are worked out
  from reads that are now cheap.
- **A keystroke is unchanged** (it changes the query, which every
  derivation reads), and patch is unchanged throughout, within noise.

