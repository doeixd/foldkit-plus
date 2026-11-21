# One declaration, every reader: the metakit unification plan

Status: plan, 2026-11-21, revised the same day after execution began. Nothing in it is built unless "Where things stand today" says so. It succeeds [metakit-phases-2-6-PLAN.md](./metakit-phases-2-6-PLAN.md). The coordinating session keeps the phase table below current and hands each piece of work to a subagent. The revision added a candid assessment, laws and interactions, new operations, and evidence gates on the three phases that are bets. Phase 1 follows [the kernel convergence note](./metakit-kernel-convergence-DESIGN.md) ("the kernel note").

## The problem, the idea, and what you get

An application built with Foldkit Plus (this repository's packages) states the same facts several times. Foldkit is the framework we build on: an application is one state value (the Model), events (Messages), a function `update` that makes the next Model from a Model and a Message, and a function `view` that draws a Model. Take one fact: "pressing Add changes the cart's count, and nothing else". Today that fact is written as code inside `update`. It is written again as the list of Model fields a part of the page reads. It is written again as the rule the server checks and as the SQL the database runs. It is written again as the test that says a late reply must not undo a newer one, and as the list of fields the server must send so the page can start. Each copy is in a form only one part of the system can read. So the page redraws parts that did not change, ships data and script that the first press does not need, and a rule can be right in one copy and wrong in another.

The idea is to state each fact once, as data, in a form every part reads. A rule becomes a small tree of operations (an expression) instead of a function. A state change becomes a guard and a list of "this field becomes this value" (a transition) instead of a branch of `update`. Anything can then read, without running it, what a Message reads and what it writes.

This week's work built that form as the package `metakit` and connected seven packages to it through entry points an application imports only if it wants them. This plan makes it the base of the project: one expression language instead of two, one dependency graph (the record of what reads and what writes each piece of state) instead of five, one way to keep computed values up to date, and an application whose `update` is declared. On that base it builds what the declarations make possible: a page that answers its first press (the first click or key a person makes) without loading the framework, script cut along Messages, and values that are maintained from what changed.

When the plan is done, you write a rule once and the page, the form, the server, the database, the checker and an AI agent's tool list all read that one rule. A page ships the data its changeable parts read and the script its first press needs. A list of 100,000 rows takes a pending edit without a walk of the list. A test fails when a race between two Messages has no test.

| Phase | Delivers | Needs | Size |
| --- | --- | --- | --- |
| 0. Clear the ground | Files small enough to review, recorded baselines, leftovers, a test that fails at random | nothing | 6 bouts: 3 done, 1 in part |
| 1. One expression language | The second language and its checker on metakit; list, text and write operations; laws | 0 | 21 bouts |
| 2. One dependency graph | One graph read by drawing, page start-up, data fetching, replication and the checkers | 1, steps 1 to 6 | 9 bouts |
| 3. Declared `update` (a bet) | An application's Messages as one declared set of state changes, read by every package | 1, 2; its gate | 13 bouts |
| 4. Maintained values | Sums, lists, joins and derived values kept up to date from row changes | 1, 2 | 14 bouts |
| 5. Stores and orderings | Every database declares its guarantees; two changes that meet are decided or tested | 1; item 3 needs 4, item 8 needs 2 | 12 bouts |
| 6. Resume without the runtime (a bet) | A page that answers declared presses before Foldkit loads, then hands over to it | 2, 3; its gate | 15 bouts |
| 7. Script cut by Message (a bet) | Script files per part of the page and per Message; loading ahead; a failed load | 3, 6; its gate | 10 bouts |
| 8. Examples and documents | Every example on the new base; guides, the agent skill, the site, a post | all | 10 bouts |

A *bout* is one piece of work that stands on its own (a module with its tests, a design note), done by one agent and reviewed at its end. Sizes are estimates for scheduling, not limits. A phase marked "a bet" opens with a list of what must be measured true before most of it is spent, and the smaller shape it takes if that fails. In the table, a checker is a program that shows a rule cannot be broken; replication is keeping a copy of state on several devices; "resume" is a server-drawn page starting in the browser from the server's state; the runtime is Foldkit's script. The next section explains these and the other words the phases use.

## Is this a better design?

Partly on evidence, partly on a bet. The two are kept apart here so a reader can tell which is which.

**Better, on evidence already in hand.**

- *One rule read by every consumer.* This week's independent review found the in-memory evaluator, the SQL and the provers disagreeing about a missing value, and found SQL produced by two code paths (`metakit/sql` and `metakit/drizzle`) that each had bugs the other lacked. Both were possible only because each reader had its own copy of the rule's meaning. One evaluation rule and one SQL lowering removed that class of fault, and a parity suite now runs every operation on two databases against the evaluator.
- *One expression language instead of two.* Every operation added today is added twice (in `foldkit-entity` and in metakit), and each side has checks the other lacks. That cost is certain and grows with every operation.
- *One graph instead of five.* Issue #581's audit found the five share no data and one of them has no caller outside tests. Facts the system already holds (what a projection reads) do not reach the code that could use them (the drawing skip).

**A bet, and what would confirm or refute it.**

- *That most of a real application's `update` can be stated as data at an acceptable cost.* The first attempt, on `examples/todo-app` (Bout 3, `70585f667`), gave a transition to 11 of 25 Messages, 44%, and two of those write nothing. The other 14 need list edits, text trimming, optional values, or a URL parsed. Every Command stayed hand-written: a transition can describe one but nothing runs it, and several read the Model from before the change. The page that opted in grew by 4,209 compressed bytes (165,083 to 169,292). Twelve metakit modules arrived (12.2 kB minified, the largest `ops/residualize` at 3,375 B and `transition` at 2,248 B), with `foldkit-surface/writes` (1,146 B) and the machine itself (1,088 B); the budget's ceiling is now 171,000 B. What it bought was measured too: after `DraftChanged` (a keystroke in the draft) only the composer is drawn again, after `FilterSelected` only the board, where an undeclared Message draws all five Surfaces. Phase 1's items 11 to 14 add the missing operations, ways of writing and supplied inputs; by the kernel note's count, 23 of 25 would then be transitions with no hand-written `update` arm, their Commands emitted as records, and the other two (`UrlChanged`, which parses a URL, and `MirrorRestored`, which decodes stored strings) ordinary code with a declared footprint. Confirmed if, after them, most Messages of two real examples are declared and the declared form is not much longer, slower to type-check or heavier than the function it replaces. Refuted if a large share still needs ordinary code. Phase 3's gate measures it.
- *That a page can answer presses without the framework and be faster for it.* The earlier measurement on one example found nothing to gain from skipping static parts or splitting inside the runtime; the only form that can move the numbers is a small script that runs instead of the runtime. Whether that script fits its size, and whether Foldkit adopts a page it changed, has not been tried. Phase 6's gate tries both first.
- *That cutting script by Message pays.* The application's own `update` code was about 16.6 kB of 217 kB compressed on the measured example. Cutting it matters only if the runtime is out of the start path, so this bet rests on the previous one. Phase 7's gate says so.

**What this week showed about cost.**

- *Bytes.* Page budgets pass by tens of bytes. Three page budgets and a Worker budget were raised this week, one by an amount nobody traced. Putting metakit under `foldkit-entity` adds weight to every page that reads rows unless the code it replaces leaves.
- *Proofs lose power when made sound.* Several answers that read "proved" became Unknown once null, absent and out-of-range values were taken seriously. More will.
- *The checker and prover proved false things until someone independent looked.* Declared rewrite laws were false for null, NaN and absent values; counterexamples were reported without being replayed. The fix was review, conformance over awkward values and replay. That is why this plan gates every phase on an independent review, and why a law may be declared only where something checks it.
- *A declared form is more to learn.* Each Message stated as data is a second vocabulary beside TypeScript. Where a Message does not fit, the plan keeps the function, first-class.
- *The first consumer found kernel defects at once.* `Transition.set(path, Option.none())` does not infer the empty value's type. An exported `Transition.make` with `emits` and no annotation fails declaration emit (TS2883). `WritesCheck.verify` cannot see a transition and the `update` arm that runs it drift together, since it compares the arm with the declaration the arm itself runs. `Writes.of` keeps a counter at module level (`started` in `packages/surface/src/writes.ts`), shared by every instance and every server request. And `metakit/graph` reached the page whole, against this plan's own byte rule. Each has a phase in "Where each open item goes"; a second example will find more.

## Words this plan uses

The opening explains the words it uses. The rest of the plan uses these.

- **Way of writing, property.** A way of writing is how a transition changes one path: set it to a value, add an amount to it, append to a list, remove the element with an id. A property (a law) is a fact about an operation, an aggregate or a way of writing that holds for every input, such as "the order of the two arguments does not matter". "Laws decide" in the target lists them.
- **Gate.** The first bout of a phase that is a bet: it measures the phase's premises, and the coordinator reads the numbers before the rest is briefed.
- **Pending write, differential test.** A pending (optimistic) write is one the page has applied and the server has not yet answered. A differential test runs two implementations over the same cases and requires the same answers.
- **Supplied input.** A value a transition needs and cannot make, such as a new id or the time: whoever runs the transition binds it once and records it. "What stays out" explains why.

- **Effect, Effect Schema.** Effect is the TypeScript library Foldkit is built on; it runs asynchronous work as values. Its Schema type describes a value's shape (`Schema.Struct({ balance: Schema.Int })`). Every Model, input and stored row here is described by one.
- **Package names.** `foldkit-entity` defines kinds of stored row (Entities), their relations, queries and declared writes; `Laws.check` is its checker. `foldkit-form` holds form state, `foldkit-agent` exposes an application's Messages to an AI agent as tools, `foldkit-mixins` and its `mixins-*` siblings draw and style widgets, `foldkit-remote-server` and `foldkit-remote-drizzle` are the server side of Remote (Drizzle is the SQL library they use), `foldkit-ssr` renders pages on a server. An *opt-in entry point* is a subpath of a package (`foldkit-form/metakit`) that only an application importing it pays for.
- **Stores named here.** SQLite and Postgres are databases; PGlite is Postgres running inside a test process; D1 is Cloudflare's hosted SQLite; a Durable Object is a Cloudflare server object with its own storage; IndexedDB is the browser's.
- **Names from this week's work.** `Machine.lift` moves a part's machine under a path of a larger state, and `Machine.compose` joins such parts into one machine. `Writes.of(App, machine)` reads what each Message writes; its `rootView` keeps a Surface's drawing while no Message wrote what it reads, its `track` wraps `update` to see each Message, and `WritesCheck.verify` reports a Message that changed a field it did not declare. `SSR.static` marks a region the browser never draws again. `KeepTyped` keeps what a person typed in a field before the script ran. `Data.can` asks Remote whether a write would be allowed now. `Bundle.lazy` loads a part's code at the first Message that reaches it.
- **Judge, residualize.** The judge is `foldkit-entity`'s evaluator: it answers true, false or unknown for a rule over the rows a page holds. To residualize an expression is to evaluate the parts whose inputs are known and keep the rest as a smaller expression.
- **Ledger, proof example.** The ledger is the file Phase 0 creates to hold every measurement this plan compares against. The proof examples are the two applications each phase is shown on: `examples/todo-app` (small, first) and `examples/foldkit/domains-plus` (measured).
- **Expression, path.** An expression is a rule or a computed value written as a tree of operations (`Num.gte($.balance, 0)`). A path names a field inside a Schema (`$.cart.count`). `metakit` is our package for both.
- **Reader.** A program that takes an expression and does something with it: evaluates it in memory, turns it into SQL, bounds it, proves something about it, or lists the paths it reads. A *conformance case* is an input with its expected answer, run through every reader to show they agree.
- **Transition, guard, machine.** A transition is one state change written as data: a guard (the condition under which it applies) and its writes. A machine is a state Schema with its named transitions, one per Message tag.
- **Footprint.** The list of paths a transition reads and the list it writes, read from the data without running it.
- **Command.** Foldkit's word for a side effect `update` asks the runtime to run (a fetch, a focus). A transition describes a Command as data (`emits`); the runtime runs it.
- **Surface, projection.** In `foldkit-surface`, a Surface is a named part of the view. Its projection is the function that picks, out of the Model, what that part shows, together with the list of Model paths it reads.
- **Bundle, placement.** In `foldkit-bundle`, a Bundle is a reusable part with its own Model, Messages and view. A placement is one use of it at a path of the application's Model.
- **Remote, Sync, Guard.** `foldkit-remote` holds rows read from a server in the Model and sends writes. A *live read* is one the server keeps pushing changes to. *Invalidation* is marking a held result as possibly wrong, so it is fetched again. `foldkit-sync` replicates a part of the Model between devices. `foldkit-guard` states who may read or change which rows.
- **Relation, collation.** A relation says one kind of row points at another (a line belongs to an order). A collation is the rule by which text is ordered and compared (by code point, or ignoring ASCII case).
- **Node kinds, operations, opaque.** An expression tree has six kinds of node today: a literal, a path, a call of an operation, an if, a match, and an opaque node. Phase 1 adds a seventh, `Rows`, which asks one question of each element of a list or each related row (does any pass a test, what do they sum to, which pass) and is the only iteration the language has. An operation is what a call names (`Num.add`); there are 20 today and Phase 1 adds more. An opaque node wraps ordinary code the readers cannot look into; it says which paths it reads, or that it may read anything.
- **Checker, prover, verdict.** The checker (`Abstract` in metakit, `Laws.check` in `foldkit-entity`) answers at once whether a transition can break a rule, from bounds on each value. The prover hands the harder cases to the Z3 solver. Both answer with a verdict: true, false or Unknown.
- **Null-strict, refusal.** Null-strict means an operation over a missing value gives a missing value, and a rule holds only where it evaluates to true. A refusal is a typed failure the evaluator returns instead of a wrong number (an integer past 2^53-1, a division by zero).
- **Hydration, resume, envelope, cover.** Hydration is what Foldkit does when its script first runs on a server-drawn page: it calls the whole view and matches the result to the elements already there. Resume means the page starts from the server's Model instead of fetching again. The envelope is the JSON the server writes into the page for that. A path a Surface reads is *covered* when something guarantees it will be there in the browser; `foldkit-ssr` refuses a page with an uncovered read.
- **Anchor, binder.** An anchor is an element the server marked with the id of the value it shows, so a script can write that value without drawing the view. The binder is the small script Phase 6 builds: it answers a press by running a transition and writing anchors, before Foldkit is loaded.
- **Blocking.** The total time, from navigation, in which the browser's main thread was busy for over 50 ms at a stretch and answered nothing. The baseline measures it with the CPU slowed four times, as a phone's is.
- **Chunk.** One file of built script.
- **Maintained value, delta, incremental view maintenance.** A maintained value is a computed result (a sum, a filtered list) that is updated from each change instead of computed again from all rows. A delta is one such change: this row, before and after. Incremental view maintenance is the database term for keeping query results up to date this way.
- **Aggregate.** A value computed over many rows: a sum, a count, a minimum.
- **Store capability, isolation, parent-row lock.** A store is whatever persists rows. Its capabilities say how it runs writes that overlap in time (its isolation level) and whether a write locks the row a group of rows belongs to (the parent-row lock).
- **Obligation, walk.** An obligation is something a proof of one step did not show and a test must: usually that two transitions arriving in either order leave a valid state. A walk is a seeded test that runs steps in many orders to show it.
- **Budget.** A test that fails when a page's or Worker's built script grows past a recorded number of bytes.
- **Jev.** The review tool (`npx jev-pref review`) that judges a diff against the project's written preferences. A hunk is one changed region of a diff.
- **Mutation spec.** A file (`test/*.mutations.ts`) listing deliberate breakages of the code, each as `{ name, edits: [{ file, find, replace }], tests }`; `pnpm mutate <spec>` applies each and requires a test to fail. The `file` and `find` of an edit are its anchor. This is unrelated to `Mutation.update`, entity's name for a declared write.
- **The #601 note, the #600 note.** `docs/design/601-expression-standard-library-DESIGN.md` (the standard set of value types and operations) and `docs/design/600-solver-pass-DESIGN.md` (the solver).

## Where things stand today

First checked against the tree at `add1121f6` (file sizes are `wc -c` there), and against `a750f5be2` for what landed since. Where a line was not checked it is listed under "Assumptions to verify".

**Landed since the plan was written.**

- The split (`a750f5be2`): `abstract/check.ts` and `prove.ts` became sixteen files, each under 20,000 characters, with exported names unchanged. In `packages/metakit/src/abstract`: `check.ts`, `entail.ts`, `fields.ts`, `fits.ts`, `matches.ts`, `ops.ts`, `state.ts`, `support.ts`. `src/prove.ts` and, in `src/prove`: `lower.ts`, `machine.ts`, `policy.ts`, `shape.ts`, `solve.ts`, `transition.ts`, `witness.ts`. The split's agent found five mutations in `packages/metakit/test/metakit.mutations.ts` that survive at HEAD, four of them in `policy.ts` and `abstract/unordered.ts`: tests that cannot fail. They are open (Phase 0's review).
- The ten guides are on the site and cold-read (`1612529cc`, `8d5a783bc`); five skill references were re-checked (`a9dce383f`); the blog image folder is renamed (`935243def`).
- The CI flake's handling is in the workflow (`ef2e8d8a2`): a browser shard whose connection closes is re-run once with one worker. The retry path has not run in CI yet, so it is unverified.
- Bout 3 landed (`70585f667`): `examples/todo-app` declares 11 of its 25 Messages in `src/machine.ts` and draws through `Writes.of`. It needed no `Machine.compose` (the Model is flat). Its page grew by 4,209 compressed bytes: 12 metakit modules (12.2 kB minified, `ops/residualize` and `transition` the largest), `foldkit-surface/writes` and the machine itself. `metakit/graph` reaches the page through `foldkit-surface/writes`, which the first version of rule 3 forbade; rule 3 and Phase 2 item 1 now settle it. It also found four defects, placed in "Where each open item goes".
- Bout 2 (the split) and Bout 3 (the first example) are done. Bout 1, the kernel note, landed as `ab6e69c08`, and Phase 1 below follows it.
- Still open in Phase 0: the ledger and the budget audit (items 2 and 3), and the five surviving mutations (item 7), closed in Phase 0's review.

