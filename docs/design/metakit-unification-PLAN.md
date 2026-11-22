# One declaration, every reader: the metakit unification plan

Status: plan, written 2026-11-21, revised 2026-11-22 against the tree at `1358ac483`. Phases 0, 1 and 5 are built and reviewed; Phase 2 is built in large part; Phase 3 is done on its first example; Phase 4 is next. A built phase is summarised with its commits, what it moved and what it decided differently; its full brief is in git history (`6f3a3b08c`) and in [the kernel convergence note](./metakit-kernel-convergence-DESIGN.md) ("the kernel note"). Measurements live in [the ledger](./metakit-unification-LEDGER.md). It succeeds [metakit-phases-2-6-PLAN.md](./metakit-phases-2-6-PLAN.md). Every phase ends in a numbered bout list a coordinator briefs from; "Order" says which bouts run side by side.

## The problem, the idea, and what you get

An application built with Foldkit Plus (this repository's packages) states the same facts several times. Foldkit is the framework we build on: an application is one state value (the Model), events (Messages), a function `update` that makes the next Model from a Model and a Message, and a function `view` that draws a Model. Take one fact: "pressing Add changes the cart's count, and nothing else". Without this plan that fact is written as code inside `update`, again as the list of Model fields a part of the page reads, again as the rule the server checks and the SQL the database runs, again as the test that says a late reply must not undo a newer one, and again as the list of fields the server must send so the page can start. Each copy is in a form only one part of the system can read. So the page redraws parts that did not change, ships data and script that the first press does not need, and a rule can be right in one copy and wrong in another.

The idea is to state each fact once, as data, in a form every part reads. A rule becomes a small tree of operations (an expression) instead of a function. A state change becomes a guard and a list of "this field becomes this value" (a transition) instead of a branch of `update`. Anything can then read, without running it, what a Message reads and what it writes.

The package `metakit` holds that form. Phase 1 made it the only expression language: `foldkit-entity`'s rules, queries and declared writes build metakit expressions. This plan finishes the base (one dependency graph, the record of what reads and what writes each piece of state; one way to keep computed values up to date; an application whose `update` is declared) and builds on it what the declarations make possible: a page that answers its first press (the first click or key a person makes) without loading the framework, script cut along Messages, values maintained from what changed, and operations, folds and ways of writing an application defines itself, with claims every reader trusts because a generated test checks them.

When the plan is done, you write a rule once and the page, the form, the server, the database, the checker and an AI agent's tool list all read that one rule. A page ships the data its changeable parts read and the script its first press needs. A list of 100,000 rows takes a pending edit without a walk of the list. A test fails when a race between two Messages has no test, and when an operation you defined claims a law it does not keep.

| Phase | Delivers | Status at `1358ac483` | Needs | Bouts left |
| --- | --- | --- | --- | --- |
| 0. Clear the ground | Files small enough to review, the ledger, leftovers | Done; housekeeping open | nothing | 1 |
| 1. One expression language | Entity on metakit; list, text and write operations; property tables | Done; standard library and soundness items open | 0 | 5 |
| 2. One dependency graph | One graph read by drawing, start-up, fetching, replication, checkers | Built in large part | 1 | 6 |
| 3. Declared `update` (a bet) | An application's Messages as one declared set of state changes | Done on todo-app; gate readings, domains-plus and adoption open | 1, 2; its gate | 8 |
| 4. Checked custom algebras and maintained values | Operations, folds and ways of writing an application defines, checked; values kept up to date from row changes | Next | 1, 2 | 24 |
| 5. Stores and orderings | Every store declares its guarantees; two changes that meet are decided or tested | Done | 1 | 1 |
| 6. Resume without the runtime (a bet) | A page that answers declared presses before Foldkit loads | Not started | 2, 3; its gate | 15 |
| 7. Script cut by Message (a bet) | Script per part of the page and per Message | Not started | 3, 6; its gate | 10 |
| 8. Examples and documents | Every example on the new base; guides, skill, site, post | Proof examples move with each phase | all | 10 |
| 9. Building on the base | An application's own typed language, stores and protocols, checked like ours | Not started | 4 part A | 7 |
| Developer-experience audit | Inference, compile cost and messages, measured across phases | Not started | 2, 3 | 1 per phase |

A *bout* is one piece of work that stands on its own (a module with its tests, a design note), done by one agent and reviewed at its end. A phase marked "a bet" opens with a *gate*: a bout that measures what must be true before most of the phase is spent, with the smaller shape the phase takes if it fails. A checker is a program that shows a rule cannot be broken; "resume" is a server-drawn page starting in the browser from the server's state; the runtime is Foldkit's script. The other words are explained in "Words this plan uses".

## Is this a better design?

Partly on evidence, partly on a bet.

**Better, on evidence.**

- *One rule read by every consumer.* An independent review found the in-memory evaluator, the SQL and the provers disagreeing about a missing value, and SQL produced by two code paths that each had bugs the other lacked. One evaluation rule and one SQL lowering removed that class of fault; a parity suite runs every operation on SQLite and PGlite against the evaluator.
- *One expression language.* Phase 1 deleted entity's second evaluator, checker (`bounds.ts`) and operator table (`207a36783`, `c02c2dcf1`, `d72bcd85c`). A differential over 679 pairs of write and rule found no opposite answer before the old checker went.
- *One graph.* The structure exists (`40a0a1c13`) and four of the five old graphs read it; Phase 2 says which part is not done.

**A bet, and what would confirm or refute it.**

- *That most of a real `update` can be stated as data at an acceptable cost.* On todo-app 23 of 25 Messages are transitions and the other two are ordinary code with a declared footprint (`12354bd14`, `92d3114e2`). The cost is unmeasured: the page read 165,083 compressed bytes before it opted in and 173,086 at `31b10117c`, not split by cause. domains-plus has 39 Messages of its own and no machine; Phase 3 counts 19 declarable today and up to 31 after the work it lists, against 30 for three in four.
- *That a page can answer presses without the framework and be faster for it.* Not tried. Phase 6's gate tries it first.
- *That cutting script by Message pays.* Only once the runtime is out of the start path. Phase 7's gate says so.
- *That applications will define checked algebras of their own.* None does yet. Phase 4's first consumers are an example and its tests, and domains-plus's search label (Phase 3 bout 3.5), which needs one.

**What the work so far showed about cost.**

- *Bytes.* Phase 1 left every page that reads rows 3.3 to 5.6 kB brotli above its earlier ceiling, accepted by the maintainer on 2026-11-21 (ledger, "Closed by step 10").
- *Proofs lose power when made sound.* 19 pairs the old checker kept are Unknown because a value may be NaN or null.
- *Nothing is right until someone independent looks.* Three adversarial reviews after Phases 1 and 5 found an authorization bypass, a replay that silently diverged (confirmed by a TLA+ model) and a partial delete on read-committed Postgres ([phase 1 and 5 review](./metakit-phase1-5-REVIEW.md), [deep review 2](./metakit-deep-review-2-REVIEW.md), [deep review 3](./metakit-deep-review-3-REVIEW.md)). Every phase ends in an independent review, and a claim is trusted only where something checks it.
- *A declared form is more to learn,* and type errors are where a user meets it first. Rules 19 to 21 and the developer-experience audit gate inference, compile cost and messages.

## Words this plan uses

- **Effect, Effect Schema.** Effect is the TypeScript library Foldkit is built on; it runs asynchronous work as values. Its Schema type describes a value's shape (`Schema.Struct({ balance: Schema.Int })`). Every Model, input, stored row and operation argument here is described by one.
- **Expression, path, operation.** An expression is a rule or computed value written as a tree of operations (`Num.gte($.balance, 0)`); a path names a field inside a Schema (`$.cart.count`). An operation is what a call node names (`num.add`). metakit has 33 core operations (`CoreOpId` in `packages/metakit/src/node.ts`), a closed set each reader implements.
- **Node kinds, opaque.** An expression tree has seven kinds of node: a literal, a path, a call, an if, a match, a `Rows` node (one question asked of each element of a list or each related row: any, every, count, sum, min, max, find, keep, patch; the only iteration), and an opaque node, which wraps ordinary code and says which paths it reads, or that it may read anything.
- **Custom (foreign) operation.** An operation an application defines outside the core set, carried in a node by its id and version (`flags.or@1`) with no evaluator, because a page and a server hold different implementations of it, or the page none. Each reader takes the implementations from its caller and refuses a call it holds none for.
- **Reader, conformance case.** A reader takes an expression and does something with it: evaluates it, turns it into SQL, bounds it, proves something about it, or lists the paths it reads. A conformance case is an input with its expected answer, run through every reader.
- **Null-strict, refusal.** Null-strict means an operation over a missing value gives a missing value, and a rule holds only where it evaluates to true. A refusal is a typed failure the evaluator returns instead of a wrong number.
- **Transition, guard, machine, footprint.** A transition is one state change as data: a guard, its writes, and the Commands it emits as records. A machine is a state Schema with one named transition per Message tag. A footprint is the paths a transition reads and writes, read from the data.
- **Way of writing.** How a transition changes one path: set, add, append, insert, remove or patch an element with an id, include or exclude a value of a sorted set (`ops/ways.ts`). Phase 4 adds `combine`: the path becomes a checked operation of its old value and a given one.
- **Property (law), generated check.** A fact about an operation, fold or way of writing that holds for every input in a stated domain: identity, absorbing, idempotent, commutative, associative, invertible, monotone, and for partial evaluation alone reflexive and involution. The set is closed; the tables are `opProperties`, `foldProperties`, `writeProperties` (`properties.ts`). A generated check is a test built from a declaration: it samples inputs and requires the property to hold against an implementation.
- **Supplied input.** A value a transition needs and cannot make (a new id, the time): whoever runs the step makes it once and records it.
- **Command.** Foldkit's word for a side effect `update` asks the runtime to run. A transition emits it as a record; `foldkit-surface/declared` maps each record to the application's Command.
- **Checker, prover, verdict, residualize.** The checker (`Abstract`) answers at once whether a transition can break a rule, from bounds on each value; the prover hands harder cases to the Z3 solver. Both answer a `Verdict`: true, false or Unknown. To residualize is to evaluate the parts whose inputs are known and keep the rest.
- **Obligation, walk, registry.** An obligation is something a proof did not show and a test must. A walk is a seeded test that runs steps in many orders. The registry (`metakit/temporal`) collects every obligation and discharge in a test run; one test fails while any is open, and `npx foldkit-plus laws` prints them.
- **Store capability.** How a store runs overlapping writes (isolation, and whether it reaches one statement or a transaction) and whether a write locks the row a group of rows hangs on (the parent-row lock). A rule needs a capability (`row-atomic`, `parent-serialized`); a writer says where it judges the rule (in its statement, from a read first, or by a database constraint).
- **Pending write, differential test, epoch.** A pending write is one the page applied and the server has not answered. A differential test runs two implementations over the same cases and requires the same answers. An epoch (`writes.epochFor(reads)`) is a number that moves whenever a write may have touched the given paths; a memo that keeps it can skip comparing values.
- **Package names.** `foldkit-entity` (Entities, relations, queries, declared writes; `Laws.check` in `foldkit-entity/laws`); `foldkit-remote` (rows from a server in the Model; a live read is one the server keeps pushing); `foldkit-sync` (replication between devices); `foldkit-guard` (who may read or change which rows); `foldkit-surface` (named parts of the view, Surfaces, and the Model paths each reads, its projection); `foldkit-bundle` (reusable parts placed at a path); `foldkit-form`; `foldkit-agent` (Messages as an AI agent's tools); `foldkit-mixins` and `mixins-*` (widgets and styling; `SlotView` is a widget's view with named slots); `foldkit-remote-server` and `foldkit-remote-drizzle` (Remote's server; Drizzle is the SQL library); `foldkit-ssr` (server rendering); `foldkit-durable` (a journal in a Durable Object). An opt-in entry point is a subpath only an application importing it pays for.
- **Stores named here.** SQLite and Postgres; PGlite is Postgres inside a test process; D1 is Cloudflare's hosted SQLite; a Durable Object is a Cloudflare server object with its own storage; IndexedDB is the browser's.
- **Hydration, resume, envelope, cover, anchor, binder.** Hydration is Foldkit calling the whole view on its first run over a server-drawn page and matching it to the elements there. Resume starts the page from the server's Model; the envelope is the JSON the server writes into the page for that. A path a Surface reads is covered when something guarantees it is in the browser. An anchor is an element the server marked with the id of the value it shows; the binder is the small script Phase 6 builds that answers a press by running a transition and writing anchors before Foldkit loads.
- **Blocking, chunk, budget.** Blocking is the time from navigation in which the main thread was busy over 50 ms at a stretch, with the CPU slowed four times. A chunk is one file of built script. A budget is a test that fails when built script grows past a recorded number of bytes.
- **Maintained value, delta.** A computed result updated from each change instead of computed again from all rows; a delta is one change, the row before and after. An aggregate is a value over many rows.
- **Jev, mutation spec.** Jev (`npx jev-pref review`) judges a diff against the project's written preferences. A mutation spec (`test/*.mutations.ts`) lists deliberate breakages; `pnpm mutate <spec>` applies each and requires a test to fail.
- **Proof examples, the #601 note.** `examples/todo-app` (small, first) and `examples/foldkit/domains-plus` (measured). `docs/design/601-expression-standard-library-DESIGN.md` is the standard set of value types and operations and the admission rule for an operation.

## Where things stand

Checked against the tree at `1358ac483`.

**Built.**

- *Phase 0.* The split (`a750f5be2`), the guides on the site (`1612529cc`, `8d5a783bc`, `a9dce383f`), the ledger (`891b383fd`), the surviving mutations closed (`582f356cd`), the CI retry (`ef2e8d8a2`).
- *Phase 1.* All eleven steps of the kernel note: `metakit/build`, the text, equality and list operations, foreign operations, supplied inputs, `Transition.add` and `Transition.opaque` (`54a77dcba`, `dacf53ac5`, `c2a963065`, `82d490935`); one `Verdict` (`6e319f5ff`); `Rows`, list writes, emitted records, `Transition.commutes` (`98b48a212`); the property tables and generated checks (`03d191014`, `99b02acfc`); entity translated, judged, its writes as transitions, `Laws.check` and Drizzle's operations on metakit, guard on metakit, and the constructors building metakit nodes (`b98da5975`, `b61064cb4`, `6ccde36e8`, `c02c2dcf1`, `d72bcd85c`, `d78fa53c1`, `207a36783`); `num.mulScaled` (`24904fdd6`).
- *Phase 2.* See its verdict table.
- *Phase 3, on todo-app.* `foldkit-surface/declared` (`bb73a0c93`, `721541c90`), todo-app on it (`92d3114e2`, `6f6257848`) with a seeded replay through the hand-written and derived `update` (`09a74a89b`), Message-to-Message edges (`21bbb5355`), a confined child Bundle (`35cc0fe6f`), Sync reading durable transitions from the machine (`add073f0e`, `b7b7e3358`, `64afe868b`).
- *Phase 5.* All items but 3: store declarations (`017182491`, `4189259c4`, `55bb49d7b`, `73e049220`, `288e6777c`), `EntityWriter.store` required (`45c18bf93`), guard rules held to the store (`e6ba38818`, `154db2ed5`), late answers read again (`684abd795`), protocol obligations walked (`84cb25302`, `40cef27c4`), the registry and `metakit/pairs` (`78e39b7f0`, `a7e15bd43`, `45c0a983e`), `Transition.idempotent` and Sync convergence (`e6cf9aa0b`, `ae728b5e6`), `replayOver` (`79c464475`). D1 is serializable per statement in both the Drizzle writer and the journal, and every host holds a document's laws to its journal's store, so `Journal.store` and `Accepted.store` now have readers (`ab41873a8`).

**Decided differently from the plan's first text.**

- The page judges held rows without building a residual expression (the lean judge, `103e5f790`).
- A way of writing declares no `invertible` (`b7097b083`); `commutes` and `idempotent` carry named conditions (`CommuteCondition`, `IdempotentCondition` in `ops/ways.ts`), loaded by a page two rows at a time (`ca26ec8cf`, `c0197407e`).
- An `add` answer equal to its replay settles without a read only at the revision right after the newer value (`rightAfter`, `1b78d2cdd`), which needed write answers to carry revisions (`EntityWriter.revision`, `0e8faee9c`); a read beside a pending `add` is shown as it is (`bad8758c4`); a failed pending write, `set` included, is dropped with its layer and nothing is read again; reconciled writes are ordered by server revision (`2e0563dfc`, `770e2ff59`).
- A rule a database constraint holds is judged `constraint` (`89bc972e1`); deletes and links through an `onDelete` relation are held to the store (`e23d90ff9`, `9bf8c0510`); the Postgres store races run on a real Postgres in CI (`ddd5af4dc`). The Drizzle writer judges only a guard's rule over other rows in its statement, so an aggregate data rule is refused on D1 and read-committed Postgres until Phase 4 bout 4.17 (`d729a83fa`).

**Still as it was.**

- `ForeignOp` (`node.ts`) holds `id`, `version`, `returns` (a value kind), `nulls` and `properties`, with no argument or result Schema; no reader acts on `properties` and metakit checks none. `call(op, args)` (`ops/core.ts`) takes `unknown` arguments and returns an `Expr` whose value type the caller picks. Implementations are a record keyed by the string `id@version`. `OpProperties.invertible.inverse` is a `CoreOpId`.
- Entity's `Expr.operator` types arguments and result by Schemas and declares nine `Law` kinds (`law.ts`), tested by `Conformance.laws` in tests only; four reach metakit (`propertiesOf` in `expr/primitive.ts`).
- Maintained values exist only as `foldkit-remote/aggregate`; Postgres declares no parent-row lock; #580 and #606 are open.
- The graph's ids are strings; `deadReaders` has no caller; `pruneStatic` and `queryReadiness` are called only by `examples/metakit/src/demo.ts`; `packages/ssr` imports nothing from metakit.
- `foldkit-durable` declares its own copy of the store capability shape (`StoreCapabilities` in `packages/durable/src/journal.ts`) instead of metakit's.

## What was decided before this plan

- metakit is the base; every package takes metakit declarations as its main input where it took a function or a representation of its own.
- "Meta-Foldkit" is the layer of issues #597 and #598; their later comments narrow the bodies and are followed.
- Resume and script splitting are built in full; measurements order the work and set defaults, they do not cancel it.
- Work is deferred only for a concrete reason: upstream Foldkit, a measured cost, an unsound design, or another package's ownership.

## The target, in prose

### One model of declarations

An application is described by six kinds of declaration, all written with one expression language.

1. **Schemas** say what values a Model field, an input, a stored row or an operation's argument may hold. metakit ships a Schema only for what Effect lacks (a decimal at a scale, money, a calendar day, an ordered enumeration).
2. **Expressions** are rules and computed values over a named environment, which says what the expression may read. Reading outside the environment is a type error.
3. **Transitions and machines** say how state changes. A declared write to a stored row and an arm of an application's `update` are the same thing.
4. **Queries and aggregates** say which rows match, in what order, and what follows from related rows.
5. **Guards and policies** say who may read or change what.
6. **Views** read declared paths: a view stays a Foldkit view function over projections and bindings whose reads are declared.

`foldkit-entity` is a language written on the kernel, not a second kernel; Phase 9 lets an application write its own the same way.

### One dependency graph

One graph is built once, when the application is defined. Its nodes are paths (in the Model, or a field of a stored row), writers (a transition, a declared write, a reducer step) and readers (a projection, a binding, a placement, a query, a guard, a rule). An edge says "writes" or "reads" and how it is known: derived, declared, or unknown. Unknown is never treated as empty: for rendering it forces a redraw, for authorization it grants nothing. At run time a package joins the graph with what is active and what changed.

### One way to keep computed values up to date

A maintained value has a definition, a source and a rule for one delta. The graph says which maintained values a change can reach; the delta rule updates from the changed row when the definition's properties allow it, and otherwise recomputes and says so.

### Laws decide

Two Messages both write the cart's count: does their order matter? A row leaves a list: can the total be corrected from that row? A pending edit sits over a value the server just changed: can it be applied on top? Each answer depends on a property, so each operation, fold and way of writing carries properties from one closed set, one table per kind keyed by its closed set of names.

| Property | In plain words | Example |
| --- | --- | --- |
| Commutative | The order of the two inputs does not matter | `a + b`; two increments of one count |
| Associative | Grouping does not matter | a sum of integers |
| Idempotent | Twice is the same as once | `max`; set to a value; remove the element with an id |
| Identity | Some input leaves the other unchanged | `0` for `+` |
| Invertible | A named operation undoes it | subtract undoes add |
| Monotone | A larger input never gives a smaller result (or never a larger) | `x + 1` |
| Absorbing | Some input decides the result whatever the other is | `false` for `and` |

**The rule for declaring one.** A property is declared only where (a) a generated check confirms it against an implementation over the awkward values, and (b) a reader decides something from it, over the domain it holds for (integer addition is associative where neither grouping is refused; nothing over floats is declared associative).

| Property | What checks it | What decides from it |
| --- | --- | --- |
| Identity, absorbing | `propertyChecks.ts`, `foldChecks.ts` | Partial evaluation and the page judge; a total's starting value |
| Idempotent | Generated checks; `writeChecks.ts` | Partial evaluation; `Transition.idempotent`; Sync redelivery |
| Commutative | Both orders; two writes on seeded states | `Transition.commutes`; `metakit/pairs`; Sync convergence; `replayOver` |
| Associative | Three inputs, both groupings | `metakit/aggregates`; combining deltas (Phase 4) |
| Invertible | Apply, undo, compare | `metakit/aggregates`; update-or-rescan (Phase 4) |
| Monotone | Ordered pairs | The checker's bounds (`abstract/ops.ts`) |

Laws do not solve a Message the language cannot state, and do not make a weak store strong.

### Custom algebras, checked

An application needs operations metakit does not ship: combining permission flags, a domain's rounding, a text normalisation. Phase 4 part A lets it declare one, a fold over it and a way of writing with it, so that every reader acts on its claims and a false claim fails a test. The vocabulary of properties stays closed; user-defined instances of it are allowed and checked (decision 11).

- *Declaring.* Once, with id, version, a Schema per argument and for the result, its null rule and its claims. The declaration is the typed constructor. Each claim is typed by the signature: an identity has the argument's type; identity, absorbing, commutative and associative compile only for `(A, A) => A`; an inverse takes the result and the second argument and gives the first (or is `'self'`); monotone has one direction per argument. There is no per-claim domain: every claim holds over what the argument Schemas admit, and evaluation checks each argument and the answer against its Schema, refusing `ill-typed` otherwise. Names and signatures are fixed in [the checked-operations note](./metakit-checked-operations-DESIGN.md) ("the operations note").
- *Checking.* A generated check per claim over inputs sampled from the argument Schemas (`Arbitrary.schema` from `effect/Arbitrary`, seeded; `@stability unstable`, see Risks), plus the awkward values each Schema admits and the ends of any range it checks, which the sampler adds itself. Our own loop checks, so the calls evaluated can be recorded for SQL parity. Checks never run on a page; they run in a test helper with each implementation the application ships, and optionally at a development server's start. Every claim reachable from an application's machines and languages is an obligation in the registry, discharged only by a passing check in that run, so a forgotten check fails the obligations test.
- *Versions.* Obligations are named by `id@version`; a bump names new ones. A changed declaration under one version is refused where a server and a page compare descriptions.
- *Lowering.* A lowering per dialect, typed by arity; a dialect without one refuses by name. Every lowering joins the parity suite: one statement per dialect over the calls the memory checks evaluated.
- *Folds and ways.* A custom fold names a checked operation that claims commutative, associative and an identity; its fold properties derive from the operation's. A custom way of writing is `combine`; `add` is its named case with `num.add`.
- *Readers.* Partial evaluation and the page judge (identity, absorbing, idempotent, carried in the node); the checker (monotone, given implementations); `Transition.commutes`, `Transition.idempotent`, `metakit/pairs`, Sync convergence and `replayOver` (through `combine`); the update-or-rescan classifier (through the fold). The solver answers Unknown, as today.

### What happens when two declarations meet

| The two that meet | Found by | Decided by | Left to a walk |
| --- | --- | --- | --- |
| Transition and transition | The graph | `Transition.commutes` | Pairs it does not decide (`metakit/pairs`) |
| Transition and rule | The graph | The checker, then the prover | Rules across rows on a store that does not serialize writers |
| Transition and projection or query | The graph | The delta rule | Nothing; a wrong skip is caught by the reference run |
| Write and guard | The graph | The checker | A guard reading other rows on a weak store |
| Pending write and newer server value | Remote, by field | `replayOver` | The orders of answer, patch and read |

A declaration-based decider never answers "they conflict": only a run finds a counterexample, replayed through the evaluator before it is reported.

### Why resume and splitting follow

If every Message's reads and writes are known, three things are computed before any script runs: the Messages a page can send, the values they can change, and the data those read. The same facts say what script a press needs.

### Where metakit ends

metakit knows Effect Schema and nothing else: no Foldkit, network, storage or drawing. It owns expressions, paths, transitions, machines, the verdict, the readers, the graph structure, the store vocabulary, walks, the registry, and (Phase 4) custom operations and their checks. Each package owns its runtime. Extracting metakit stays last, as #598 decided.

### What stays out

The #601 admission rule for a core operation: every reader implements it exactly or refuses it by name; conformance cases with the awkward values; total over its input Schema or a declared partial answer; reads only its arguments. A custom operation keeps the last three and refuses by name where it has no implementation. The language has no user functions with bodies, recursion, loops, I/O, randomness or clock reads; what it cannot make it is given as a supplied input. The only iteration is `Rows`, one pass, no nesting. What does not fit stays code (`Transition.opaque`, with a development-time check of its declared footprint). Phase 9's `Language` groups operations to derive reader tables; it changes no reader's meaning.

## Rules for every phase

**Bytes.**

1. An opt-in feature lives on its own subpath; a page that does not use it pays zero bytes, asserted in `scripts/test/publishedBuild.test.ts`.
2. A main entry a page loads imports from metakit only what rule 3 allows; `foldkit-entity` and its importers carry the node constructors, the evaluator and judge, and the operation modules a page names.
3. One module per operation; a page naming one ships no other (`4eb219727`). The checker, prover, SQL lowering, conformance and generated checks never reach a page; of the graph a page carries only `metakit/graph/match`.
4. A bout that touches code a page runs measures the affected budgets before and after into the ledger. A budget is raised only for code every such page runs, with the measurement beside it; otherwise the bout stops and reports.

**Meaning.**

5. Null and refusal mean one thing in every reader; a refusal is a failure, never "undecided".
6. An analysis may only weaken toward Unknown.
7. A counterexample is replayed through the evaluator before it is reported; tests never snapshot a solver's values.
8. Proofs that a rule on data holds never assume a guard about who is asking.
9. A new core operation updates every reader's table in the same change; the tables are typed by the ids.
10. A reader acts on a property, core or custom, only where a generated check of it ran in the same test run; a custom claim with no check is an open obligation.

**Review.**

11. Every phase ends with an adversarial review by an agent that did not write it, on the most capable model. Fixers fix, each fix with a test that failed first and a mutation.
12. Jev runs only on changes to a published package's API, with the README and skill files the change updates, by file.
13. A new source file is born under 20,000 characters; a file a phase rewrites is split in that phase.
14. Each behaviour has a mutation in a `*.mutations.ts` spec, run in one `pnpm mutate` call per spec.

**Working in the shared tree.**

15. Agents work on disjoint files; each brief says what the others edit. No worktrees and no branches without the maintainer's word.
16. The coordinator alone commits the lockfile, `packages/plus`'s generated entries and the tsconfig paths.
17. A new run-time dependency lists the projects that need the reference. One heavy command at a time while memory is short. Agents push and report; the coordinator reads CI.
18. Agents post nothing on `foldkit/foldkit`; requests are drafted in `docs/upstream-foldkit-ssr.md`.

**Types and developer experience.**

19. A public API a bout shapes ships with a `*.test-d.ts`: positive cases written as a user writes them, with no annotation or generic argument, asserting the inferred type; one `@ts-expect-error` per constraint, each probed alone, on the line where the mistake is; and a type mutation (widen the constraint, see a negative case go red). No `string` where a typed key works, no `Schema.Top` where a struct is read, no cast in a test or example, no tag compared through `{ _tag: string }`.
20. Every refusal or definition-time error a bout adds names the thing, the reason and the fix, and a test asserts the text. The messages this plan names are the wording to start from.
21. The instantiation count of `pnpm exec tsc -b <project> --force --extendedDiagnostics` for `examples/todo-app`, `examples/reference` and `examples/foldkit/domains-plus` is in the ledger with command and commit; a phase raises none by more than 10% without the maintainer's word. Time is reported beside it.

## Phase 0: clear the ground (done)

Delivered as listed. Open:

| Bout | Model | Files | Beside |
| --- | --- | --- | --- |
| 0.1 `npx jev-pref sync` and its reconciliation; `pnpm check:changed --dry` on a known change, fixed if wrong; report the CI retry's first run (or none) | Haiku | `jev-pref.json`, `scripts/` (only if `check:changed` is wrong) | anything |

The remote branch `ui-polish-ci` is deleted only on the maintainer's word. Until a CI log shows the retry path, no phase's verdict rests on a run that showed `VITEST_BROWSER_CONNECTION_CLOSED`.

## Phase 1: one expression language (done; leftovers)

Reviewed with Phase 5, every finding resolved. Differently from its text: the lean judge; byte targets not met and accepted; ways of writing in `ops/ways.ts` without `invertible`; `Transition.commutes` grew the conditions the review required (`66ac7395d`, `4761c746b`). Entity's law kinds moving onto metakit's set is Phase 4 bout 4.11.

### Leftover 1: the standard library

Each operation enters by the admission rule, in one module under `packages/metakit/src/ops/`, with its row in every reader table (`ops/laws.ts`, `properties.ts`, `abstract/ops.ts`, `prove/lower.ts`, `sqlLowering.ts`), conformance cases including the #601 note's for it, and SQL both dialects agree on (the #601 note's integer formulas). Its consumer is a rule of the #601 note's three domains (§2: a bank with a monthly fee, a booking with a trial, an order with tax and a discount), written as fixtures in `packages/metakit/test/fixtures/domains601.ts` and checked by `Abstract` and the parity suite. Properties are declared only where the table names a reader.

| Id | Signature | Properties declared, and the reader | Consumer |
| --- | --- | --- | --- |
| `num.div` | `(n: int \| decimal, d: int, { rounding, onZero: 'null' \| 'refuse' }) → same kind` | none (monotone only where `d > 0`: the checker's own row) | order: price split across lines |
| `num.rem` | `(int, int) → int`, truncated | none | booking: day of the cycle |
| `num.abs` | `K → K` | none (monotone only on a half line) | bank: size of a correction |
| `num.min`, `num.max` | `(K, K) → K` | commutative, associative, idempotent, monotone up, up: checker, partial evaluation | order: discount capped at a limit |
| `num.round` | `decimal(s) → decimal(t)`, named rounding | monotone up: checker | bank: fee at two places |
| `num.toDecimal`, `num.toInt` | exact up; down with a named rounding | monotone up: checker | order: tax rate times an integer price |
| `time.addDays` | `(date, int) → date` | identity 0 right, monotone up, up: partial evaluation, checker | booking: trial end |
| `time.addMonths` | `(date, int) → date`, clamped | identity 0 right, monotone up in the date: partial evaluation, checker | bank: next fee date |
| `time.daysBetween` | `(date, date) → int` | monotone up, down: checker | booking: days left |
| `time.startOfMonth` | `date → date` | idempotent, monotone up: partial evaluation, checker | bank: fee month |
| `time.overlaps` | `(start, end, start, end) → boolean`, half-open | none | booking: no two trials overlap |
| `str.concat` | `(text, text) → text` | identity `''` both: partial evaluation | order: display reference |
| `str.endsWith` | `(text, text) → boolean`, by code point | none | bank: account suffix rule |
| `str.upperAscii` | `text → text`, A–Z only | idempotent: partial evaluation | order: currency code |
| `arr.has` | `(list of scalars, scalar) → boolean` | none | `examples/metakit` permissions roles (Phase 4 bout 4.12) |

`time.today(zone)` is a supplied input, not an operation. Pattern matching, Unicode case and calendar units on timestamps stay out (#601 §4.2, §4.3).

### Leftover 2: soundness

| Item | Change | Test that fails first | Mutation |
| --- | --- | --- | --- |
| `Transition.when` typed `boolean` (`transition.ts:144`) | typed `boolean \| null`; a null guard refuses | a `*.test-d.ts` passing a nullable guard; a step with a null guard refuses | make a null guard pass |
| A rule on an optional key | absent key holds in decode, SQL, checker and prover alike (`transitionOf` did this in `a38eaa591`) | a rule over `Schema.optionalKey` with the key absent, through all four readers | read absent as present in the checker |
| Unbounded `Schema.Finite` arithmetic | the solver's floating-point theory under a 2 s limit, Unknown past it | `x + y > x` over finite non-negative doubles is proved | drop the limit's Unknown |
| `Rows.sum` of decimal products | accepts `num.mulScaled` contributions; an in-memory total past the safe range refuses | a sum of two products near 2^53 refuses | drop the range check |

The bout first checks each against the code at its start and closes those already done.

**Done when.** Every operation above passes parity on SQLite and PGlite and has its fixture consumer; each soundness item's test failed first and its mutation is killed; page budgets read as before (`publishedBuild.test.ts`: a page naming none of them carries none).

| Bout | Model | Files | Beside |
| --- | --- | --- | --- |
| 1.1 Numbers (`num.div` to `num.toInt`) and the domain fixtures | Sonnet | `packages/metakit/src/ops/num*.ts`, reader tables, `test/fixtures/domains601.ts` | Phase 2, 3; not 4.4 (both edit `node.ts`) |
| 1.2 Time | Sonnet | `ops/time.ts`, reader tables, `src/domain/calendarDay.ts` | after 1.1 (shared tables) |
| 1.3 Text (`concat`, `endsWith`, `upperAscii`) | Sonnet | `ops/str.ts`, reader tables | after 1.2 |
| 1.4 `arr.has` | Sonnet | `ops/arr.ts`, reader tables | after 1.3 and 4.12 |
| 1.5 Soundness | most capable | `transition.ts`, `abstract/fields.ts`, `prove/lower.ts`, `ops/rows.ts` | after 1.4 or beside 4.2 |

## Phase 2: one dependency graph (built in large part)

**Goal.** One structure answers "what can this change affect" for every consumer. Issues #581, #586, #587, #588, closed by the coordinator on bout 2.6's readings.

| Old graph | Verdict |
| --- | --- |
| Surface's contract graph | Built: `Graph.of` builds `DependencyGraph` from contracts and the machine (`2a4ca3c9d`, `21bbb5355`) |
| Remote's write-to-query impact | Half built: `reaches.ts` on `metakit/graph` (`268666dba`); `impactOn` (`impact.ts`) decides from query bodies alone |
| `Projection.derive` and `SlotView.region` memos | Not built: both compare values on every render |
| Bundle drawing memo | Built (`50076f855`, `f278d0772`) |
| Sync closure and replay diff | Built in part: `Closure.reads` runs only for undeclared Messages (`mount.ts`), ownership checked (`283c75082`). Not built: `readsOutside` reads a throw as "nothing read"; two owned-fields helpers with different rules (`make.ts` owns a field only when the whole field is a dependency; `closure.ts` owns any field a dependency starts with) |
| `Graph.analyze` | Built |

Consumers: `Surface.rootView` and `SurfaceView.toRenderer` skip while `writes.install()` is active (`c7f7613b7`; `Declared.of` exposes `install`), tested for `Surface.rootView` only; the `Writes.of` counter is per instance (`1129d2b94`); Remote skips read planning on unchanged activation reads (`3bf01ad1a`); a value derived from a Remote read is reached through the store's contract writers (`c7f7613b7`). `coverOf` (`packages/ssr/src/index.ts`) matches paths with its own prefix test.

| Measure | Verdict |
| --- | --- |
| On todo-app, a Message writing one Surface's paths draws no other | Built, tested (`examples/todo-app/test/machine.test.ts`), no ledger reading |
| `askedOf` runs zero times for a Message that does not write the store | Built, tested (`packages/remote/test/readEntryReuse.test.ts`), no count recorded |
| Building the graph for `examples/reference` under 5 ms | Not measured |
| No page budget grows for an application without a machine | Budgets pass; no phase reading |
| One function walks a declaration for its paths | Not reviewed |

**Items.**

1. *Readings* (bout 2.1). The four measures into the ledger with command and commit: render counts with `node scripts/render-baseline.mjs` on todo-app per Message; an `askedOf` call counter in `readEntryReuse.test.ts` printed for a store-free Message; graph build time for reference and todo-app with a `performance.now()` harness in `packages/surface/test/graphBuild.bench.ts`, median of 20; the walker list (grep of `packages/*/src` for functions that walk `Node` or a footprint, each named with its file). Bars: zero foreign draws, zero `askedOf`, under 5 ms, one walker (`Expr.reads`/`readsOfNode`) with every other listed walker either deleted in bout 2.6 or justified as not reading paths.
2. *Memos read epochs* (bout 2.2). `Projection.derive(…, { pathEpoch?: (root) => number })` and `SlotView.region(…, { pathEpoch? })` skip comparing their read values while the epoch is unchanged; `Writes.of` supplies `writes.epochFor(reads)`. Test first: a counter of the comparison function across two Messages that write nothing the memo reads, expected 0 comparisons, today 2. Mutation: always compare. Also the missing test: `SurfaceView.toRenderer` under `writes.install()` keeps an unchanged Surface's drawing. Consumer: a two-Surface fixture in `packages/surface/test/memoEpoch.test.ts`, then any proof-example `Projection.derive` bout 2.1's walker list finds. Measured: comparisons per Message on todo-app in the ledger.
3. *Sync's owned fields and the silent catch* (bout 2.3). One helper, `ownedFields(dependencies): { whole: ReadonlySet<string>; partial: ReadonlySet<string> }`, in `packages/surface/src/closure.ts`, read by both `closure.ts` and `packages/sync/src/make.ts`. Test first: a projection depending on `todos.*.title` and a Message that changes `todos[0].completed` outside the slice; `make.ts` compares it, `closure.ts` today calls `todos` owned. `readsOutside` reports a throw from `Closure.reads` as reading every field outside the slice (unknown, never empty), and a document whose durable Messages are all declared never calls it. Refusal text: `[foldkit-sync] Closure.reads threw for Message "<tag>"; its reads outside the slice are unknown, so the replica treats every outside field as read. Declare a transition for "<tag>" to remove the guess.` Mutation: the old `catch { return [] }`.
4. *`impactOn` on the graph* (bout 2.4). `impactOn` builds (once per held-connection set, memoized by identity) query reader nodes from each held query's `Expr.reads` and asks `readersOf(rowPath(entity, fields))` before rejudging. Test first: a change to a field no held query reads rejudges zero connections (count `rejudged` calls; today one per connection). Mutation: skip the graph filter. Byte reading: the Remote pages before and after (rule 4); the graph's structure is server- and page-safe only through `graph/match`, so `impactOn` uses `pathsOverlap` from it, not `build`.
5. *`coverOf` and typed ids* (bout 2.5). `coverOf` replaces its prefix test with `pathsOverlap`/`minimizePaths` from `metakit/graph/match` (one matcher), which `packages/ssr` gains as a dependency. `DependencyGraph<W extends string, R extends string>`; `affectedBy(writer: W): ReadonlyArray<R>`, `readersOf(path): ReadonlyArray<R>`, `explain(writer: W, reader: R)`; `Graph.of(module)` infers `W` from the Message tags and `R` from the Surface names. Negative cases: `affectedBy('Typo')`, `explain('AddTodo', 'NoSuchSurface')`. Mutation: widen `W` to `string`.
6. *Review and the one walker* (bout 2.6). Adversarial: make each consumer skip something that changed; delete or justify each extra walker from item 1's list.

**Done when.** The four readings meet their bars; every verdict row reads "Built"; the typed ids' negative cases exist; each new skip has a reference run and a mutation that drops the unknown edge; rule 21's counts hold.

| Bout | Model | Files | Beside |
| --- | --- | --- | --- |
| 2.1 Readings (part of 4.3) | Sonnet | ledger, a bench file | everything |
| 2.2 Memos read epochs; `toRenderer` test | Sonnet | `packages/surface/src/index.ts`, `packages/mixins/src/slotView.ts`, tests | Phase 4; after 2.3 (both in `packages/surface`) |
| 2.3 Owned fields and the catch | Sonnet | `packages/surface/src/closure.ts`, `packages/sync/src/make.ts`, `mount.ts` | Phase 4 part B; not 4.10 (sync) |
| 2.4 `impactOn` | Sonnet | `packages/remote/src/impact.ts` | after 4.2 (both in `packages/remote`) |
| 2.5 `coverOf` and typed ids | most capable | `packages/ssr/src/index.ts`, `packages/metakit/src/graph/structure.ts`, `packages/surface/src/graph.ts` | not 4.4 while it edits metakit's `index.ts` |
| 2.6 Review and walker deletions | most capable | as found | after 2.1–2.5 |

## Phase 3: `update` as declared transitions (done on todo-app)

**Goal.** An application states its Messages as one machine; every package takes it; hand-written arms keep working beside it.

**The gate, as measured.**

| Premise | Bar | Reading |
| --- | --- | --- |
| Most Messages can be declared | todo-app 21 of 25; domains-plus three in four (30 of 39) | todo-app 23 of 25 (24 of 26 at `31b10117c`); domains-plus 0 declared, 19 declarable today (below) |
| Their Commands can be declared | Half of those that send one | todo-app all |
| The declared form is not much longer | Median arm at most 1.5 times | Not counted |
| It does not slow the editor | Rule 21 | Unverified (3.034 s recorded without a command) |
| It does not cost a page much | Under 5,000 B brotli; 3,500 after the residualize and graph fixes | 165,083 → 173,086, not split |
| It buys something | A declared Message draws only the Surfaces it writes | True on todo-app |

**domains-plus's 39 Messages** (`src/client/message.ts`, answered in `src/client/app.ts`'s `own`):

| Group | Messages | Declarable | What it needs |
| --- | --- | --- | --- |
| No change, no Command | `CompletedFocusCartButton`, `CompletedFocusCartCloseButton`, `CompletedFocusFiltersButton`, `CompletedFocusTldFilterButton`, `CompletedRevealResultsListStart`, `CompletedScrollPage`, `CompletedNavigateInternal`, `CompletedLoadExternal`, `CompletedFocusSearchInput`, `CompletedDismissSearchKeyboard`, `CompletedScrollPageToTop`, `ClickedDomainsHome`, `ClickedSkipToMain` (13) | now | an empty transition |
| A Command only | `FocusedResultsList`, `PressedResultsListScrollKey`, `ClickedLink` (3) | now | emitted records; `ClickedLink` emits by `Expr.match` on the request's tag |
| Field writes | `UpdatedTldSearch` (set), `ClickedRemoveDomain` (`removeWhere` by name), `ClickedRemoveCartDomain` (the same, emitting a focus) (3) | now | today's ways |
| Opening or closing a sheet with a field set | `ClickedFilters`, `ClickedMobileAvailabilityOption`, `ClickedMobileSortOption`, `ClickedTldFilter`, `ClickedMobileTldOption`, `ClickedCart` (6) | after bout 3.3 | `Sheet` (`foldkit-mixins-ui`) with a machine, lifted at each sheet's path |
| A widget's own Message | `GotFiltersSheetMessage`, `GotTldSheetMessage`, `GotCartSheetMessage`, `GotResultsListMessage` (4) | after bout 3.3 | `Sheet` and `WindowList` machines, lifted |
| Upstream Listbox | `GotTldListboxMessage`, `GotAvailabilityListboxMessage`, `GotSortListboxMessage` (3) | no | upstream `@foldkit/ui/listbox` has no machine: confined opaque children |
| Search label | `SubmittedSearch` (1) | after bout 4.4 | `queryToMaybeDomainLabel` as a typed custom operation |
| Add from what was read | `ClickedAddDomain` (1) | after bout 3.6 | reading the quote from Remote's store path as a path, `insert` keyed by name |
| Search and address | `UpdatedSearch`, `PressedEscape`, `ClickedClearSearch`, `ClickedRetrySearch`, `ChangedUrl` (5) | no | they call the debounce's `update`, `Data.refresh` and `routeOf`: `Transition.opaque` with declared footprints |

Declarable now 19; after bouts 3.3, 4.4 and 3.6, 31 of 39, which passes three in four (30). Without the `Sheet` and `WindowList` machines it is 21: the gate then fails and the phase takes its smaller shape.

*If a premise fails,* declared transitions stay an opt-in for the Messages that fit, hand-written `update` stays what the guides teach first, and bouts 3.6 and 3.7 are limited to Form, Agent and Sync.

**Items.**

1. *Gate readings* (bout 3.1, part of 4.3). Byte cost split by cause: `node scripts/bundle-report.mjs examples/todo-app --json` per package and module at `70585f667~1`, `70585f667`, `92d3114e2`, `31b10117c` and HEAD, each delta attributed to a module; the cost of declaring alone by building HEAD's page once with `Declared.of` and once with the hand-written `update` kept in `examples/todo-app/test/` for `09a74a89b`'s replay (a temporary entry, deleted). Arm lengths: lines of each transition against the hand-written arm in that file, median. Compile cost: rule 21's command on todo-app with and without `src/machine.ts` imported (the temporary entry).
2. *Keyed children and moves* (bout 3.2). `Machine.each<Outer, Child, K extends keyof Child>(list: List<Outer, Child>, key: K, child: Machine<Child>)`: a child machine per element, its Message carrying the key typed by `Child[K]`; `Transition.move(list, key, toIndex)`: commutes with nothing, idempotent. Test first: todo-app's `RenamedTodo` as a child transition of a per-todo machine gives the same Models as today's `patch` over a seeded replay. Refusal: `[metakit] Machine.each: the element of "<path>" has no key field "<key>"; give the field each element is identified by.` Negative cases: a key not in `Child`; a child Message without the key.
3. *`Sheet` and `WindowList` machines* (bout 3.3). In `packages/mixins-ui`: each widget's `update` becomes a machine (`Sheet.machine`, `WindowList.machine`), its old `update` derived from it; their tests unchanged and green. Consumer: domains-plus's sheets and results list.
4. *domains-plus, first part* (bout 3.4): the 19 declarable now, through `Declared.of`, with `fallback` for the rest; seeded replay through the old and new `update`.
5. *domains-plus, second part* (bout 3.5): the sheet Messages, the widget Messages lifted, `SubmittedSearch` with the custom operation of bout 4.4; README lists each hand-written Message and why.
6. *Remote and Bundle take the machine* (bout 3.6). Remote: reducer steps are writers of the store path in `Graph.of`; a store row is readable as a path (`$.remote.store.Quote.<name>`) by a transition's guard; `Data.can` asks the machine. Bundle: `Bundle.make({ machine })` exposes it and a placement is `Machine.lift` at its path. Consumer: `ClickedAddDomain`.
7. *Form and Agent* (bout 3.7). Form: a submit is a transition and a control's disabled state is its guard (`foldkit-form/metakit`). Agent: `machineTools(composedMachine)` from `Declared.of`'s machine.

**Done when.** The six readings in the ledger with commands; domains-plus at 30 or more declared (opaque not counted) or the smaller shape recorded; both proof examples' seeded replays compare Models with `toBe` on no-ops; budgets within the ledger plus the measured cost of code every page with a machine runs; `Declared.of`'s `*.test-d.ts` covers the Message union, the Command table's exhaustiveness, `supply` and `fallback`, each negative alone; rule 21 holds.

| Bout | Model | Files | Beside |
| --- | --- | --- | --- |
| 3.1 Gate readings (part of 4.3) | Sonnet | ledger, a temporary entry | everything |
| 3.2 Keyed children and moves | most capable | `packages/metakit/src/machine.ts`, `transitionLists.ts` | not 4.9 (both in transitions) |
| 3.3 `Sheet`, `WindowList` machines | Sonnet | `packages/mixins-ui/src/sheet*.ts`, `windowList*.ts` | everything else |
| 3.4 domains-plus part 1 | Sonnet | `examples/foldkit/domains-plus/src/client/*` | after 3.1 |
| 3.5 domains-plus part 2 | Sonnet | the same | after 3.3, 3.4, 4.4 |
| 3.6 Remote and Bundle | Sonnet | `packages/remote/src/{domain,can}.ts`, `packages/bundle/src` | after part B's `packages/remote` bouts |
| 3.7 Form and Agent | Sonnet | `packages/form/src/metakit.ts`, `packages/agent/src/metakit.ts` | anything |
| 3.8 Review | most capable | as found | last |

## Phase 4: checked custom algebras, and maintained values

**Goal.** An application can teach every reader a new operation, a fold over it and a way of writing with it, and a false claim fails a test (part A). One mechanism keeps computed values up to date from row deltas, on the page and the server (part B; #580 and the server side of the #601 note's aggregates). One phase, because the update-or-rescan classifier is the main reader of fold properties.

**Depends on.** Phase 1 and Phase 2's structure. Part A edits `packages/metakit`, entity's operator files and `examples/metakit`; part B `packages/remote`, `packages/remote-drizzle`, `packages/durable`.

**Probes** (bout 4.1, done): the results are in [the operations note](./metakit-checked-operations-DESIGN.md) and "Facts the probes settled" below.

### Part A: checked custom algebras

The sketches below show shape; the note holds the compiled signatures, the error texts and the reasons for each change from the plan's first text, and bouts 4.4 to 4.12 build the note's.

**A1. The typed operation** (`packages/metakit/src/operation.ts`, subpath `metakit/operation`).

```ts sketch
export interface Operation<
  Id extends string, V extends number,
  Args extends ReadonlyArray<Schema.Top>, R extends Schema.Top,
  N extends 'strict' | 'own',                     // the null rule: an implementation's argument types depend on it
  Claims extends OpClaims<Args, R> = {},
> {
  <const A extends { readonly [K in keyof Args]: ExprInput<never, Schema.Schema.Type<Args[K]> | null> }>(...args: A):
    Expr<EnvOfAll<A>, Schema.Schema.Type<R> | null>
  readonly descriptor: ForeignOp & { readonly args: Args; readonly result: R; readonly claims: Claims }
}

export const define: <
  const Id extends string, const V extends number,
  const Args extends ReadonlyArray<Schema.Top>, R extends Schema.Top,
  const N extends 'strict' | 'own',
  const Claims extends OpClaims<Args, R> = {},
>(spec: {
  readonly id: Id & NotCorePrefixed<Id>
  readonly version: V
  readonly args: Args
  readonly returns: R
  readonly nulls: N
  readonly claims?: Claims
}) => Operation<Id, V, Args, R, N, Claims>

type OpClaims<Args, R> = {                        // a claim that does not fit the shape is typed as a sentence, not never
  readonly identity?: Binary<Args, R> extends true ? { readonly value: Schema.Schema.Type<R>; readonly side: Side } : Misfit
  readonly absorbing?: Binary<Args, R> extends true ? { readonly value: Schema.Schema.Type<R>; readonly result: Schema.Schema.Type<R>; readonly side: Side } : Misfit
  readonly idempotent?: SameType<Args, R> extends true ? true : Misfit
  readonly commutative?: Binary<Args, R> extends true ? true : Misfit
  readonly associative?: Binary<Args, R> extends true ? true | { readonly unlessRefused: true } : Misfit
  readonly invertible?: Args extends readonly [infer A, infer B]
    ? { readonly inverse: 'self' | Operation<string, number, readonly [R, B], A & Schema.Top, any> } : Misfit
  readonly monotone?: { readonly [K in keyof Args]: 'up' | 'down' | 'none' }
}
```

`Binary<Args, R>` holds when `Args` is a pair of one Schema and `R` is that Schema; `SameType` covers the unary case. `Node.foreign` and `build.call` with a foreign op leave the public API (breaking). Evaluation checks each argument against its Schema before the implementation runs and the answer after (refusal `ill-typed`); `define` also refuses a Schema that decodes from another form, a non-number, boolean or text argument, and a claimed value its Schema does not admit. Refusals: `[metakit] Operation.define: "num.half" is under the core prefix "num."; choose an id outside bool., eq., null., ord., num., str., arr., rows.`; `[metakit] Operation.define: the version of "flags.or" is 0; a version is a positive integer, and a changed meaning takes a new one.`

**A2. Implementations and lowering** (`operation.ts`, `operationSql.ts`).

```ts sketch
export const implement: <O extends AnyOperation>(op: O,
  run: (...args: RunArgs<O>) => Schema.Schema.Type<O['descriptor']['result']> | null) => Implementation<O>
                                                                   // refuses by throwing; nulls only where nulls: 'own'
export const implementations: (name: string, ...is: ReadonlyArray<Implementation<AnyOperation>>) =>
  ForeignImplementations                                           // opaque; the name is for reports and obligations
// metakit/operation/sql, so no page loads it; one lowering serves metakit/sql and metakit/drizzle
export const lowering: <O extends AnyOperation>(op: O, lowerings: {
  readonly sqlite?: (...args: ArityOf<O, SqlPiece>) => SqlPiece
  readonly postgres?: (...args: ArityOf<O, SqlPiece>) => SqlPiece
  readonly aggregate?: { readonly sqlite?: (arg: SqlPiece) => SqlPiece; readonly postgres?: (arg: SqlPiece) => SqlPiece }
}) => SqlLowering<O>
export const lowerings: (...ls: ReadonlyArray<SqlLowering<AnyOperation>>) => ForeignLowerings
// piece`(${a} | ${b})`: a tagged template whose holes are only other pieces
```

An aggregate lowering is wrapped in `coalesce(…, identity)`: Postgres's `bit_or` and `bit_xor` give null over no rows and SQLite has neither. Refusals: `[metakit] evaluate: no implementation of "flags.or@1" was given; pass Operation.implementations(…, Operation.implement(flagsOr, …)) to this reader.`; `[metakit/sql] no postgres lowering of "flags.or@1"; declare one with lowering(flagsOr, { postgres }) from metakit/operation/sql.`

**A3. Generated checks and obligations** (`packages/metakit/src/operationChecks.ts`, exported from `metakit/conformance`).

```ts sketch
export const checkOperation: <O extends AnyOperation>(op: O, implementations: ForeignImplementations,
  options?: { readonly seed?: number; readonly sql?: ReadonlyArray<ParityRunner> }) => OperationReport
export const lawObligations: (from: Machine<any, any> | Expr | ReadonlyArray<AnyOperation>,
  implementations: ReadonlyArray<ForeignImplementations>) => ReadonlyArray<WalkObligation>
```

Samples: the awkward values each argument Schema admits (`Schema.is` over metakit's set), the ends of a checked range (read from the check's `representation`), 200 seeded values per argument (associativity: 1,000 triples), null and a refusal for a strict operation. A failure: `[metakit] flags.xor@1 claims idempotent, and it does not hold: flags.xor(5, 5) is 0, not 5. Remove the claim, or narrow the argument Schemas.` Obligations are named `law:<id>@<version>/<property>/<implementations name>` (parity: `law:flags.or@1/parity/postgres`), are `WalkObligation`s with no steps, and a passing `checkOperation` records their discharges. Budget: under 1 s per operation in memory (generation alone is 4 ms; running the claims is unmeasured, bout 4.6 meets the budget); SQL parity is one statement per dialect over the recorded calls, since equality on exactly those calls carries every claim's equations to the dialect.

**A4. Readers act on claims** (`ops/residualize.ts`, `ops/judge.ts`, `ops/laws.ts`, `abstract/rowOf.ts`). Partial evaluation and the page judge read a custom call's `identity`, `absorbing`, `idempotent` from its descriptor. The checker takes `{ foreign?: ForeignImplementations }`; with it, a call claiming `monotone` is bounded by its implementation at the interval's ends, without it Unknown. An identity, absorbing or idempotent claim rewrites only where the dropped operand is shown to lie within the argument Schema (the same AST, or every check it carries, or the result of an operation whose result Schema does); otherwise the call stays (rule 6). The checker's interval ends must lie within the argument Schemas, else Unknown. Test first: `Abstract.checkInvariant` of `clamp(x, 0, 10) <= 10` is Unknown today and True with the implementation.

**A5. A fold over a checked operation** (`node.ts` adds `RowsFold` `'reduce'` carrying `op: ForeignOp | Op`; `ops/rows.ts`, `properties.ts`, `sqlLowering.ts`).

```ts sketch
export const reduce: <L extends NullableItems, O extends CommutativeMonoid, V, T = true>(
  list: L, op: O, value: (each: Each<ElementOf<L>>) => V, test?: (each: Each<ElementOf<L>>) => T) => Expr<…, ResultType<O>>
// like Arr.sum: Arr.reduce($.roles, flagsOr, each => each.bits)
// CommutativeMonoid = AnyOperation whose Claims has commutative: true, associative: true (not unlessRefused) and identity on both sides
```

In memory the answer over no element is the identity and a null contribution is skipped, as `sum` and SQL's aggregates do. `foldProperties` for a `reduce` derives from the operation (identity, invertible from its inverse, idempotent). SQL lowers through the operation's `aggregate` lowering, else refuses: `[metakit/sql] Arr.reduce over "flags.or@1" has no sqlite aggregate; declare lowering(flagsOr, { aggregate: { sqlite } }) or read the rows into memory.` Definition-time refusal for a runtime-built op without the claims: `[metakit] Arr.reduce: "flags.andNot@1" does not claim commutative and associative with an identity, so its answer over rows would depend on their order.` Test: the classifier's answer for `reduce(num.add)` equals its answer for `sum`.

**A6. `combine`** (`transitionLists.ts` or a new `transitionCombine.ts`, `ops/ways.ts`, `transitionCommutes.ts`).

```ts sketch
export const combine: <State, Input, V, Supplied = NoSupplied>(
  target: Path<TransitionEnv<State, Input, Supplied>, V>, op: BinaryOver<NonNullable<NoInfer<V>>>,
  value: ExprInput<TransitionEnv<State, Input, Supplied>, NoInfer<V>>)
  => WriteEquation<State, Input, V, Supplied, 'combine'>
```

`WayOfWriting` gains `'combine'`; its `writeProperties` row: two combines of one operation (same id and version) commute when it claims commutative and `associative: true` (with `{ unlessRefused: true }`: Unknown, since the checker cannot range a custom result), and are idempotent when it claims idempotent and `associative: true` (conditions `'same-operation'`, `'idempotent-operation'`). `add` stays its own way: `num.add` is associative only unless refused, and a core operation is not an `Operation`. `Transition.commutes` and `Transition.idempotent` read it; `replayOver` replays a pending combine over a newer value when the page holds the implementation, else treats it as a `set`; `PendingPatch` gains `combines` beside `adds` (`packages/remote/src/ledger.ts`); Sync convergence reads it. Test first: two `combine(flagsOr)` on one path: `commutes` True, `idempotent` True; `combine(flagsAndNot)` twice: Unknown with a walk. Mutation: the row claiming commutes for any operation.

**A7. Entity's operators on it** (`packages/entity/src/expr/operator.ts`, `expr/primitive.ts`, `law.ts` deleted, `operators.ts`, `conformance/operator.ts`). `Expr.operator` builds on `Operation.define`, keeping Entity-field arguments and its `collation` rule. The nine law kinds:

| Entity kind | Reaches metakit today | Becomes |
| --- | --- | --- |
| `Commutative` | yes | `commutative` |
| `Idempotent` | yes | `idempotent` |
| `Identity` | yes | `identity` |
| `Absorbing` | yes | `absorbing` |
| `Associative` | no (dropped in `propertiesOf`) | `associative` |
| `Monotonic` (direction, position) | no | `monotone`, one direction per argument, the rest absent |
| `Inverse` (`op(a, other(a)) = identity`, unary `other`) | no | `invertible` with a binary inverse; an operator declaring the unary form is refused with the rewrite named |
| `Distributes` | no | deleted: no reader |
| `PreservesCollation` | no | deleted: collations are fold operations (`str.lowerAscii`) placed by entity's constructors |

`Law.within` goes too: narrow the argument Schemas. `Operators.implement`, the memory and Drizzle tables and `Conformance.laws` become metakit's `implement`, `implementations`, `lowering`, `lowerings` and `checkOperation`; entity's names are deleted (breaking, each listed in the upgrade guide with its compiler error, the table in the operations note). `Evidence.Proven` is deleted and counts for nothing; `Evidence.Tested` becomes a registry discharge. A defined operator (`definedAs`) is its body and declares no claims (refused if it does); the kernel's `number.add`, `number.subtract` and `text.startsWith` declare nothing of their own, their rows in `opProperties` say what they keep. Test: entity's existing operator tests pass on metakit's checks; a declared `Distributes` fails to compile.

**A8. The first consumer** (`examples/metakit/src/permissions.ts`, `test/permissions.test.ts`, `test/permissions.mutations.ts`, `test/permissions.test-d.ts`). `Flags = Schema.Int.check(Schema.isBetween(0, 2147483647))`; `flags.or` (commutative, associative, idempotent, identity 0), `flags.xor` (commutative, associative, identity 0, its own inverse), `flags.andNot` (none), `flags.clamp` (monotone up, none, none; `'none'` positions are single values); the domain is 0 to 2^31−1 because JavaScript's bitwise operators are 32-bit and SQLite's 64-bit; a machine granting and revoking through `combine`; a rule `Abstract` bounds; a maintained total (part B); SQL on SQLite and PGlite. Postgres's `bit_or` aggregate and SQLite's none show a dialect refusing by name; xor lowers to `a # b` on Postgres (its `^` is a power) and `(a | b) - (a & b)` on SQLite (no `^`).

**Typing negative cases** (each alone, in `packages/metakit/test/operation.test-d.ts`): identity of the wrong type; `commutative` on `(Int, Text)`; an inverse of the wrong signature; a `monotone` tuple of the wrong length; an implementation of the wrong arity, and of the wrong argument type; a call with a text argument where an integer is taken, the error on that argument; `reduce` over `flags.andNot`; `combine` with an operation whose argument is not the path's type; id `'num.half'`.

**Bytes and compile cost.** A page naming no custom operation is byte-for-byte unchanged; `operationChecks.ts` and `operationSql.ts` are absent from every page (`publishedBuild.test.ts`); a page judging with a custom operation carries its descriptor and claims (expected under 300 B brotli per operation, measured in bout 4.12). The typed declaration costs at most 164 instantiations, and with one call and one implementation at most 684, measured as in the note's probe 3 (an entity operator costs 213 and 909 today).

### Part B: maintained values

**B1. Row deltas** (`packages/remote/src/maintained/deltas.ts`). `type RowDelta<Row> = { readonly key: EntityKey; readonly before: Option<Row>; readonly after: Option<Row>; readonly source: 'server' | 'optimistic' | 'restored' }`, emitted per store step from `storeSteps.ts`. A live echo of a pending write is not counted twice (test first: a pending write then its echo gives one delta).

**B2. The mechanism** (subpath `foldkit-remote/maintained`; `aggregate.ts` moves under it, breaking the import path).

```ts sketch
export const Maintained: {
  fold: <Row, O extends FoldKind | CommutativeMonoid>(query: QueryOf<Row>, fold: O,
    each?: (row: Each<Row>) => Expr<…>) => Definition<Row, FoldResult<O>>
  list: <Row, K extends keyof Row>(query: QueryOf<Row>, options: { readonly order: OrderBy<Row, K>; readonly where?: … }) =>
    Definition<Row, ReadonlyArray<Row>>
  join: <Row, Rel extends RelationOf<Row>>(query: QueryOf<Row>, through: Rel) => Definition<Row, …>
  derive: <Model, A>(reads: Projection<Model, A>) => Definition<Model, A>
  value: <A>(definition: Definition<any, A>, model) => A          // keeps identity while nothing it reads changed
}
```

Order keys are typed by the row's fields. Test first: a Surface over one row of a maintained list is not drawn again when another row changes (render counter).

**B3. A pending write on a large list.** `insertsPlaced` (`layers.ts`) calls `placeIn` (`placement.ts`), which scans and copies each segment per inserted row (about 400 ms at 100,000 rows). Placement uses the order index: a sorted array of keys searched by binary search, rebuilt only on a rescan. Test first: placement evaluations counted for one insert into 100,000 rows: 17 or fewer, today 100,000.

**B4. Coverage** (`maintained/coverage.ts`). `covers(held: Query, asked: Query): Verdict` by `Abstract.checkGoal` on `asked.where ⇒ held.where` at definition; Unknown asks the server. Test: negative cases per form (a held `price < 10` does not cover `price < 20`; a held `status = 'a'` does not cover `status in ('a','b')`).

**B5. Offline as-of reads** (`maintained/asOf.ts`). A retained result carries `completeAsOf: Revision`, apart from "current", and never restores a server cursor. Test: a restored result after reconnect is shown as of R and read again.

**B6. Indexes.** An order index (B3) and a reverse index for joins (B10) are built for a maintained value whose source has more than 400 rows, and not below, from the benchmark at 25, 100, 400, 5,000 and 100,000 rows (`packages/remote/test/maintained.bench.ts`): the threshold is moved to wherever the benchmark shows the index first pays, and recorded. A page that maintains nothing carries neither (publishedBuild row).

**B7. On the server, with Phase 5 item 3** (`packages/remote-drizzle/src/index.ts`, `storeOf`; `packages/durable/src/journal.ts`). A derived member defined by a row aggregate can be stored: the writer updates the parent's total in the transaction that writes the child. On Postgres it first runs `select … for update` on the parents in id order and declares `parentRowLock: true`, which makes an aggregate data rule enforceable there. A Durable Object keeps the same totals in its storage. D1 keeps refusing an aggregate data rule: its writer judges none in its statement. Refusal on SQLite/D1: `[foldkit-remote-server] the rule "neverOverdrawn" of Account sums its Entries and needs parent-serialized; D1 (serializable per statement) judges it from a read first. Judge it on Postgres with the parent lock, or as a guard in the statement.` Test: two concurrent overdrawing transfers on the CI Postgres leave one refused; two transfers in opposite directions do not deadlock.

**B8. Change replay** for the Durable Object journal (#580's sixth package): a reconnecting client receives the operations after its cursor. Postgres and D1 are deferred: no ordered change log there.

**B9. Dependent queries** (#606, `packages/remote/src/domain.ts`). A query whose parameters come from another read is asked once `queryReadiness` says its parameters are bound. Test first: a cascading choice (a state, then its cities) sends no query with an unbound parameter. Consumer: `examples/reference`'s filters, or a new fixture in `packages/remote/test`.

**B10. Update or rescan** (`maintained/classify.ts`).

```ts sketch
export type Classification = Data.TaggedEnum<{
  Update: { readonly by: 'fold-invertible' | 'fold-insert-only' | 'row-local-filter' | 'sorted-placement' | 'reverse-index' | 'derived-reads' }
  Rescan: { readonly reason: 'fold-not-invertible-on-delete' | 'body-reads-changed-path' | 'second-hop' | 'nested-rows' | 'order-key-not-unique' | 'unknown-reads' }
}>
export const classify: <A>(definition: Definition<any, A>) => Classification
```

Rules as before: a fold applies an insert from the row when commutative and associative, a delete when also invertible, otherwise asks the order index or rescans; a filter judges a row alone when its test reads only the element and unchanged values; a sorted list also needs an order key over the element ending in a unique tie-break; a join reaches pointing rows through the reverse index; a second hop or a second `Rows` rescans; a derived value recomputes when the graph says a path it reads was written; `reduce` folds by the same rules. In development each maintained value logs its class once: `[foldkit-remote] maintained "cartTotal" rescans on delete: min has no inverse.` A report test lists every rescanning value of the proof examples with its reason.

**Hazards and tests.**

- *A custom claim is false:* bout 4.6's checks; mutations `flags.or` invertible, `flags.xor` idempotent, `flags.andNot` commutative, each killed; removing the check call turns the obligations test red.
- *A claim holds in memory and not in SQL:* the parity runner.
- *A changed declaration under one version:* `Operation.describe` and `Operation.compare` (the note) give the refusal `[foldkit-remote] the server describes flags.or@1 differently from this page (claims differ); bump the version where the meaning changed.` Nothing carries descriptions between a server and a page yet, so until Phase 9's `Language.describe` they have their own tests and no caller in a package.
- *A maintained result drifts:* seeded differentials against recomputation after each delta over overlapping optimistic layers, a live echo while pending, a failed write, reconnect and restore; mutations `min` invertible, a body called row-local when it reads a changing parameter.
- *A partial list presented as complete:* B4's negative cases.
- *The lock deadlocks:* opposite-direction transfers on CI Postgres.

**Done when (measured).** Part A: every claim of the permissions domain has a passing check and its mutation killed; parity on SQLite and PGlite; `combine(flagsOr)` pairs commute and are idempotent, `combine(flagsAndNot)` pairs are Unknown with a walk; the obligations test fails when a check call is removed; the negative cases exist and a type mutation turns one red; the publishedBuild rows hold; entity's `Law` is gone with its operator tests green; every refusal above has a text test. Part B: one changed row in a maintained list of 100,000 evaluates that row only; a pending write on it is placed in under 16 ms on the ledger's machine (about 400 ms today); the data grid's redraw readings and the 25-row pages' budgets at or below the ledger; one of two overdrawing transfers refused on Postgres; the rescan report lists every rescanning value. Rule 21 holds; `examples/metakit`'s count recorded before 4.4 and within 10% after 4.12.

**Review.** Adversarial: a sampling gap that lets a false claim pass, a reader acting on an unchecked claim, a delta sequence that double-counts or loses a row.

| Bout | Model | Files | Beside |
| --- | --- | --- | --- |
| 4.1 Design note and the three probes (done, `109e52eff`) | most capable | the note only | 4.2, 4.3 |
| 4.2 Row deltas and the mechanism (B1, B2) | most capable | `packages/remote/src/maintained/*`, `aggregate.ts` | 4.1, 4.3 |
| 4.3 Phase 2 and 3 readings (2.1, 3.1) | Sonnet | ledger | 4.1, 4.2 |
| 4.4 Typed operation (A1) | most capable | `packages/metakit/src/operation.ts`, `node.ts`, `ops/core.ts` | part B; not 1.1 |
| 4.5 Implementations and lowering (A2) | Sonnet | `operation.ts`, `operationSql.ts`, `sqlRender.ts`, `ops/eval.ts` | part B |
| 4.6 Generated checks and obligations (A3) | most capable | `operationChecks.ts`, `conformance.ts`, `temporal.ts` | part B |
| 4.7 Readers act on claims (A4) | Sonnet | `ops/residualize.ts`, `ops/judge.ts`, `abstract/rowOf.ts` | part B |
| 4.8 `reduce` (A5) | Sonnet | `node.ts`, `ops/rows.ts`, `properties.ts`, `sqlLowering.ts` | part B |
| 4.9 `combine` in metakit (A6) | most capable | `transitionCombine.ts`, `ops/ways.ts`, `transitionCommutes.ts` | not 3.2 |
| 4.10 `combine` in Remote and Sync (A6) | Sonnet | `packages/remote/src/{replay,ledger}.ts`, `packages/sync/src/convergence.ts` | after part B's Remote bouts; not 2.3 |
| 4.11 Entity's operators (A7) | Sonnet | `packages/entity/src/expr/*`, `law.ts`, `operators.ts`, `conformance/operator.ts` | part B |
| 4.12 Permissions example (A8) | Sonnet | `examples/metakit/*` | after 4.4–4.9 |
| 4.13 Placement by the order index (B3) | Sonnet | `layers.ts`, `placement.ts` | part A |
| 4.14 Coverage (B4) | most capable | `maintained/coverage.ts` | part A |
| 4.15 Offline as-of (B5) | Sonnet | `maintained/asOf.ts`, `persist.ts` | part A |
| 4.16 Indexes and benchmark (B6) | Sonnet | `maintained/index*.ts`, bench | after 4.13 |
| 4.17 Server totals and the Postgres lock (B7) | most capable | `packages/remote-drizzle/src/index.ts`, `packages/durable/src/journal.ts` | part A |
| 4.18 Durable Object change replay (B8) | Sonnet | `packages/durable/src` | after 4.17 |
| 4.19 Dependent queries (B9) | Sonnet | `packages/remote/src/domain.ts` | part A |
| 4.20 Fold kinds on the mechanism | Sonnet | `maintained/fold.ts` | after 4.2 |
| 4.21 Lists and joins on the mechanism | Sonnet | `maintained/list.ts`, `join.ts` | after 4.20 |
| 4.22 `classify` (B10) | Sonnet | `maintained/classify.ts` | after 4.8, 4.21 |
| 4.23 The rescan report and the differentials | Sonnet | `packages/remote/test/maintained*.ts` | after 4.22 |
| 4.24 Review | most capable | as found | last |

## Phase 5: store capabilities and orderings (done)

Reviewed three times; open findings are deep review 2's L3 (a doc claim on `EntityWriter.checksTargets`, left while another session edits `packages/remote-server/src/index.ts`) and deep review 3's L1 (`superseded` strips `adds`, costing a safe extra read) and M3 (a target's existence is visible through a link to a hidden row; recorded as matching Postgres foreign keys, with a `Link` rule as the guard). The store-declaration fixes of the first revision of this plan landed in `ab41873a8`.

| Bout | Model | Files | Beside |
| --- | --- | --- | --- |
| 5.1 L3's doc fix; L1 kept as is with a test pinning the safe extra read; `foldkit-durable`'s `StoreCapabilities` held equal to metakit's by a type test (`packages/durable/test/store.test-d.ts`) | Haiku | `packages/remote-server/src/index.ts` (one doc comment), `packages/remote/test`, `packages/durable/test` | when the other session leaves `remote-server` |

## Phase 6: resume without the runtime

**Goal.** A server-drawn page answers a declared press before the runtime loads, ships only the data its changeable parts read, keeps what a person did before any script ran, and hands over without rebuilding an element. Issues #436, #472, #607, #608; asked for in full on #432.

**The baseline** (`metakit-phase-6-DESIGN.md`, domains-plus, CPU slowed four times): 212,869 B compressed script before the first press; 1,474 ms blocking; takeover at 1,333 ms; first press to next paint 104 ms, in the cart at 280 ms (range 123 ms); envelope 10,741 B, 857 B compressed.

**The gate** (bout 6.1): probes 2 and 3 as throwaway code in `examples/foldkit/domains-plus` behind `FOLDKIT_BINDER_SPIKE=1`, committed to no package.

| Premise | Measurement | Holds if |
| --- | --- | --- |
| The binder fits | A script that decodes one Message, runs its transition, writes one anchor, by `clientBudget` (`scripts/bundle-budget.mjs`) | Under 20 kB brotli with the envelope reader |
| Foldkit adopts a changed page | Press "Add to cart" in the spike, then hydrate; `rebuiltElements` (`scripts/phase6-baseline.mjs`) | Zero rebuilt; the cart keeps the binder's count |
| The binder has work | domains-plus's declared on-screen presses that send no Command and change only anchors | The cart and filter presses, after Phase 3 |

*If a premise fails,* items 2, 6 and 7 are built; the binder, bindings and hand-over are not.

**Items.**

1. *Probe 1* (bout 6.2): does a region Foldkit holds as trusted HTML keep another script's changes across later renders? A browser test in `packages/ssr/test/trustedRegion.browser.test.ts`.
2. *The live set* (bout 6.3, `packages/ssr/src/liveSet.ts`, server-only). `liveSet(plan, graph): { messages: ReadonlySet<Tag>; writes: ReadonlyArray<Path>; reads: ReadonlyArray<Path> }`: the Messages bound to elements, closed over `GraphEdge.Sends`; the paths they write (from `Graph.of`); the paths they and the changeable values read; `deadReaders` marks readers no live Message reaches. Only `reads` goes in the envelope. A new cover kind `'unchanging'`. In development the full Model is resumed and a read of an omitted path reported: `[foldkit-ssr] the Surface "Cart" read "remote.store.Quote.acme.com", which the live set left out of the envelope; a Message that writes it is not bound on this page, or its footprint is undeclared.` Test: domains-plus's envelope shrinks and every Surface still covered.
3. *Bindings and anchors* (bout 6.4, `packages/ssr/src/binding.ts`). `Binding.text(expr)`, `Binding.attribute(name, expr)`, `Binding.shown(expr)`, `Binding.order(listPath, key)`, declared per Surface as a record whose keys are the binding ids (`Bindings<Model, Keys extends string>`); the server writes `data-fk-anchor="<key>"`. A key used in the view and not declared does not compile.
4. *The binder* (bouts 6.5, 6.6, `packages/ssr/src/binder.ts`, subpath `foldkit-ssr/binder`). `Binder.start(options: { readonly manifest: BinderManifest<Tag>; readonly envelope: Envelope; readonly wake: () => Promise<void> })`: one delegated listener; per press the Message decoded by its Schema, its transition loaded, applied, anchors written as text. It answers only declared Messages with no emitted record whose written paths are all bound; anything else calls `wake`. A Message that fails decode is dropped with `[foldkit-ssr/binder] the element's "AddedDomain" payload did not decode: <issue>; nothing was sent.`
5. *The hand-over* (bout 6.7): the runtime loads on idle or at the first Message the binder cannot answer, starts from the binder's state through `SSR.hydrate`'s `init` substitution, takes the listeners; a press during the load is held and sent once.
6. *Input before boot* (bout 6.8): `KeepTyped` extends to scroll position, open `<details>` and every control the binder touched.
7. *Static parts* (bout 6.9): a region no live Message reaches is drawn into the HTML, its data left out, not drawn by the client; `pruneStatic` computes its bindings' values from the static Model. Consumer of `deadReaders` and `pruneStatic`.

**Needs upstream, and the fallback.**

| Need | Today | Upstream | Fallback |
| --- | --- | --- | --- |
| Leave data out of the envelope | Yes, under `SSR.static` | No | n/a |
| Skip drawing a static region | Yes | Cheaper adoption (request A) | Foldkit parses and compares it |
| Answer before the runtime | Our script | No | n/a |
| Hydrate after the binder | Believed (probe 2) | Hydrate from a Model (proposal 3) | `SSR.hydrate`'s `init` substitution |
| Keep a typed field | Partly | Leave a control alone (proposal 6) | Save and restore |
| Update inside a region after hand-over without drawing it | No | A subtree Foldkit does not own (request B) | Foldkit draws it |
| No virtual tree (#607) | No | A replaceable renderer (foldkit#1871, #1872) | Binder, then Foldkit with skips |

**The requests, as they would be sent** (proposals 3 and 6 are drafted in `docs/upstream-foldkit-ssr.md`):

> *Request A, a question.* A server-rendered region passed as trusted HTML is parsed and compared at hydration. For a region the application declares unchanged since the server drew it, would you accept an opt-in that adopts the served element as it is? We measured hydration of such regions on a 746-element page and can share the numbers. The Model stays the single source of truth: the opt-in says only that this subtree was drawn from it already. (Drafted by an AI assistant on the maintainer's behalf.)

> *Request B, a comment on foldkit#1871.* One more use for running a view with its own dispatch frame: a subtree that a small script updated before the runtime loaded, from the same Model and through the same Messages. After hydration that subtree needs to be either adopted without a redraw or left to an owner the application names. Is either in scope for this issue? (Drafted by an AI assistant on the maintainer's behalf.)

**Replaces or deletes.** `foldkit-ssr/loader` becomes the binder's smallest case (breaking). The hand-picked resume `state` list is computed.

**Hazards and tests.** Client draws differently: `rebuiltElements` zero. A left-out value changes: item 2's development check; a region with a handler or live-set read refused as static (`BindingInStaticRegion`). Binder and runtime disagree: every declared Message of domains-plus through both, Models and anchor text compared. Stale value after hand-over: e2e press, load, press (`examples/foldkit/domains-plus/e2e/binder.e2e.ts`). Forged Message: decode, text only, security review. First undeclared press: measured beside script at load. Navigation to an unserved page: e2e.

**Done when (same script, two runs).** On domains-plus: script before the first press under 20 kB compressed; blocking under 200 ms; a declared press at rest no slower than 403 ms (280 + 123); zero rebuilt elements; envelope no larger than 10,741 B; first undeclared press reported; a binding key not declared fails to compile; each refusal above has a text test. A miss changes the default, not the feature.

| Bout | Model | Files | Beside |
| --- | --- | --- | --- |
| 6.1 Gate: binder spike | most capable | domains-plus behind a flag, not committed | Phase 9 |
| 6.2 Probe 1 and the design note | most capable | `docs/design/metakit-resume-DESIGN.md`, one browser test | Phase 9 |
| 6.3 The live set | most capable | `packages/ssr/src/liveSet.ts` | Phase 9 |
| 6.4 Bindings and anchors | Sonnet | `packages/ssr/src/binding.ts` | after 6.3 |
| 6.5 Binder: listener, decode, apply | most capable | `packages/ssr/src/binder.ts` | after 6.4 |
| 6.6 Binder: anchor writes, manifest | Sonnet | the same | after 6.5 |
| 6.7 Hand-over | Sonnet | `binder.ts`, `hydrate.ts` | after 6.6 |
| 6.8 Input before boot | Sonnet | `packages/ssr/src/keepTyped.ts` | after 6.3 |
| 6.9 Static parts | Sonnet | `packages/ssr/src/static.ts` | after 6.3 |
| 6.10 domains-plus on the binder | Sonnet | `examples/foldkit/domains-plus` | after 6.7 |
| 6.11 End-to-end tests | Sonnet | `e2e/binder.e2e.ts` | after 6.10 |
| 6.12 Measurements | Sonnet | ledger | after 6.11 |
| 6.13 Security review of the binder | most capable | as found | after 6.7 |
| 6.14 Hand-over and live-set review | most capable | as found | after 6.12 |
| 6.15 Fixes from the reviews | Sonnet | as found | last |

## Phase 7: script cut along Messages

**Goal.** The page loads the script a press needs when it needs it.

**The gate** (bout 7.1, Sonnet), with `measure` in `scripts/bundle-report.mjs` after Phase 6:

| Premise | Measurement | Holds if |
| --- | --- | --- |
| The runtime is out of the start path | Script before the first press | Phase 6's binder shipped |
| There is enough to cut | Transitions and Command code against script before the first press | At least a quarter |

*If a premise fails,* cut by Surface and child machine only, keep item 4, build no per-Message chunks.

**Items.**

1. *Cuts.* Per Surface (`Bundle.lazy`); per child machine (`Machine.compose({ cart: () => import('./cart.machine') })`, a lazy child); per Message (`Transition.lazy(() => import('./addDomain'))`, the transition and its anchor writers; the Effects of its Commands in a second chunk the runtime loads).
2. *The manifest* (`packages/ssr/src/vite/manifest.ts`, plugin in `foldkit-ssr/vite`). `type Manifest<Tag extends string> = { readonly [T in Tag]: { readonly chunk: string; readonly with: ReadonlyArray<string> } }`, written into the server's plan; every tag has exactly one home by type and by test.
3. *What loads when.* At start the binder and manifest; on idle the chunks of Messages bound on screen; on pointer over, focus or touch start the chunk; on the press, wait up to 3 s.
4. *A chunk that fails.* A held form is released to the browser's submission; any other press retried once, then the control marked failed (`aria-disabled`, a declared fallback); nothing sent twice.
5. *After hand-over.* The runtime's `update` takes arms as chunks arrive; a Message for an unloaded arm waits, as `Bundle.lazy` does.

**Replaces.** `runtimeChunk` (`packages/ssr/src/runtimeChunk.ts`), absorbed by the plugin (breaking for domains-plus's Vite config).

**Done when.** "Add to cart"'s chunk under 3 kB compressed, loaded on intent; total script within 3% of 212,869 B; a press before its chunk happens exactly once (e2e holding the request); a failed chunk handled (e2e failing it, as `loader.e2e.ts`); the manifest's negative type cases (a missing tag, a tag twice).

| Bout | Model | Files | Beside |
| --- | --- | --- | --- |
| 7.1 Gate | Sonnet | ledger | Phase 9 |
| 7.2 Lazy child machines and lazy transitions | most capable | `packages/metakit/src/machine.ts`, `transition.ts` | Phase 9 (not its metakit bouts) |
| 7.3 Manifest contract and plugin | most capable | `packages/ssr/src/vite/manifest.ts` | after 7.2 |
| 7.4 Loading policy in the binder | Sonnet | `binder.ts` | after 7.3 |
| 7.5 Failure handling | Sonnet | `binder.ts` | after 7.4 |
| 7.6 Runtime takes arms as they arrive | Sonnet | `packages/surface/src/declared.ts` | after 7.3 |
| 7.7 domains-plus cut by Message | Sonnet | domains-plus | after 7.6 |
| 7.8 End-to-end tests | Sonnet | `e2e/chunks.e2e.ts` | after 7.7 |
| 7.9 Measurements | Sonnet | ledger | after 7.8 |
| 7.10 Review of ordering | most capable | as found | last |

## Phase 8: examples and documents on the new base

**Goal.** What a reader runs and reads shows the new base.

**Items.** (1) The proof examples move with each phase. (2) In order: `examples/reference`, `chirp`, `registry`, `cms`, `pages`, `writes`, `writes-domain`, then `cloudflare`, `auth`, `entity`, `remote`, `sync`, `todo`; each declares its Messages, turns on the write verifier in its tests, records its budget and rule 21's count where it is one of the three. A widget-only example moves only where it calls a deleted API. (3) Guides, one page per job: declare your `update`; see what a Message can affect; keep a list up to date; define an operation and check its laws; make a page answer before the framework loads; cut script by Message; hold a rule to a store; write your own language, store or protocol. An upgrade guide for Phases 1 to 4's breaks, each with the compiler error and a before and after. (4) The skill: `SKILL.md` and the entity, metakit, surface, remote and ssr references. (5) The site and a post.

**Done when.** No example calls a deleted API; every snippet compiles (`node scripts/docs-check.mjs` or a temporary `*.test-d.ts`); every guide passed a cold reader whose report and fixes are linked from the bout; the site lists them.

| Bout | Model | Files | Beside |
| --- | --- | --- | --- |
| 8.1–8.4 Examples, two or three per bout, in the order above | Sonnet | one example each | each other |
| 8.5–8.8 Guides, two per bout, each with a Sonnet cold reader | Sonnet | `docs/`, `packages/*/docs/` | examples |
| 8.9 Skill and site | Sonnet | `skills/foldkit-plus/`, `examples/site/src/catalog.ts` | after 8.5–8.8 |
| 8.10 Post | Sonnet, reviewed by the most capable model | `examples/site/public/blog/` | last |

## Phase 9: building on the base

**Goal.** An application writes its own typed language, stores and protocols on metakit, treated by every reader as ours.

1. **A domain language** (`packages/metakit/src/language.ts`, subpath `metakit/language`).

   ```ts sketch
   export const make: <const Families extends Record<string, Record<string, AnyOperation>>>(families: Families) => Language<Families>
   interface Language<F> {
     readonly families: F                                                     // the operations, callable as constructors
     readonly implement: (name: string, impls: ImplementationsFor<F>) => ForeignImplementations       // exhaustive by type
     readonly implementSome: (name: string, impls: Partial<ImplementationsFor<F>>) => ForeignImplementations  // a page's
     readonly sql: (dialect: 'sqlite' | 'postgres') => ForeignLowerings        // refuses a missing lowering by name
     readonly describe: () => ReadonlyArray<OperationDescription>              // what server and page compare
     readonly obligations: () => ReadonlyArray<WalkObligation>
   }
   ```

   `describe()` is the first channel `Operation.describe` and `Operation.compare` (the note) have: a server and a page compare descriptions through it. `foldkit-agent`'s machine tools list `describe()` so an agent sees the operations a tool's input may use. Consumers: `examples/metakit`'s permissions domain; entity's own operators as a language. Tests: a `*.test-d.ts` where `implement` missing `flags.xor` fails to compile and an expression mixing `Num` and `language.families.flags` infers its environment and flows into `Transition.set`; a page table missing an operation refuses at evaluation with A2's text.

2. **Custom maintained values.** A `reduce` fold is a maintained-value kind with no further API. Consumer: the permissions total over rows; `flags.or` rescans on delete, `flags.xor` updates from the row; differential against recomputation.

3. **Custom ways of writing.** `combine`. Consumer: the permissions machine replicated through Sync, with its convergence report and a two-replica walk.

4. **Custom stores, checked** (`packages/metakit/src/storeCheck.ts`, a test entry `metakit/store/check` that no server main imports).

   ```ts sketch
   export const checkStore: (declared: StoreCapabilities, adapter: {
     readonly connect: () => Promise<StoreConnection>        // two are opened
     readonly seed: (rows: { parent: Row; children: ReadonlyArray<Row> }) => Promise<void>
   }, options?: { readonly runs?: number }) => Promise<StoreReport>
   ```

   Probes per declared capability: two writers reading then writing one row (serializable, transaction reach); a statement-only probe (a read in one round trip, a write in the next); a parent-row race with and without the lock. Failure: `[metakit/store] "FakeStore" declares serializable over a transaction, and two writers each read balance 10 and wrote 5: the second write did not see the first. Declare read-committed, or isolate the round trips.` The capability vocabulary stays closed (decision 11). Consumers: the memory writer, Drizzle over SQLite, Postgres (CI) and local D1, the Durable Object journal, the IndexedDB replica. Test: a fake interleaving store declaring serializable fails.

5. **Custom protocol obligations.** A typed form: `Temporal.protocol<const Names extends string>(names: ReadonlyArray<Names>)` returns `obligation(name: Names, …)` and `discharge(name: Names, …)`, so an unknown name does not compile; a guide. Consumer: todo-app's undo, where `ExpireUndo` and `Restore` race, walked over its real `update`. Test: the report fails while open; removing the guard makes the walk `Broken` with a seed.

**Done when.** Each item's test passes and its mutation is killed; the obligations test lists the new obligations; rules 19 to 21 hold; each has a guide (Phase 8).

| Bout | Model | Files | Beside |
| --- | --- | --- | --- |
| 9.1 Language | most capable | `packages/metakit/src/language.ts` | Phases 6, 7 |
| 9.2 Agent lists the language | Sonnet | `packages/agent/src/metakit.ts` | after 9.1 |
| 9.3 Store check kit | most capable | `packages/metakit/src/storeCheck.ts` | 9.1 |
| 9.4 Stores adopt the kit | Sonnet | `packages/remote-server/test`, `remote-drizzle/test`, `durable/test`, `sync/test` | after 9.3 |
| 9.5 Typed protocol obligations | Sonnet | `packages/metakit/src/temporal.ts`, `examples/todo-app/test` | 9.1 |
| 9.6 Permissions consumers (total, Sync replica) | Sonnet | `examples/metakit` | after 9.1, 4.23 |
| 9.7 Review | most capable | as found | last |

## The developer-experience audit

One bout (most capable, with a Sonnet helper for measurements) after Phase 2's bout 2.5 and Phase 3's bout 3.1, then at each later phase's end. It reads, without having written them:

- *Inference:* every public API the plan shaped (`Expr`, `Transition`, `Machine`, `Declared.of`, `Graph.of`, `Rows`, `Operation`, `Maintained`, `Binding`) called as a user would, its inferred type asserted; a call needing an annotation is a finding. It lists every `string` where a typed key works and every cast in tests and examples (`grep -rn " as " examples/*/src examples/*/test packages/*/test`).
- *Where errors land and how they read:* each negative case's line and first sentence, which must land on the mistake and name it in the user's terms.
- *Compile cost:* rule 21's counts with command and commit.
- *Messages:* every refusal added since the last audit, checked against rule 20.

**Done when.** The ledger holds the three counts; every finding is fixed with a test or recorded with the reason it stays.

## Order, and what can run side by side

Now: bouts 4.2 and 4.3 together (`packages/remote`, ledger); 4.1 is done. Then three lines:

- **Phase 4 part A** (4.4–4.12) in `packages/metakit`, entity's operator files, `examples/metakit`.
- **Phase 4 part B** (4.13–4.23) in `packages/remote`, `remote-drizzle`, `durable`.
- **Phase 2 and Phase 3** (2.2, 2.3, 2.5, 3.2–3.5, 3.7) in `surface`, `mixins`, `mixins-ui`, `sync`, `ssr`, `form`, `agent` and domains-plus. Phase 1's leftovers (1.1–1.5) in `packages/metakit/src/ops` beside these, never beside 4.4 (both edit `node.ts`).

Shared files are never edited by two bouts at once: `packages/remote` (part B, 2.4, 3.6, 4.10), `packages/sync` (2.3, 4.10, 9.6), `packages/metakit/src/node.ts` (1.x, 4.4, 4.8), `transitionLists.ts`/`transitionCommutes.ts` (3.2, 4.9). Phase 3 must not wait for Phase 4 beyond 4.4: Phase 6's gate counts domains-plus's presses. Phase 6 waits for 2.5 and 3.5; Phase 7 for Phase 6. Phase 9 starts after 4.12 and runs beside Phases 6 and 7. The audit runs after 2.5 and 3.1, then at each phase's end. Within a phase a design note precedes its implementation, and the review follows the last bout.

## The first bouts of Phase 4, as briefed

Each brief carries `CLAUDE.md`'s git rules (one tree and branch, explicit-path commits in one command, the never list, push and report, no CI wait) and says what the other two edit.

### Bout 4.1: the checked-operations design note and its probes

- **Model.** The most capable: a published API's shape and types.
- **Commits.** Only `docs/design/metakit-checked-operations-DESIGN.md`. Probes and the prototype are temporary files in `examples/kitchen-sink` (types) and `packages/metakit` (behaviour, run from inside the package), deleted before the commit.
- **Probes, first.** (1) `Arbitrary.schema` from `effect/Arbitrary` (Effect 4.1.4): a seed, and whether `Schema.isBetween` bounds are honoured; (2) SQLite and PGlite `|`, xor (`a # b` on Postgres, `(a | b) - (a & b)` on SQLite) and `a & ~b` against JavaScript over 2,000 seeded pairs in 0 to 2^31−1; (3) instantiation counts of a typed three-operation declaration against one `Expr.operator`. Each result goes in the note with its command.
- **Done** in `109e52eff`: the note, with the three probes and 15 changes to this plan, now made here.
- **Reads.** This plan's "Custom algebras, checked" and Phase 4 part A; the kernel note's sections on custom operators and properties; `packages/metakit/src`: `node.ts`, `ops/core.ts`, `ops/eval.ts`, `sqlRender.ts`, `properties.ts`, `ops/ways.ts`, `ops/laws.ts`, `propertyChecks.ts`, `foldChecks.ts`, `writeChecks.ts`, `transitionCommutes.ts`, `transitionLists.ts`, `abstract/rowOf.ts`, `temporal.ts`; `packages/entity/src`: `law.ts`, `expr/operator.ts`, `expr/primitive.ts`, `expr/operatorLaws.ts`, `operators.ts`, `conformance/operator.ts`; `packages/remote/src/replay.ts`, `ledger.ts`; `docs/agents/traps-types.md`.
- **Must decide.** Final names; each signature of A1–A6 compiled with every negative case; sampling; obligation collection and naming; the description compared; every break with its compiler error. It may change a decision of this plan with the reason.
- **Form.** By `docs/agents/writing-docs.md`, under 500 lines; a cold reader (Sonnet, given only the path) before the commit.
- **Must not touch.** Any source file. No Jev.

### Bout 4.2: row deltas and the maintained-value mechanism

- **Model.** The most capable: it shapes `foldkit-remote/maintained`.
- **Writes.** `packages/remote/src/maintained/{deltas,definition,index}.ts`, `aggregate.ts` moved under it (breaking import path), `test/maintained.test.ts`, `test/maintained.test-d.ts`, `test/maintained.mutations.ts`. The export is reported for the coordinator's `generate` and `paths`.
- **Tests first.** A pending write then its echo gives one delta; a Surface over one row of a maintained list is not drawn again when another row changes; a seeded differential against recomputation over optimistic layers, a live echo, a failed write, reconnect and restore.
- **Reads.** `packages/remote/src/aggregate.ts`, `storeSteps.ts`, `optimistic.ts`, `layers.ts`, `ledger.ts`, `replay.ts`, `liveEvents.ts`; `packages/metakit/src/aggregates.ts`, `properties.ts`; #580 with every comment; `docs/agents/traps-data-and-sql.md`, `traps-async.md`.
- **Inner loop.** `pnpm exec tsc -b packages/remote`; the new test files from the root with `--project unit`.
- **End checks, once.** `pnpm mutate packages/remote/test/maintained.mutations.ts`; the six Remote page budgets before and after into the ledger (a page that maintains nothing must not move); Jev by file with the README and `skills/foldkit-plus/references/remote.md`.
- **Must not touch.** `packages/metakit`, `packages/surface`, `packages/sync`.

### Bout 4.3: Phase 2's and Phase 3's readings

- **Model.** Sonnet: it measures and decides nothing about an API.
- **Writes.** The ledger; temporary build entries in `examples/todo-app` and a bench file deleted before the commit (or kept as `packages/surface/test/graphBuild.bench.ts` if it runs under 10 s).
- **Task.** Phase 2 item 1's four readings and walker list; Phase 3 item 1's byte split by cause, the declared-versus-hand-written page, arm lengths, and rule 21's counts for todo-app, reference and domains-plus, each with command and commit.
- **Must not touch.** Any source under `packages/`.

## Risks, and what limits each

- **A declared property is false.** Rule 10; generated checks; a mutation per property kind; reference runs in tests.
- **A custom claim passes its check and is false.** The awkward values and range ends are always sampled, by our own code: `effect/Arbitrary` does not reliably reach a range's ends (200 values missed both). Phase 4's reviewer hunts sampling gaps; readers decide only skips a reference run would catch.
- **`effect/Arbitrary` is `@stability unstable`, and its replay tokens are not stable across releases.** A seed's samples may change with an Effect upgrade, so a recorded failing seed may not replay. Pin the Effect version; generation goes through one internal module, so an upgrade changes one file; the sampler's own edge values do not depend on Arbitrary; checking is our own loop, not `checkEffect`.
- **The typed claims cost the type checker.** 164 instantiations per declaration, 684 with a call and an implementation (note, probe 3), under entity's 213 and 909; rule 21.
- **Bundles grow.** Rule 3; a page naming no custom operation asserted unchanged; rule 4.
- **The bets do not pay, or gates are skipped.** Phase 3's gate was passed on its count with three premises unmeasured; bout 4.3 measures them and the coordinator reads each gate whole before its phase's later bouts are briefed. domains-plus's three in four depends on `Sheet` and `WindowList` machines (bout 3.3).
- **Upstream does not move.** Every Phase 6 and 7 deliverable works on today's Foldkit.
- **Proofs lose power when made sound.** Pairs going to Unknown are named with what would decide them.
- **A wrong skip shows a stale page.** A reference run, Unknown never empty, a mutation per consumer.
- **Scope with no stopping point.** Measured "done when"; a new idea becomes an issue unless a "done when" needs it.
- **The machine and CI.** One heavy command at a time; the flake rule.

## Decisions taken

1. `foldkit-entity` keeps its public constructors and builds metakit underneath (done).
2. Related rows live in metakit (`metakit/relation`, done).
3. The application layer lives in `foldkit-surface` (`foldkit-surface/declared`, done).
4. No source transform: script is cut where declarations name a dynamic import.
5. The binder answers only declared presses without Commands; Foldkit draws after hand-over.
6. D1 holds a rule over other rows only where it is judged in the writing statement; aggregate data rules stay refused there.
7. Skips run while `writes.install()` is active, which `Declared.of` exposes; an application without a machine is unaffected.
8. Change replay is built for the Durable Object only.
9. domains-plus is the measured proof, todo-app the first.
10. Fingerprints (#579) and cluster machines (#609) are outside the plan.
11. Laws are a closed vocabulary; applications declare checked instances of it (operations, `reduce` folds, `combine` writes), and readers act on a claim only where a generated check ran. Store capabilities follow the same rule: adapters open, kinds of guarantee closed.
12. The ways of writing are `set`, `add`, `append`, `insert`, `remove`, `removeWhere`, `patch`, `patchWhere`, `include`, `exclude`, `opaque`, and `combine`.
13. Lists are folded by `Rows`; a custom fold is `reduce` over a checked operation.
14. A page carries only `metakit/graph/match` of the graph.
15. Checks never run on a page; they run in tests (enforced by the obligations report) and optionally at a development server's start.
16. A `reduce` operation must claim commutative, associative (not `unlessRefused`) and an identity.
17. Entity's operator machinery moves into metakit; entity's `Law`, `Operators` and `Conformance.laws` names are deleted; entity's unary `Inverse` form is refused with the binary rewrite named.
18. `Evidence.Proven` stops counting as a check.
19. Compile cost is gated by instantiation count (rule 21, 10%).
20. Phase 2's memos skip by epoch, not by building graph reader nodes per memo: `writes.epochFor` already is the graph's answer per path set.
21. Sync's owned-fields rule is `make.ts`'s (a field is owned only when the whole field is a dependency); a throw in `Closure.reads` means unknown reads, never none.
22. An index is built above 400 rows unless the benchmark moves the threshold.
23. A custom operation has one domain, its argument Schemas, checked when it runs; there is no per-claim `over`. Its implementation refuses by throwing, and its SQL lowering lives on `metakit/operation/sql`, off every page (bout 4.1's note).

## Open questions for the maintainer

1. **Gate thresholds.** Phase 3's three in four, Phase 6's 20 kB and 200 ms, Phase 7's quarter: keep as proposed?
2. **domains-plus's smaller shape.** If `Sheet` and `WindowList` machines do not land, domains-plus declares 21 of 39 and Phase 3 takes its smaller shape. Is that acceptable, or should the upstream Listbox's three Messages count as declared once confined (which would reach 30 without machines but counts code as declared)?
3. **The remote branch `ui-polish-ci`:** delete it?

## Assumptions to verify, each where named

- Every custom operation an application acts on is reachable from a machine or language its tests check; one used only in a free-standing expression is not collected (bout 4.6 adds `lawObligations(expr)` for that case).
- Phase 1's soundness leftovers are still open (bout 1.5 checks first).
- A filtered list's body can be classified as row-local from `Expr.reads` alone (bout 4.22).
- Remote's store rows can be read by a transition's guard as a path (bout 3.6; otherwise `ClickedAddDomain` stays opaque and domains-plus reaches 30 only with the Listbox question above).
- A region Foldkit holds as trusted HTML is left alone across renders, and hydration adopts a page the binder changed (bouts 6.1, 6.2).
- The CI flake is a resource limit of the runner (Phase 0).

## Facts the probes settled

Bout 4.1's probes (methods and commands in [the operations note](./metakit-checked-operations-DESIGN.md)), against Effect 4.1.4, `node:sqlite` 3.53.3 and PGlite 0.5.11 (Postgres 18.6):

- `Arbitrary.schema` takes a seed (number or string; one seed gives one list), honours `Schema.isBetween` bounds, exclusive ones included, and runs synchronously with `Arbitrary.sampleEffect`. It does not reliably sample a range's ends (200 values held neither end of 0 to 2^31−1). An unbounded `Schema.Int` reaches about ±100 at the default size. `Schema.Number` yields NaN, ±Infinity, −0 and unsafe integers; `Schema.String` the empty text, NUL and lone surrogates. A range check's bounds read back from `annotations.representation`. The module is `@stability unstable` (see Risks).
- SQLite's and Postgres's `|`, xor and `a & ~b` agree with JavaScript's over 2,000 pairs in 0 to 2^31−1. Postgres's `^` is a power and SQLite has no `^`: xor is `a # b` on Postgres and `(a | b) - (a & b)` on SQLite. Postgres's `bit_or` and `bit_xor` over no rows are null; SQLite has neither. Outside 0 to 2^31−1 the three part (`2147483647 | 2147483648` is −1 in JavaScript, 4294967295 in SQLite).
- A typed declaration costs 164 instantiations, 684 with a call and an implementation, below an entity operator's 213 and 909.
