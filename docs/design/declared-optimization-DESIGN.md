# Optimizing from what a program declares

Status: design (2026-11-02). The why behind the performance plan's
"Beyond parity" levers ([performance-PLAN.md](./performance-PLAN.md)), and a
second consumer of the graph [contract-layer-PLAN.md](./contract-layer-PLAN.md)
(#190) derives. Issues are listed under each pass.

## The idea

Foldkit's runtime knows nothing about a program but this: a Message arrived,
so run `update`, run `view`, and diff the whole tree. A Foldkit Plus program
declares far more, and every declaration is something an optimizer could use:

| Declaration | What it states | Where |
| --- | --- | --- |
| A Surface's `model` and Projections' dependencies | the Model paths a region reads | `App.surface`, `Projection`, `SlotView.region` |
| A Surface's `messages` | the Messages a region can send | `App.surface(…, { messages })` |
| Remote reads, Selections, Query bodies | the data a page needs: shape, filter, order, freshness | `Data.get`, `Data.query`, `Query.define` |
| Entity, Write, guard rules | which writes touch which rows, and who may read what | `Write.*`, `GuardServer`, `Entity.sets`, cascades |
| The Site tree | routes, the Surfaces each shows, and how pages nest | `foldkit-site` |
| Bundles and placements | which `update` branches and views belong together | `Bundle.make`, `Page.at` |
| Styles and recipes | every class and rule, fixed per build | `Style`, `foldkit-mixins-ui` |

One thing is missing: what each Message writes. `update` is a function, so
nothing states that `ClickedAddDomain` changes `cart`. The invalidation pass
below infers it.

## The rule: a declaration is a claim, and a pass that trusts one ships a checker

An optimization that trusts a declaration is only as safe as the
declaration is true. A region memoized on reads it does not declare shows a
stale value with nothing said. So every pass in this note comes with a
development and test mode that computes the unoptimized answer beside the
optimized one and reports a difference. It names the region, the
declaration and the value, through `Diagnostics` (#237). Production trusts
the declaration; development and the test suite verify it.

This is the pattern already in the tree:
- `verifyPredictions` checks a pending layer against the server's answer;
- `Law.check` holds the client's judgement of a write to the server's;
- `Data.why` explains a read;
- conformance suites hold two implementations to one answer.

A pass without a checker is not merged.

## The graph

The passes read one structure: the program's declarations, evaluated at
build. That is the routes, each route's regions, each region's reads and
Messages, the reads' data and access, and the styles each region draws.
contract-layer-PLAN derives the same graph for correctness and for agents;
performance is a second reader. #419's style plugin is the first build-time
pass: it evaluates style modules through Vite's SSR loader and emits an
artifact. Each later pass has the same shape: evaluate the declarations,
emit a smaller or faster artifact, and verify in development.

## Passes

### Server rendering

**Partial prerendering** (#434). A region that reads nothing the request
can change (route parameters, query, cookies, the viewer) and no data whose
freshness is per request renders identically every time, and its Surface
says so. Such regions render once at build. The server fills only the
dynamic holes per request, and streams the shell at once (#427). In
domains-plus that is the header, the hero, the footer, the filter
scaffolding and the page frame. Checker: in development, render the region
per request as well and compare with the prerendered markup.

The prerendered shell belongs in the page template, not inside the markup
the request renders. Foldkit re-parses the rendered markup and the page
around it to check its fidelity (foldkit/foldkit#1657). Its cost grows with
what is parsed, so a shell that sits inside the rendered markup saves
rendering but is still parsed on every request.

**Reads at route match** (#435). A route's reads are known from the Site
tree and its Surfaces before any view runs. The server starts all of them
when the route matches, in parallel, rather than discovering them while it
renders, and with streaming the head leaves while they are in flight.
Checker: the reads the render then asks for must be a subset of those
started. An extra read is reported.

**Resume only what the client reads** (#436). The resume plan ships the
Model slices a page adopts. A slice no interactive region reads, only
static or prerendered ones, need not cross the wire. Checker: in
development, resume the full Model too, and report a region that reads a
slice the plan pruned.

**Streaming** (#427) orders the response by what the graph knows is first
screen.

### Data

**Cache policy and keys from the declarations** (#428). A read's cache key
is its input, plus the viewer only where a guard rule over it mentions the
viewer. A read no rule ties to a person is public. Freshness comes from the
declaration. Checker: a test runs each cached read as two principals and
requires the same answer wherever the policy says public.

**Indexes from Query bodies** (#437). Every filter and order a client may
request is declared. remote-drizzle checks that the tables have an index
serving each declared Query, as it checks CHECK constraints against
invariants (#259), and can write the statement for a missing one. The check
itself is the checker, at build.

**Route-level prefetch and splitting** (#438). The Site tree and its
Surfaces give each route's reads (prefetch on intent, built in #227) and its
Bundles. The client splits per route from the tree, instead of
hand-written `Resource.lazy`. Checker: a module assertion per route chunk,
as `split.test.ts` does.

### Client updates

**Regions skip work unless their reads changed** (#431). Built opt-in
(#384, #385); this pass makes it the default. Checker: in development,
redraw a skipped region and compare.

**An invalidation map from Message writes** (#439). Narrowed 2026-11-10: the inferred write sets are dropped for a static write-against-query function and per-Entity versions, each built when its trigger is met ([377-439-440-remote-data-plane-DESIGN.md](./377-439-440-remote-data-plane-DESIGN.md)). Declared reads per
region plus each Message's writes give the regions a Message can affect;
the rest are not even checked. Write sets are inferred by running `update`
over generated Messages in tests (the property-test generators of
`heldValue.test.ts` already exist) and recording which Model paths change,
or declared on a Bundle part. Checker: in development, after each Message,
compare the Model paths that changed with the inferred set, and report a
write outside it.
Deferred (2026-11-09): checking a region costs well under a microsecond over
Model paths, and about 22 µs to read a 25-row Remote list again after a write.
That is about 1% of a frame on a page like domains-plus, the most this pass
could save (`performance-PLAN.md`, "Measure the check before skipping it").

**Fine-grained updates without runtime tracking** (#433). Solid tracks
dependencies at runtime; Plus can take the same graph from declarations, at
no tracking cost. A compiled view patches only the bindings whose paths
changed.

**Listeners only where Messages are declared.** A region that sends no
Messages needs no handlers. This falls out of #432 and #433.

### Bundle size

**Islands** (#432). A region declaring no Messages, and reading nothing the
client can change, needs no client code.

**Capability tree shaking**, continued. #378 drops write code from a
read-only page by declaration. The same rule extends to every capability a
page does not declare (live, outbox, persistence, cascades, guards),
checked by `readOnlyPage.test.ts`-style cases.

**Selection-specific codecs** (#440). Decided closed 2026-11-10 on the measurement (decoding is already per Selection; at most 0.76 kB could go): [377-439-440-remote-data-plane-DESIGN.md](./377-439-440-remote-data-plane-DESIGN.md). A page decodes the fields its
Selections read, so the wire decoders it ships can be generated for those
alone, not each Entity's whole Schema. Checker: a round-trip test of each
generated codec against the full Schema.

### Styles

**Used variants only** (#420). The views and the Slots they draw give the
recipe variants a build can reach; emit only those, and deduplicate
declarations. Checker: #419's conformance test, rules against runtime
injection.

## Order

The cheapest passes with the largest effect come first, and none needs
Foldkit's cooperation:

1. **#434 partial prerendering**, beside #413 and after #419. A static
   region costs nothing to render per request, and with the shell in the
   template it costs nothing to check either.
2. **#435 reads at route match**, with **#427 streaming**.
3. **#428 cache policy from guards.**
4. **#436 resume only what the client reads.** The resume data sits inside
   the page Foldkit re-parses, so this cuts server CPU as well as HTML; the
   performance plan moves it into Phase 1.
5. **#439 the invalidation map**, after **#431**.
6. **#437 index checks**, **#438 route splitting** and **#440 selection
   codecs**.
7. **#432 islands** and **#433 compiled views**, with upstream.

Each pass's checker lands in the same change as the pass.