**Laws and ways of writing, as the code has them.**

- metakit declares five rewrite laws per operation (`OpLaws` in `packages/metakit/src/node.ts`): `identity`, `absorbing`, `idempotent`, `reflexive` (`op(x, x)` is a constant) and `involution` (`op(op(x))` is `x`). Partial evaluation applies them (`src/ops/residualize.ts`), and the conformance suite checks them by requiring the rewritten expression to evaluate like the original over null, absent, NaN and refused operands (`src/conformance.ts`). Nine of the 20 operations declare any: `bool.and`, `bool.or`, `bool.not`, `eq.is`, `eq.isNot`, `num.add`, `num.sub`, `num.mul`, `num.neg`. It declares nothing about order of arguments, grouping, inverses or monotonicity; the checker's knowledge of monotonicity is written into its own table (`src/abstract/ops.ts`).
- metakit's aggregates carry a two-way tag, `algebra: 'group' | 'semilattice'`, and `requiresRescanOnDelete` (`src/aggregates.ts`): whether a change updates a total or forces a rescan. `packages/remote/src/aggregate.ts` branches on the aggregate's `_tag`, not on `algebra`, so nothing outside metakit's tests and docs reads the tag.
- `foldkit-entity` declares nine kinds of law on an operator (`packages/entity/src/law.ts`): associative, commutative, idempotent, identity, absorbing, inverse, distributes, monotonic, preserves-collation. `Conformance.laws` tests each. Only `Monotonic` has a consumer (`bounds.ts`); the module's comment says "a law describes; nothing rewrites a body by one".
- Ways of writing. metakit has one: `Transition.set(path, expression)`, a `WriteEquation` whose target is a path fixed when it is declared (`packages/metakit/src/transition.ts`); a transition's `emits` describes a Command as data and changes no path. A `foldkit-entity` `Write` (`packages/entity/src/write.ts`) has: `sets` (an input key written to a field), `increments` with a direction (`increment` or `decrement`), `assignments` (`compute`: a field from an expression over the row before and the input), `links` (point a to-one relation at another row), what its context sets (`Entity.sets`), and the row's revision moved on (checked against `expect`), over three kinds of write (`WriteKind`: `Update`, `Insert`, `Delete`). A pending write in `foldkit-remote` (`PendingPatch` in `packages/remote/src/ledger.ts`) keeps the same split: absolute values, relative `adds`, and `computes`. Neither package has append, remove or a change to one element of a list, and no way of writing declares a property.

**Built and reviewed this week.**

- `packages/metakit`: expressions over 20 core operations (`src/node.ts`, `src/ops/*`), paths, `Transition`, `Machine` with `lift` and `compose`, the synchronous checker (`src/abstract/check.ts`), the Z3 prover (`src/prove.ts`), one SQL lowering used by `metakit/sql` and `metakit/drizzle` (`src/sqlLowering.ts`), field inspection, `Graph.analyze`, `metakit/store`, `metakit/temporal`, value types (`Money`, `Decimal`, `CalendarDay`, `OrderedEnum`) and row aggregates. It imports no Foldkit package.
- Opt-in entry points that read metakit declarations: `foldkit-surface/writes`, `foldkit-remote/aggregate`, `foldkit-sync/metakit`, `foldkit-guard/check`, `foldkit-form/metakit`, `foldkit-agent/metakit`, `foldkit-mixins-form/declared`. `foldkit-remote-server` imports `metakit/store` in its main entry, which runs only on a server.
- In `foldkit-remote`: reads declare their store's field as a dependency; a late answer no longer undoes a newer read where the domain reads live. In `foldkit-ssr`: a resumed part can name the Model paths it restores.

**The second expression language, untouched.** `packages/entity` has its own: `src/expr.ts` (124,938 characters: field, input and relation-path expressions, a separate predicate type, queries, ordering), `src/evaluate.ts` (the judge), `src/write.ts` (declared writes), `src/laws.ts` with `src/bounds.ts` and `src/enumerate.ts` (`Laws.check`), `src/invariant.ts`, `src/refine.ts`, `src/operators.ts` and `src/memoryTable.ts` (custom operators), `src/footprint.ts`. `foldkit-remote-drizzle` compiles it to SQL in `compile.ts`, `operators.ts` and `checks.ts`. `foldkit-guard`, `foldkit-remote`, `foldkit-remote-domain` and `foldkit-remote-server` are written against it. No file in `packages/entity/src` imports metakit, and metakit has nothing for related rows except its aggregates.

**Five dependency graphs.** Issue #581's audit lists them: the contract graph (`Module` and `Graph` in `packages/surface`), Remote's write-to-query impact (`packages/remote/src/impact.ts`), the per-value memos of `Projection.derive` and `SlotView.region`, the Bundle drawing memo (`packages/bundle/src/memo.ts`), and Sync's closure and replay diffs (`packages/sync/src/mount.ts`, `make.ts`). `Graph.analyze` in metakit is a sixth, used only by `foldkit-surface/writes`; its `pruneStatic` and `queryReadiness` have no caller in any package.

**Partial.**

- One example declares Messages as a machine, and under half of them. What the other 14 of `examples/todo-app` need: changing the list element with an id (3 Messages), keeping the elements that pass a test (2), appending unless an element has the id, with a new id for the added one (2), building an `Option` and looking up an element by id (2), reading inside an `Option` (1), trimming text (2), and parsing a URL and reading a record by key (2).
- Maintained values exist only as `aggregated` in `packages/remote/src/aggregate.ts`.
- Store capabilities are declared for the Drizzle writer and the memory writer only. Postgres is declared as taking no parent-row lock. SQLite and D1 are declared serializable (`storeOf` in `packages/remote-drizzle/src/index.ts`).
- Resume: `foldkit-ssr` ships a pick of Model fields and resumed parts, checks coverage (`coverOf`), has static regions (`SSR.static`), an opt-in loader (`foldkit-ssr/loader`) and keeps typed fields. It has no anchors, no binder, and no script cut by Message.
- The ledger of Phase 0 does not exist yet, and the budget work of its item 3 has not started.

## What was decided before this plan

These came with the instruction and are not reopened here.

- metakit is the base. Every package takes metakit declarations as its main input where it takes a function or a representation of its own today.
- "Meta-Foldkit" is the layer of issues #597 and #598 in which an application's `update` is stated as declared transitions over its Model. Their later comments (2026-11-19 and 2026-11-20) narrow the bodies and are followed here.
- Resume and script splitting are built in full. `metakit-phase-6-DESIGN.md` advised against both on one example's numbers; that advice is overruled. Its numbers stay as the baseline, and measurements order the work and set defaults. They do not cancel it.
- Work is deferred only for a concrete reason: it waits on upstream Foldkit, a measured cost outweighs it, the design is unsound, or another package owns it.

## The target, in prose

### One model of declarations

An application is described by six kinds of declaration, all written with one expression language.

1. **Schemas** say what values a Model field, an input or a stored row may hold. A value type is an Effect Schema; metakit ships a Schema only for what Effect lacks (a decimal at a scale, money, a calendar day, an ordered enumeration).
2. **Expressions** are rules and computed values over a named environment. The environment says what the expression may read: a rule on a row reads the row; a guard reads the row and the person asking; a query reads the row and its parameters; a view value reads the Model. Reading outside the environment is a type error.
3. **Transitions and machines** say how state changes. A declared write to a stored row and an arm of an application's `update` are the same thing: a guard, writes, and Commands described as data.
4. **Queries and aggregates** say which rows match, in what order, and what follows from related rows.
5. **Guards and policies** say who may read or change what, as expressions over the row and the person.
6. **Views** read declared paths. A view stays a Foldkit view function; what makes it readable is that the values it shows come from projections and bindings whose reads are declared.

`foldkit-entity` remains the place where rows, relations, queries and declared writes are defined. Its constructors build metakit expressions. It is a language written on the kernel, not a second kernel.

### One dependency graph

