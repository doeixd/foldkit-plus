# One declaration, every reader: the metakit unification plan

Status: plan, written 2026-11-21, revised 2026-11-22 against the tree at `d729a83fa`. Phases 0, 1 and 5 are built and reviewed; Phase 2 is built in large part; Phase 3 is done on its first example; Phase 4 is next. A built phase is summarised in one paragraph with its commits, what it moved and what it decided differently; its full brief is in git history (`6f3a3b08c`) and in [the kernel convergence note](./metakit-kernel-convergence-DESIGN.md) ("the kernel note"). Measurements live in [the ledger](./metakit-unification-LEDGER.md). It succeeds [metakit-phases-2-6-PLAN.md](./metakit-phases-2-6-PLAN.md). The coordinating session keeps the phase table current and hands each piece of work to a subagent.

## The problem, the idea, and what you get

An application built with Foldkit Plus (this repository's packages) states the same facts several times. Foldkit is the framework we build on: an application is one state value (the Model), events (Messages), a function `update` that makes the next Model from a Model and a Message, and a function `view` that draws a Model. Take one fact: "pressing Add changes the cart's count, and nothing else". Without this plan that fact is written as code inside `update`, again as the list of Model fields a part of the page reads, again as the rule the server checks and the SQL the database runs, again as the test that says a late reply must not undo a newer one, and again as the list of fields the server must send so the page can start. Each copy is in a form only one part of the system can read. So the page redraws parts that did not change, ships data and script that the first press does not need, and a rule can be right in one copy and wrong in another.

The idea is to state each fact once, as data, in a form every part reads. A rule becomes a small tree of operations (an expression) instead of a function. A state change becomes a guard and a list of "this field becomes this value" (a transition) instead of a branch of `update`. Anything can then read, without running it, what a Message reads and what it writes.

The package `metakit` holds that form. Phase 1 made it the only expression language: `foldkit-entity`'s rules, queries and declared writes now build metakit expressions. This plan finishes the base (one dependency graph, the record of what reads and what writes each piece of state; one way to keep computed values up to date; an application whose `update` is declared) and builds on it what the declarations make possible: a page that answers its first press (the first click or key a person makes) without loading the framework, script cut along Messages, values maintained from what changed, and operations, folds and ways of writing an application defines itself, with claims every reader trusts because a generated test checks them.

When the plan is done, you write a rule once and the page, the form, the server, the database, the checker and an AI agent's tool list all read that one rule. A page ships the data its changeable parts read and the script its first press needs. A list of 100,000 rows takes a pending edit without a walk of the list. A test fails when a race between two Messages has no test, and when an operation you defined claims a law it does not keep.

| Phase | Delivers | Status at `d729a83fa` | Needs | Bouts left |
| --- | --- | --- | --- | --- |
| 0. Clear the ground | Files small enough to review, the ledger, leftovers | Done; two housekeeping items open | nothing | 1 |
| 1. One expression language | Entity on metakit; list, text and write operations; property tables | Done; standard library and four soundness items open | 0 | 6 |
| 2. One dependency graph | One graph read by drawing, start-up, fetching, replication, checkers | Built in large part; completion item open | 1 | 4 |
| 3. Declared `update` (a bet) | An application's Messages as one declared set of state changes | Done on todo-app; the gate's byte and type readings, domains-plus and adoption open | 1, 2; its gate | 8 |
| 4. Checked custom algebras and maintained values | Operations, folds and ways of writing an application defines, checked; values kept up to date from row changes | Next | 1, 2 | 24 |
| 5. Stores and orderings | Every store declares its guarantees; two changes that meet are decided or tested | Done; store-declaration fixes in the tree | 1 | 0 |
| 6. Resume without the runtime (a bet) | A page that answers declared presses before Foldkit loads | Not started | 2, 3; its gate | 15 |
| 7. Script cut by Message (a bet) | Script per part of the page and per Message | Not started | 3, 6; its gate | 10 |
| 8. Examples and documents | Every example on the new base; guides, skill, site, post | Proof examples move with each phase | all | 10 |
| 9. Building on the base | An application's own typed language, stores and protocols, checked like ours | Not started | 4 part A | 7 |
| Developer-experience audit | Inference, compile cost and messages, measured across phases | Not started | 2, 3 | 1, then once per phase |

A *bout* is one piece of work that stands on its own (a module with its tests, a design note), done by one agent and reviewed at its end. Sizes are estimates for scheduling, not limits. A phase marked "a bet" opens with a *gate*: a bout that measures what must be true before most of the phase is spent, with the smaller shape the phase takes if it fails. In the table, a checker is a program that shows a rule cannot be broken; "resume" is a server-drawn page starting in the browser from the server's state; the runtime is Foldkit's script. The words the phases use are explained in "Words this plan uses".

## Is this a better design?

Partly on evidence, partly on a bet. The two are kept apart so a reader can tell which is which.

**Better, on evidence.**

- *One rule read by every consumer.* An independent review found the in-memory evaluator, the SQL and the provers disagreeing about a missing value, and SQL produced by two code paths that each had bugs the other lacked. One evaluation rule and one SQL lowering removed that class of fault, and a parity suite runs every operation on SQLite and PGlite against the evaluator.
- *One expression language.* Phase 1 deleted entity's second evaluator, checker (`bounds.ts`) and operator table; an operation is added once (`207a36783`, `c02c2dcf1`, `d72bcd85c`). A differential test over 679 pairs of write and rule found no opposite answer before the old checker went (ledger, "Laws on metakit's checker").
- *One graph.* The structure exists (`40a0a1c13`) and four of the five old graphs read it; Phase 2's verdict table says which part is not done.

**A bet, and what would confirm or refute it.**

- *That most of a real application's `update` can be stated as data at an acceptable cost.* On `examples/todo-app` it holds for the count: 23 of 25 Messages are transitions with no hand-written arm and the other two (`UrlChanged`, `MirrorRestored`) are ordinary code with a declared footprint (`12354bd14`, `92d3114e2`); every Command runs from an emitted record. It is not shown for cost: the page read 165,083 compressed bytes before it opted in and 173,086 at `31b10117c`, and the growth is not split by cause, so the gate's byte premise is unmeasured. domains-plus has no machine and its gap list is not counted. Phase 3's completion bouts measure both.
- *That a page can answer presses without the framework and be faster for it.* The earlier measurement found nothing to gain from skipping static parts inside the runtime; only a small script that runs instead of the runtime can move the numbers. Whether it fits and whether Foldkit adopts a page it changed has not been tried. Phase 6's gate tries both first.
- *That cutting script by Message pays.* The application's own `update` code was about 16.6 kB of 217 kB compressed on the measured example. It matters only once the runtime is out of the start path. Phase 7's gate says so.
- *That applications will define checked algebras of their own.* No application does yet. Phase 4 part A's first consumer is an example and its tests (as the project's scope rule allows); Phase 9 builds the kit around it.

**What the work so far showed about cost.**

- *Bytes.* Phase 1 left every page that reads rows 3.3 to 5.6 kB brotli above its ceiling before the move (the evaluator and judge every such page now runs); the maintainer accepted that on 2026-11-21 (ledger, "Closed by step 10"). Every later bout measures before and after.
- *Proofs lose power when made sound.* Answers that read "proved" became Unknown once null, absent and out-of-range values were taken seriously, and 19 pairs the old checker kept are Unknown for that reason.
- *Nothing is right until someone independent looks.* Declared rewrite laws were false for null and NaN; two adversarial reviews after Phases 1 and 5 found an authorization bypass in `GuardServer.writer` and a replay that silently diverged, the second confirmed by a TLA+ model ([phase 1 and 5 review](./metakit-phase1-5-REVIEW.md), [deep review 2](./metakit-deep-review-2-REVIEW.md)). That is why every phase ends in an independent review, and why a claim (a law, a capability) is trusted only where something checks it.
- *A declared form is more to learn,* and type errors are where a user meets it first. The plan had no gate on inference, compile time or message quality; it has one now (rule 19 and the developer-experience audit).

## Words this plan uses