One graph is built once, when the application is defined. Its nodes are paths (in the Model, or a field of a kind of stored row), writers (a transition, a declared write, a package's own reducer step) and readers (a projection, a binding, a placement, a query, a guard, a rule). An edge says "writes" or "reads" and carries how it is known: derived from data, declared by hand, or unknown. Unknown is never treated as empty: for rendering it forces a redraw, for authorization it grants nothing.

The graph answers questions about definitions: which readers can a Message affect, who writes this path. At run time a package joins it with what is active (which Surfaces are shown, which queries are loaded) and with what actually changed. Those are three views of one graph, the same split issue #581 calls planes.

Rendering, resume coverage, live-read planning, invalidation, the development-time check that a Message wrote only what it declared, and the provers all read this graph. Phase 2 says what each of today's five becomes.

### One way to keep computed values up to date

A maintained value has a definition (an aggregate, a filtered and ordered list, a join through a relation, a derived expression), a source (which rows it is over), and a rule for applying one delta. The graph says which maintained values a change can reach. The delta rule updates the value from the changed row alone when the definition allows it, and otherwise recomputes and says so. Aggregates use this today; Phase 4 puts lists, joins, derived projections and server-side totals on the same mechanism.

### Laws decide

Some questions cannot be answered from footprints alone. Two Messages both write the cart's count: does their order matter? A row leaves a list: can the total be corrected from that row, or must every row be read again? A pending edit sits over a value the server just changed: can the edit be applied on top, or must the value be fetched? Each has the same kind of answer: it depends on a property of the operation involved.

So each operation, each aggregate and each way of writing carries declared properties from a small closed set. There are no algebra objects a user constructs. A property is a field of a type, and each kind of thing has one table keyed by its closed set of names, in a new `packages/metakit/src/properties.ts`: `opProperties` (typed by every core operation id, so an operation with no row does not compile), `foldProperties` and `writeProperties`. `Op.laws` leaves the operation's descriptor (the kernel note, "Which properties does an operation, a fold or a way of writing declare?").

| Property | In plain words | Example |
| --- | --- | --- |
| Commutative | The order of the two inputs does not matter | `a + b`; two increments of one count |
| Associative | Grouping does not matter, so many can be combined in any batches | a sum of integers |
| Idempotent | Doing it twice is the same as doing it once | `max`; set to a value; remove the element with an id |
| Has an identity | Some input leaves the other unchanged | `0` for `+`; an empty total |
| Invertible | Another operation undoes it | subtract undoes add; decrement undoes increment |
| Monotone | A larger input never gives a smaller result (or never a larger one) | `x + 1`; a count as rows arrive |
| Absorbing | Some input decides the result whatever the other is | `false` for `and` |

Two more exist today and stay, used only to simplify expressions: reflexive (`x = x` is true) and involution (`not not x` is `x`).

**The rule for declaring one.** A property is declared only where (a) something checks it against the evaluator over the awkward values, and (b) some consumer decides something from it. The reason for (a) is this week: the review found declared rewrite laws that were false for null, NaN and absent values, and partial evaluation was applying them. The reason for (b) is `foldkit-entity`, where eight of nine kinds of law are declared and tested and nothing reads them. A property with a check and no consumer is deleted. A property is declared over the values it holds for: integer addition is associative where neither grouping is refused for leaving the safe range, and addition of floats is not declared associative at all.

| Property | What checks it | What decides from it |
| --- | --- | --- |
| Identity, absorbing | Conformance: the rewritten expression evaluates alike (exists) | Partial evaluation (exists); a maintained total's starting value (Phase 4) |
| Idempotent | Conformance for operations (exists); twice equals once for folds and ways of writing (new) | Partial evaluation (exists); an edit delivered twice is harmless (Phase 5, 9 and 10) |
| Commutative | Conformance over both orders (new); two writes in both orders on seeded states (new) | `Transition.commutes` (Phase 1); walks asked for (5.8); Sync (5.9); replay (5.10) |
| Associative | Conformance over three inputs, both groupings (new) | Many deltas, or many pending increments, combined into one (Phase 4, item 10) |
| Invertible | Conformance: apply, undo, compare (new) | Update from the changed row or rescan (Phase 4, item 10); undo a failed pending write |
| Monotone | Conformance over ordered pairs (exists in `foldkit-entity`; new in metakit) | The checker's bounds (today a hand-kept table in `src/abstract/ops.ts`) |

In the table, "5.8" is Phase 5's item 8. A property of a way of writing is derived, not declared twice: "add an amount" is commutative because the operation it applies is. Phase 1 items 12 and 13 build the tables and the checks; Phases 4 and 5 build the consumers, each with a deliverable and a test.

Laws do not solve a Message the language cannot state. A property says how two stated changes relate. It says nothing about a branch of `update` that is ordinary code (`UrlChanged` parsing a URL); that stays opaque, and everything that meets it is tested, not decided. Nor do laws make a slow analysis fast or a weak store strong: they say which work can be skipped, never that a rule holds on a store that does not serialize its writers.

### What happens when two declarations meet

An *interaction* is two declarations whose footprints overlap: one writes a path the other reads or writes. The design has one answer for every kind, in three steps. The graph finds the pair. Laws and the checker decide what can be decided. What cannot be decided becomes an obligation, discharged by a seeded walk.

| The two that meet | Found by | Decided by | Left to a walk |
| --- | --- | --- | --- |
| Transition and transition | The graph: overlapping writes, or a write under a read | `Transition.commutes`, from their ways of writing | Pairs that do not commute or cannot be decided |
| Transition and rule | The graph: the rule reads what it writes | The checker, then the prover: does the step keep the rule? | Rules across rows on a store that does not serialize writers |
| Transition and projection or query | The graph | The delta rule: update from the changed row, or recompute | Nothing; a wrong skip is caught by the reference run |
| Write and guard | The graph: the guard reads what the write changes | The checker: can the writer still pass the guard afterwards? | A guard reading other rows on a weak store |
| Pending write and newer server value | Remote, at run time, by field | The way of writing: does it commute with what changed? | The orders of answer, patch and read (Phase 5's walks) |

This table is the answer to "what happens when these two things meet". Where the decider answers yes, the application is asked for no test (the plan's own tests still sample such pairs to check the decider). Where it answers Unknown, the pair becomes an obligation (a test that must exist), and Phase 5's report fails until a walk discharges it. A declaration-based decider never answers "they conflict": only a run finds a counterexample, and it is replayed through the evaluator before it is reported.

### Why resume and splitting follow

If every Message's reads and writes are known, three things can be computed before any script runs. The set of Messages a page can send is the tags on its elements, plus the Messages their Commands can send back. The paths those Messages write decide which values on the page can ever change. The paths those values and Messages read are all the data the page needs to answer; the rest is drawn into the HTML and left out of the envelope. The same facts say what script a press needs: the transition for that Message and the code that writes the values it changes. So a small script can answer a declared press without the framework, and script can be cut along Messages.

### Where metakit ends

metakit knows Effect Schema and nothing else: no Foldkit, no network, no storage, no drawing. It owns expressions, paths, transitions, machines, the verdict, the readers (evaluation, partial evaluation, bounds, proof, SQL), the graph structure, store capability vocabulary and walks. Each Foldkit Plus package owns its runtime: `foldkit-entity` rows, relations, queries and the wire names of operations; `foldkit-remote` the cache, network and optimistic layers; `foldkit-sync` replication; `foldkit-guard` the person, server-only checks, and what a refusal discloses; `foldkit-surface` the application's contracts and the Foldkit side of the graph; `foldkit-ssr` the envelope, the loader and the binder. Physical extraction of metakit into its own repository stays last, as #598 decided.

### What stays out

The admission rule for an operation, from the #601 note: it enters only if (1) every reader implements it exactly or refuses it by name with a reason; (2) it has conformance cases, including the awkward values of its types, that pass on every reader; (3) it is total over its input Schema, or its partial case has a declared answer; (4) it reads nothing but its arguments.

The language has no user functions with bodies, no recursion, no loops, no I/O, no randomness and no clock read inside an operation. The time enters as a value bound once by whoever runs the step. Expressions do not draw, do not perform effects, and do not decide what is static (the graph does). A transition is one synchronous step; time, retries and concurrency stay with Effect and with the protocols of Phase 5. An `update` arm that needs a loop or arbitrary code stays an ordinary function, marked as reading and writing unknown paths, never half-translated. There are seven kinds of expression node (`Lit`, `Path`, `Call`, `If`, `Match`, `Opaque`, and Phase 1's `Rows`) and no runtime "algebra" or "language" objects.

**What the language cannot make, it is given.** A transition cannot mint an id, read the clock or call out. It takes such a value as a *supplied input*: a third slice of its environment, `supplied`, beside `state` and `input`, each value declared with a Schema (`supplied: { id: Schema.String, now: Schema.Int }`). Whoever runs the step makes the value once and passes it: `Transition.step(transition, state, input, supplied)`. The #601 note set this rule for the clock; the kernel note extends it to ids and to who is asking. The page binds a new id and the time when it sends the Message, and records them in the Message, so a replay, the server and another device run the same step with the same values. A proof treats a supplied value as any value its Schema allows. A Message that needs a new id is then declarable, not undeclarable.

The only iteration is the `Rows` node: one question asked of each element of a list (any, every, count, sum, min, max, find, keep, patch), with a body that is an expression over the element (`each`). You write the test as an arrow, `Arr.any(state.todos, todo => todo.completed)`, which metakit calls once while building; the arrow is not kept, only the expression it returned. The body cannot call itself and in Phase 1 holds no second `Rows`, so every evaluation ends after one pass. What does not fit stays code: `Transition.opaque` wraps an ordinary function with the paths it reads and writes declared, and a development-time check fails when it writes a path it did not declare.

## Rules for every phase

**Bytes.**

1. A feature someone opts into lives on its own subpath, and a page that does not use it pays zero bytes for it. A test asserts it (`scripts/test/publishedBuild.test.ts`).
2. A main entry that a page loads never imports metakit at run time. Today no such entry does (`foldkit-remote-server`'s main entry imports `metakit/store`, and it runs only on a server). After Phase 1 the exception is `foldkit-entity`, whose job is building expressions, and through it the packages that import it. They then carry the node constructors and the operation modules a page names, and nothing else of metakit.
3. One module per operation, imported by name. A build test asserts that a page naming one operation ships no other. The checker, the prover, SQL lowering and conformance never reach a page; a test asserts each is absent. Of the graph, a page may carry one thing: the function that matches written paths to read paths, which `Writes.of` runs once when the view is defined. (Revised on 2026-11-21: the first version said no graph analysis reaches a page, and Bout 3 showed `foldkit-surface/writes` importing `metakit/graph` whole.) The rule changes, not just the import, because matching paths is what a page that skips drawing must do, and doing it once at definition costs little; what must stay off is the rest of `graph.ts`, which imports `Expr` and `sqlLowering` for `pruneStatic` and `queryReadiness`. Phase 2 item 1 puts the matching function in a module of its own that imports only `path.ts`; Today `transition.ts` imports partial evaluation for `Transition.can` and `Transition.footprint`, and `Machine.make` holds `canDispatch` and `affordances`, so every page that runs a step carries `ops/residualize`. Phase 1's step 3 moves the reads walker to `ops/reads.ts` and those functions to a module of their own, which takes it off (the kernel note). Phase 7's build computes the match ahead of time, and the page then ships only its result.
4. Page budgets pass by tens of bytes. Every bout that touches code a page runs measures the affected budget tests before and after, and writes both readings in the ledger (in its report, until Phase 0 has created the ledger). A budget is raised only for code every such page runs, with the measurement beside the number. A bout that would need a raise for anything else stops and reports.

**Meaning.**

5. Null and refusal mean one thing in every reader. Evaluation is null-strict. A refused evaluation is a failure, never "undecided".
6. An analysis may only weaken toward Unknown. A proof answers Unknown rather than rest on a value that may be null, absent, NaN or out of range.
7. A counterexample is run through the evaluator before it is reported. Tests compare verdicts and replay witnesses; they never snapshot a solver's values.
8. Proofs that a rule on data holds never assume a guard about who is asking.
9. A new operation updates every reader's table in the same change. The tables are typed by the set of operation ids, so a missing entry does not compile.

**Review.**

10. Every phase ends with an adversarial review by an agent that did not write it, on the most capable model, before the next phase builds on it. Reviewers probe and report. Fixers fix, each fix with a test that failed first and a mutation. Phases 0 and 8 change no package's behaviour; their reviews are the ones their sections name.
11. Jev runs only on changes to a published package's API, with the README and skill reference files the change updates. It cannot take a file over 20,000 characters or more than ten hunks at once: review by file (`--include`, a raised `--max-hunks`).
12. A new source file is born under 20,000 characters. A file a phase rewrites is split in that phase. Phase 0 splits `abstract/check.ts` and `prove.ts`; Phase 1 splits each `foldkit-entity` file as it moves onto metakit.
13. Tests can fail: each behaviour has a mutation in a `*.mutations.ts` spec, run in one `pnpm mutate` call per spec.

**Working in the shared tree.**

14. Agents work on disjoint files, and each brief says what the others are editing. No worktrees and no branches without the maintainer's word.
15. The coordinator alone commits the lockfile, `packages/plus`'s generated entries and the generated tsconfig paths. A bout that adds an export says so in its report; the coordinator runs `pnpm --filter foldkit-plus generate` and `pnpm paths`.
16. A package that gains a run-time dependency on another needs the project reference in every project that loads it from source. The bout that adds the dependency lists those projects; the coordinator adds them with the paths.
17. One heavy command at a time while the machine is short on memory. Agents push and report; the coordinator reads CI.

**Upstream.**

18. Agents post nothing on `foldkit/foldkit`. A request is drafted in `docs/upstream-foldkit-ssr.md` for the maintainer. A posted request never links our repository and says an AI drafted it on the maintainer's behalf.

## Phase 0: clear the ground

**Goal.** Later phases can be reviewed, measured and merged without tripping on this week's leftovers.

**State on 2026-11-21.** Done: item 1 (`a750f5be2`: the split, into sixteen files where this section named nine; see "Where things stand today"), item 4 (`1612529cc`, `8d5a783bc`, `a9dce383f`: the guides and five skill references), the folder rename of item 5 (`935243def`), and the workflow change of item 6 (`ef2e8d8a2`; the flake is recorded on #582). Open: item 2 (the ledger), item 3 (budgets), the rest of item 5 (`jev-pref sync`, `check:changed`, the branch), watching item 6's retry run for the first time in CI, and item 7 below. The items are left as first written, as the record of what was asked.

**Scope.**

1. Split `packages/metakit/src/abstract/check.ts` into `abstract/fields.ts` (what a Schema says of each field), `abstract/state.ts` (the facts held while checking), `abstract/ops.ts` (the per-operation table) and `abstract/check.ts` (the two entry functions). Split `src/prove.ts` into `prove/lower.ts` (expressions to solver terms), `prove/witness.ts` (replay), `prove/machine.ts`, `prove/policy.ts`, with `src/prove.ts` re-exporting. No behaviour change; exported names identical.
2. A ledger, `docs/design/metakit-unification-LEDGER.md`: every bundle budget with its ceiling, today's reading and its headroom; the numbers of `metakit-phase-6-DESIGN.md`; view and patch time per Message from `scripts/render-baseline.mjs`; type-check time of `packages/entity`, `packages/remote` and `examples/reference`. Each later phase adds its before and after here.
3. Budgets. Raised this week, by the comments in the budget files: `examples/cms` (+500 B), `examples/reference` and `examples/registry` (+650 B, then +300 B), and the domains-plus Worker (+5,000 B, then +4,700 B, of which about 1.4 kB in `foldkit-remote` was never traced to a cause). Each of these, and each budget with under 350 B of headroom, gets a line saying what grew and whether every such page runs it. The untraced 1.4 kB is bisected. Where growth is opt-in code, a bout moves it behind its subpath and lowers the ceiling. `publishedBuild.test.ts` gains the rows it lacks: the main entries of `foldkit-agent` and `foldkit-mixins-form` keep no metakit module.
4. Documents. Ten guides written this week are not on the site: the six in `packages/metakit/docs/`, `packages/agent/docs/machine-tools.md`, `packages/form/docs/metakit.md`, `packages/remote/docs/aggregates.md` and `docs/surface-writes.md`. The catalog (`examples/site/src/catalog.ts`) has no metakit entry, and its helpers reach only a package's README and `docs/<name>.md`, so the bout adds a helper for a package's `docs/` folder and a metakit entry. Each of the ten gets a cold-reader pass. The "Checked against" line of a skill reference (`skills/foldkit-plus/references/*.md`) is set to today's versions only where the reference was re-checked; `ssr.md`, `surface.md`, `sync.md`, `remote.md` and `bundle.md` name versions older than their packages.
5. Housekeeping: rename `examples/site/public/blog/2026-11-18-foldkit-plus-0-41` to the 0.43 post's name and fix its references; run `npx jev-pref sync` and reconcile; run `pnpm check:changed --dry` on a known change and confirm its output, fixing the script if it is wrong. `gh pr view 592` reports the PR as merged; the branch `ui-polish-ci` still exists on the remote and is deleted only on the maintainer's word.
6. The CI flake. The browser connection closes mid-run in a different shard each time (`VITEST_BROWSER_CONNECTION_CLOSED`). The coordinator records it on #582 with run links. The plan's handling: a shard that fails with exactly that signature is re-run once by the workflow and the re-run is logged; the browser shards run with one fewer worker; a second failure of the same shard is treated as real. It counts as handled after twenty consecutive runs on `main` without it. Its cause is unknown, and no phase's verdict may rest on a run that showed it.
7. *Added on 2026-11-21: tests that cannot fail.* Five mutations in `packages/metakit/test/metakit.mutations.ts` survive at HEAD, four of them in `packages/metakit/src/policy.ts` and `src/abstract/unordered.ts`. For each: write the test that kills it, or mark it `survives` with the reason the change is behaviour-equivalent. One bout, Sonnet; inner loop `npx vitest run packages/metakit/test/policy.test.ts packages/metakit/test/unordered.test.ts --project unit`; end check one `pnpm mutate packages/metakit/test/metakit.mutations.ts` and `pnpm mutate:check`. It touches only `packages/metakit/test`, unless a surviving mutation shows a real fault, which it reports before fixing.

**Replaces or deletes.** Nothing public.

**Hazards and tests.** A split moves mutation anchors: every `*.mutations.ts` spec naming the two files is updated and `pnpm mutate:check` passes. A split can change what a bundler keeps: `publishedBuild.test.ts -t metakit` and `pnpm --filter metakit build` pass, and the exported names in the built declarations of both files are compared before and after.

**Done when.** No file in `packages/metakit/src` is over 20,000 characters (only those two are today; the next largest is `expr.ts` at 17,570); the ledger exists with every budget; the site lists the ten guides; `check:changed` is verified.

**Review.** One reviewer reads the split as a diff of moved code and confirms nothing else changed, and confirms item 7 left no surviving mutation without a stated reason. The flake's handling counts as verified only once a CI run has taken the retry path and the log shows it.

**Size.** 6 bouts: the split (Sonnet, done), the ledger and budgets (Sonnet), documents (Sonnet, with a Sonnet cold reader; done), housekeeping (Haiku; part done), the flake (Sonnet; done, unverified), the surviving mutations (Sonnet).

## Phase 1: one expression language and one checker

**Goal.** There is one expression language, one evaluator, one checker and one SQL lowering. `foldkit-entity`'s public way of writing rules, queries and writes stays; what it builds is metakit.

**Which side survives each overlap.** The plan first read both sides at the level of their exports and module comments. The kernel note (item 1, Bout 1) read them whole and overruled nine rows of this table and seven proposals of an earlier draft of items 11 to 14 ("Where does this note overrule the plan?"); the table and the items below show the note's decisions, marked "note".

| Overlap | Survives | Why |
| --- | --- | --- |
| Expression tree | metakit `Node` and `Expr<Env, A>`, with a seventh kind, `Rows` (note) | A call cannot ask a test of each related row |
| Predicate as a separate type | Neither: a predicate is a boolean expression | One tree; `Expr.match` and `Expr.when` already cover both |
| In-memory evaluation of operations | metakit's evaluator; five of entity's meanings move in (note) | Null-giving equality and membership, text order, ASCII fold |
| Judging over held rows | entity `Judge`, calling metakit | Only entity knows which rows a page holds |
| Three-valued answer | metakit `Verdict` in memory; the wire keeps its JSON (note) | A `Verdict` holds `Option` values and is not JSON |
| Partial evaluation | metakit `Expr.residualize`, `judge` | Replaces `Condition.residual` in guard |
| Static checking | metakit `Abstract` and `metakit/prove` | Relates two unknowns (`amount <= balance`); `bounds.ts` cannot |
| The check's report | entity `Laws.check`, `Laws.show`, evidence kinds, on `foldkit-entity/laws` | Pairs writes with rules per Entity; a report users know |
| Listing a write's steps | entity `enumerate.ts`, judging each step through metakit (note) | The states report and `becoming` need concrete steps |
| A declared state change | `transitionOf(write)` on `foldkit-entity/transition` (note) | A member of `Write` would put `Transition` on every page |
| Rules on an Entity | Invariants stay on the Entity, translated per check (note) | A rule may read the row before, or another row |
| Reads and writes of a declaration | metakit `Expr.reads`, `Transition.footprint` | One walker instead of four |
| How a fact is known | entity `Footprint` (`Derived`, `Declared`, `Unknown`) | metakit has reads-or-unknown only; the graph needs three |
| Built-in operations | metakit core operations | Closed set with per-reader tables |
| Custom operators | Defined ones expand; primitive ones become calls of foreign operations (note) | `Opaque` hides arguments from SQL and has no wire name |
| Value types | `metakit/domain` | Built; the #601 note's `foldkit-entity/decimal` never was |
| SQL for operations | metakit `sqlLowering.ts` | One lowering, parity-tested on PGlite and SQLite |
| SQL for queries | `foldkit-remote-drizzle` `compile.ts` | Joins, cursors, ordering, collation are query matters |
| Conformance | Both, merged | metakit's per-operation cases; entity's query and store cases |
| Field specs and JSON Schema | `metakit/inspect` | Replaces entity `jsonSchema.ts` and form's own mapping |
| Related rows (`exists`, relation paths) | A hop is a `Path`; `metakit/relation` holds `Rows` (note) | Every reader already reads a nested path |
| Text order and case folding | A fold operation (`text.lowerAscii`) placed by entity's constructors (note) | One call can override a field's collation |

**Scope.**

1. *Design note* (`docs/design/metakit-kernel-convergence-DESIGN.md`, Bout 1, committed as `ab6e69c08`). It fixes the mapping of each entity node to a metakit node, relation hops and `exists`, collation, insert and delete as transitions, list folds and list writes, the property set, `Transition.commutes`, the environment, the wire names, what `foldkit-entity`'s main entry imports, and the order of this phase's steps. Its prototype measured a page on metakit nodes 8,970 brotli bytes smaller than the same page on today's constructors, and type-check work no dearer. The items below follow it.
2. *One verdict.* `Verdict` with a reason replaces the judge's true/false/unknown, `Data.can`'s `Yes`/`No`/`Undecided` and guard's `May.answer` in memory. On the wire `Yes`/`No`/`Undecided` and `MaySchema` keep their JSON and are converted where decoded. The checker's `Kept`/`Refused`/`Undecided` stay as report words built on it. Entity gains its run-time dependency on metakit here.
3. *Related rows and lists in the kernel.* A hop through a to-one relation is a `Path` with an `@relation` segment. The new node `Rows`, exported from `metakit/relation` with the relation type, asks one question of each related row or each element of a list: `any`, `every`, `count`, `sum`, `min`, `max`, `find`, `keep`, `patch`; `exists` is `any`. Every reader: memory over held rows, Unknown in `Expr.judge` when not all are held; SQL as correlated subqueries for related rows, refused by name for a list in a column; the checker by delta for sums and by bound for the rest.
4. *Entity builds metakit, through a translation.* A new `packages/entity/src/lower.ts` translates today's entity nodes to metakit nodes, and a differential test runs every conformance case through today's judge and through metakit's evaluation of the translation. Each reader then switches to the translation while the constructors stay. Last, `Expr.*`, `Query.where` and `Order` build metakit nodes directly over `{ row, next, input, viewer, now, each }`, `expr.ts` is split into `packages/entity/src/expr/`, and the old node types and `lower.ts` go together. `evaluate.ts` keeps held-row judging only. `dependenciesOf` becomes a call to `Expr.reads`. Invariants stay declared on the Entity and are translated per check.
5. *Writes are transitions.* `transitionOf(write)`, on a new subpath `foldkit-entity/transition` (file `writeTransition.ts`), gives the metakit transition of a declared write over the state `{ present, row }`, with `supplied: { viewer, now }`. `Write.footprint` stays computed from the write's own lists, and a test holds it equal to the transition's. `Mutation.insert`/`update`/`delete` keep their shape.
6. *One checker.* `Laws.check`, moved to `foldkit-entity/laws`, lowers each pair of write and rule and calls a new per-goal entry of `Abstract` (one transition, what may be assumed, one goal over before, after and input); what stays open goes to `metakit/prove` as an obligation. `enumerate.ts` stays, judging each listed step through metakit's evaluator; only `bounds.ts` is replaced. Before `bounds.ts` is deleted, a differential test runs both checkers over every fixture (the bank, `examples/writes`, chirp, the CMS) and requires that metakit decides every pair the old pass decided, with the same verdict. The one exception is a pair the old pass decided on unsound ground (a value that may be null or absent): it may become Unknown, listed by name with the reason and accepted by the phase's reviewer.
7. *One SQL lowering.* `compile.ts`, `operators.ts` and `checks.ts` in `packages/remote-drizzle` call metakit's lowering for operations and keep query structure. Its hand-kept kernel operator table goes.
8. *The standard library, finished* (the six phases of the #601 note, on metakit). Numbers: decimal multiplication as a core operation with its SQL, written in integer arithmetic that rounds an exact half to the even neighbour ("half-even") the same way on every database (today's `Decimal.mul` is an `Opaque` node that SQL refuses); `times`; `div` and `rem` with a named rounding and a declared answer for a zero divisor (`onZero`); `round`, conversions. Choice: `coalesce` beside the existing `when` and `match`. Time: `addMonths` with the clamp, `daysBetween`, `startOfMonth`, `today(zone)` as a bound value, timestamps and durations recognised from Effect's Schemas. Text: `lowerAscii`, `upperAscii`, `concat`, `endsWith` (`trim` moves to item 11). Rows: as in item 3. Lists and sets of scalars. Each enters by the admission rule.
9. *Soundness leftovers.* `Transition.when` is typed `boolean | null`, and a null guard refuses. A rule on an optional key holds when the key is absent, in decode, SQL, checker and prover alike (`rulesOf` reads it as always present today). Arithmetic over an unbounded `Schema.Finite` is proved with the solver's floating-point theory under a time limit, and answers Unknown past it (it is never proved today). `Rows.sum` accepts a decimal product as its contribution, and an in-memory sum refuses a total past the safe range.
10. *The other packages.* `foldkit-guard`: row rules are metakit expressions over `{ row, principal }`; `Condition.residual` and `Condition.judge` are replaced by `Expr.residualize` and `judge`; rules live on the one Entity handle (`Guards.enforced` began this). `foldkit-remote-domain`: `Lower.check` and `Lower.write` lower through `transitionOf`. `packages/guard/src/check.ts` loses its own partial translation and uses item 4's. `foldkit-sync`: laws and transitions written with metakit, through `foldkit-sync/metakit` (which stays a subpath), become the documented way; a `holds` function remains as an opaque law the checker answers Unknown for. `foldkit-remote`: local matching and prediction evaluate through metakit.
11. *Operations for ordinary list, text and optional-value edits.* What the first consumer could not say (see "Where things stand today"), as the kernel note's section "How is a list in an application's state read and changed?" decides it. Each enters under the #601 admission rule ("What stays out"): every reader implements it exactly or refuses it by name; it has conformance cases including the awkward values (the empty list, a list holding null, a duplicate id, an absent key, a null test); it is total or declares its partial answer; it reads only its arguments. A property is declared only where a generated check and a named consumer both exist.

| Form | Gives | Partial case | Properties (note), and who reads them |
| --- | --- | --- | --- |
| `Arr.any`, `Arr.every` | Some, or every, element passes | Empty: false, true | From `bool.or`, `bool.and`: Phase 4, `Expr.judge` |
| `Arr.count`, `Arr.sum` | A number over the elements that pass | Empty: 0; past 2^53-1 refused | Comm., assoc. unless refused, identity 0, invertible: Phase 4 |
| `Arr.min`, `Arr.max` | The least or greatest | Empty: null | Comm., assoc., idempotent: Phase 4 |
| `Arr.find` | The first element that passes, or a value of it | None passes: null | none: order shows |
| `Arr.keep` | The elements that pass, in order | none | none (a list is classified by its body; Phase 4) |
| `arr.append`, `arr.include`, `arr.exclude` | The list with an element at the end; a sorted set with a value in or out | none | Via `writeProperties` (item 12) |
| `str.trim(text)` | Without leading or trailing space, tab, LF, CR | none | Idempotent: partial evaluation |
| `null.coalesce(a, b)` | `a`, or `b` when `a` is null | none | Identity null, idempotent: partial evaluation |
| A path to an `Option` field | `state.undo.id`: the id, or null when there is none | An `Option` of a nullable type is refused | none |

   In the table, "assoc." is associative and "comm." commutative. A test that gives null does not pass, and a null list gives null. An `Option` field reads and is written as nullable, so no operation builds or opens one; that also ends today's failure to infer `Option.none()`. A path segment `*` stands for every element, so footprints name elements (`todos.*.completed`). SQL refuses every list form by name in this phase; the checker knows the length after `append`, `insert` and `keep`, and answers Unknown otherwise; the solver answers Unknown with the reason `unsupported`. Parsing a URL or decoding stored strings is not an operation: `Transition.opaque` (item 12) declares such a Message's footprint around ordinary code. Files: the note's steps 1 (`str.trim`, `null.coalesce`, `Option` paths) and 3 (folds, `arr.*`, `path.ts` for `*`).

12. *Ways of writing.* Today a transition can only set a path. `packages/metakit/src/transition.ts` gains named ways of writing. Each still builds "this path becomes this value", so the evaluator reads them unchanged; the name is recorded beside the write for the readers that decide from it. The kernel note's table ("Ways of writing") gives each one's entity parts, whether two on one path commute, whether twice is once, and what undoes it.

| Way of writing | Entity write parts that lower to it | Two on one path |
| --- | --- | --- |
| `set` | `sets`, `links`, context values, `assignments`, the revision | Commute only for one literal value |
| `add(path, amount)` | `increments` (a decrement negates the amount) | Commute; undone by the negated amount |
| `append(list, element)` | none | Do not commute: order shows |
| `insert(list, element)` | none (a row's insert sets `present`, item 5) | Do not commute: order shows |
| `remove`, `removeWhere` | none | Commute |
| `patch`, `patchWhere` | none | When they set different fields and read none the other sets |
| `include`, `exclude` | none (a set is a list of scalars kept sorted) | Commute, unless one of each with one value |
| `opaque(reads, writes, body)` | none: ordinary code, declared footprint | Unknown |

   A key that no element has changes nothing, and the step returns the list it was given, so a no-op keeps the Model's identity. Then `Transition.commutes(a, b)` answers a `Verdict` from footprints and `writeProperties` by the note's six rules ("Do two transitions commute?"). It answers True only for pairs the table lists as commuting, with any `add` that could be refused in one order shown in range by the checker. Every other overlapping pair is Unknown with an obligation of the kind `walk`, and it never answers False. In todo-app, `ToggledTodo` and `RenamedTodo` commute; `ToggledTodo` and `ClearedCompleted` are Unknown, and a walk shows they do not commute. Phase 5 item 8 is its consumer.

13. *The properties and their checks.* A new `packages/metakit/src/properties.ts` holds `OpProperties` (an optional field per property of "Laws decide", plus `reflexive` and `involution` for partial evaluation alone) and the table `opProperties`, typed by every core operation id; `Op.laws` and `OpLaws` leave `node.ts`, and partial evaluation reads the table. `foldProperties` and `writeProperties` sit beside it. The note's section "Which properties does an operation, a fold or a way of writing declare?" lists what each operation declares (for example `num.add`: identity 0, commutative, associative unless refused, inverse `num.sub`, monotone up in both); `eq.is` is commutative and `num.mul` associative, but nothing reads either, so neither is declared. A page that runs `Expr.judge` carries the whole table; step 1 measures it and splits it by family if rule 4 needs. The aggregates' `algebra` and `requiresRescanOnDelete` (`src/aggregates.ts`) stop being declared and are read off `foldProperties`. The checker's hand-kept monotonicity in `src/abstract/ops.ts` reads `monotone`. The conformance suite generates a check of every declared property from the tables, over null, absent, NaN, refused, zero and the ends of the safe range, so no property is declared unchecked. A property holds over a stated domain: integer `num.add` is associative only where neither grouping is refused, and nothing over floats is declared associative. Entity's `Law` kinds (`packages/entity/src/law.ts`) move onto the same set when item 4 moves its operators; `Distributes` has no consumer and is dropped, and `PreservesCollation` goes with collations. A foreign operation carries its declared laws and no reader acts on them in this phase.

14. *Supplied inputs, Commands as a list, and the defects Bout 3 found in the kernel.* `Transition.make` takes `supplied` beside `state` and `input` ("What stays out"); `Transition.step(transition, state, input, supplied)` takes the values; a replay passes the recorded ones. The Foldkit side that binds them at dispatch is Phase 3's item 4. `emits` becomes a list of `Transition.emit(tag, fields, { when })`, each evaluated over the state before the change; `Machine.update` returns the list (the note, "How are Commands declared?"). The defects: `Option.none()` inference ends with the nullable reading of item 11 (step 1); `PathAccessor` is exported from metakit's main entry, ending TS2883 (step 1); and step 3 moves `readsOfNode` to `ops/reads.ts` and `can`, `canDispatch` and `affordances` to a module of their own, so a page that runs transitions and reads footprints carries no `ops/residualize`. That last move breaks `machine.canDispatch(tag, partial)`, which becomes `Machine.canDispatch(machine, tag, partial)` (callers: `packages/agent/src/metakit.ts`, `examples/metakit/src/demo.ts`). Each fix comes with a test that failed first: a `*.test-d.ts` for inference, a declaration-emit build of a fixture project, and a `publishedBuild.test.ts` row.

**How Phase 1 is ordered.** The kernel note's "In what order is Phase 1 built?" sets eleven steps, which replace this list's numbering as the order of work. Each step's files, deletions and breaks are in the note.

| Step | What | Items | Model |
| --- | --- | --- | --- |
| 1 | metakit: `metakit/build`, new operations, `opProperties`, foreign operations, `supplied` | 11, 13, 14; part of 12 | most capable |
| 2 | One `Verdict` | 2 | Sonnet |
| 3 | metakit: `Rows`, lists, ways of writing, `emits` as a list, `commutes`, `can` moved | 3, 11 to 14 | most capable |
| 4 | entity: the translation and its differential test | 4 | most capable |
| 5 | entity: the judge reads the translation | 4 | Sonnet |
| 6 | entity: `transitionOf` | 5 | Sonnet |
| 7 | entity: `Laws.check` on metakit, then `bounds.ts` deleted | 6 | Sonnet |
| 8 | remote-drizzle: operations lowered by metakit | 7 | Sonnet |
| 9 | guard, remote, remote-domain, sync | 10 | most capable for guard |
| 10 | entity: constructors build metakit; `expr.ts` split; old types deleted | 4 | most capable |
| 11 | Standard library and soundness leftovers | 8, 9 | Sonnet, per family |

Step 2 runs beside steps 1 and 3; step 8 beside steps 5 to 7; step 11 beside everything from step 4 on. The others wait for the steps they name. The first consumer of steps 1 and 3 is `examples/todo-app`: its gap list is run again after step 3 (see "Done when"). The phase's soundness review runs after step 6, before Phases 2 to 5 build on it; the guard security review runs after step 9. The coordinator writes each step's brief from the note's text for that step (its files, deletions, breaks), with the inner loop being the one package's `tsc -b` and the step's own test files. Step 1 is the next bout to brief, and it waits for the note's commit.

**Depends on.** Phase 0's split (done). Its "Done when" compares with the ledger of Phase 0 item 2, which must exist before step 10 reads it.

**Replaces or deletes, and the migration.**

- Deleted: `packages/entity/src/bounds.ts`, the scalar half of `evaluate.ts`, the `Predicate` union and its interfaces in `expr.ts`, `memoryTable.ts`'s kernel table, `jsonSchema.ts`, `packages/remote-drizzle/src/operators.ts`' kernel table, guard's `Condition` evaluator, the aggregates' declared `algebra` and `requiresRescanOnDelete`, entity's `Distributes` and `PreservesCollation` law kinds. `enumerate.ts` stays (the kernel note).
- Breaking for users: code that inspects an expression's `_tag` (`'Eq'`, `'Compare'`, …) reads metakit nodes instead. `Data.can` and guard answers are a `Verdict` in memory. `Laws` is imported from `foldkit-entity/laws`. An aggregate's `algebra` field is gone. The wire's `collation` field on a computed assignment is refused. `Operators.kernel` no longer lists `number.add`, and an application operator id under a core prefix (`number.`, `text.`, `rows.`, …) is refused. A rule on an optional key no longer fails for an absent key. `Transition.when` may be null. The upgrade guide lists each with the compiler error and a before and after.
- Not breaking: `Expr.eq(Product.fields.price, …)`, `Query.define`, `Mutation.update`, `Entity.invariant` call sites, and the wire names of operations (`number.add@1`).

**Hazards and tests.**

- *Two languages while the move is in flight.* The move goes reader by reader behind entity's unchanged constructors, each step keeping `foldkit-entity/conformance` green on memory, SQLite and PGlite. No release is cut between step 2 and step 10, so no deployed page and server meet half-moved.
- *A reader drifts.* Every operation's cases run through every reader; the section 3.2 table of the #601 note becomes named cases.
- *The new checker decides less.* The differential test of item 6.
- *Entity pages grow.* The byte rule below.
- *Type-check time grows.* The kernel note's prototype found 25 instantiations a call on metakit against 27 today over 165 calls; step 10 measures `tsc -b packages/entity` against the ledger, since the prototype's longest expression read six fields; #190 names type cost as the deciding risk.
- *Guard regresses.* A security review of item 10: no path where a rule that cannot be evaluated allows.
- *A declared property is false.* Item 13's generated checks, over null, absent, NaN, refused and out-of-range operands; each property has a mutation that declares it on an operation it does not hold for (commutative on `num.sub`) and must turn the suite red.
- *A list operation means different things per reader.* Item 11's cases include the empty list, a list holding null, a duplicate id and an absent key; a reader that cannot agree refuses by name.
- *A keyed write hits the wrong element, or two.* Item 12's tests cover an id that is absent (`remove` and `patch` change nothing and return the list they were given, tested with `toBe`), a duplicate id (every element with that key is changed or removed; a test pins it), and `insert` of a key already there (nothing changes).
- *`Transition.commutes` says True wrongly.* Each of its six rules has a mutation; a seeded test runs every pair it calls True in both orders over generated states and requires equal results.
- *The operation set never stops growing.* The stopping rule is the admission rule plus a consumer: an operation is added when a Message of a proof example, or a rule of a fixture, needs it, and it is named in the bout's report.

**Done when (measured).** The client budgets of `examples/entity`, `examples/chirp`, `examples/reference` and `examples/registry` are at or under their Phase 0 readings. A page naming one operation ships no other (new test). `Laws.check` on the bank fixture decides every pair it decides today, and `ChargeFee` against `neverOverdrawn` without the solver. The conformance run stays under 30 seconds in the unit project. `tsc -b packages/entity` is within 15% of its ledger time. A search of `packages/*/src` finds one evaluator, one checker and one operation-to-SQL lowering. After step 3, Bout 3's gap list is run again on `examples/todo-app`: every Message it listed as needing a list, text or optional-value operation or a new id is declared (the note expects 23 of 25 with no hand-written arm, `UrlChanged` and `MirrorRestored` through `Transition.opaque`), the page's budget reading is taken, and both go in the ledger (Phase 3's gate reads them). A page that runs transitions and reads footprints holds no `ops/residualize` (step 3's build test). Every declared property has a generated check and a named consumer, or is gone.

**Review.** Adversarial soundness review of the evaluator and checker paths, of every declared property (the reviewer looks for an input that breaks one), and of the keyed writes; a separate security review of guard.

**Size.** 21 bouts: the design note; steps 1 and 3 at two bouts each; steps 2 and 4 to 10 at one each; step 11 at five (one per family of the #601 note); the two reviews; the re-run of the gap list. The models are the step table's. Haiku: renames once a shape is decided. Step 1 is in `packages/metakit` only; step 3 also edits the two callers of `canDispatch` (`packages/agent`, `examples/metakit`).

## Phase 2: one dependency graph

**Goal.** One structure answers "what can this change affect" for every consumer. Issues #581, #586, #587, #588.

**Scope.**

1. *The structure* in `packages/metakit/src/graph.ts` and new files beside it: nodes for paths, writers and readers; edges with the three-way knowledge tag moved from entity's `Footprint`; a path index so a lookup does not scan; `affectedBy(writer)`, `readersOf(path)`, `writersOf(path)`, `explain(writer, reader)` and `unknowns()`. Model paths and stored-row fields share one address scheme, joined where a Remote read turns row fields into a Model path. The path-matching function a page may carry (rule 3) is a module of its own, importing only `path.ts`; `pruneStatic` and `queryReadiness` move to modules a page does not load. Measure: `examples/todo-app`'s page no longer holds `ops/residualize` (3,375 B minified today) unless its own code calls partial evaluation, asserted in `publishedBuild.test.ts` and read off its budget.
2. *The Foldkit side.* `Graph.of(module)` in `packages/surface/src/graph.ts` builds the one graph from the contracts it already reads, plus the application's machine. Its law validation becomes a query on the graph.
3. *What each of the five becomes.*

| Today | Becomes |
| --- | --- |
| `Module`/`Graph` contract graph (surface) | The builder of the one graph; its validations are queries on it |
| Remote write-to-query impact (`impact.ts`, `reaches.ts`) | Query and write nodes in the graph; `impactOn` joins it with row deltas |
| `Projection.derive` and `SlotView.region` memos | Readers in the graph; a memo asks the graph before comparing values |
| Bundle drawing memo (`bundle/src/memo.ts`) | A placement is a reader of its path; the memo is keyed by declared paths |
| Sync closure and replay diff (`mount.ts`, `make.ts`) | Ownership is in the graph; perturbation runs only for undeclared Messages |
| `Graph.analyze` (metakit) | A thin call over the one structure |

4. *Consumers.* Rendering: `Surface.rootView` skips by declared paths by default when the application has a machine and the projection's reads are complete (#587), and `SurfaceView.toRenderer` in `packages/mixins-surface` gets the same skip. The counter `Writes.of` keeps at module level (`started` in `packages/surface/src/writes.ts`, which tells Foldkit's own throw from a drawing's) moves into each instance, with a test that two instances, and two server renders in one process, do not see each other's count. Bundle: the drawing memo and declared paths see each other (#586). Remote: a Message whose writes do not reach the store's path skips the read planning. Today `observeEntry` in `packages/remote/src/domain.ts` reuses its plan only when `asked.storeOnly` holds (a bare Surface or `Remote.observe`); the graph extends that to `Surface.at`, families and `Data.active`. A write settled in another tab invalidates only the connections it can reach. Resume: `coverOf` in `packages/ssr` asks the graph. The write verifier (`WritesCheck`) also checks Sync ownership. The provers take the pairs for obligations from the graph.
5. *The stale-drawing case.* `Writes.of` recognises a Remote read by its projection's metadata and always draws it again. A value derived from a Remote read with `Projection.derive`, or a plain reference into the store, carries no such metadata, and the skip keeps its drawing. The bout first writes the failing test, then closes it by making Remote's reducer steps writers of the store path in the graph, so any reader under that path is reached.

**Depends on.** Phase 1's steps 1 to 6 and their review (they deliver the translation of item 4 and the writes of item 5). What it reads from them is items 4 and 5: entity's reads come from the one walker, and writes are transitions. Items 1 to 3 here can start on metakit transitions before Phase 1 ends. The skips of item 4 are built and measured on `examples/todo-app`, which has a machine from Bout 3; domains-plus gets them when Phase 3 gives it one.

**Replaces or deletes.** `packages/remote/src/reaches.ts`' own derivation; the separate walkers in `Graph`; the duplicated "owned fields" helpers in `packages/sync/src/make.ts` and `packages/surface/src/closure.ts`; `Closure.reads` perturbation for documents whose Messages are all declared, and with it the `try` in `readsOutside` (`packages/sync/src/mount.ts`) that reads a throw as "nothing read". Breaking: `Surface.rootView` skips by default (a projection with undeclared reads must say so, and the development check reports one that does not); `Graph.analyze`'s result shape.

**Hazards and tests.** *A skip that is wrong shows a stale page.* Every skip has a reference in development and tests: run the full path too and compare (#581's matrix), with a recorded counterexample test for each fallback. *Unknown read as empty:* a mutation that drops the unknown edge must turn a test red in each consumer. *Counting renders:* a runtime test with two Surfaces and two transitions, as #587 describes, since a memo's first change always misses.

**Done when (measured).** On `examples/todo-app`, a Message that writes one Surface's paths calls no other Surface's renderer (render counts from `scripts/render-baseline.mjs` against the ledger). `askedOf` runs zero times for a Message that does not write the store. Building the graph for `examples/reference` takes under 5 ms at definition, on the ledger's machine. No page budget grows for an application without a machine. The review lists every function that walks a declaration for the paths it reads or writes, and there is one.

**Review.** Adversarial: the reviewer tries to make each consumer skip something that changed.

**Size.** 9 bouts. Most capable model: the structure's API and the review. Sonnet: one bout per consumer.

## Phase 3: `update` as declared transitions

**Goal.** An application states its Messages as one machine. Every package takes that machine as input. Hand-written `update` arms keep working beside it.

**What must be true first.** This phase is a bet that a real `update` can be stated as data at an acceptable cost. Before items 2 to 6 are spent, one bout (most capable model) gathers six measurements into the ledger and the coordinator reads them. Today's readings come from Bout 3 (`70585f667`) on `examples/todo-app`.

| Premise | Measurement | Holds if |
| --- | --- | --- |
| Most Messages can be declared | todo-app re-declared after Phase 1 step 3; a counted gap list for domains-plus | todo-app: 21 of 25 at least (11 today, 23 expected); domains-plus: three in four |
| Their Commands can be declared too | Messages whose Commands run from emitted records through the tag-to-Command table | Half of the Messages that send a Command (none today) |
| The declared form is not much longer | Lines of each declared arm against the hand-written arm it replaced | The median is at most one and a half times |
| It does not slow the editor | `tsc -b` of each example with its machine, against the ledger | Within 15% of the ledger's time |
| It does not cost a page much | The page's budget reading before and after it opts in | Under 5,000 B brotli (4,209 B today); under 3,500 B after Phase 1 step 3 and Phase 2 item 1 |
| It buys something | Renderer calls per Message (`scripts/render-baseline.mjs`) | A declared Message draws only the Surfaces it writes (true on todo-app today) |

   The byte cost is paid once per page that opts in. todo-app's ceiling was raised to 171,000 B to take today's 169,292 B. Each later example that opts in may grow by at most the 5,000 B of the table (3,500 B once the two fixes land) over its own Phase 0 reading.

   The thresholds are proposals for the maintainer to set once the first numbers exist. *If a premise fails,* the phase is not cancelled; it takes its smaller shape. Declared transitions are an opt-in for the Messages that fit, through `foldkit-surface/writes` as it is today plus Phase 1's operations. Hand-written `update` stays first-class and is what the guides teach first. Items 2 (a derived `update`, Messages typed from the machine) and 6 (every package takes the machine) are dropped, except for the packages where a declared Message already pays: Form's guards, Agent's tools and Sync's recorded edits. Phases 6 and 7 then read their own gates with that in mind.

**Scope.**

1. *Design note* (`docs/design/metakit-declared-update-DESIGN.md`), fed by the gap list of the third bout below. It fixes the names; the rest of this list is the recommended shape.
2. *The application layer*, in `foldkit-surface` on a new subpath beside `writes` (proposed: `foldkit-surface/declared`). From a composed machine it gives: the Foldkit Message union, typed from the transitions' inputs; a table from each emitted record's tag to the application's Command constructor, exhaustive by type, so no `update` arm is written by hand to run one (the kernel note, "Commands"); for each Command, the Message tags it may send back, so the graph has Message-to-Message edges; and `update`, derived from the machine.
3. *Coexistence.* A Message with no transition is handled by a hand-written arm, recorded in the graph as reading and writing unknown paths. In development and tests `WritesCheck.verify` compares what each declared Message actually changed with its declaration. An application moves one Message at a time. Two things Bout 3 found are closed here. The verifier cannot see a transition and the arm that runs it drift together, since it compares the arm with the declaration the arm itself runs; the derived `update` of item 2 removes the second copy, and `WritesCheck.verify` then checks only `Transition.opaque` bodies and hand-written arms (the kernel note, "How are Commands declared?"); until an arm is derived the example keeps a test of its behaviour that does not go through the transition. And a Command that reads the Model from before the change: `emits` is evaluated over the state before the writes, which is what those Commands need, and the layer of item 2 is what finally runs an emitted Command.
4. *Kernel additions the layer needs*, in `packages/metakit`. Elements chosen while the application runs, values bound at dispatch, and code that stays code (`Transition.opaque`) are Phase 1's items 12 and 14. Left for this phase: a child machine per element of a keyed collection (`Machine.lift` along a key), a write that moves an element, and several Commands from one transition. The layer binds supplied inputs (a new id, the time) when a Message is sent and records them in it, so a replay is exact.
5. *Opaque but confined children.* A Bundle without a machine is placed as a child whose writes are confined to its path and whose reads are unknown within it. The graph stays exact outside the child. The write verifier holds the confinement.
6. *Each package takes the machine.* Surface: `Writes.of` is the default drawing path. Bundle: a Bundle exposes its machine, a placement is `Machine.lift` at its path. Remote: its Messages are writers of the store path; `Data.can` asks the machine. Sync: `make({ transitions })` takes the durable subset of the application's machine. Form: a submit is a transition and a control's disabled state is its guard. Agent: `machineTools` takes the application's machine. SSR: Phase 6. Mixins: the widget Bundles in `packages/mixins-ui` gain machines in batches, three first (a disclosure, a tabs, a dialog), the rest confined until moved.

**Depends on.** Phases 1 and 2.

**Replaces or deletes.** `SyncDeclared.transition` per Message: the application's machine replaces it (breaking for users of `foldkit-sync/metakit`). `Writes.of` stays as the lower-level call; the layer calls it, so an application on the layer no longer calls it itself. An application that adopts the layer gets its Messages typed from the machine; one that does not is unaffected.

**Hazards and tests.** *A declared arm and its hand-written original disagree during a move:* a test replays each example's recorded Messages through both and compares Models with `toBe` on no-ops. *A no-op returns a new Model:* the derived `update` returns the Model it was given, tested. *Frame lag* (`docs/state-model.md`): Messages carry intent, so a transition computes from the Model, not from a drawn value; the held-frames test of `examples/registry` is repeated on the proof example. *Type cost of a large composed machine:* measured on the proof example.

**Done when (measured).** `examples/todo-app` and then `examples/foldkit/domains-plus` run with a composed machine. Each example's README lists the Messages left hand-written, with the reason for each. Their budgets are within the ledger's readings plus the measured size of the code every page with a machine runs, which the ledger records. View and patch time per Message is at or below the ledger's.

**Review.** Adversarial review of the derived `update` (ordering of Commands, no-ops, refusals) and of the confinement rule.

**Size.** 13 bouts, the first of them the gate. Most capable model: the gate, the design note, items 2 and 4, the review. Sonnet: per-package adoption, widget machines.

## Phase 4: maintained values, on the page and on the server

**Goal.** One mechanism keeps computed values up to date from row deltas. Issue #580, and the server side of the #601 note's aggregates.

**Scope.**

1. *Row deltas* inside `foldkit-remote` (#580's first work package): for each change, the row before and after as the page sees it, with its source (server, optimistic, restored). A live echo of a pending write is not counted twice.
2. *The mechanism*, generalising `packages/remote/src/aggregate.ts` into a `foldkit-remote/maintained` subpath: a maintained value with a definition, a source and a delta rule.

| Kind | On a delta |
| --- | --- |
| Sum, count | Add and subtract the row's contribution |
| Min, max, every, any | Constant on insert; an order index answers a removed extreme |
| Filtered, ordered list | Judge the changed row; place it by binary search on the order key |
| Join through a relation | A reverse index finds the rows that point at the changed one |
| Derived projection | Recompute only when a path it reads was written |

   A maintained value keeps its identity while nothing it reads changed. So a Surface over one row is not drawn again when another row changes, which is the finer half of #588. Which row of this table applies, and when a kind falls back to recomputing, is decided by item 10, not by a list kept beside it.

3. *The cost of a pending write on a large list.* A pending optimistic write on a 100,000-row list costs about 400 ms today because placing it walks the list: `insertsPlaced` in `packages/remote/src/layers.ts` calls `placeIn` (`placement.ts`), which scans and copies each segment's edges for every inserted row. Placement uses the order index.
4. *Coverage.* Whether a held list contains every candidate of another query is an implication between two predicates, decided by the synchronous checker when the queries are defined, never by the solver on a page. Only forms the checker decides count; the rest ask the server.
5. *Offline as-of reads* (#580's fourth work package): a retained result is "complete as of revision R", kept apart from "current", and never restores a server cursor.
6. *Indexes*, each added where the benchmark at 25, 100, 400, 5,000 and 100,000 rows shows it pays, and absent from a page that maintains nothing.
7. *On the server.* A derived member defined by a row aggregate can be stored: the writer in `packages/remote-drizzle` updates the parent's stored total in the transaction that writes the child. On Postgres it locks the parent row first (`select … for update`), which is also what makes a rule over an aggregate enforceable there, and declares `parentRowLock: true`. A Durable Object keeps the same totals in its storage. D1: see Phase 5.
8. *Change replay* (#580's sixth work package) is built for the Durable Object journal, which is ordered. For Postgres and D1 it is deferred: no ordered change log exists there, and adding one is a store design of its own.
9. *Dependent queries* (#606): a query whose parameters come from another read is asked only once `Graph.queryReadiness` says they are bound, so a cascading choice (a state, then its cities) sends no half-filled query. This gives `queryReadiness` its first caller.
10. *Update or rescan, chosen from properties.* When a maintained value is defined, `classify` (`packages/remote/src/maintained/classify.ts`) reads its definition and the property tables of Phase 1 item 13, and answers "update from the changed row" or "rescan", with a reason. It generalises the group and semilattice split that `aggregates.ts` declares today, reading `foldProperties` (Phase 1 item 13).
   - *A fold over rows.* An insert is applied from the row when the fold is associative and commutative. A delete, or an update's old value, is undone from the row when the fold is also invertible (`sum`, `count`). Otherwise (`min`, `max`, `any`, `every`) a delete of the current extreme asks item 6's order index, or rescans where there is none. Deltas that arrive together are combined first when the fold is associative.
   - *A filtered list* (a `keep`). A changed row is judged alone when the test reads only `each` and values that did not change (parameters, constants). A body that reads another row, or a Model path the change wrote, rescans. *A sorted list* adds one condition: the order key reads only `each` and ends in a unique tie-break (the id); then the row is placed by binary search.
   - *A join through a relation.* A change to the pointing row is a filtered list's case. A change to the row pointed at reaches the rows pointing at it through a reverse index. A body that hops a second relation, or holds a second `Rows`, rescans.
   - *A derived projection* is recomputed when the graph says a path it reads was written.
   - *The starting value.* A fold with an identity starts from it (0 for `sum` and `count`, false for `any`); one without (`min`, `max`) starts as null over no rows, as Phase 1 item 11 declares.

   A rescan is never silent: in development each maintained value logs its class once, and the item's report test lists every rescanning value of the proof examples with its reason. Tests: a table over every fold and each list and join form; the seeded differential test below, run in update mode, must equal recomputation. Mutations: declaring `min` invertible, or calling a body row-local when it reads a parameter that changes, turns the differential test red.

**Depends on.** Phase 1 (related rows, aggregates over decimals, the property tables), Phase 2 (the graph selects what a delta reaches).

**Replaces or deletes.** `aggregated` moves under the new subpath (breaking: the import path). `filtered` keeps its public meaning and is maintained underneath. The list-placement walk goes.

**Hazards and tests.** *A maintained result drifts from the truth:* seeded differential tests compare every maintained value with a full recomputation after each delta, over overlapping optimistic layers, a live echo while pending, a failed write, reconnect and restore. *A partial list presented as complete:* negative cases for each coverage form. *The lock deadlocks:* parents are locked in id order; a test runs two transfers in opposite directions on a real Postgres. *Indexes cost memory:* recorded beside the time.

**Done when (measured).** One changed row in a maintained list of 100,000 evaluates that row only (evaluations counted). A pending write on that list is placed in under 16 ms on the ledger's machine, against about 400 ms. A 25-row page is not slower and its budget does not move. Two concurrent overdrawing transfers on Postgres leave one refused.

**Review.** Adversarial: the reviewer writes delta sequences that try to double-count or lose a row.

**Size.** 14 bouts. Most capable model: the mechanism's API, coverage, the Postgres lock, the review. Sonnet: each kind, benchmarks, `classify` (item 10, after the mechanism's API and Phase 1 step 3).

## Phase 5: store capabilities and orderings, finished

**Goal.** Every store says what it guarantees, every rule that needs a guarantee is held to it, and every protocol's races are named and tested.

**Scope.**

1. *Capability declarations* for the stores that have none: the Durable Object store and the Sync stores, in `packages/durable`, `packages/sync` and `packages/remote-server`. The browser's IndexedDB replica is `eventual`. The authoritative replica takes its declaration from the store its host runs on. With the Drizzle writer (SQLite, D1, Postgres) and the memory writer, that is every store in the repository.
2. *Guard rules that read other rows* are held to a capability as data rules are: a row guard through a relation needs writers of the parent serialized, or the check and the write in one statement.
3. *Postgres:* the parent-row lock of Phase 4 item 7.
4. *D1, revisited.* The code declares D1 serializable because it is SQLite behind one writer, a batch is one transaction, and the writer judges a rule in the statement that writes. The #601 note says to refuse an aggregate rule there because a batch cannot branch on a read. Both are right about different writers. Decision: D1 holds an aggregate rule only when the rule is judged inside the writing statement; a writer that reads first and writes in a second round trip is refused. A concurrency test on the local D1 stack shows two overlapping writes with one refused, and the note is corrected.
5. *A late answer without a live read.* A domain with writes but no live read can still end on an older value, because the record of which answer is newest (`packages/remote/src/kept.ts`) is used only through the live capability (`keepRead` and `settleKept` in `capability.ts`). The record moves to where every domain with writes has it. This is code every such page runs, so its budget may rise by the measured amount.
6. *Obligations for the real protocols.* Latest-wins, optimistic rollback, reconnect and two tabs each declare their obligations in the package that implements them (`packages/remote`, `packages/sync`), and are discharged by seeded walks over the real reducers, not a model of them.
7. *A report that fails.* One test collects every declared obligation and every discharge in the repository and fails while one is open. `npx foldkit-plus laws` prints the same list.
8. *Only the pairs that need a test get one.* The graph (Phase 2) lists every pair of transitions of an application's machine whose footprints overlap. For each pair `Transition.commutes` (Phase 1 item 12) answers. A True pair needs no test and the report says why (for example, two `add`s to one count). An Unknown pair becomes an obligation of the kind `walk`: a seeded walk runs both orders from generated states, and the report of item 7 fails until it exists. Files: a new `packages/metakit/src/pairs.ts` beside `temporal.ts` (pairs from a graph and a machine) and its use in item 7's test. Proof: on `examples/todo-app`, the report lists the pairs it decided and the pairs it asks a walk for, and a mutation that declares `append` commutative removes a walk obligation and turns a seeded walk red.
9. *Sync convergence read from the declaration.* Replicas converge today by replaying the server journal's order (`packages/sync/src/make.ts`, `serverJournal.ts`), so a replica's optimistic result can be rebased. From item 8's verdicts, `foldkit-sync/metakit` derives, per pair of durable transitions, whether a rebase can change what a replica showed: never where the pair commutes, possibly where it does not. Each possible pair is an obligation, discharged by a two-replica walk in both orders. The experimental last-writer-wins register (`lww.ts`) is the declared tie-break for two `set`s of one field, and the walk checks it converges. A Message delivered twice to a replica needs no removal of the copy when every way of writing it uses is idempotent; otherwise the journal's ids remove it, and a walk that delivers twice checks both. Proof: a test with two replicas of `examples/todo-app`'s durable subset, both orders, equal documents; a mutation that drops the tie-break is caught.
10. *A pending write replayed over a newer server value, by one rule.* When a newer value for a field arrives while a write on that field is pending (a live patch, or a read answered beside the write), the write's way of writing for that field decides. Where it commutes with any change to the field (an `add`; a `remove` or a `patch` of another element), the write is applied over the newer value, exactly: this is today's relative layer (#498, `adds` in `PendingPatch`, `packages/remote/src/ledger.ts`). Where it does not (a `set`: absolute values, `computes`, links), the pending value is shown over the newer one, as the kernel note says and as absolute values do today; but the two cannot be ordered from themselves, so the field is kept and read again if the write's answer disagrees. That branch is what #499 does for a live patch and what `6782b2e93` (the #480 fix: `keepRead` in `packages/remote/src/liveEvents.ts`) does for a read; both become callers of one function, `replayOver` in a new `packages/remote/src/replay.ts`. A failed pending write is removed the same way: an invertible one (`add`) is undone by its inverse over the current value, and any other is dropped and its fields read again. It needs item 5, so every domain with writes has the record of which answer is newest. Tests: `packages/remote/test/temporal.test.ts` stays green unchanged; a new case resolves an `add` over a newer value without a second read; item 6's walks cover the orders of answer, patch and read. Mutations: treating `set` as commuting, and treating `add` as not, each turn a test red.

**Depends on.** Phase 1. Item 3 is Phase 4's item 7. Items 8 and 9 need Phase 2's graph and Phase 1 step 3; item 10 needs item 5 and Phase 1 step 3. The rest is independent of Phases 2 to 4.

**Replaces or deletes.** `EntityWriter.store` becomes required (breaking: a writer that names no store is refused at registration, where today only a rule reading other rows is). The separate keeping logic of the live-patch path and the read path (`keptBefore`, `keepRead`) folds into `replayOver`.

**Hazards and tests.** *A capability is declared and not true:* each declared capability has a concurrency test on the real store (PGlite cannot run two connections; the Postgres tests use the CI service). *A walk that cannot fail:* each walk has a mutation that removes the protection and must report `Broken` with a seed. *A pair decided True wrongly:* item 8's walks run on a sample of True pairs too, and any difference fails the build. *`replayOver` changes a case `6782b2e93` fixed:* its four mutations in `packages/remote/test/temporal.mutations.ts` are kept and must still be killed. *Code every page with writes runs:* item 10 sits in the remote reducer, so its page budgets are measured before and after (rule 4).

**Done when.** No store in the repository is undeclared; the obligations test passes with zero open; each protocol has a walk with a killing mutation; on `examples/todo-app` every overlapping pair is decided or walked; one function decides every replay over a newer value.

**Review.** Adversarial concurrency review, including the pairs `Transition.commutes` called True.

**Size.** 12 bouts: one per item, two for item 10, and the review. Most capable model: items 2, 4, 5, 10 and the review. Sonnet: items 1, 3, 6 to 9.

## Phase 6: resume without the runtime

**Goal.** A server-drawn page answers a declared press before Foldkit's runtime is loaded and ships only the data its changeable parts read. It keeps what a person did before any script ran, and hands over to the full runtime without rebuilding an element. Issues #436, #472, #607 and #608; the maintainer asked for this in full on #432.

**The baseline** (`metakit-phase-6-DESIGN.md`, domains-plus, CPU slowed four times): 212,869 B of compressed script before the first press; 1,474 ms of blocking; the runtime takes over at 1,333 ms; the first press reaches the next paint in 104 ms and shows in the cart at 280 ms (over the runs, that last figure ranged by 123 ms); the envelope is 10,741 B, 857 B compressed.

**What must be true first.** This phase is a bet that a small script can answer presses and that Foldkit adopts the page afterwards. Neither has been tried. Before items 2 to 7 are spent, one bout (most capable model) runs a binder spike: item 1's probes 2 and 3 as throwaway code in `examples/foldkit/domains-plus` behind an environment flag, committed to no package.

| Premise | Measurement | Holds if |
| --- | --- | --- |
| The binder fits | A script that decodes one Message, runs its transition and writes one anchor, by `clientBudget` | Under 20 kB brotli with the envelope reader |
| Foldkit adopts a changed page | Press "Add to cart" in the spike, then hydrate; `rebuiltElements` in `scripts/phase6-baseline.mjs` | Zero rebuilt elements; the cart keeps the binder's count |
| The binder has work | domains-plus's on-screen presses that are declared, send no Command and change only anchors | At least the cart and filter presses (counted after Phase 3) |

   `clientBudget` is in `scripts/bundle-budget.mjs`. The thresholds are proposals for the maintainer. *If a premise fails,* resume is limited to the reduced envelope: items 2 (the live set), 6 (input before boot) and 7 (static parts) are built, and the binder, bindings and hand-over (items 3 to 5) are not. Foldkit loads and hydrates as today, from a smaller envelope and with less to draw. "Done when" then drops the script bar and the binder's press time, and keeps the envelope, blocking and rebuilt-element readings. Phase 7 then reads its own gate with no binder.

**Scope.**

1. *Design note and three probes* (the gate runs the second and third). Does a region Foldkit holds as trusted HTML keep changes another script makes inside it across later renders? Does `Runtime.hydrate` adopt every element when it starts from a Model the binder changed? How many bytes is the smallest script that can evaluate a transition?
2. *The live set.* When the server renders, `foldkit-ssr` computes from the graph: the Messages the page can send (the tags bound to its elements, closed over the Messages their Commands send back), the paths those write, and the paths that the Messages and the changeable values read. Only that set goes in the envelope. A new kind of cover says "read only by parts that cannot change". In development the full Model is resumed as well, and a read of an omitted path is reported.
3. *Bindings and anchors.* A value a Surface shows can be declared as an expression over the Model (text, an attribute, shown or hidden, a keyed list's order). The server marks the element with the binding's id, an anchor. The view function stays the way the page is drawn by Foldkit; the binding says exactly what the value reads.
4. *The binder* (`foldkit-ssr/binder`): the script a page loads at start, grown from today's loader and its delegated listener (`packages/ssr/src/loader.ts`, `listen.ts`). It listens once on the document. For a press it reads from the element which Message to send (the envelope's `bindings` already hold this) and how to read a typed value into it. It loads that Message's transition, checks the Message against its Schema, applies the transition to the resumed state, and writes the anchors the graph says can change. It answers only Messages that are declared, have no Command, and whose affected values are all anchors. Anything else wakes the runtime.
5. *The hand-over.* The runtime's chunk loads when the browser is idle or at the first Message the binder cannot answer. It starts from the binder's state, hydrates, and takes the listeners. A press that arrives during the load is held and sent once.
6. *Input before boot.* `KeepTyped` and the kept checkbox, radio and select states extend to the scroll position, an open `<details>`, and every control the binder touched.
7. *Static parts.* A region that sends no Message and reads nothing in the live set is drawn into the HTML, its data is left out, and the client does not draw it.

**What our packages can do today, what needs upstream, and the fallback.**

| Need | In our packages today | Needs upstream | Fallback we build |
| --- | --- | --- | --- |
| Leave data out of the envelope | Yes, for regions under `SSR.static` | No | n/a |
| Skip drawing a static region | Yes: `SSR.static` | Cheaper adoption (request A) | Foldkit parses and compares the region |
| Answer a press before the runtime | Yes: our own script | No | n/a |
| Runtime hydrates after the binder | Believed yes (probe 2) | Hydrate from a Model (proposal 3) | The `init` substitution `SSR.hydrate` uses now |
| Keep a typed field through hydration | Partly: saved and written back | Leave a control alone (proposal 6) | Today's save and restore |
| Update inside a region after hand-over without drawing it | No | A subtree Foldkit does not own (request B) | The region is drawn by Foldkit after hand-over |
| No virtual tree at all, as #607 asks | No | A replaceable renderer (foldkit#1871, #1872) | Binder before hand-over, Foldkit with skips after |

So without any upstream change the plan delivers: the reduced envelope, declared presses answered before the runtime, a hand-over, and (in Phase 7) script by Message. The hand-over rests on the second probe of item 1. What stays blocked is a page that never loads Foldkit's renderer for parts that change after hand-over.

**The requests, as they would be sent** (for the maintainer; proposals 3 and 6 are already drafted in `docs/upstream-foldkit-ssr.md`):

> *Request A, a question.* A server-rendered region passed as trusted HTML is parsed and compared at hydration. For a region the application declares unchanged since the server drew it, would you accept an opt-in that adopts the served element as it is? We measured hydration of such regions on a 746-element page and can share the numbers. The Model stays the single source of truth: the opt-in says only that this subtree was drawn from it already. (Drafted by an AI assistant on the maintainer's behalf.)

> *Request B, a comment on foldkit#1871.* One more use for running a view with its own dispatch frame: a subtree that a small script updated before the runtime loaded, from the same Model and through the same Messages. After hydration that subtree needs to be either adopted without a redraw or left to an owner the application names. Is either in scope for this issue? (Drafted by an AI assistant on the maintainer's behalf.)

**Depends on.** Phases 2 and 3.

**Replaces or deletes.** `foldkit-ssr/loader` becomes the binder's smallest case (breaking: its entry and options). The resume plan's hand-picked `state` list is computed.

**Hazards and tests.**

- *The client draws differently from the server.* Keep the served elements before any script runs and assert, after hand-over, that every one is still in the document (`rebuiltElements` in `scripts/phase6-baseline.mjs`). A console warning is not a test.
- *A left-out value changes after all.* The development check of item 2; a server test that a region with a handler or a live-set read is refused as static (`BindingInStaticRegion` exists).
- *The binder and the runtime disagree about a transition.* Both run the same metakit transition; a test applies every declared Message of the proof example through the binder and through `update` and compares Models and anchor text.
- *A stale value after hand-over.* An end-to-end test presses through the binder, lets the runtime load, presses again, and reads the page.
- *A Message forged in the page.* The binder decodes every Message through its Schema and writes text, never HTML; a security review covers it.
- *The first undeclared press pays for the runtime.* Measured and reported beside script at load, as #472 required. A page chooses when the runtime loads through the plan's existing `start` (`now`, `idle`, `on-interaction`); the default follows the numbers.
- *Navigation on the client to a page never served.* An end-to-end test; the draw functions stay in the bundle.

**Done when (measured, same script, two runs).** On domains-plus: script before the first press under 20 kB compressed; blocking at load under 200 ms; a declared press at rest no slower than 280 ms plus 123 ms, the widest range the baseline saw for that press; zero rebuilt elements; the envelope no larger than today's; the first undeclared press reported. The numbers go in the ledger whether or not they meet the bar, and a miss changes the default, not the feature.

**Review.** Adversarial review of hand-over and of the live set's soundness; a security review of the binder.

**Size.** 15 bouts, the first of them the gate. Most capable model: the gate, the design note, the live set, the binder's contract, both reviews. Sonnet: anchors, input keeping, end-to-end tests, measurements.

## Phase 7: script cut along Messages

**Goal.** The page loads the script a press needs when it needs it.

**What must be true first.** Cutting script by Message can move only the application's own `update` code: hydration calls the whole view, and the runtime is what hydrates. On domains-plus that code was 16.6 kB of 217 kB compressed, against about 91 kB for Foldkit and Effect (`metakit-phase-6-DESIGN.md`, from earlier reports it did not repeat). So it pays only once Phase 6 has taken the runtime out of the start path. One bout (Sonnet: it measures and decides nothing about an API) measures, with `measure` in `scripts/bundle-report.mjs` on the built page after Phase 6:

| Premise | Measurement | Holds if |
| --- | --- | --- |
| The runtime is out of the start path | Script before the first press, after Phase 6 | Phase 6's gate held and its binder shipped |
| There is enough to cut | The application's transitions and Command code, against the script before the first press | At least a quarter of it |

   *If a premise fails,* Phase 7 cuts by Surface and by child machine only (item 1's first two cuts, which `Bundle.lazy` already does for a part), keeps the failure handling of item 4, and builds no per-Message chunks or per-tag manifest.

**How the examples build today.** Each example is a Vite build with `@foldkit/vite-plugin`; domains-plus adds `styles` from `foldkit-mixins/vite` and, under an environment flag, `runtimeChunk` from `packages/ssr/src/runtimeChunk.ts`, which splits the runtime from the loader. `Bundle.lazy` (`packages/bundle/src/lazy.ts`) already loads a part's `update` and view at the first Message that reaches it.

**Scope.**

1. *Where the cuts are.* Per Surface: what `Bundle.lazy` does. Per child machine: a child of `Machine.compose` given as a dynamic import. Per Message: a transition and the code that writes its anchors, which is all the binder needs; and, in a second chunk the runtime loads, the Effects of its Commands.
2. *How the build produces it.* No source transform. The application's declarations name their own dynamic imports, the bundler splits on them, and a plugin in `foldkit-ssr/vite` writes a manifest (Message tag to chunk, and which chunks to fetch together) into the server's plan.
3. *What loads when.* At start: the binder and the manifest. When idle: a preload of the chunks for Messages bound to elements on screen. On intent (pointer over, focus, touch start): the chunk itself. On the press: the transition runs, waiting up to 3 seconds for its chunk.
4. *A chunk that fails on first press.* A held form is released to the browser's own submission. Any other press is retried once, then the control is marked failed and a declared fallback is shown; nothing is sent twice.
5. *After hand-over.* The runtime's `update` takes arms as their chunks arrive; a Message for an arm not yet loaded waits for it, as `Bundle.lazy` does today.

**Depends on.** Phases 3 and 6.

**Replaces or deletes.** `runtimeChunk` is absorbed by the manifest plugin (breaking for a Vite config that names it; only domains-plus's does).

**Hazards and tests.** *A press before its chunk:* an end-to-end test holds the chunk request and asserts the press happens exactly once. *A failed chunk:* the test fails the request, as `loader.e2e.ts` does. *More total script:* total bytes are reported beside bytes at start. *A Message in two chunks:* the manifest test asserts each tag has one home.

**Done when (measured).** On domains-plus, the chunk for "Add to cart" is under 3 kB compressed and loads on intent; total script is within 3% of the baseline's 212,869 B compressed (today the whole script loads before the first press, so that figure is also the total); the failure tests pass.

**Review.** Adversarial review of ordering between a press, a chunk and the hand-over.

**Size.** 10 bouts, the first of them the gate. Most capable model: the manifest's contract and the review. Sonnet: the gate, the plugin, tests.

## Phase 8: examples and documents on the new base

**Goal.** What a reader runs and reads shows the new base, and nothing describes the old one.

**Scope.**

1. *The running proof.* `examples/todo-app` is the first example on a composed machine (the third bout below), because it is small. `examples/foldkit/domains-plus` is the measured proof, because both resume issues and the baseline use it. It gains the machine, and with it Phase 2's skips, in Phase 3; bindings, the binder and chunks in Phases 6 and 7.
2. *The rest, in order:* `examples/reference` (after the other session working there finishes), `chirp`, `registry`, `cms`, `pages`, `writes` and `writes-domain`, then the other examples with a server or Remote data (`cloudflare`, `auth`, `entity`, `remote`, `sync`, `todo`). An example that only shows widgets or styling moves only where it calls an API this plan deleted. Each move declares the Messages, turns on the write verifier in its tests, and records its budget.
3. *Guides.* One page per job, by `docs/agents/writing-docs.md`: declare your `update`; see what a Message can affect; keep a list up to date; make a page answer before the framework loads; cut script by Message; hold a rule to a store. `docs/expressions.md` gains a section per value type. An upgrade guide for Phases 1 to 3's breaking changes.
4. *The skill.* `skills/foldkit-plus/SKILL.md` and the references for entity, metakit, surface, remote and ssr, each snippet compiled, each "Checked against" line set when checked.
5. *The site.* Catalog entries for every new guide; the demos rebuilt.
6. *A post*, opening with the problem a reader has, with the measured results and their source.

**Depends on.** Each phase lands with its own README section, skill reference and changelog entry; this phase is the examples beyond the proof and the documents that span phases.

**Replaces or deletes.** Guide sections and skill snippets that show `Condition.residual`, entity node tags, `foldkit-ssr/loader` or the per-Message `SyncDeclared.transition`.

**Hazards and tests.** *A snippet that no longer compiles:* every snippet is compiled (`node scripts/docs-check.mjs <file>`, or the temporary `*.test-d.ts` recipe). *A claim the code does not keep:* each sentence is checked against the source, negative claims included. *An example moved without its checks:* each moved example keeps its end-to-end file green and records its budget.

**Done when.** No example calls an API this plan deleted; every guide has passed a cold reader; the site lists them.

**Review.** A cold reader per document; one reviewer compares each moved example's behaviour with its end-to-end tests before and after.

**Size.** 10 bouts, Sonnet, with Sonnet cold readers; the post is reviewed by the most capable model.

## Where each open item goes

| Open item | Phase |
| --- | --- |
| `Decimal.mul` has no SQL lowering | 1, item 8 |
| Postgres takes no parent-row lock | 4, item 7 |
| D1 declared serializable against the #601 note | 5, item 4 |
| Capability declarations for the Durable Object and Sync stores | 5, item 1 |
| Guard rules reading other rows not held to a capability | 5, item 2 |
| A pending write on a 100,000-row list costs about 400 ms | 4, item 3 |
| The plan short-circuit covers only a bare Surface and `Remote.observe` | 2, item 4 |
| A late answer without a live read ends on an older value | 5, item 5 |
| A value derived from a Remote read is kept by the declared-writes skip | 2, item 5 |
| #586: the Bundle memo and declared paths do not see each other | 2, item 4 |
| #587: `SurfaceView.toRenderer` untouched; the skip is opt-in | 2, item 4 |
| #581: the write verifier does not check Sync ownership | 2, item 4 |
| `Transition.when` typed boolean though a guard can be null | 1, item 9 |
| Unbounded `Schema.Finite` arithmetic is never proved | 1, item 9 |
| A rule on an optional key read as if the key were always present | 1, item 9 |
| `Rows.sum` refuses a decimal product; no safe-range check on sums | 1, item 9 |
| No example declares its Messages as a machine | Bout 3 (done: 11 of 25), then 1 step 3, 3 and 8 |
| Lists, trimming, `Option`s, record reads and new ids cannot be stated | 1, items 11, 12, 14 |
| `Transition.set(path, Option.none())` does not infer | 1, item 14 |
| Exported unannotated `Transition.make` with `emits` fails declaration emit (TS2883) | 1, item 14 |
| `ops/residualize` reaches every page that runs a step (through `Machine.make`) | 1, item 14 (step 3) |
| `metakit/graph` reaches the page through `foldkit-surface/writes` | Rule 3 revised; 2, item 1 |
| `WritesCheck.verify` cannot see a transition and its arm drift together | 3, item 3 |
| `Writes.of` keeps a counter at module level | 2, item 4 |
| A transition's `emits` describes a Command; nothing runs it | 3, item 2 |
| Declared laws checked by no consumer (entity's eight of nine) | 1, item 13 |
| No decision whether two overlapping transitions commute | 1, item 12; 5, item 8 |
| Pending-write replay over a newer value decided case by case | 5, item 10 |
| Five mutations in `metakit.mutations.ts` survive at HEAD | 0, item 7 |
| The CI retry path has never run | 0, item 6 (review) |
| New guides not in the site catalog; no cold reader; "Checked against" lines | 0, item 4 (done) |
| The CI flake (`VITEST_BROWSER_CONNECTION_CLOSED`) | 0, item 6 (handled, recorded on #582) |
| Budgets raised this week; others under 350 B of headroom | 0, item 3 |
| PR #592 and the `ui-polish-ci` branch | 0, item 5 |
| The blog image folder named for 0.41 | 0, item 5 (done) |
| `npx jev-pref sync`; `pnpm check:changed` never verified | 0, item 5 |
| #580: coverage proofs, offline as-of reads, indexes | 4, items 4 to 6 |
| #580: change replay for Postgres and D1 | Deferred: no ordered change log there |
| #606: dependent queries | 4, item 9; a guide in 8 |
| #588: Remote projections declare no path | Store field done this week; finer reads in 4, item 2 |
| #579: content fingerprints of definitions | Not in this plan: no phase here needs one yet |
| #609: machines on a cluster | Not in this plan: no design exists |

## Order, and what can run side by side

Phase 0 comes first and is small; Phase 1's design note is written beside it. What is left of Phase 0 (the ledger and budgets, the surviving mutations) touches `docs/design`, budget files and `packages/metakit/test`, and runs beside Phase 1's step 1 as long as the mutation bout and step 1 do not both edit metakit's tests at once. Phase 1 is the long pole, ordered by the kernel note's steps ("How Phase 1 is ordered"): Phases 2, 3, 4 and 5 all read its one walker and its writes-as-transitions, so they wait for its steps 1 to 6. They do not wait for step 11 (the standard library and the soundness leftovers), which runs alongside them in `packages/metakit/src/ops` and `src/domain`.

The laws thread runs through four phases in order. Phase 1 steps 1 and 3 build the property tables, their generated checks and `Transition.commutes`. Then Phase 4 item 10 (update or rescan), Phase 5 item 8 (which pairs need a walk), item 9 (Sync) and item 10 (replay) are its consumers; items 8 and 9 wait for Phase 2's graph, item 10 for Phase 5's item 5. The gates of Phases 3, 6 and 7 each open their phase and are one bout; the coordinator reads each before the rest of its phase is briefed.

Once Phase 1's steps 1 to 6 are reviewed, three lines run side by side. The graph's structure and its drawing consumers (Phase 2) are in `packages/metakit/src/graph*`, `packages/surface`, `packages/bundle`, `packages/bundle-surface` and `packages/mixins-surface`. Stores and orderings (Phase 5) are in `packages/remote-drizzle`, `packages/remote-server`, `packages/durable` and the temporal tests. The standard library is in metakit's operation files. Four packages are shared between lines, and a bout in one of them is never scheduled beside another bout in the same one: `packages/remote` (Phase 1 steps 2, 3 and 9, Phases 2, 4 and 5), `packages/remote-drizzle` (Phase 1 step 8, Phases 4 and 5), `packages/sync` (Phase 1 step 9, Phases 2 and 5) and `packages/ssr` (Phase 2's `coverOf`, then Phases 6 and 7).

Phase 3 waits for Phase 2's structure. Phase 4 waits for Phase 2's structure and Phase 1's related rows. Phases 6 and 7 wait for Phase 3 and are sequential with each other, since both rebuild the loader in `packages/ssr`. Phase 8's proof example moves with each phase; its remaining examples are disjoint from each other and run in parallel at the end.

Within a phase, a design note always precedes the bouts that implement it, and the review always follows the last of them.

## The first three bouts, as briefed

Their briefs are kept as given, as the record of what was asked; a status line on each says what happened. Bout 1 is Phase 1's item 1. Bout 2 is Phase 0's item 1. Bout 3 produces the example Phase 2 measures on and the gap list Phase 3's design note starts from. Bout 1 reads and writes while bout 2 runs its commands; bout 1's own compile and prototype runs come after bout 2 has pushed. Bout 3 starts after bout 2 has pushed too, for two reasons: it compiles `packages/metakit` from source, which bout 2 is moving, and only one heavy command runs at a time while memory is short. Every brief also carries the git rules of `CLAUDE.md` ("Git in the shared tree"): one tree and one branch, explicit-path commits in one command, the never list, push and report, no CI wait.

### Bout 1: the kernel convergence design note

- **Status.** Done (`ab6e69c08`); Phase 1 follows it. Its prototype found no byte growth for three constructors (8,970 brotli bytes smaller) and no type-check growth.
- **Model.** The most capable: it decides a published API's shape across several packages.
- **Commits.** Only `docs/design/metakit-kernel-convergence-DESIGN.md`. Its prototype (below) is temporary files in `examples/kitchen-sink`, deleted before the commit.
- **Reads.** Whole (a large file in pages, with the Read tool's offset): `packages/entity/src` (`expr.ts`, `evaluate.ts`, `write.ts`, `laws.ts`, `bounds.ts`, `enumerate.ts`, `invariant.ts`, `refine.ts`, `footprint.ts`, `operators.ts`, `memoryTable.ts`, `law.ts`, `collation.ts`, `context.ts`); in `packages/metakit/src`, `node.ts`, `expr.ts`, `path.ts`, `transition.ts`, `machine.ts`, `ops/*`, `aggregates.ts`, `sqlLowering.ts`; this plan's Phase 1; `docs/design/601-expression-standard-library-DESIGN.md`; `docs/design/600-solver-pass-DESIGN.md`; issues #597 and #598 with every comment (`gh issue view <n> --comments` prints comments only; read the body too). By their exports and the functions that walk an expression: `packages/metakit/src/abstract/check.ts` and `prove.ts`; `packages/remote-drizzle/src/compile.ts`, `operators.ts`, `checks.ts`; `packages/guard/src/condition.ts`, `may.ts` and `index.ts`.
- **Form of the note.** As `docs/agents/writing-docs.md` asks of an explanation, under 700 lines: the decision first, then one section per question below, each ending in what is deleted and what breaks, then rejected alternatives.
- **Must decide.** For each entity node and predicate, the metakit node it becomes. How a relation hop and `exists` are expressed and typed. How a collation reaches a text operation in every reader. How insert and delete are transitions. The environment an Entity expression reads. The wire names. What `foldkit-entity`'s main entry imports from metakit, and the expected byte change. The type-check cost of `Expr<Env, A>` under entity's field types. Both come from one prototype: a temporary copy of three entity constructors (`Expr.eq`, `Expr.gte`, `Expr.add`) building metakit nodes, with a temporary page entry that uses them. Bytes: that entry and the same entry on today's constructors, each measured with `clientBudget` from `scripts/bundle-budget.mjs`, which the budget tests use. Type-check time: `pnpm exec tsc -b examples/kitchen-sink --force --extendedDiagnostics` with each version of the file. The order of Phase 1's steps and the breaking changes of each. It may overrule a row of this plan's overlap table, with the reason.
- **Inner loop.** Each snippet compiled in a temporary `*.test-d.ts` in `examples/kitchen-sink` with `pnpm exec tsc -b examples/kitchen-sink`, proved checked by a deliberate error, then deleted. That project compiles `packages/metakit` from source, so the snippets are compiled once bout 2 has pushed. Probes of behaviour run from inside the package they probe.
- **End checks.** Every claim about the code names its file. The bout's own agent starts a cold reader (Sonnet, given only the note's path, briefed as `docs/agents/writing-docs.md` describes), fixes each problem it reports or says in its report why one does not apply. No Jev: no published API changes yet.
- **Must not touch.** It leaves no file in the repository changed but the note (the temporary snippet file is deleted before the commit). It reads GitHub and posts nothing there.

### Bout 2: split the two files Jev cannot take

- **Status.** Done (`a750f5be2`): sixteen files, each under 20,000 characters, exported names unchanged; it found five surviving mutations (Phase 0, item 7).
- **Model.** Sonnet: a mechanical move with a clear target.
- **Writes.** `packages/metakit/src/abstract/check.ts` and new `abstract/fields.ts`, `abstract/state.ts`, `abstract/ops.ts`; `packages/metakit/src/prove.ts` and new files under `src/prove/`; the `file` anchors in `packages/metakit/test/metakit.mutations.ts`, `core-review.mutations.ts`, `consumers-review.mutations.ts` and `temporal.mutations.ts`. The build needs no change: `packages/metakit/tsdown.config.ts` makes every file under `src` an entry.
- **What goes where.** `abstract/fields.ts`: `FieldKind`, `FieldInfo`, `collectFields` and their helpers. `abstract/ops.ts`: `TermOp`, `PredicateOp`, `AbstractOp` and the `abstractOps` table. `abstract/state.ts`: the facts kept while checking and the functions that narrow them. `abstract/check.ts` keeps `checkInvariant` and `checkTransition` and re-exports the rest, so `Abstract.*` is unchanged. `prove/lower.ts`: expressions to solver terms. `prove/witness.ts`: reading and replaying a counterexample. `prove/machine.ts`: `machine` and its report types. `prove/policy.ts`: `policy`, `policyImplies`, `policyConsistent`. `prove.ts` keeps `ProveOptions`, `invariant`, `transition` and re-exports. A helper that more than one new file uses goes in the lowest of them that needs it (fields, then state, then ops). If a piece is still over the limit, split it again by operation family (`abstract/ops/num.ts`, …) and say so in the report. The new files are built but not importable by users: `package.json`'s `exports` does not change.
- **Rules.** No behaviour change and no change to exported names. Each resulting file under 20,000 characters (`wc -m`), checked at the end. Comments move with what they document. Imports between the new files have no cycle that changes evaluation order. A mutation spec entry is `{ name, edits: [{ file, find, replace }], tests }`: update the `file` of every edit whose `find` text moved. Four specs name the two files today; search all of `packages/*/test` and `examples/*/test` for others, change only the `file` of an edit found there, and name it in the report. Before the first edit, run `pnpm --filter metakit build` and save the list of exported names of `dist/prove.d.ts` and `dist/abstract/check.d.ts` in the session's scratch directory, for the comparison below.
- **Inner loop.** `pnpm exec tsc -b packages/metakit`, and `npx vitest run packages/metakit/test/abstract-soundness.test.ts packages/metakit/test/prove.test.ts --project unit` from the repository root.
- **End checks, once.** `npx vitest run packages/metakit/test --project unit` (read `Test Files` as well as `Tests`); `pnpm mutate` on each of the four specs, one call per spec; `pnpm mutate:check`; `pnpm --filter metakit build`, then a comparison of the exported names in `dist/prove.d.ts` and `dist/abstract/check.d.ts` before and after; `npx vitest run scripts/test/publishedBuild.test.ts -t metakit --project unit`; `pnpm exec oxfmt` on the files it wrote, then `pnpm format:check`. No Jev: the API is unchanged.
- **Must not touch.** Any other package's source; `packages/plus`; the lockfile; tsconfig paths; `examples/todo-app` (bout 3).

### Bout 3: the first example as a composed machine

- **Status.** Done (`70585f667`, lockfile `d79b83402`): 11 of 25 Messages declared with one `Machine.make` (no `Machine.compose`: the Model is flat), +4,209 brotli bytes, render counts as the brief asked. Its gap list and defects are in "Where things stand today" and "Where each open item goes".
- **Model.** Sonnet: one example, a clear design, today's API.
- **Writes.** In `examples/todo-app`: a new `src/machine.ts`; `src/app.ts`, `src/view.ts`, `src/surface.ts` and the runtime entry as needed; a new `test/machine.test.ts` with a mutation spec; nothing outside the example.
- **Read first.** `docs/surface-writes.md` (how `Writes.of`, `writes.rootView`, `writes.track` and `WritesCheck.verify` are used), `packages/surface/test/writesComposed.test.ts` and `writesFixture.ts` (a composed machine drawn through them, and how renderer calls are counted), `examples/metakit/src/demo.ts` (transitions and machines), `packages/metakit/docs/resumability-and-queries.md` (`Machine.compose`).
- **Task.** With today's `metakit` and `foldkit-surface/writes`: give a transition to every Message of `src/app.ts` whose effect on the Model today's kernel can state. That means its writes go to fixed paths, and each written value is computed from Model fields and the Message's payload with existing operations. For such a Message the `update` arm runs the transition, so the change is stated once. Where a field of the Model is a struct with Messages of its own, give it a machine and join the parts with `Machine.compose`; otherwise use one `Machine.make`. Draw the Surfaces through `writes.rootView` and wrap `update` with `writes.track`. Some Messages keep their hand-written arm and get no transition, and so draw everything, as today: one that changes a list element (even when its payload carries the element's id), one that needs a new id or the time, and one that cannot be stated for another reason. In `test/machine.test.ts`, a hand-written list holding at least one of every Message tag is run through `WritesCheck.verify`.
- **Report.** A gap list: each Message that could not be declared, and exactly what the kernel lacks for it (a list element chosen at run time, a Command, a new id, the time). This list is the input to Phase 3's design note.
- **Inner loop.** `pnpm exec tsc -b examples/todo-app` and `npx vitest run examples/todo-app/test/machine.test.ts --project unit`.
- **End checks, once.** `npx vitest run examples/todo-app --project unit`, with the reading of `test/bundle.test.ts` before and after in the report; in `test/machine.test.ts`, a test on the Foldkit runtime that counts each Surface's renderer calls across two transitions and shows the untouched Surface's count does not move; a mutation spec `test/machine.mutations.ts` whose edits are in the example's own `src/machine.ts` (a transition that stops declaring one of its writes must fail the verifier; a transition declared to write another Surface's path must move the count); `pnpm e2e examples/todo-app/e2e/todo-app.e2e.ts`, since the example has a server; `pnpm typecheck`. No Jev: an example.
- **The budget.** The example now opts into `foldkit-surface/writes` and the metakit modules it names, so `test/bundle.test.ts` will read higher. Report the reading before and after and the size of each module that arrived. Raise the ceiling to the new reading plus the file's usual margin, with a dated comment saying what the growth bought. Stop and report instead if a module of the checker, the prover, SQL lowering or conformance is among the arrivals.
- **Must not touch.** Any file under `packages/`; other examples; `CHANGELOG.md`.

## Risks, and what limits each

**Two expression languages while the move is in flight.** A half-moved `foldkit-entity` could evaluate one way in memory and another in SQL. Limit: the move goes reader by reader behind unchanged constructors, the conformance suite gates every step on three stores, the old checker is deleted only after the differential test, and no release is cut mid-move.

**Upstream does not move.** A page that never loads Foldkit's renderer needs changes we do not own. Limit: every Phase 6 and 7 deliverable is designed to work on today's Foldkit; the table in Phase 6 names what stays blocked; the requests are drafted and cost nothing to hold.

**Bundles grow.** Putting metakit under `foldkit-entity` adds a dependency to pages that pass their budgets by tens of bytes. Limit: bout 1's prototype found a page on metakit nodes 8,970 brotli bytes smaller for three constructors, but without entity's own work (relations, ordering, `Query`); step 10 reads the four page budgets again and stops on growth. One module per operation; the ledger records every reading; a raise needs code every such page runs. A page that opts into declared transitions pays a measured allowance (Phase 3's gate), not an untraced raise.

**A declared property is false.** This week's review found rewrite laws false for null, NaN and absent values, and partial evaluation applying them. A false commutativity would let Phase 5 skip a walk that would have failed, and a false inverse would let Phase 4 drift. Limit: a property exists only with a generated check over the awkward values and a named consumer; each consumer has a reference run (recompute, both orders) in tests; each property has a mutation declaring it where it does not hold.

**The bets do not pay.** Phases 3, 6 and 7 rest on premises not yet shown: that most Messages fit, that the binder fits and is adopted, that there is script to cut. Limit: each opens with a gate whose numbers the coordinator reads before the rest is briefed, and each has a smaller shape that keeps what was already paid for.

**Proofs lose power when made sound.** This week's corrections turned several "proved" answers into Unknown. More will follow from null guards and optional keys. Limit: the differential test of Phase 1 names every pair that went from decided to Unknown. A pair whose old answer was sound gets a fix in the checker before the old pass is deleted. A pair whose old answer rested on a value that may be null or absent is listed with what would decide it. Pinned proofs fail loudly when they stop being proved.

**A wrong skip shows a stale page.** Every optimisation here removes work on the claim that nothing changed. Limit: each has a reference run in development and tests, Unknown is never read as empty, and each consumer has a mutation that drops the unknown edge.

**Scope with no stopping point.** "Unify everything" has no natural end. Limit: each phase has a "done when" that is measured; items outside the plan are listed with the reason (the last rows of the placement table); a new idea becomes an issue, not a bout, unless a phase's "done when" needs it.

**Type-check cost.** A composed machine over a large Model, and expressions typed by environment under entity's field types, can slow the editor. Limit: measured in bout 1 and in Phase 3's design note, with the ledger's times as the bar.

**The machine and CI.** Memory is short and one CI failure is not understood. Limit: one heavy command at a time; the flake rule of Phase 0; no verdict from a run that showed it.

## Decisions the maintainer may want to change

1. **`foldkit-entity` keeps its public constructors and builds metakit underneath.** The alternative is to have users write metakit expressions directly and reduce entity to rows and relations. Kept as it is because every example and the wire depend on today's shape.
2. **Related rows move into metakit** (`metakit/relation`) rather than staying an entity-only layer over a scalar kernel.
3. **The application layer lives in `foldkit-surface`** on a subpath, not in a new `meta-foldkit` package as #598's first comments sketched. It follows the later comments' rule against a new noun before a user needs it.
4. **No source transform.** Script is cut where declarations name a dynamic import; views are not compiled to patchers. #607 leaves this open (its question 1).
5. **The binder answers only declared presses without Commands**, and Foldkit draws after hand-over. Full removal of the virtual tree waits on upstream.
6. **D1 keeps aggregate rules** when the rule is judged in the writing statement, against the #601 note's blanket refusal.
7. **Skips become the default** in `Surface.rootView` once an application has a machine (breaking).
8. **Change replay is built for the Durable Object only.**
9. **domains-plus is the measured proof and todo-app the first**, not `examples/reference`.
10. **Fingerprints (#579) and cluster machines (#609) are outside the plan.**
11. **Laws are a closed set of declared properties, not algebra objects a user builds.** The alternative (a user-supplied monoid or lattice per operation) would let applications teach the readers new facts, at the cost of facts nothing checks. Kept closed because every property needs a generated check and a consumer.
12. **The ways of writing are `set`, `add`, `append`, `insert`, `remove`, `removeWhere`, `patch`, `patchWhere`, `include`, `exclude`, and `opaque` for code** (the kernel note). An `Option` field reads and writes as nullable, with no operation of its own.
13. **Lists are folded by a seventh node kind, `Rows`, not by operations taking a function** (the kernel note). One pass, no nesting in Phase 1.
14. **A page may carry the path-matching part of the graph** (rule 3, revised), and nothing else of it.
15. **The gate thresholds** of Phases 3, 6 and 7 are proposals, and so are the fallback shapes: opt-in transitions, a reduced envelope without the binder, cuts by Surface only.

## Assumptions to verify, each in its phase's first bout

- That `foldkit-entity`'s expressions all map to metakit nodes. The kernel note read entity whole and found a seventh kind needed (`Rows`); step 4's differential test confirms the mapping case by case. (Phase 1, step 4.)
- That metakit's checker decides every pair `bounds.ts` decides. (Phase 1, the differential test.)
- That the entity page budgets do not grow net. Shown for three constructors by the kernel note's prototype; not yet for relations, ordering and `Query`. (Phase 1, step 10.)
- That after Phase 1 step 3, 23 of `examples/todo-app`'s 25 Messages need no hand-written arm. Counted by the kernel note, not built. (Phase 1, "Done when".)
- That domains-plus's Messages fit as well as todo-app's. Not counted. (Phase 3's gate.)
- That each property in "Laws decide" holds over the domain it is declared on. Only metakit's five rewrite laws are checked today. (Phase 1, item 13.)
- That a filtered list's `where` body can be classified as reading only the changed row from `Expr.reads` alone. (Phase 4, item 10.)
- That Sync's only source of divergence between a replica's view and the journal is the order of non-commuting transitions. Read from `make.ts`'s replay, not traced through every path. (Phase 5, item 9.)
- That the older test runners and records outside metakit (`Walk`, `Scenario`, and the `Evidence` kinds that say how a rule was shown) fit `metakit/temporal`'s walk without a second runner. Their sources were not read. (Phase 5.)
- That a region Foldkit holds as trusted HTML is left alone across renders, and that hydration adopts a page the binder changed. Neither was tried. (Phase 6, the gate and probe 1.)
- That a script able to evaluate a transition fits the 20 kB bar with room for the binder. Bout 3 measured the metakit modules a page running steps carries at 12.2 kB minified, `ops/residualize` included, which Phase 1 step 3 removes; the binder's own code was not measured. (Phase 6, the gate.)
- That the cause of the stale-drawing case in Phase 2 item 5 is that Remote's reducer steps are not writers in the graph. It is recorded from the brief; the bout reproduces it first.
- Which budgets have under 350 B of headroom: none was built or measured for this plan. The raises listed in Phase 0 come from the comments in the budget files. (Phase 0, the ledger.)
- That the flake is a resource limit of the CI runner. Its cause is unknown. (Phase 0.)
- Line numbers quoted from issue #581's audit were read at `4b9bc344c` and may have moved.