- **Effect, Effect Schema.** Effect is the TypeScript library Foldkit is built on; it runs asynchronous work as values. Its Schema type describes a value's shape (`Schema.Struct({ balance: Schema.Int })`). Every Model, input, stored row and operation argument here is described by one.
- **Expression, path, operation.** An expression is a rule or computed value written as a tree of operations (`Num.gte($.balance, 0)`); a path names a field inside a Schema (`$.cart.count`). An operation is what a call node names (`num.add`). metakit has 33 core operations (`CoreOpId` in `packages/metakit/src/node.ts`), a closed set each reader implements.
- **Node kinds, opaque.** An expression tree has seven kinds of node: a literal, a path, a call, an if, a match, a `Rows` node (one question asked of each element of a list or each related row: any, every, count, sum, min, max, find, keep, patch; the only iteration), and an opaque node, which wraps ordinary code and says which paths it reads, or that it may read anything.
- **Custom (foreign) operation.** An operation an application defines outside the core set, carried in a node by its id and version (`flags.or@1`) with no evaluator, because a page and a server hold different implementations of it, or the page none. Each reader takes the implementations from its caller and refuses a call it holds none for (`Node.foreign` today; Phase 4 gives it typed arguments and checked laws).
- **Reader, conformance case.** A reader takes an expression and does something with it: evaluates it, turns it into SQL, bounds it, proves something about it, or lists the paths it reads. A conformance case is an input with its expected answer, run through every reader to show they agree.
- **Null-strict, refusal.** Null-strict means an operation over a missing value gives a missing value, and a rule holds only where it evaluates to true. A refusal is a typed failure the evaluator returns instead of a wrong number (an integer past 2^53-1, a division by zero).
- **Transition, guard, machine, footprint.** A transition is one state change written as data: a guard (the condition under which it applies), its writes, and the Commands it emits as records. A machine is a state Schema with its named transitions, one per Message tag. A footprint is the list of paths a transition reads and the list it writes, read from the data.
- **Way of writing.** How a transition changes one path: set it, add an amount, append, insert, remove or patch an element with an id, include or exclude a value of a sorted set (`ops/ways.ts`). Phase 4 adds `combine`: the path becomes a checked operation of its old value and a given one.
- **Property (law).** A fact about an operation, fold or way of writing that holds for every input in a stated domain: identity, absorbing, idempotent, commutative, associative, invertible, monotone, and for partial evaluation alone reflexive and involution. The set is closed; the tables are `opProperties`, `foldProperties` and `writeProperties` (`packages/metakit/src/properties.ts`). A *generated check* is a test built from a declaration: it samples inputs and requires the property to hold against an implementation.
- **Supplied input.** A value a transition needs and cannot make, such as a new id or the time: whoever runs the step makes it once and records it, so a replay runs the same step.
- **Command.** Foldkit's word for a side effect `update` asks the runtime to run (a fetch, a focus). A transition emits a Command as a record; `foldkit-surface/declared` maps each record to the application's Command.
- **Checker, prover, verdict.** The checker (`Abstract` in metakit) answers at once whether a transition can break a rule, from bounds on each value; the prover hands harder cases to the Z3 solver. Both answer with a `Verdict`: true, false or Unknown. To residualize an expression is to evaluate the parts whose inputs are known and keep the rest.
- **Obligation, walk, registry.** An obligation is something a proof did not show and a test must, usually that two transitions in either order leave a valid state. A walk is a seeded test that runs steps in many orders. The registry (`metakit/temporal`) collects every obligation and discharge in a test run; one test fails while any is open, and `npx foldkit-plus laws` prints the list.
- **Store capability.** A store is whatever persists rows. Its capabilities say how it runs overlapping writes (its isolation, and how far it reaches: one statement or a transaction) and whether a write locks the row a group of rows hangs on (the parent-row lock). A rule needs a capability (`row-atomic`, `parent-serialized`), and a writer says where it judges the rule (in its statement, from a read first, or by a database constraint).
- **Pending write, differential test.** A pending (optimistic) write is one the page has applied and the server has not answered. A differential test runs two implementations over the same cases and requires the same answers.
- **Package names.** `foldkit-entity` defines kinds of stored row (Entities), relations, queries and declared writes; `Laws.check` (`foldkit-entity/laws`) is its checker. `foldkit-remote` holds rows read from a server in the Model and sends writes; a *live read* is one the server keeps pushing changes to. `foldkit-sync` replicates part of the Model between devices. `foldkit-guard` states who may read or change which rows. `foldkit-surface` names parts of the view (Surfaces) and the Model paths each reads (its projection); `foldkit-bundle` makes reusable parts (Bundles) placed at a path of the Model. `foldkit-form`, `foldkit-agent` (an application's Messages as an AI agent's tools), `foldkit-mixins` and its `mixins-*` siblings (widgets and styling), `foldkit-remote-server` and `foldkit-remote-drizzle` (the server side of Remote; Drizzle is the SQL library), `foldkit-ssr` (server rendering). An *opt-in entry point* is a subpath (`foldkit-form/metakit`) only an application importing it pays for.
- **Stores named here.** SQLite and Postgres are databases; PGlite is Postgres inside a test process; D1 is Cloudflare's hosted SQLite; a Durable Object is a Cloudflare server object with its own storage; IndexedDB is the browser's.
- **Hydration, resume, envelope, cover, anchor, binder.** Hydration is Foldkit calling the whole view on its first run over a server-drawn page and matching it to the elements there. Resume starts the page from the server's Model; the envelope is the JSON the server writes into the page for that. A path a Surface reads is *covered* when something guarantees it is in the browser. An anchor is an element the server marked with the id of the value it shows; the binder is the small script Phase 6 builds that answers a press by running a transition and writing anchors before Foldkit loads.
- **Blocking, chunk, budget.** Blocking is the time from navigation in which the main thread was busy over 50 ms at a stretch, measured with the CPU slowed four times. A chunk is one file of built script. A budget is a test that fails when built script grows past a recorded number of bytes.
- **Maintained value, delta.** A maintained value is a computed result (a sum, a filtered list) updated from each change instead of computed again from all rows (incremental view maintenance, in database terms). A delta is one change: this row, before and after. An aggregate is a value over many rows.
- **Jev, mutation spec.** Jev (`npx jev-pref review`) judges a diff against the project's written preferences. A mutation spec (`test/*.mutations.ts`) lists deliberate breakages of the code; `pnpm mutate <spec>` applies each and requires a test to fail.
- **Proof examples, the #601 note.** The two applications each phase is shown on: `examples/todo-app` (small, first) and `examples/foldkit/domains-plus` (measured). `docs/design/601-expression-standard-library-DESIGN.md` is the standard set of value types and operations, with the admission rule for an operation.

## Where things stand

Checked against the tree at `d729a83fa` and the commits named. A claim not checked is listed under "Assumptions to verify".

**Built.**

- *Phase 0.* The split of metakit's two largest files (`a750f5be2`), the guides on the site (`1612529cc`, `8d5a783bc`, `a9dce383f`), the ledger and budget notes (`891b383fd`), the surviving mutations killed or declared unobservable (`582f356cd`), the CI retry for a closed browser connection (`ef2e8d8a2`).
- *Phase 1.* All eleven steps of the kernel note. metakit gained `metakit/build`, the text, equality and list operations (33 core operations in all), foreign operations, supplied inputs, `Transition.add` and `Transition.opaque` (`54a77dcba`, `dacf53ac5`, `c2a963065`, `82d490935`); one `Verdict` (`6e319f5ff`); `Rows` over lists and related rows, list writes, emitted records, `Transition.commutes` (`98b48a212`); the property tables with generated checks (`03d191014`, `99b02acfc`). Entity was translated (`b98da5975`, `5b022a2e7`), judged through the translation (`b61064cb4`), its writes became transitions (`6ccde36e8`), `Laws.check` moved to metakit's checker (`c02c2dcf1`), Drizzle's operations to metakit's lowering (`d72bcd85c`), guard onto metakit (`d78fa53c1`), and the constructors build metakit nodes with the translation deleted (`207a36783`). `num.mulScaled`, decimal multiplication with half-even rounding, landed from the standard library (`24904fdd6`).
- *Phase 2, in part.* See its verdict table.
- *Phase 3, on todo-app.* `foldkit-surface/declared` (`bb73a0c93`, `721541c90`): a derived `update`, a Command table exhaustive by type, supplied values bound per step, a required fallback for undeclared Messages; todo-app on it (`92d3114e2`, `6f6257848`) with a seeded test replaying Messages through the hand-written and derived `update` (`09a74a89b`); Message-to-Message edges (`21bbb5355`); a confined child Bundle tested (`35cc0fe6f`); Sync's durable transitions read from the application's machine (`add073f0e`, `b7b7e3358`, `64afe868b`).
- *Phase 5.* All ten items but item 3. Stores declare isolation and its reach (`017182491`, `4189259c4`, `55bb49d7b`, `73e049220`, `288e6777c`); `EntityWriter.store` is required (`45c18bf93`); guard rules over other rows are held to the writer's store (`e6ba38818`, `154db2ed5`); a late answer without a live read is read again (`684abd795`); protocol obligations walked over the real reducers (`84cb25302`, `40cef27c4`); the registry, `metakit/pairs` and the failing report (`78e39b7f0`, `a7e15bd43`, `45c0a983e`); `Transition.idempotent` and Sync convergence read from the declaration (`e6cf9aa0b`, `ae728b5e6`); one `replayOver` rule (`79c464475`).

**Decided differently from the plan's first text, and moved.**

- The page judges held rows without building a residual expression (the lean judge, `103e5f790`), so partial evaluation stays off pages.
- A way of writing declares no `invertible`, since nothing decides from it (`b7097b083`); `commutes` and `idempotent` carry named conditions (`CommuteCondition`, `IdempotentCondition` in `ops/ways.ts`), and the ways live in `ops/ways.ts` so a page that replays a pending write loads two rows of the table (`ca26ec8cf`, `c0197407e`).
- Phase 5 item 10: an `add` answer equal to its replay settles without a read only at the revision right after the newer value (`rightAfter`, `1b78d2cdd`), which needed every write answer to carry the revision it moved the row to (`EntityWriter.revision`, `0e8faee9c`); a read beside a pending `add` is shown as it is, since it may include the add (`bad8758c4`); a failed pending write, `set` included, is dropped with its layer and nothing is read again (`replay.ts`). Reconciled writes are ordered by server revision (`2e0563dfc`).
- A rule a database constraint holds is judged `constraint` (`89bc972e1`); a delete through an `onDelete` relation and a link through one are held to the store (`e23d90ff9`); the Postgres store races run on a real Postgres in CI (`ddd5af4dc`). The Drizzle writer judges only a guard's rule over other rows in its statement, so an aggregate data rule is refused on D1 and on read-committed Postgres until Phase 4 item B7 (`d729a83fa`, which corrected the #601 note).
- Phase 5 item 3, the Postgres parent-row lock, is Phase 4 item B7.
- In the tree at this writing, not yet committed: D1 declared two ways, and the store declarations of `foldkit-sync` and `foldkit-durable` not read by anything (`packages/durable/src/journal.ts`, `packages/sync/src/journal.ts`). The coordinator confirms the fix before Phase 4 item B7 reads those declarations.

**Still as it was, and what later phases build on.**

- `ForeignOp` (`node.ts`) holds `id`, `version`, `returns` (number, boolean or text), `nulls` and `properties`; it has no argument or result Schema. No reader acts on its `properties` and metakit checks none of them. `call(op, args)` in `ops/core.ts` takes `unknown` arguments and returns an `Expr` whose value type the caller picks, so a call of a custom operation is typed by nobody. Implementations are a record keyed by the string `id@version`. `OpProperties.invertible.inverse` is a `CoreOpId`, so a custom operation cannot name its own inverse.
- Entity's `Expr.operator` does type its arguments and result by Schemas and declares nine `Law` kinds (`packages/entity/src/law.ts`); `Conformance.laws` tests them against an implementation from Schema samples, in tests only, and records `Evidence` (`Tested`, or `Proven` by a reference nobody checks). Only four kinds reach metakit's descriptor (`propertiesOf` in `expr/primitive.ts`). Phase 1 decided to move the kinds onto metakit's set and drop `Distributes` and `PreservesCollation`; that was not done.
- The standard library beyond `num.mulScaled` (division and rounding, time, `concat`/`endsWith`/`upperAscii`, lists and sets of scalars) and four soundness items (`Transition.when` is still typed `boolean`; see Phase 1) are open.
- Maintained values exist only as `foldkit-remote/aggregate`. Postgres declares no parent-row lock. #580 and #606 are open.
- The graph's ids are strings (`DependencyGraph.affectedBy(writerId: string)` in `graph/structure.ts`); `deadReaders` has no caller; `pruneStatic` and `queryReadiness` are called only by `examples/metakit/src/demo.ts`. `packages/ssr` imports nothing from metakit.

## What was decided before this plan

- metakit is the base. Every package takes metakit declarations as its main input where it took a function or a representation of its own.
- "Meta-Foldkit" is the layer of issues #597 and #598 in which an application's `update` is stated as declared transitions over its Model; their later comments narrow the bodies and are followed.
- Resume and script splitting are built in full; `metakit-phase-6-DESIGN.md`'s advice against them is overruled. Its numbers stay as the baseline; measurements order the work and set defaults, they do not cancel it.
- Work is deferred only for a concrete reason: it waits on upstream Foldkit, a measured cost outweighs it, the design is unsound, or another package owns it.

## The target, in prose

### One model of declarations

An application is described by six kinds of declaration, all written with one expression language.

1. **Schemas** say what values a Model field, an input, a stored row or an operation's argument may hold. metakit ships a Schema only for what Effect lacks (a decimal at a scale, money, a calendar day, an ordered enumeration).
2. **Expressions** are rules and computed values over a named environment, which says what the expression may read: a rule on a row reads the row; a guard reads the row and the person asking; a query reads the row and its parameters; a view value reads the Model. Reading outside the environment is a type error.
3. **Transitions and machines** say how state changes. A declared write to a stored row and an arm of an application's `update` are the same thing: a guard, writes, and Commands as records.
4. **Queries and aggregates** say which rows match, in what order, and what follows from related rows.
5. **Guards and policies** say who may read or change what, as expressions over the row and the person.
6. **Views** read declared paths. A view stays a Foldkit view function; the values it shows come from projections and bindings whose reads are declared.

`foldkit-entity` remains where rows, relations, queries and declared writes are defined. Its constructors build metakit expressions: a language written on the kernel, not a second kernel. Phase 9 lets an application write its own language on the kernel the same way.

### One dependency graph

One graph is built once, when the application is defined. Its nodes are paths (in the Model, or a field of a kind of stored row), writers (a transition, a declared write, a package's reducer step) and readers (a projection, a binding, a placement, a query, a guard, a rule). An edge says "writes" or "reads" and how it is known: derived from data, declared by hand, or unknown. Unknown is never treated as empty: for rendering it forces a redraw, for authorization it grants nothing. At run time a package joins the graph with what is active and with what actually changed. Rendering, resume coverage, live-read planning, invalidation, the development-time write check and the provers read this graph.

### One way to keep computed values up to date

A maintained value has a definition (an aggregate, a filtered and ordered list, a join through a relation, a derived expression), a source, and a rule for one delta. The graph says which maintained values a change can reach. The delta rule updates the value from the changed row alone when the definition's properties allow it, and otherwise recomputes and says so.

### Laws decide

Some questions cannot be answered from footprints. Two Messages both write the cart's count: does their order matter? A row leaves a list: can the total be corrected from that row, or must every row be read again? A pending edit sits over a value the server just changed: can it be applied on top? Each answer depends on a property of the operation involved, so each operation, fold and way of writing carries properties from one closed set, in one table per kind keyed by its closed set of names (`properties.ts`, `ops/ways.ts`, `ops/laws.ts`).

| Property | In plain words | Example |
| --- | --- | --- |
| Commutative | The order of the two inputs does not matter | `a + b`; two increments of one count |
| Associative | Grouping does not matter, so many can be combined in any batches | a sum of integers |
| Idempotent | Twice is the same as once | `max`; set to a value; remove the element with an id |
| Identity | Some input leaves the other unchanged | `0` for `+`; the empty total |
| Invertible | A named operation undoes it | subtract undoes add |
| Monotone | A larger input never gives a smaller result (or never a larger) | `x + 1`; a count as rows arrive |
| Absorbing | Some input decides the result whatever the other is | `false` for `and` |

Reflexive (`x = x` is true) and involution (`not not x` is `x`) are used only to simplify expressions.

**The rule for declaring one.** A property is declared only where (a) a generated check confirms it against an implementation over the awkward values, and (b) a reader decides something from it. A property is declared over the values it holds for: integer addition is associative where neither grouping is refused, and nothing over floats is declared associative.

| Property | What checks it | What decides from it |
| --- | --- | --- |
| Identity, absorbing | Generated checks (`propertyChecks.ts`, `foldChecks.ts`) | Partial evaluation and the page judge; a maintained total's starting value (Phase 4) |
| Idempotent | Generated checks; twice equals once for ways of writing (`writeChecks.ts`) | Partial evaluation; `Transition.idempotent`; Sync redelivery |
| Commutative | Generated checks over both orders; two writes in both orders on seeded states | `Transition.commutes`; `metakit/pairs`; Sync convergence; `replayOver` |
| Associative | Generated checks over three inputs, both groupings | `metakit/aggregates`; combining many deltas into one (Phase 4) |
| Invertible | Apply, undo, compare | `metakit/aggregates`; update-or-rescan (Phase 4) |
| Monotone | Ordered pairs | The checker's bounds (`abstract/ops.ts` reads the table) |

Laws do not solve a Message the language cannot state: `UrlChanged` parsing a URL stays opaque, and everything that meets it is tested, not decided. Nor do laws make a weak store strong: they say which work can be skipped, never that a rule holds on a store that does not serialize its writers.

### Custom algebras, checked

An application needs operations metakit does not ship: combining permission flags, a domain's own rounding, a text normalisation. It can declare one today (`Node.foreign`) and readers carry it by name, but nothing types its call, no reader acts on what it claims, and nothing checks the claim. Phase 4 part A closes the three gaps, so an application can teach every reader a new operation, a fold over it, and a way of writing with it, and a false claim fails a test. Decision 11 records the rule: the vocabulary of properties stays closed, and user-defined instances of it are allowed and checked.

*Declaring.* An operation is declared once, with its id, a version, a Schema per argument and for the result, its null rule, and the properties it claims, from the same closed set. The declaration is the typed constructor: calling it builds a call node whose value type comes from the result Schema and whose environment is inferred from the arguments. Each property's fields are typed by the operation's signature: an identity value has the type of the argument it stands beside; commutative and associative can be written only for two arguments of one type that give that type; an inverse is an operation that takes the result and the second argument and gives the first; monotone has one direction per argument. Writing one that does not fit the signature is a compile error at that property.

*Checking.* Each claim is confirmed by a generated property check over inputs sampled from the argument Schemas: the awkward values each Schema admits (metakit's set of null, refusal, NaN, the infinities, zero, the ends of the safe range, the empty text, a lone surrogate, a NUL, filtered by the Schema), the ends of any range the Schema checks, and seeded values from a generator derived from the Schema. A failure names the operation, the property, the inputs and both answers, replayed through the evaluator. Checks never run on a page (rule 3). They run in a test helper the application calls with each implementation it ships, and in development a server may run the same helper at start. What makes a forgotten check fail loudly is the registry: every claim of every custom operation reachable from an application's machines and languages is an obligation named by operation, version, property and implementation, discharged only by a passing check in that test run, and the repository's obligations test fails while one is open.

*Versions.* Obligations are named by `id@version`, so a version bump names new ones and the old discharge covers nothing. A declaration that changes (its Schemas, null rule or claims) under the same version is refused where a server and a page compare descriptions, naming the operation. An implementation that changes is checked again on every test run, since a discharge is never stored.

*Lowering.* SQL learns a custom operation from a lowering declared per dialect, typed by its arity; a dialect without one refuses the statement by name, as today. Every lowering joins the parity suite: the generated samples run through SQLite and PGlite and must give the memory implementation's answers. A fold over a custom operation lowers only where its operation also declares an aggregate per dialect.

*Folds and ways.* A custom fold is a fold over a checked operation, not a function: `Rows` gains one fold kind that names an operation, admitted only where the operation claims commutative, associative and an identity (rows have no order in SQL, so a fold that depends on order is refused at definition and by type). Its fold properties are derived from the operation's, as `sum`'s are from `num.add`: an inverse makes it update from the changed row on a delete; idempotence without an inverse makes it a semilattice that rescans on a delete of the extreme. A custom way of writing is `combine`: the path becomes the operation of its old value and a given one. Two combines of one operation commute where it is commutative and associative; twice is once where it is associative and idempotent; a failed one is undone by its inverse. `add` is the named case of combining with `num.add`.

*Readers.* Partial evaluation and the page judge read a custom call's identity, absorbing and idempotent claims from its node, so a page carries the claims of the operations it names. The checker reads monotone when it is given the implementations (a bound from the endpoints) and answers Unknown without them. `Transition.commutes`, `Transition.idempotent`, `metakit/pairs`, Sync convergence and `replayOver` read combines. Phase 4's update-or-rescan classifier reads custom folds. The solver answers Unknown for a custom call, as today.

### What happens when two declarations meet

An *interaction* is two declarations whose footprints overlap. The graph finds the pair; laws and the checker decide what can be decided; what cannot becomes an obligation, discharged by a walk.

| The two that meet | Found by | Decided by | Left to a walk |
| --- | --- | --- | --- |
| Transition and transition | The graph | `Transition.commutes`, from their ways of writing | Pairs it does not decide (`metakit/pairs`) |
| Transition and rule | The graph | The checker, then the prover | Rules across rows on a store that does not serialize writers |
| Transition and projection or query | The graph | The delta rule: update from the changed row, or recompute | Nothing; a wrong skip is caught by the reference run |
| Write and guard | The graph | The checker | A guard reading other rows on a weak store |
| Pending write and newer server value | Remote, at run time, by field | `replayOver`, from the way of writing | The orders of answer, patch and read |

A declaration-based decider never answers "they conflict": only a run finds a counterexample, and it is replayed through the evaluator before it is reported.

### Why resume and splitting follow

If every Message's reads and writes are known, three things are computed before any script runs: the Messages a page can send (the tags on its elements and what their Commands send back), the values those Messages can change, and the data those values and Messages read. The same facts say what script a press needs. So a small script can answer a declared press without the framework, and script can be cut along Messages.

### Where metakit ends

metakit knows Effect Schema and nothing else: no Foldkit, no network, no storage, no drawing. It owns expressions, paths, transitions, machines, the verdict, the readers, the graph structure, the store capability vocabulary, walks and the registry, and (Phase 4) the definition and checking of custom operations. Each package owns its runtime: `foldkit-entity` rows, relations, queries and wire names; `foldkit-remote` the cache, network and optimistic layers; `foldkit-sync` replication; `foldkit-guard` the person and what a refusal discloses; `foldkit-surface` the application's contracts and the Foldkit side of the graph; `foldkit-ssr` the envelope, the loader and the binder. Extracting metakit into its own repository stays last, as #598 decided.

### What stays out

The admission rule for a core operation, from the #601 note: every reader implements it exactly or refuses it by name; it has conformance cases including the awkward values of its types; it is total over its input Schema or declares its partial answer; it reads nothing but its arguments. A custom operation keeps the last three and, for the first, refuses by name in every reader it has no implementation for.

The language has no user functions with bodies, no recursion, no loops, no I/O, no randomness and no clock read inside an operation. A custom operation is not a function in the language: its implementations live outside it, one per reader, carried by name. What the language cannot make (a new id, the time, who is asking) it is given as a supplied input. The only iteration is `Rows`, whose body is an expression over the element, built once from an arrow; a body holds no second `Rows`, so every evaluation ends after one pass. What does not fit stays code: `Transition.opaque` wraps a function with its declared footprint, and a development-time check fails when it writes a path it did not declare. There are no runtime "algebra" or "language" objects that change what a reader means: Phase 9's `Language` only groups an application's operations to derive each reader's tables.

## Rules for every phase

**Bytes.**

1. A feature someone opts into lives on its own subpath, and a page that does not use it pays zero bytes for it, asserted in `scripts/test/publishedBuild.test.ts`.
2. A main entry a page loads imports from metakit only what rule 3 allows. `foldkit-entity` and the packages that import it carry the node constructors, the evaluator and judge, and the operation modules a page names (ledger, "Closed by step 10").
3. One module per operation, imported by name; a page naming one operation ships no other (`4eb219727`). The checker, the prover, SQL lowering, conformance and the generated checks never reach a page. Of the graph, a page may carry only `metakit/graph/match`.
4. Every bout that touches code a page runs measures the affected budgets before and after and writes both in the ledger. A budget is raised only for code every such page runs, with the measurement beside it. A bout that would need a raise for anything else stops and reports.

**Meaning.**

5. Null and refusal mean one thing in every reader. A refused evaluation is a failure, never "undecided".
6. An analysis may only weaken toward Unknown.
7. A counterexample is replayed through the evaluator before it is reported. Tests compare verdicts and replay witnesses; they never snapshot a solver's values.
8. Proofs that a rule on data holds never assume a guard about who is asking.
9. A new core operation updates every reader's table in the same change; the tables are typed by the operation ids, so a missing entry does not compile.
10. A reader acts on a property, core or custom, only where a generated check of it ran in the same test run; a custom claim with no check is an open obligation.

**Review.**

11. Every phase ends with an adversarial review by an agent that did not write it, on the most capable model. Reviewers probe and report; fixers fix, each fix with a test that failed first and a mutation.
12. Jev runs only on changes to a published package's API, with the README and skill files the change updates, by file (`--include`, a raised `--max-hunks`).
13. A new source file is born under 20,000 characters; a file a phase rewrites is split in that phase.
14. Tests can fail: each behaviour has a mutation in a `*.mutations.ts` spec, run in one `pnpm mutate` call per spec.

**Working in the shared tree.**

15. Agents work on disjoint files, and each brief says what the others are editing. No worktrees and no branches without the maintainer's word.
16. The coordinator alone commits the lockfile, `packages/plus`'s generated entries and the tsconfig paths; a bout that adds an export says so.
17. A package that gains a run-time dependency on another lists the projects that need the project reference; the coordinator adds them. One heavy command at a time while memory is short. Agents push and report; the coordinator reads CI.
18. Agents post nothing on `foldkit/foldkit`; requests are drafted in `docs/upstream-foldkit-ssr.md`, never link our repository, and say an AI drafted them on the maintainer's behalf.

**Types and developer experience.**

19. A public API a bout shapes ships with a `*.test-d.ts`: positive cases written as a user writes them, with no annotation or generic argument, asserting the inferred type; one `@ts-expect-error` negative case per constraint, each probed alone, placed on the line where the mistake is, so the error lands there; and a type mutation (widen the constraint, see a negative case go red). No `string` where a typed key works (a Message tag, a Surface name, an Entity field, an operation), no `Schema.Top` where a struct is read, no cast in a test or example, no tag compared through a value typed `{ _tag: string }`.
20. Every refusal or thrown definition-time error a bout adds names the thing (the operation, Message, path or store), the reason, and the fix, and a test asserts that text. "Invalid" with no subject is a defect.
21. Compile cost is measured, not hoped: the instantiation count of `tsc -b <project> --force --extendedDiagnostics` for `examples/todo-app`, `examples/reference` and `examples/foldkit/domains-plus` is recorded in the ledger with its command and commit, and a phase may raise none of them by more than 10% without the maintainer's word. Time is reported beside it, since a short native check varies by tens of milliseconds while the count does not.

## Phase 0: clear the ground (done)

Delivered the split, the ledger with every budget and its notes (the untraced 1.4 kB of the domains-plus Worker traced to plan reuse and `keptOver`), the guides on the site, `publishedBuild.test.ts` rows for `foldkit-agent` and `foldkit-mixins-form`, the surviving mutations closed, and the CI retry. Open: `npx jev-pref sync` with its reconciliation, a verified `pnpm check:changed --dry`, and the remote branch `ui-polish-ci` (deleted only on the maintainer's word); and the CI retry has not been seen to run, so the flake rule stands: no phase's verdict rests on a run that showed `VITEST_BROWSER_CONNECTION_CLOSED`. One Haiku bout, whenever the tree is quiet.

## Phase 1: one expression language and one checker (done)

Delivered as "Where things stand" lists, following the kernel note's eleven steps; the overlap table and step list are in the kernel note. Reviewed adversarially with Phase 5 ([review](./metakit-phase1-5-REVIEW.md)), every finding resolved. Differently from its text: the lean judge; the byte targets not met and accepted; the ways of writing in `ops/ways.ts` without `invertible`; `Transition.commutes` grew conditions (`steady`, `reads-no-set-field`) the review required (`66ac7395d`, `4761c746b`).

**Open, and where it goes.**

1. *Entity's law kinds onto metakit's set.* Not done; Phase 4 item A8 does it, with the typed operation it needs.
2. *The standard library* (step 11), four families of the #601 note: division, remainder and rounding with a declared zero divisor, and conversions; time (`addMonths` with the clamp, `daysBetween`, `startOfMonth`, `today(zone)` as a supplied input); text (`concat`, `endsWith`, `upperAscii`); lists and sets of scalars. Each enters by the admission rule and only with a consumer named in its bout: a Message of a proof example, a rule of a fixture, or an operation an example's test needs. One bout per family, Sonnet.
3. *Soundness leftovers* (item 9): `Transition.when` is typed `boolean`, though a guard can be null and a null guard refuses; a rule on an optional key holds when the key is absent in decode, SQL, checker and prover alike (`a38eaa591` did this for `transitionOf` only); arithmetic over an unbounded `Schema.Finite` proved with the solver's floating-point theory under a time limit; `Rows.sum` over a decimal product with a safe-range check. The bout first checks each against the code and closes those already done, then fixes the rest, each with a test that failed first. One bout, most capable.

**Done when.** Each family's operations pass the parity suite on SQLite and PGlite; `Transition.when`'s null type has a `*.test-d.ts` case; each soundness item has a test that failed first; the page budgets read as before (a new operation is a new module no page imports unless it names it).

## Phase 2: one dependency graph (built in large part)

**Goal.** One structure answers "what can this change affect" for every consumer. Issues #581, #586, #587, #588, all open until the completion item's readings exist.

**Verdict on each of the five graphs.**

| Old graph | Planned to become | Verdict |
| --- | --- | --- |
| Surface's contract graph (`Module`, `Graph`) | The builder of the one graph | Built: `Graph.of` builds metakit's `DependencyGraph` from contracts and the machine (`2a4ca3c9d`), with Message-to-Message edges (`21bbb5355`) |
| Remote's write-to-query impact (`impact.ts`, `reaches.ts`) | Query and write nodes in the graph | Half built: `reaches.ts` builds on `metakit/graph` (`268666dba`); `impactOn` in `impact.ts` still decides from the query bodies itself, without the graph |
| `Projection.derive` and `SlotView.region` memos | Readers in the graph | Not built: neither memo asks the graph |
| Bundle drawing memo | Keyed by declared paths | Built: `pathEpoch` and an instance-scoped counter (`50076f855`, `f278d0772`) |
| Sync closure and replay diff | Ownership in the graph; perturbation only for undeclared Messages | Built in part: `mount.ts` runs `Closure.reads` only for a Message no declaration covers, and `WritesCheck.verify` checks Sync and Remote ownership (`283c75082`). Not built: the `try` in `readsOutside` that reads a throw as "nothing read" is still there, and the owned-fields helpers are still two (`packages/sync/src/make.ts`, `packages/surface/src/closure.ts`) |
| `Graph.analyze` (metakit) | A thin call over the one structure | Built (`graph.ts`) |

Of the consumers: `Surface.rootView`'s skip is installed by default (`c7f7613b7`); the counter in `Writes.of` is per instance (`1129d2b94`); Remote skips read planning when declared activation reads are unchanged (`3bf01ad1a`); a value derived from a Remote read is reached through the store's contract writers (`c7f7613b7`, tested in `packages/surface/test/writes.test.ts`); the page carries only `metakit/graph/match` (`40a0a1c13`). `SurfaceView.toRenderer` in `packages/mixins-surface` has no skip (#587). `coverOf` in `foldkit-ssr` does not ask the graph: `packages/ssr` imports nothing from metakit.

**Verdict on each "Done when" measure.**

| Measure | Verdict |
| --- | --- |
| On todo-app, a Message that writes one Surface's paths calls no other Surface's renderer, read against the ledger | Built, unmeasured: `examples/todo-app/test/machine.test.ts` counts each Surface's drawings through `writes.rootView`, but no reading from `scripts/render-baseline.mjs` is in the ledger |
| `askedOf` runs zero times for a Message that does not write the store | Built, unmeasured: `packages/remote/test/readEntryReuse.test.ts` covers plan reuse; no count is recorded |
| Building the graph for `examples/reference` takes under 5 ms | Not measured, and reference has no machine, so its graph holds contracts only |
| No page budget grows for an application without a machine | Unmeasured as a phase reading; the budgets pass |
| The review lists every function that walks a declaration for its paths, and there is one | Not done |

**Completion item (one gate, then three bouts).** The gate is a Sonnet bout that takes the four readings above into the ledger with the command and commit of each, and lists the walkers. Then: (1) `Projection.derive`, `SlotView.region` and `SurfaceView.toRenderer` read the graph; (2) Sync's owned-fields helpers become one, read from the graph, and the `try` in `readsOutside` goes for documents whose Messages are all declared; `impactOn` reads the graph's query nodes; `coverOf` asks the graph through a server-only module; (3) typed ids: `DependencyGraph` is generic in its writer and reader ids, `Graph.of` infers them from the application's Message tags and Surface names, so `affectedBy('Typo')` does not compile. `deadReaders` gets its consumer in Phase 6 item 7 or is deleted at Phase 6's gate.

**Done when.** The four readings are in the ledger and meet their bars (or the coordinator records why the bar moved); every row of the verdict table reads "Built"; a `*.test-d.ts` holds the typed ids with a negative case for an unknown tag and an unknown Surface; each new skip has a reference run (full path compared) and a mutation that drops the unknown edge; the coordinator closes #581, #586, #587 and #588 on those readings.

**Review.** Adversarial: the reviewer tries to make each consumer skip something that changed.

## Phase 3: `update` as declared transitions (done on todo-app)

**Goal.** An application states its Messages as one machine; every package takes it as input; hand-written arms keep working beside it.

**The gate, as measured.** Today's readings, from the ledger:

| Premise | Bar | Reading |
| --- | --- | --- |
| Most Messages can be declared | todo-app 21 of 25; domains-plus three in four | todo-app 23 of 25 (24 of 26 at `31b10117c`), `Transition.opaque` not counted; domains-plus not counted (0 of 39 declared; an earlier note is unverified) |
| Their Commands can be declared | Half of the Messages that send one | todo-app: all |
| The declared form is not much longer | Median at most 1.5 times | Not measured per arm; `app.ts` and `surface.ts` together 44 lines shorter |
| It does not slow the editor | Within 15% of the ledger | 3.034 s, recorded without a command or commit: unverified |
| It does not cost a page much | Under 5,000 B brotli (3,500 after the two fixes) | Unmeasured: 165,083 before opt-in, 173,086 at `31b10117c`, not split by cause |
| It buys something | A declared Message draws only the Surfaces it writes | True on todo-app |

The coordinator has not read the gate as a whole, and three premises are unmeasured. The first remaining bout measures them before the per-package adoption below is spent: the byte cost by building todo-app's page twice from one tree, once with `Declared.of` and once with the hand-written `update` its replay test keeps (`09a74a89b`); the type cost with the command rule 21 names; the arm lengths by counting; and the domains-plus gap list by Message, each with what it lacks. *If a premise fails,* the phase takes its smaller shape: declared transitions stay an opt-in for the Messages that fit, hand-written `update` stays what the guides teach first, and item 6 is limited to Form, Agent and Sync, where a declared Message already pays.

**Remaining scope.**

1. *Kernel additions.* A child machine per element of a keyed collection (`Machine.lift` along a key field, typed by that field), and a write that moves an element. Several Commands from one transition are done (emitted records are a list).
2. *domains-plus on a composed machine*, from the counted gap list, with its README listing each hand-written Message and why.
3. *Each package takes the machine.* Bundle: a Bundle exposes its machine and a placement is `Machine.lift` at its path. Remote: its reducer steps are writers of the store path; `Data.can` asks the machine. Form: a submit is a transition and a control's disabled state is its guard. Agent: `machineTools` takes the application's composed machine. Mixins: three widget Bundles in `packages/mixins-ui` gain machines (a disclosure, tabs, a dialog), the rest confined. SSR is Phase 6.

**Done when.** The gate's six readings are in the ledger with commands; todo-app and domains-plus run on a composed machine with a seeded replay through the hand-written and derived `update` comparing Models (`toBe` on no-ops); their budgets are within the ledger plus the measured cost of the code every page with a machine runs; view and patch time per Message at or below the ledger; `Declared.of`'s `*.test-d.ts` covers inference of the Message union, the Command table's exhaustiveness and the required `supply` and `fallback`, each negative case alone; rule 21's counts hold.

**Review.** Adversarial review of the derived `update` (Command order, no-ops, refusals), keyed children and the confinement rule.

**Size.** 8 bouts: the gate's readings (most capable), kernel additions (most capable), domains-plus (two, Sonnet), adoption (three, Sonnet), the review.

## Phase 4: checked custom algebras, and maintained values

**Goal.** An application can teach every reader a new operation, a fold over it and a way of writing with it, with properties the readers act on, and a false claim fails a test (part A). One mechanism keeps computed values up to date from row deltas, on the page and on the server (part B; #580, and the server side of the #601 note's aggregates). They are one phase because the update-or-rescan classifier is the main reader of fold properties: building it over the closed set and opening it later would build it twice.

**Depends on.** Phase 1 (done) and Phase 2's structure (built). Part A is in `packages/metakit`, `packages/entity`'s operator code and `examples/metakit`; part B in `packages/remote` and `packages/remote-drizzle`. The two run side by side; B10 waits for A6.

### Part A: checked custom algebras

The design is in "Custom algebras, checked". The items:

- **A1. Design note** (`docs/design/metakit-checked-operations-DESIGN.md`): the names, the typing of each property against the signature, how a fold and a combine are written, the wire description, and what entity's `Expr.operator` keeps; a prototype of the typed declaration in a temporary `*.test-d.ts` with its instantiation count, as Bout 1 of Phase 1 did.
- **A2. A typed operation.** A new subpath (proposed `metakit/operation`) declares an operation with argument and result Schemas and claims typed by the signature; the declaration is the constructor, inferring its environment from its arguments. `ForeignOp` gains the Schemas and its value kind is read from the result Schema. `Node.foreign` and the untyped `call` of a custom operation leave the public API, so there is one way to declare one (breaking). An id under a core prefix is a type error as well as a definition-time refusal.
- **A3. Implementations and SQL, typed.** An implementation is declared against the operation, typed by its Schemas' encoded sides; a reader's table is built from implementations, not from hand-written `id@version` strings. A lowering per dialect is typed by arity; a fold's operation may declare an aggregate per dialect. A missing lowering refuses by name, saying which operation and dialect and that a lowering is declared with the operation.
- **A4. Generated checks and their obligations.** The test helper in `metakit/conformance` samples from the Schemas, checks each claim against an implementation, and runs the SQL lowerings through the parity runner; collecting the custom operations reachable from a machine or language registers their obligations. Cost: the awkward values plus seeded samples, at most a few thousand cases per property, so one operation checks in under a second in memory; SQL batched per property.
- **A5. Readers act on custom claims:** partial evaluation and the page judge (identity, absorbing, idempotent); the checker's bounds (monotone, given implementations); claims over a narrower domain only where the checker shows the arguments lie in it; `unlessRefused` as for `num.add`.
- **A6. A fold over a checked operation.** `Rows` gains a fold kind naming an operation, refused by type and at definition unless the operation claims commutative, associative and an identity; `foldProperties` derives its row. Evaluation, the page judge, SQL (where an aggregate is declared), the checker (Unknown unless monotone) and the classifier of B10 read it. A test holds that the classifier's answer for a fold over `num.add` equals its answer for `sum`.
- **A7. `combine`.** `Transition.combine(path, operation, value)` and a `combine` row in `writeProperties`, derived from the operation's claims. Read by `Transition.commutes`, `Transition.idempotent`, `metakit/pairs`, Sync convergence and `replayOver`; a pending combine whose implementation the page lacks replays as a `set`. A test holds `combine` of `num.add` to `add`'s verdicts. `replay.ts` imports the `combine` row alone (rule 3).
- **A8. Entity's operators on it.** `Expr.operator` builds on the typed operation, keeping Entity-field arguments and its collation rule; `Law` is deleted for the closed set (`Distributes` and `PreservesCollation` dropped, as Phase 1 decided); `Operators.implement`, the memory and Drizzle tables and `Conformance.laws` become metakit's, entity's names deleted (breaking); `Evidence.Proven` no longer counts as a check.
- **A9. The first consumer.** `examples/metakit` gains a permissions domain: `flags.or` (commutative, associative, idempotent, identity 0, no inverse), `flags.xor` (commutative, associative, identity 0, its own inverse), `flags.andNot` (neither), and a clamp claiming monotone; used in a machine through `combine`, in a rule the checker bounds, in a maintained value (part B) and in SQL on both databases (Postgres has a `bit_or` aggregate and SQLite none, which shows a dialect refusing by name).

**Typing, as tests.** A `*.test-d.ts` per item, by rule 19. Negative cases, each alone: an identity of the wrong type; commutative on two arguments of different types; an inverse of the wrong signature; a monotone list of the wrong length; an implementation of the wrong arity or argument type; a call with an argument of the wrong type, whose error lands on that argument; a fold over an operation that does not claim commutative; `combine` with an operation whose second argument is not the path's type; an id under `num.`.

### Part B: maintained values

- **B1. Row deltas** in `foldkit-remote` (#580's first work package): each change as the row before and after as the page sees it, with its source (server, optimistic, restored); a live echo of a pending write is not counted twice.
- **B2. The mechanism**, generalising `packages/remote/src/aggregate.ts` into `foldkit-remote/maintained`: a definition, a source and a delta rule, typed by the query's row Schema (an order key names a field of the row, not a string). A maintained value keeps its identity while nothing it reads changed, so a Surface over one row is not drawn again when another changes (the finer half of #588).
- **B3. A pending write on a large list.** About 400 ms on 100,000 rows today, because `insertsPlaced` (`layers.ts`) calls `placeIn` (`placement.ts`), which scans and copies each segment for every inserted row. Placement uses the order index.
- **B4. Coverage.** Whether a held list contains every candidate of another query is an implication between two predicates, decided by the synchronous checker when the queries are defined, never by the solver on a page; forms it does not decide ask the server.
- **B5. Offline as-of reads** (#580's fourth package): a retained result is "complete as of revision R", apart from "current", and never restores a server cursor.
- **B6. Indexes**, each added where the benchmark at 25, 100, 400, 5,000 and 100,000 rows shows it pays, absent from a page that maintains nothing.
- **B7. On the server**, with Phase 5 item 3. A derived member defined by a row aggregate can be stored: the Drizzle writer updates the parent's total in the transaction that writes the child. On Postgres it first locks the parent row (`select … for update`), in id order, and declares `parentRowLock: true`; that is what makes an aggregate data rule enforceable there, which is refused today. A Durable Object keeps the same totals in its storage. D1 stays refused for an aggregate data rule, since its writer judges no data rule in its statement; judging one there waits for a fixture that needs it.
- **B8. Change replay** for the Durable Object journal, which is ordered. Postgres and D1 are deferred: no ordered change log exists there.
- **B9. Dependent queries** (#606): a query whose parameters come from another read is asked once `queryReadiness` says they are bound, its first caller outside the demo.
- **B10. Update or rescan, chosen from properties.** `classify` (`packages/remote/src/maintained/classify.ts`) reads a definition and `foldProperties` and answers a tagged `Classification`: `Update`, or `Rescan` with a reason from a closed union, matched exhaustively, never a string. A fold applies an insert from the row when it is commutative and associative, a delete when it is also invertible; otherwise a delete of the extreme asks B6's order index, or rescans. A filtered list judges a changed row alone when its test reads only the element and values that did not change; a sorted list also needs an order key over the element ending in a unique tie-break. A join reaches the rows pointing at a changed row through a reverse index; a second hop or a second `Rows` rescans. A derived projection recomputes when the graph says a path it reads was written. A fold with an identity starts from it; `min` and `max` start null. A rescan is never silent: in development each maintained value logs its class once, and a report test lists every rescanning value of the proof examples with its reason. Custom folds from A6 are classified by the same rules.

**Hazards and tests.**

- *A custom claim is false:* A4's checks; a mutation per property kind that declares it where it does not hold (`flags.or` invertible, `flags.xor` idempotent, `flags.andNot` commutative) must fail its check, and removing an application's check call must turn the obligations test red.
- *A claim holds in memory and not in SQL:* the parity runner over the same samples.
- *A changed declaration under one version:* a test that a server and a page with different descriptions of one `id@version` refuse, naming it.
- *A maintained result drifts from the truth:* seeded differential tests compare every maintained value with a full recomputation after each delta, over overlapping optimistic layers, a live echo while pending, a failed write, reconnect and restore; run in update mode it must equal recomputation. Mutations: declaring `min` invertible, or calling a body row-local when it reads a parameter that changes.
- *A partial list presented as complete:* negative cases for each coverage form.
- *The lock deadlocks:* two transfers in opposite directions on the CI Postgres.
- *Type cost of the typed claims:* rule 21, plus `examples/metakit`'s own count recorded before A2.

**Done when (measured).** Part A: every claim of `examples/metakit`'s operations has a passing generated check and its mutation is killed; parity on SQLite and PGlite; two combines of `flags.or` commute and are idempotent, two of `flags.andNot` are Unknown with a walk; the obligations test fails when a check is removed; the typing negative cases above exist and a type mutation turns one red; a page that names no custom operation is byte-for-byte unchanged and `metakit/operation`'s checks are absent from every page (`publishedBuild.test.ts`); entity's `Law` is gone and its operator tests pass on metakit's checks; every refusal A2 to A7 add names the operation, the reason and the fix. Part B: one changed row in a maintained list of 100,000 evaluates that row only (evaluations counted); a pending write on that list is placed in under 16 ms on the ledger's machine, against about 400 ms; the data grid's redraw readings and the 25-row pages' budgets are at or below the ledger; two concurrent overdrawing transfers on Postgres leave one refused; the report lists every rescanning value with its reason.

**Review.** Adversarial: the reviewer looks for an operation whose claims pass the check and are false (a sampling gap), a reader that acts on a claim with no check, and delta sequences that double-count or lose a row.

**Size.** 24 bouts. Part A, 10: the note, A2 and A3 (two), A4, A5, A6, A7 (two), A8, A9. Most capable: the note, A2, A4, A7. Sonnet: A3, A5, A6, A8, A9. Part B, 14: the mechanism's API, coverage, the Postgres lock and the review on the most capable model; each kind, benchmarks, B9 and B10 on Sonnet.

## Phase 5: store capabilities and orderings (done)

Delivered as "Where things stand" lists, reviewed twice ([review](./metakit-phase1-5-REVIEW.md), [deep review 2](./metakit-deep-review-2-REVIEW.md)), every finding resolved but L3, a doc claim on `EntityWriter.checksTargets` left while another session edits `packages/remote-server/src/index.ts`. Differently from its text: item 10's revision rule and the failed `set` dropped without a read; `Transition.idempotent` added for item 9's redelivery, where a copy delivered later still relies on the journal's ids unless the Message commutes with every durable Message (`ba5902969`); item 3 moved to Phase 4 B7. Open: the store-declaration fixes in the tree (D1 declared two ways; Sync and durable declarations read by nothing), and L3. Phase 4 B7 reads the store declarations only after the coordinator confirms those fixes.

## Phase 6: resume without the runtime

**Goal.** A server-drawn page answers a declared press before Foldkit's runtime is loaded, ships only the data its changeable parts read, keeps what a person did before any script ran, and hands over to the runtime without rebuilding an element. Issues #436, #472, #607, #608; the maintainer asked for this in full on #432.

**The baseline** (`metakit-phase-6-DESIGN.md`, domains-plus, CPU slowed four times): 212,869 B of compressed script before the first press; 1,474 ms of blocking; takeover at 1,333 ms; the first press reaches the next paint in 104 ms and shows in the cart at 280 ms (range 123 ms); the envelope 10,741 B, 857 B compressed.

**What must be true first.** A binder spike (most capable model): item 1's probes 2 and 3 as throwaway code in `examples/foldkit/domains-plus` behind an environment flag, committed to no package.

| Premise | Measurement | Holds if |
| --- | --- | --- |
| The binder fits | A script that decodes one Message, runs its transition and writes one anchor, by `clientBudget` (`scripts/bundle-budget.mjs`) | Under 20 kB brotli with the envelope reader |
| Foldkit adopts a changed page | Press "Add to cart" in the spike, then hydrate; `rebuiltElements` in `scripts/phase6-baseline.mjs` | Zero rebuilt elements; the cart keeps the binder's count |
| The binder has work | domains-plus's on-screen presses that are declared, send no Command and change only anchors | At least the cart and filter presses, counted after Phase 3 |

The thresholds are proposals for the maintainer. *If a premise fails,* resume is limited to the reduced envelope: items 2, 6 and 7 are built, the binder, bindings and hand-over are not, and "Done when" keeps the envelope, blocking and rebuilt-element readings.

**Scope.**

1. *Design note and three probes.* Does a region Foldkit holds as trusted HTML keep changes another script makes inside it? Does `Runtime.hydrate` adopt every element when it starts from a Model the binder changed? How small is the smallest script that evaluates a transition?
2. *The live set.* On the server, `foldkit-ssr` computes from the graph the Messages the page can send, the paths they write, and the paths the Messages and changeable values read; only that set goes in the envelope. A new kind of cover says "read only by parts that cannot change". In development the full Model is resumed too and a read of an omitted path is reported.
3. *Bindings and anchors.* A value a Surface shows can be declared as an expression over the Model; the server marks the element with the binding's id. Binding ids are typed by the declaration's keys, never free strings.
4. *The binder* (`foldkit-ssr/binder`), grown from today's loader and its delegated listener. For a press it reads which Message to send, decodes it through its Schema, loads that Message's transition, applies it to the resumed state, and writes the anchors the graph says can change. It answers only declared Messages with no Command whose affected values are all anchors; anything else wakes the runtime.
5. *The hand-over.* The runtime loads when idle or at the first Message the binder cannot answer, starts from the binder's state, hydrates and takes the listeners; a press during the load is held and sent once.
6. *Input before boot.* `KeepTyped` and the kept control states extend to the scroll position, an open `<details>`, and every control the binder touched.
7. *Static parts.* A region that sends no Message and reads nothing in the live set is drawn into the HTML, its data left out, and the client does not draw it; the graph's `deadReaders` finds the candidates.

**What our packages can do today, what needs upstream, and the fallback.**

| Need | In our packages today | Needs upstream | Fallback we build |
| --- | --- | --- | --- |
| Leave data out of the envelope | Yes, for regions under `SSR.static` | No | n/a |
| Skip drawing a static region | Yes: `SSR.static` | Cheaper adoption (request A) | Foldkit parses and compares the region |
| Answer a press before the runtime | Yes: our own script | No | n/a |
| Runtime hydrates after the binder | Believed yes (probe 2) | Hydrate from a Model (proposal 3) | The `init` substitution `SSR.hydrate` uses now |
| Keep a typed field through hydration | Partly | Leave a control alone (proposal 6) | Today's save and restore |
| Update inside a region after hand-over without drawing it | No | A subtree Foldkit does not own (request B) | Foldkit draws the region after hand-over |
| No virtual tree at all, as #607 asks | No | A replaceable renderer (foldkit#1871, #1872) | Binder before hand-over, Foldkit with skips after |

Without any upstream change the plan delivers the reduced envelope, declared presses before the runtime, a hand-over, and (Phase 7) script by Message.

**The requests, as they would be sent** (for the maintainer; proposals 3 and 6 are drafted in `docs/upstream-foldkit-ssr.md`):

> *Request A, a question.* A server-rendered region passed as trusted HTML is parsed and compared at hydration. For a region the application declares unchanged since the server drew it, would you accept an opt-in that adopts the served element as it is? We measured hydration of such regions on a 746-element page and can share the numbers. The Model stays the single source of truth: the opt-in says only that this subtree was drawn from it already. (Drafted by an AI assistant on the maintainer's behalf.)

> *Request B, a comment on foldkit#1871.* One more use for running a view with its own dispatch frame: a subtree that a small script updated before the runtime loaded, from the same Model and through the same Messages. After hydration that subtree needs to be either adopted without a redraw or left to an owner the application names. Is either in scope for this issue? (Drafted by an AI assistant on the maintainer's behalf.)

**Depends on.** Phase 2's completion item (`coverOf` on the graph) and Phase 3's domains-plus machine.

**Replaces or deletes.** `foldkit-ssr/loader` becomes the binder's smallest case (breaking). The resume plan's hand-picked `state` list is computed.

**Hazards and tests.** *The client draws differently:* every served element still in the document after hand-over (`rebuiltElements`). *A left-out value changes after all:* item 2's development check; a server test that a region with a handler or a live-set read is refused as static. *The binder and the runtime disagree:* every declared Message of the proof example through both, comparing Models and anchor text. *A stale value after hand-over:* an end-to-end press, load, press. *A forged Message:* the binder decodes through the Schema and writes text, never HTML; a security review. *The first undeclared press pays for the runtime:* measured beside script at load (#472). *Navigation to a page never served:* an end-to-end test.

**Done when (measured, same script, two runs).** On domains-plus: script before the first press under 20 kB compressed; blocking at load under 200 ms; a declared press at rest no slower than 280 ms plus 123 ms; zero rebuilt elements; the envelope no larger than today's; the first undeclared press reported; a binding declared with an unknown key fails to compile; every refusal the live set and binder add (`BindingInStaticRegion` and the new ones) names the region, the path and the fix. A miss changes the default, not the feature.

**Review.** Adversarial review of hand-over and the live set's soundness; a security review of the binder.

**Size.** 15 bouts, the first the gate. Most capable: the gate, the note, the live set, the binder's contract, both reviews. Sonnet: anchors, input keeping, end-to-end tests, measurements.

## Phase 7: script cut along Messages

**Goal.** The page loads the script a press needs when it needs it.

**What must be true first.** Cutting by Message moves only the application's own `update` code (16.6 kB of 217 kB on domains-plus, against about 91 kB for Foldkit and Effect), so it pays only once Phase 6 took the runtime out of the start path. One Sonnet bout measures with `measure` in `scripts/bundle-report.mjs` after Phase 6:

| Premise | Measurement | Holds if |
| --- | --- | --- |
| The runtime is out of the start path | Script before the first press | Phase 6's gate held and its binder shipped |
| There is enough to cut | Transitions and Command code against the script before the first press | At least a quarter |

*If a premise fails,* Phase 7 cuts by Surface and child machine only (which `Bundle.lazy` already does for a part), keeps item 4's failure handling, and builds no per-Message chunks.

**Scope.**

1. *Where the cuts are.* Per Surface (`Bundle.lazy`); per child machine (a child of `Machine.compose` given as a dynamic import); per Message (a transition and the code that writes its anchors, and in a second chunk the Effects of its Commands).
2. *How the build produces it.* No source transform: declarations name their own dynamic imports, the bundler splits on them, and a plugin in `foldkit-ssr/vite` writes a manifest (Message tag to chunk) into the server's plan. The manifest's type is keyed by the application's Message tags, so a tag with no home or two homes does not compile.
3. *What loads when.* At start, the binder and the manifest; when idle, chunks for Messages bound to elements on screen; on intent, the chunk itself; on the press, the transition runs, waiting up to 3 seconds for its chunk.
4. *A chunk that fails on first press.* A held form is released to the browser's own submission; any other press is retried once, then the control is marked failed and a declared fallback shown; nothing is sent twice.
5. *After hand-over.* The runtime's `update` takes arms as their chunks arrive; a Message for an arm not yet loaded waits, as `Bundle.lazy` does.

**Replaces or deletes.** `runtimeChunk` (`packages/ssr/src/runtimeChunk.ts`) is absorbed by the manifest plugin (breaking for domains-plus's Vite config).

**Hazards and tests.** A press before its chunk (end-to-end, exactly once); a failed chunk (the request failed, as `loader.e2e.ts` does); more total script (total reported beside start); a Message in two chunks (type and manifest test).

**Done when (measured).** On domains-plus, the "Add to cart" chunk is under 3 kB compressed and loads on intent; total script within 3% of 212,869 B; the failure tests pass; the manifest's negative type cases exist.

**Review.** Adversarial review of ordering between a press, a chunk and the hand-over.

**Size.** 10 bouts, the first the gate. Most capable: the manifest's contract and the review. Sonnet: the gate, the plugin, tests.

## Phase 8: examples and documents on the new base

**Goal.** What a reader runs and reads shows the new base, and nothing describes the old one.

**Scope.**

1. *The running proof.* todo-app first, domains-plus measured; domains-plus gains its machine in Phase 3, bindings, the binder and chunks in Phases 6 and 7.
2. *The rest, in order:* `examples/reference`, `chirp`, `registry`, `cms`, `pages`, `writes`, `writes-domain`, then the other examples with a server or Remote data. Each move declares the Messages, turns on the write verifier in its tests, and records its budget.
3. *Guides*, one page per job by `docs/agents/writing-docs.md`: declare your `update`; see what a Message can affect; keep a list up to date; define an operation and check its laws; make a page answer before the framework loads; cut script by Message; hold a rule to a store; write your own language, store or protocol on metakit (Phase 9). An upgrade guide for the breaking changes of Phases 1 to 4, each with the compiler error a user sees and a before and after.
4. *The skill.* `skills/foldkit-plus/SKILL.md` and the references for entity, metakit, surface, remote and ssr, each snippet compiled.
5. *The site and a post*, the post opening with the problem a reader has, with the measured results and their source.

**Depends on.** Each phase lands with its own README section, skill reference and changelog entry; this phase is the examples beyond the proof and the documents that span phases.

**Done when.** No example calls an API this plan deleted; every guide passed a cold reader, whose report and the fixes are linked from the bout; every snippet compiles (`node scripts/docs-check.mjs` or the temporary `*.test-d.ts` recipe); the site lists the guides.

**Size.** 10 bouts, Sonnet, with Sonnet cold readers; the post reviewed by the most capable model.

## Phase 9: building on the base

**Goal.** An application writes its own typed language, stores and protocols on metakit, and every reader, checker and report treats them as it treats ours. Each capability below has a consumer in the repository and a test.

1. **A domain language.** `Language.make` groups an application's operations (part A), folds and ways, and derives each reader's input from them: typed implementation tables (exhaustive by type for a server, partial for a page, whose missing entries refuse by name), the SQL tables per dialect, the wire description a server and a page compare, the obligations of every claim, and the operation list `foldkit-agent` shows an agent. It is not a wrapper: each derived table is something a reader takes today as a hand-assembled record. The operations stay the constructors, so an application's namespace (`Flags.or`, `Flags.clamp`) is ordinary imports and infers as metakit's own do. Consumers: `examples/metakit`'s permissions domain and entity's own operators. Test: a `*.test-d.ts` where an expression mixing core and custom operations infers its environment and value type and flows into `Transition.set`, with negative cases; a page table missing an operation refuses at evaluation, naming it.
2. **Custom maintained values.** A fold over a checked operation is a maintained-value kind (A6, B10) with no further API. Consumer: `examples/metakit`'s total of permission flags over rows, which rescans on a delete for `flags.or` and updates from the row for `flags.xor`; the differential against recomputation is its test.
3. **Custom ways of writing.** `combine` (A7). Consumer: the permissions machine replicated through Sync, with its convergence report and a two-replica walk.
4. **Custom stores, checked.** The capability vocabulary stays closed (decision 11's rule applied to stores): a new kind of guarantee needs a rule every requirement reads. Stores are open: a store conformance kit in a test entry of `metakit/store` runs, through hooks the adapter gives (two connections, a parent and its children), the probes each declared capability implies, and fails a declaration the store does not keep. Consumers: the memory writer, the Drizzle writer over SQLite, Postgres (CI) and local D1, the Durable Object journal, the IndexedDB replica. Test: a fake store declaring `serializable` while interleaving writers fails the kit with the capability and the interleaving named.
5. **Custom protocol obligations.** `Temporal.obligation` and `walkAsync` exist; this item adds a guide and a typed form in which an application's obligation names are a literal union, so a discharge naming an unknown obligation does not compile. Consumer: todo-app's undo, whose expiry and restore race declares an obligation walked over its real `update`. Test: the report fails while it is open; removing the guard makes the walk report `Broken` with a seed.

**Depends on.** Phase 4 part A; items 2 and 3 on part B's B10 and A7. Runs beside Phases 6 and 7 (disjoint: metakit, stores and examples against `packages/ssr`).

**Done when.** Each item's test passes and its mutation is killed; the obligations test lists the new obligations; rule 19 to 21 hold; each capability has a guide (Phase 8 item 3).

**Review.** Adversarial: the reviewer tries to make a reader trust a custom claim, store or obligation nothing checked.

**Size.** 7 bouts: the language (most capable), the store kit (most capable), stores adopting it (Sonnet), the protocol kit (Sonnet), the consumers (two, Sonnet), the review.

## The developer-experience audit

Rules 19 to 21 set the bar each phase's "Done when" now names. One audit bout (most capable model, with a Sonnet helper for the measurements) runs once Phase 2's completion item and Phase 3's gate readings land, and again at the end of each later phase. It reads, without having written them:

- *Inference.* Every public API the plan shaped (`Expr`, `Transition`, `Machine`, `Declared.of`, `Graph.of`, `Rows`, the typed operation): a user-shaped call with no annotation, its inferred type asserted in a `*.test-d.ts`; where a call needs an annotation or a generic argument, that is a finding. It lists every `string` where a typed key works and every cast in tests and examples.
- *Where errors land and how they read.* For each negative case, the error's line and its first sentence: it must land on the mistake and name what is wrong in the user's terms. Long or misplaced errors are findings, each fixed in the API's types.
- *Compile cost.* Rule 21's counts for the three projects, with the command and commit in the ledger; domains-plus is read for the first time here.
- *Messages a user reads.* Every refusal and definition-time error added since the last audit, checked for the thing, the reason and the fix, each with a test of its text.

**Done when.** The ledger holds the three counts with commands; every finding is fixed with a test or recorded with the reason it stays.

## Where each open item goes

| Open item | Where |
| --- | --- |
| `jev-pref sync`, `check:changed` unverified, branch `ui-polish-ci`, the CI retry never seen | 0 |
| Entity's `Law` kinds not on metakit's set; foreign properties unread and unchecked | 4, A8 and A2 to A5 |
| Untyped call of a custom operation; implementations keyed by strings | 4, A2 and A3 |
| Standard library beyond `num.mulScaled` | 1, open item 2 |
| `Transition.when` typed boolean; optional keys; `Schema.Finite` arithmetic; decimal sums | 1, open item 3 |
| Phase 2 readings, memos, owned-fields helpers, `impactOn`, `coverOf`, typed graph ids | 2, completion item |
| #581, #586, #587, #588 | 2, closed on the completion readings |
| Phase 3 gate: bytes, type cost, arm length, domains-plus gap list unmeasured | 3, the gate's readings |
| Keyed child machines; moving an element | 3, item 1 |
| domains-plus has no machine | 3, item 2 |
| Bundle, Remote, Form, Agent and widget machines | 3, item 3 |
| Postgres takes no parent-row lock; aggregate data rules refused on Postgres | 4, B7 |
| A pending write on a 100,000-row list costs about 400 ms | 4, B3 |
| #580: deltas, coverage, offline as-of reads, indexes | 4, B1 to B6 |
| #580: change replay for Postgres and D1 | Deferred: no ordered change log there |
| #606: dependent queries | 4, B9 |
| Store declarations of D1, Sync and durable (in the tree) | 5, confirmed by the coordinator before 4 B7 |
| Review finding L3 (`checksTargets` doc claim) | 5, when the other session leaves `remote-server/src/index.ts` |
| `deadReaders` without a caller | 6, item 7 |
| No inference, compile-cost or message gate | Rules 19 to 21; the developer-experience audit |
| #579: content fingerprints of definitions | Not in this plan: no phase needs one; Phase 4's description compare uses the description itself |
| #609: machines on a cluster | Not in this plan: no design exists |

## Order, and what can run side by side

Next, three lines run side by side, on disjoint packages:

- **Phase 4 part A** in `packages/metakit` (new files beside `node.ts`, `properties.ts`, `ops/ways.ts`), later `packages/entity`'s operator files and `examples/metakit`.
- **Phase 4 part B** in `packages/remote`, later `packages/remote-drizzle` (B7) and `packages/durable` (the Durable Object totals).
- **Phase 2's completion item and Phase 3's gate readings and remaining scope** in `packages/surface`, `packages/mixins-surface`, `packages/sync`, `packages/ssr`, `packages/bundle`, `packages/mixins-ui` and `examples/foldkit/domains-plus`.

Shared packages are never touched by two bouts at once: `packages/remote` (part B, Phase 2's `impactOn`, Phase 3's `Data.can`), `packages/sync` (Phase 2's owned fields, part A7's convergence, Phase 9's consumer), `packages/metakit/src/ops/ways.ts` and `transitionCommutes.ts` (A7 only). Phase 1's open items run in `packages/metakit/src/ops` and `src/domain` beside everything, scheduled apart from A2 while it edits `node.ts`.

Phase 3 must not wait for Phase 4: Phase 6's gate counts domains-plus's presses on its machine, so a Phase 3 that slips moves Phases 6 and 7 with it. Phase 6 waits for Phase 2's `coverOf` and Phase 3's domains-plus machine; Phase 7 for Phase 6 (both rebuild the loader in `packages/ssr`). Phase 9 starts when Phase 4 part A lands and runs beside Phases 6 and 7. The developer-experience audit runs after Phase 2's completion and Phase 3's readings, then at each phase's end. Phase 8's proof example moves with each phase; its other examples run in parallel at the end. Within a phase, a design note precedes the bouts that implement it, and the review follows the last of them.

## The first bouts of Phase 4, as briefed

Three bouts start together on disjoint files. Each brief carries the git rules of `CLAUDE.md` ("Git in the shared tree"): one tree and one branch, explicit-path commits in one command, the never list, push and report, no CI wait. Each says what the other two are editing.

### Bout 4.1: the checked-operations design note

- **Model.** The most capable: it decides a published API's shape and its types.
- **Commits.** Only `docs/design/metakit-checked-operations-DESIGN.md`. Its prototype is a temporary `*.test-d.ts` in `examples/kitchen-sink`, deleted before the commit.
- **Reads.** This plan's "Custom algebras, checked" and Phase 4 part A; the kernel note's "How are a custom operator and its implementations carried?" and "Which properties…"; in `packages/metakit/src`: `node.ts` (`ForeignOp`, `foreign`), `ops/core.ts` (`call`), `ops/eval.ts` (`applyForeign`), `sqlRender.ts` (`foreignSql`), `properties.ts`, `ops/ways.ts`, `ops/laws.ts`, `propertyChecks.ts`, `foldChecks.ts`, `writeChecks.ts`, `transitionCommutes.ts`, `abstract/rowOf.ts`, `temporal.ts` (the registry); in `packages/entity/src`: `law.ts`, `expr/operator.ts`, `expr/primitive.ts`, `expr/operatorLaws.ts`, `operators.ts`, `conformance/operator.ts`; `packages/remote/src/replay.ts`; `docs/agents/traps-types.md`.
- **Must decide.** The subpath and names; the typed declaration and how each property is typed by the signature (the negative cases of Phase 4's "Typing, as tests" each compiled); how an implementation and a per-dialect lowering are declared and tabled; the sampling (which awkward values, how a Schema's range ends are read, the seeded generator and whether Effect 4's Schema gives one); how obligations are collected from a machine and a language and named; the description a server and page compare; the `Rows` fold kind and `combine`, with their rows in `foldProperties` and `writeProperties`; what entity's `Expr.operator`, `Operators` and `Conformance.laws` become, and every break with its compiler error. The prototype's instantiation count beside today's for one call.
- **Form.** By `docs/agents/writing-docs.md`, under 500 lines: the decision first, a section per question ending in what is deleted and what breaks, then rejected alternatives. A cold reader (Sonnet, given only the note's path) before the commit.
- **Inner loop.** Each snippet in the temporary `*.test-d.ts`, `pnpm exec tsc -b examples/kitchen-sink`, a deliberate error to prove it is checked.
- **Must not touch.** Any source file. No Jev: no API changes yet.

### Bout 4.2: row deltas and the maintained-value mechanism

- **Model.** The most capable: it shapes `foldkit-remote/maintained`.
- **Writes.** In `packages/remote`: B1's deltas and B2's mechanism as a new subpath, with `aggregate.ts` moved under it (breaking: the import path), a `*.test-d.ts` by rule 19, a seeded differential test against recomputation over optimistic layers, a live echo, a failed write, reconnect and restore, and a mutation spec. The export is reported for the coordinator's `generate` and `paths`.
- **Reads.** `packages/remote/src/aggregate.ts`, `optimistic.ts`, `layers.ts`, `ledger.ts`, `replay.ts`, `liveEvents.ts`; `packages/metakit/src/aggregates.ts` and `properties.ts`; issue #580 with every comment; `docs/agents/traps-data-and-sql.md` and `traps-async.md`.
- **Inner loop.** `pnpm exec tsc -b packages/remote` and the new test files from the repository root with `--project unit`.
- **End checks, once.** `pnpm mutate` on the new spec; the six Remote page budgets before and after into the ledger (rule 4: a page that maintains nothing must not move); Jev by file with the README and `skills/foldkit-plus/references/remote.md`.
- **Must not touch.** `packages/metakit` (Bout 4.1's subject), `packages/surface`, `packages/sync`.

### Bout 4.3: Phase 2's readings and Phase 3's gate readings

- **Model.** Sonnet: it measures and decides nothing about an API.
- **Writes.** Only the ledger, plus a temporary build variant of todo-app deleted before the commit.
- **Task.** Take into the ledger, each with its command and commit: Phase 2's four measures (render counts with `scripts/render-baseline.mjs` on todo-app, the `askedOf` count, the graph build time for reference and for todo-app, the list of functions that walk a declaration for its paths); Phase 3's byte cost (todo-app built from one tree with `Declared.of` and with the hand-written `update` of its replay test), the arm lengths, and rule 21's instantiation counts for todo-app, reference and domains-plus; and domains-plus's gap list by Message.
- **Must not touch.** Any source under `packages/`; `packages/remote` is Bout 4.2's.

## Risks, and what limits each

**A declared property is false.** A false commutativity would let a walk be skipped, a false inverse would let a maintained total drift. Limit: rule 10; generated checks over the awkward values and Schema samples; a mutation per property kind; each consumer has a reference run in tests.

**A custom claim passes its check and is false.** Sampling can miss. Limit: the awkward values and range ends are always sampled; the reviewer of Phase 4 hunts sampling gaps; readers decide only skips that a reference run in tests would catch.

**The typed claims cost the type checker.** Limit: the note's prototype count; rule 21's ceiling; the audit.

**Bundles grow.** Limit: rule 3 keeps checks, lowering and the graph's analysis off pages; a page naming no custom operation is asserted unchanged; rule 4.

**The bets do not pay, or their gates are skipped.** Phase 3's gate was passed on its count while three premises stayed unmeasured. Limit: Bout 4.3 measures them, and the coordinator reads each gate as a whole before its phase's remaining scope is briefed.

**Upstream does not move.** Limit: every Phase 6 and 7 deliverable works on today's Foldkit; the requests are drafted and cost nothing to hold.

**Proofs lose power when made sound.** Limit: pairs that go from decided to Unknown are named with what would decide them; pinned proofs fail loudly.

**A wrong skip shows a stale page.** Limit: a reference run in development and tests, Unknown never read as empty, a mutation per consumer that drops the unknown edge.

**Scope with no stopping point.** Limit: measured "Done when" per phase; items outside the plan listed with their reason; a new idea becomes an issue unless a phase's "Done when" needs it.

**The machine and CI.** Memory is short and one CI failure is not understood. Limit: one heavy command at a time; the flake rule.

## Decisions the maintainer may want to change

1. **`foldkit-entity` keeps its public constructors and builds metakit underneath** (done).
2. **Related rows live in metakit** (`metakit/relation`, done).
3. **The application layer lives in `foldkit-surface`** (`foldkit-surface/declared`, done), not a new package.
4. **No source transform.** Script is cut where declarations name a dynamic import (#607's question 1 left open).
5. **The binder answers only declared presses without Commands**; Foldkit draws after hand-over.
6. **D1 holds a rule over other rows only where it is judged in the writing statement**; an aggregate data rule stays refused there until a fixture needs in-statement judgement.
7. **Skips are the default** in `Surface.rootView` (done).
8. **Change replay is built for the Durable Object only.**
9. **domains-plus is the measured proof and todo-app the first.**
10. **Fingerprints (#579) and cluster machines (#609) are outside the plan.**
11. **Laws are a closed vocabulary; applications declare checked instances of it.** No user-defined kinds of property and no algebra objects: a custom operation claims properties from the set, a custom fold names a checked operation, a custom way of writing combines with one, and readers act on a claim only where a generated check of it ran. Store capabilities follow the same rule: adapters are open, kinds of guarantee are closed. (Revised 2026-11-22: the first version allowed no user-defined instances.)
12. **The ways of writing** are `set`, `add`, `append`, `insert`, `remove`, `removeWhere`, `patch`, `patchWhere`, `include`, `exclude`, `opaque`, and (Phase 4) `combine`.
13. **Lists are folded by `Rows`**, not by operations taking a function; one pass, no nesting. A custom fold is a `Rows` fold naming a checked operation.
14. **A page may carry only `metakit/graph/match`** of the graph.
15. **The gate thresholds** of Phases 3, 6 and 7 are proposals, and so are the fallback shapes.
16. **Checks never run on a page;** they run in tests (required, through the obligations report) and, by choice, at a development server's start. The alternative, checking where an operation is defined, would put samplers on pages.
17. **A custom fold must be commutative and associative with an identity.** An order-dependent fold over a list is expressible only through `find` and `keep`, or as code.
18. **Entity's operator machinery moves into metakit** (A8), and entity's `Law`, `Operators` and `Conformance.laws` names are deleted rather than kept beside metakit's.
19. **`Evidence.Proven` stops counting** as a reason for a reader to act on a property; a proof elsewhere is recorded, and the generated check still runs.
20. **Phase 9 is a phase of its own,** after Phase 4 part A, rather than spread through Phases 4 and 8.
21. **Compile cost is gated by instantiation count** (rule 21, 10%), not by time, which a native checker this short does not measure well.

## Assumptions to verify, each in its phase's first bout

- That Effect 4's Schema gives a seeded generator of values for the sampling (Bout 4.1); if not, the samples are the awkward values, the range ends and a small generator per primitive Schema.
- That the typed property builder stays within rule 21's ceiling under real signatures (Bout 4.1's prototype).
- That SQLite's and Postgres's bitwise operators agree with JavaScript's over the permissions domain's Schema (a 31-bit unsigned integer), or the domain is narrowed until they do (A9).
- That every custom operation an application acts on is reachable from a machine or a language its tests check; an operation used only in a free-standing expression outside both is not collected (A4 says how a test covers it).
- That Phase 1's soundness leftovers are still open; the log at `d729a83fa` shows only the `transitionOf` part done (Phase 1 open item 3).
- That the store-declaration fixes in the tree land as described (Phase 5; before 4 B7).
- That a filtered list's body can be classified as reading only the changed row from `Expr.reads` alone (B10).
- That domains-plus's Messages fit as well as todo-app's; not counted (Bout 4.3).
- That a region Foldkit holds as trusted HTML is left alone across renders, and that hydration adopts a page the binder changed (Phase 6's gate).
- That a script able to evaluate a transition fits 20 kB with room for the binder (Phase 6's gate).
- That the CI flake is a resource limit of the runner; its cause is unknown (Phase 0).
