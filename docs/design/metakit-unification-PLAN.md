# One declaration, every reader: the metakit unification plan

Status: plan, 2026-11-21. Nothing in it is built unless "Where things stand today" says so. It succeeds [metakit-phases-2-6-PLAN.md](./metakit-phases-2-6-PLAN.md). The coordinating session keeps the phase table below current and hands each piece of work to a subagent.

## The problem, the idea, and what you get

An application built with Foldkit Plus (this repository's packages) states the same facts several times. Foldkit is the framework we build on: an application is one state value (the Model), events (Messages), a function `update` that makes the next Model from a Model and a Message, and a function `view` that draws a Model. Take one fact: "pressing Add changes the cart's count, and nothing else". Today that fact is written as code inside `update`. It is written again as the list of Model fields a part of the page reads. It is written again as the rule the server checks and as the SQL the database runs. It is written again as the test that says a late reply must not undo a newer one, and as the list of fields the server must send so the page can start. Each copy is in a form only one part of the system can read. So the page redraws parts that did not change, ships data and script that the first press does not need, and a rule can be right in one copy and wrong in another.

The idea is to state each fact once, as data, in a form every part reads. A rule becomes a small tree of operations (an expression) instead of a function. A state change becomes a guard and a list of "this field becomes this value" (a transition) instead of a branch of `update`. Anything can then read, without running it, what a Message reads and what it writes.

This week's work built that form as the package `metakit` and connected seven packages to it through entry points an application imports only if it wants them. This plan makes it the base of the project: one expression language instead of two, one dependency graph (the record of what reads and what writes each piece of state) instead of five, one way to keep computed values up to date, and an application whose `update` is declared. On that base it builds what the declarations make possible: a page that answers its first press (the first click or key a person makes) without loading the framework, script cut along Messages, and values that are maintained from what changed.

When the plan is done, you write a rule once and the page, the form, the server, the database, the checker and an AI agent's tool list all read that one rule. A page ships the data its changeable parts read and the script its first press needs. A list of 100,000 rows takes a pending edit without a walk of the list. A test fails when a race between two Messages has no test.

| Phase | Delivers | Needs | Size |
| --- | --- | --- | --- |
| 0. Clear the ground | Files small enough to review, recorded baselines, leftovers, a test that fails at random | nothing | 5 bouts |
| 1. One expression language | The second expression language and its checker run on metakit; a standard set of operations | 0 | 16 bouts |
| 2. One dependency graph | One graph read by drawing, page start-up, data fetching, replication and the checkers | 1, items 1 to 5 | 9 bouts |
| 3. Declared `update` | An application's Messages as one declared set of state changes, read by every package | 1, 2 | 12 bouts |
| 4. Maintained values | Sums, lists, joins and derived values kept up to date from row changes | 1, 2 | 13 bouts |
| 5. Stores and orderings | Every database declares what it guarantees; every race between events has a test | 1; its item 3 needs 4 | 8 bouts |
| 6. Resume without the runtime | A page that answers declared presses before Foldkit loads, then hands over to it | 2, 3 | 14 bouts |
| 7. Script cut by Message | Script files per part of the page and per Message; loading ahead; a failed load | 3, 6 | 9 bouts |
| 8. Examples and documents | Every example on the new base; guides, the agent skill, the site, a post | all | 10 bouts |

A *bout* is one piece of work that stands on its own (a module with its tests, a design note), done by one agent and reviewed at its end. Sizes are estimates for scheduling, not limits. In the table, a checker is a program that shows a rule cannot be broken; replication is keeping a copy of state on several devices; "resume" is a server-drawn page starting in the browser from the server's state; the runtime is Foldkit's script. The next section explains these and the other words the phases use.

## Words this plan uses

The opening explains the words it uses. The rest of the plan uses these.

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
- **Node kinds, operations, opaque.** An expression tree has six kinds of node: a literal, a path, a call of an operation, an if, a match, and an opaque node. An operation is what a call names (`Num.add`); there are 20 today and Phase 1 adds more. An opaque node wraps ordinary code the readers cannot look into; it says which paths it reads, or that it may read anything.
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

Checked against the tree at `add1121f6`; file sizes are `wc -c` there. Where a line was not checked it is listed under "Assumptions to verify".

**Built and reviewed this week.**

- `packages/metakit`: expressions over 20 core operations (`src/node.ts`, `src/ops/*`), paths, `Transition`, `Machine` with `lift` and `compose`, the synchronous checker (`src/abstract/check.ts`), the Z3 prover (`src/prove.ts`), one SQL lowering used by `metakit/sql` and `metakit/drizzle` (`src/sqlLowering.ts`), field inspection, `Graph.analyze`, `metakit/store`, `metakit/temporal`, value types (`Money`, `Decimal`, `CalendarDay`, `OrderedEnum`) and row aggregates. It imports no Foldkit package.
- Opt-in entry points that read metakit declarations: `foldkit-surface/writes`, `foldkit-remote/aggregate`, `foldkit-sync/metakit`, `foldkit-guard/check`, `foldkit-form/metakit`, `foldkit-agent/metakit`, `foldkit-mixins-form/declared`. `foldkit-remote-server` imports `metakit/store` in its main entry, which runs only on a server.
- In `foldkit-remote`: reads declare their store's field as a dependency; a late answer no longer undoes a newer read where the domain reads live. In `foldkit-ssr`: a resumed part can name the Model paths it restores.

**The second expression language, untouched.** `packages/entity` has its own: `src/expr.ts` (124,938 characters: field, input and relation-path expressions, a separate predicate type, queries, ordering), `src/evaluate.ts` (the judge), `src/write.ts` (declared writes), `src/laws.ts` with `src/bounds.ts` and `src/enumerate.ts` (`Laws.check`), `src/invariant.ts`, `src/refine.ts`, `src/operators.ts` and `src/memoryTable.ts` (custom operators), `src/footprint.ts`. `foldkit-remote-drizzle` compiles it to SQL in `compile.ts`, `operators.ts` and `checks.ts`. `foldkit-guard`, `foldkit-remote`, `foldkit-remote-domain` and `foldkit-remote-server` are written against it. No file in `packages/entity/src` imports metakit, and metakit has nothing for related rows except its aggregates.

**Five dependency graphs.** Issue #581's audit lists them: the contract graph (`Module` and `Graph` in `packages/surface`), Remote's write-to-query impact (`packages/remote/src/impact.ts`), the per-value memos of `Projection.derive` and `SlotView.region`, the Bundle drawing memo (`packages/bundle/src/memo.ts`), and Sync's closure and replay diffs (`packages/sync/src/mount.ts`, `make.ts`). `Graph.analyze` in metakit is a sixth, used only by `foldkit-surface/writes`; its `pruneStatic` and `queryReadiness` have no caller in any package.

**Partial.**

- No example declares its Messages as a machine. Only `examples/metakit/src/demo.ts` imports metakit.
- Maintained values exist only as `aggregated` in `packages/remote/src/aggregate.ts`.
- Store capabilities are declared for the Drizzle writer and the memory writer only. Postgres is declared as taking no parent-row lock. SQLite and D1 are declared serializable (`storeOf` in `packages/remote-drizzle/src/index.ts`).
- Resume: `foldkit-ssr` ships a pick of Model fields and resumed parts, checks coverage (`coverOf`), has static regions (`SSR.static`), an opt-in loader (`foldkit-ssr/loader`) and keeps typed fields. It has no anchors, no binder, and no script cut by Message.
- `packages/metakit/src/abstract/check.ts` (59,606 characters) and `src/prove.ts` (51,733) are too large for Jev. `src/conformance.ts` is 13,408 and fits.

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

### Why resume and splitting follow

If every Message's reads and writes are known, three things can be computed before any script runs. The set of Messages a page can send is the tags on its elements, plus the Messages their Commands can send back. The paths those Messages write decide which values on the page can ever change. The paths those values and Messages read are all the data the page needs to answer; the rest is drawn into the HTML and left out of the envelope. The same facts say what script a press needs: the transition for that Message and the code that writes the values it changes. So a small script can answer a declared press without the framework, and script can be cut along Messages.

### Where metakit ends

metakit knows Effect Schema and nothing else: no Foldkit, no network, no storage, no drawing. It owns expressions, paths, transitions, machines, the verdict, the readers (evaluation, partial evaluation, bounds, proof, SQL), the graph structure, store capability vocabulary and walks. Each Foldkit Plus package owns its runtime: `foldkit-entity` rows, relations, queries and the wire names of operations; `foldkit-remote` the cache, network and optimistic layers; `foldkit-sync` replication; `foldkit-guard` the person, server-only checks, and what a refusal discloses; `foldkit-surface` the application's contracts and the Foldkit side of the graph; `foldkit-ssr` the envelope, the loader and the binder. Physical extraction of metakit into its own repository stays last, as #598 decided.

### What stays out

The admission rule for an operation, from the #601 note: it enters only if (1) every reader implements it exactly or refuses it by name with a reason; (2) it has conformance cases, including the awkward values of its types, that pass on every reader; (3) it is total over its input Schema, or its partial case has a declared answer; (4) it reads nothing but its arguments.

The language has no user functions with bodies, no recursion, no loops, no I/O, no randomness and no clock read inside an operation. The time enters as a value bound once by whoever runs the step. Expressions do not draw, do not perform effects, and do not decide what is static (the graph does). A transition is one synchronous step; time, retries and concurrency stay with Effect and with the protocols of Phase 5. An `update` arm that needs a loop or arbitrary code stays an ordinary function, marked as reading and writing unknown paths, never half-translated. There are six kinds of expression node (`Lit`, `Path`, `Call`, `If`, `Match`, `Opaque`) and no runtime "algebra" or "language" objects.

## Rules for every phase

**Bytes.**

1. A feature someone opts into lives on its own subpath, and a page that does not use it pays zero bytes for it. A test asserts it (`scripts/test/publishedBuild.test.ts`).
2. A main entry that a page loads never imports metakit at run time. Today no such entry does (`foldkit-remote-server`'s main entry imports `metakit/store`, and it runs only on a server). After Phase 1 the exception is `foldkit-entity`, whose job is building expressions, and through it the packages that import it. They then carry the node constructors and the operation modules a page names, and nothing else of metakit.
3. One module per operation, imported by name. A build test asserts that a page naming one operation ships no other. The checker, the prover, SQL lowering, conformance and graph analysis never reach a page; a test asserts each is absent.
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

**Scope.**

1. Split `packages/metakit/src/abstract/check.ts` into `abstract/fields.ts` (what a Schema says of each field), `abstract/state.ts` (the facts held while checking), `abstract/ops.ts` (the per-operation table) and `abstract/check.ts` (the two entry functions). Split `src/prove.ts` into `prove/lower.ts` (expressions to solver terms), `prove/witness.ts` (replay), `prove/machine.ts`, `prove/policy.ts`, with `src/prove.ts` re-exporting. No behaviour change; exported names identical.
2. A ledger, `docs/design/metakit-unification-LEDGER.md`: every bundle budget with its ceiling, today's reading and its headroom; the numbers of `metakit-phase-6-DESIGN.md`; view and patch time per Message from `scripts/render-baseline.mjs`; type-check time of `packages/entity`, `packages/remote` and `examples/reference`. Each later phase adds its before and after here.
3. Budgets. Raised this week, by the comments in the budget files: `examples/cms` (+500 B), `examples/reference` and `examples/registry` (+650 B, then +300 B), and the domains-plus Worker (+5,000 B, then +4,700 B, of which about 1.4 kB in `foldkit-remote` was never traced to a cause). Each of these, and each budget with under 350 B of headroom, gets a line saying what grew and whether every such page runs it. The untraced 1.4 kB is bisected. Where growth is opt-in code, a bout moves it behind its subpath and lowers the ceiling. `publishedBuild.test.ts` gains the rows it lacks: the main entries of `foldkit-agent` and `foldkit-mixins-form` keep no metakit module.
4. Documents. Ten guides written this week are not on the site: the six in `packages/metakit/docs/`, `packages/agent/docs/machine-tools.md`, `packages/form/docs/metakit.md`, `packages/remote/docs/aggregates.md` and `docs/surface-writes.md`. The catalog (`examples/site/src/catalog.ts`) has no metakit entry, and its helpers reach only a package's README and `docs/<name>.md`, so the bout adds a helper for a package's `docs/` folder and a metakit entry. Each of the ten gets a cold-reader pass. The "Checked against" line of a skill reference (`skills/foldkit-plus/references/*.md`) is set to today's versions only where the reference was re-checked; `ssr.md`, `surface.md`, `sync.md`, `remote.md` and `bundle.md` name versions older than their packages.
5. Housekeeping: rename `examples/site/public/blog/2026-11-18-foldkit-plus-0-41` to the 0.43 post's name and fix its references; run `npx jev-pref sync` and reconcile; run `pnpm check:changed --dry` on a known change and confirm its output, fixing the script if it is wrong. `gh pr view 592` reports the PR as merged; the branch `ui-polish-ci` still exists on the remote and is deleted only on the maintainer's word.
6. The CI flake. The browser connection closes mid-run in a different shard each time (`VITEST_BROWSER_CONNECTION_CLOSED`). The coordinator records it on #582 with run links. The plan's handling: a shard that fails with exactly that signature is re-run once by the workflow and the re-run is logged; the browser shards run with one fewer worker; a second failure of the same shard is treated as real. It counts as handled after twenty consecutive runs on `main` without it. Its cause is unknown, and no phase's verdict may rest on a run that showed it.

**Replaces or deletes.** Nothing public.

**Hazards and tests.** A split moves mutation anchors: every `*.mutations.ts` spec naming the two files is updated and `pnpm mutate:check` passes. A split can change what a bundler keeps: `publishedBuild.test.ts -t metakit` and `pnpm --filter metakit build` pass, and the exported names in the built declarations of both files are compared before and after.

**Done when.** No file in `packages/metakit/src` is over 20,000 characters (only those two are today; the next largest is `expr.ts` at 17,570); the ledger exists with every budget; the site lists the ten guides; `check:changed` is verified.

**Review.** One reviewer reads the split as a diff of moved code and confirms nothing else changed.

**Size.** 5 bouts: the split (Sonnet), the ledger and budgets (Sonnet), documents (Sonnet, with a Sonnet cold reader), housekeeping (Haiku), the flake (Sonnet).

## Phase 1: one expression language and one checker

**Goal.** There is one expression language, one evaluator, one checker and one SQL lowering. `foldkit-entity`'s public way of writing rules, queries and writes stays; what it builds is metakit.

**Which side survives each overlap.** Both sides were read at the level of their exports and module comments; the design note (item 1 below, written out as Bout 1) reads them whole and may correct a row.

| Overlap | Survives | Why |
| --- | --- | --- |
| Expression tree | metakit `Node` and `Expr<Env, A>` | Six node kinds, typed by environment, tables complete by type |
| Predicate as a separate type | Neither: a predicate is a boolean expression | One tree; `Expr.match` and `Expr.when` already cover both |
| In-memory evaluation of operations | metakit `ops/eval.ts`, `Expr.evalResult` | Null-strict and refusing, reviewed this week |
| Judging over held rows | entity `Judge`, calling metakit | Only entity knows which rows a page holds |
| Three-valued answer | metakit `Verdict` | Four names for one thing today |
| Partial evaluation | metakit `Expr.residualize`, `judge` | Replaces `Condition.residual` in guard |
| Static checking | metakit `Abstract` and `metakit/prove` | Relates two unknowns (`amount <= balance`); `bounds.ts` cannot |
| The check's report | entity `Laws.check`, `Laws.show`, evidence kinds | Pairs writes with rules per Entity; a report users know |
| A declared state change | entity `Write` on top of metakit `Transition` | `Write` adds the row key, revision, insert and delete |
| Rules on a Schema | metakit `Expr.refine`; `Entity.invariant` builds it | The rule lives on the Schema every reader already has |
| Reads and writes of a declaration | metakit `Expr.reads`, `Transition.footprint` | One walker instead of four |
| How a fact is known | entity `Footprint` (`Derived`, `Declared`, `Unknown`) | metakit has reads-or-unknown only; the graph needs three |
| Built-in operations | metakit core operations | Closed set with per-reader tables |
| Custom operators | entity `Expr.operator`, lowered | Defined ones expand; primitive ones become `Opaque` with laws |
| Value types | `metakit/domain` | Built; the #601 note's `foldkit-entity/decimal` never was |
| SQL for operations | metakit `sqlLowering.ts` | One lowering, parity-tested on PGlite and SQLite |
| SQL for queries | `foldkit-remote-drizzle` `compile.ts` | Joins, cursors, ordering, collation are query matters |
| Conformance | Both, merged | metakit's per-operation cases; entity's query and store cases |
| Field specs and JSON Schema | `metakit/inspect` | Replaces entity `jsonSchema.ts` and form's own mapping |
| Related rows (`exists`, relation paths) | entity's meaning, moved into metakit | metakit has none; the kernel must own it to check it |
| Text order and case folding | entity `Collation`, read as a Schema annotation | metakit text operations have no collation today |

**Scope.**

1. *Design note* (`docs/design/metakit-kernel-convergence-DESIGN.md`). It fixes: the mapping of each entity node to a metakit node; how a hop through a relation and `exists` are expressed (recommended: a relation descriptor and row operations in a new `metakit/relation` subpath, with `exists` as `Rows.any`); how a collation reaches text operations; how insert and delete become transitions; the wire names of operations for writes sent to a server; what `foldkit-entity`'s main entry imports. It is written out under "The first three bouts".
2. *One verdict.* `Verdict` with a reason replaces the judge's true/false/unknown, `Data.can`'s `Yes`/`No`/`Undecided` and guard's `May.answer`. The checker's `Kept`/`Refused`/`Undecided` stay as report words built on it.
3. *Related rows in the kernel.* `metakit/relation`: relation descriptors, a path hop through a to-one relation, `Rows.any`/`every`/`count`/`sum`/`min`/`max` taking `{ of }`, in every reader (memory over held rows with Unknown when not all are held, SQL as correlated subqueries, the checker by delta for sums and by bound for the rest).
4. *Entity builds metakit.* `Expr.*`, `Query.where`, `Order`, `Entity.invariant`, `Entity.refine` in `packages/entity/src` construct metakit nodes over an environment `{ row, input, next, viewer, now }`. `expr.ts` is split by topic as it moves. `evaluate.ts` keeps held-row judging only. `dependenciesOf` becomes a call to `Expr.reads`.
5. *Writes are transitions.* `Write.transition(write)` gives the metakit transition of a declared write; `Write.footprint` is derived from it. `Mutation.insert`/`update`/`delete` keep their shape.
6. *One checker.* `Laws.check` lowers each pair of write and rule and calls `Abstract.checkTransition`; what stays open goes to `metakit/prove` as an obligation. Before `bounds.ts` and `enumerate.ts` are deleted, a differential test runs both checkers over every fixture (the bank, `examples/writes`, chirp, the CMS) and requires that metakit decides every pair the old pass decided, with the same verdict. The one exception is a pair the old pass decided on unsound ground (a value that may be null or absent): it may become Unknown, listed by name with the reason and accepted by the phase's reviewer.
7. *One SQL lowering.* `compile.ts`, `operators.ts` and `checks.ts` in `packages/remote-drizzle` call metakit's lowering for operations and keep query structure. Its hand-kept kernel operator table goes.
8. *The standard library, finished* (the six phases of the #601 note, on metakit). Numbers: decimal multiplication as a core operation with its SQL, written in integer arithmetic that rounds an exact half to the even neighbour ("half-even") the same way on every database (today's `Decimal.mul` is an `Opaque` node that SQL refuses); `times`; `div` and `rem` with a named rounding and a declared answer for a zero divisor (`onZero`); `round`, conversions. Choice: `coalesce` beside the existing `when` and `match`. Time: `addMonths` with the clamp, `daysBetween`, `startOfMonth`, `today(zone)` as a bound value, timestamps and durations recognised from Effect's Schemas. Text: `lowerAscii`, `upperAscii`, `trim`, `concat`, `endsWith` under a collation. Rows: as in item 3. Lists and sets of scalars. Each enters by the admission rule.
9. *Soundness leftovers.* `Transition.when` is typed `boolean | null`, and a null guard refuses. A rule on an optional key holds when the key is absent, in decode, SQL, checker and prover alike (`rulesOf` reads it as always present today). Arithmetic over an unbounded `Schema.Finite` is proved with the solver's floating-point theory under a time limit, and answers Unknown past it (it is never proved today). `Rows.sum` accepts a decimal product as its contribution, and an in-memory sum refuses a total past the safe range.
10. *The other packages.* `foldkit-guard`: row rules are metakit expressions over `{ row, principal }`; `Condition.residual` and `Condition.judge` are replaced by `Expr.residualize` and `judge`; rules live on the one Entity handle (`Guards.enforced` began this). `foldkit-remote-domain`: `Lower.check` and `Lower.write` lower through `Write.transition`. `foldkit-sync`: laws and transitions written with metakit, through `foldkit-sync/metakit` (which stays a subpath), become the documented way; a `holds` function remains as an opaque law the checker answers Unknown for. `foldkit-remote`: local matching and prediction evaluate through metakit.

**Depends on.** Phase 0's split.

**Replaces or deletes, and the migration.**

- Deleted: `packages/entity/src/bounds.ts`, `enumerate.ts`' interval and enumeration engines, the scalar half of `evaluate.ts`, the `Predicate` union and its interfaces in `expr.ts`, `memoryTable.ts`'s kernel table, `jsonSchema.ts`, `packages/remote-drizzle/src/operators.ts`' kernel table, guard's `Condition` evaluator.
- Breaking for users: code that inspects an expression's `_tag` (`'Eq'`, `'Compare'`, …) reads metakit nodes instead. A primitive custom operator declares its reads and laws, or is rewritten as a defined one. `Data.can` and guard answers are a `Verdict`. A rule on an optional key no longer fails for an absent key. `Transition.when` may be null. The upgrade guide lists each with the compiler error and a before and after.
- Not breaking: `Expr.eq(Product.fields.price, …)`, `Query.define`, `Mutation.update`, `Entity.invariant` call sites, and the wire names of operations (`number.add@1`).

**Hazards and tests.**

- *Two languages while the move is in flight.* The move goes reader by reader behind entity's unchanged constructors, each step keeping `foldkit-entity/conformance` green on memory, SQLite and PGlite. No release is cut between item 4 and item 7.
- *A reader drifts.* Every operation's cases run through every reader; the section 3.2 table of the #601 note becomes named cases.
- *The new checker decides less.* The differential test of item 6.
- *Entity pages grow.* The byte rule below.
- *Type-check time grows.* `Expr<Env, A>` under entity's field types is measured in item 1's prototype before item 4 starts; #190 names type cost as the deciding risk.
- *Guard regresses.* A security review of item 10: no path where a rule that cannot be evaluated allows.

**Done when (measured).** The client budgets of `examples/entity`, `examples/chirp`, `examples/reference` and `examples/registry` are at or under their Phase 0 readings. A page naming one operation ships no other (new test). `Laws.check` on the bank fixture decides every pair it decides today, and `ChargeFee` against `neverOverdrawn` without the solver. The conformance run stays under 30 seconds in the unit project. `tsc -b packages/entity` is within 15% of its ledger time. A search of `packages/*/src` finds one evaluator, one checker and one operation-to-SQL lowering.

**Review.** Adversarial soundness review of the evaluator and checker paths; a separate security review of guard.

**Size.** 16 bouts. Most capable model: the design note, items 3, 4 and 10, both reviews. Sonnet: item 2 and items 5 to 9, one bout per operation family. Haiku: renames once a shape is decided.

## Phase 2: one dependency graph

**Goal.** One structure answers "what can this change affect" for every consumer. Issues #581, #586, #587, #588.

**Scope.**

1. *The structure* in `packages/metakit/src/graph.ts` and new files beside it: nodes for paths, writers and readers; edges with the three-way knowledge tag moved from entity's `Footprint`; a path index so a lookup does not scan; `affectedBy(writer)`, `readersOf(path)`, `writersOf(path)`, `explain(writer, reader)` and `unknowns()`. Model paths and stored-row fields share one address scheme, joined where a Remote read turns row fields into a Model path.
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

4. *Consumers.* Rendering: `Surface.rootView` skips by declared paths by default when the application has a machine and the projection's reads are complete (#587), and `SurfaceView.toRenderer` in `packages/mixins-surface` gets the same skip. Bundle: the drawing memo and declared paths see each other (#586). Remote: a Message whose writes do not reach the store's path skips the read planning. Today `observeEntry` in `packages/remote/src/domain.ts` reuses its plan only when `asked.storeOnly` holds (a bare Surface or `Remote.observe`); the graph extends that to `Surface.at`, families and `Data.active`. A write settled in another tab invalidates only the connections it can reach. Resume: `coverOf` in `packages/ssr` asks the graph. The write verifier (`WritesCheck`) also checks Sync ownership. The provers take the pairs for obligations from the graph.
5. *The stale-drawing case.* `Writes.of` recognises a Remote read by its projection's metadata and always draws it again. A value derived from a Remote read with `Projection.derive`, or a plain reference into the store, carries no such metadata, and the skip keeps its drawing. The bout first writes the failing test, then closes it by making Remote's reducer steps writers of the store path in the graph, so any reader under that path is reached.

**Depends on.** Phase 1's items 1 to 5. What it reads from them is items 4 and 5: entity's reads come from the one walker, and writes are transitions. Items 1 to 3 here can start on metakit transitions before Phase 1 ends. The skips of item 4 are built and measured on `examples/todo-app`, which has a machine from Bout 3; domains-plus gets them when Phase 3 gives it one.

**Replaces or deletes.** `packages/remote/src/reaches.ts`' own derivation; the separate walkers in `Graph`; the duplicated "owned fields" helpers in `packages/sync/src/make.ts` and `packages/surface/src/closure.ts`; `Closure.reads` perturbation for documents whose Messages are all declared, and with it the `try` in `readsOutside` (`packages/sync/src/mount.ts`) that reads a throw as "nothing read". Breaking: `Surface.rootView` skips by default (a projection with undeclared reads must say so, and the development check reports one that does not); `Graph.analyze`'s result shape.

**Hazards and tests.** *A skip that is wrong shows a stale page.* Every skip has a reference in development and tests: run the full path too and compare (#581's matrix), with a recorded counterexample test for each fallback. *Unknown read as empty:* a mutation that drops the unknown edge must turn a test red in each consumer. *Counting renders:* a runtime test with two Surfaces and two transitions, as #587 describes, since a memo's first change always misses.

**Done when (measured).** On `examples/todo-app`, a Message that writes one Surface's paths calls no other Surface's renderer (render counts from `scripts/render-baseline.mjs` against the ledger). `askedOf` runs zero times for a Message that does not write the store. Building the graph for `examples/reference` takes under 5 ms at definition, on the ledger's machine. No page budget grows for an application without a machine. The review lists every function that walks a declaration for the paths it reads or writes, and there is one.

**Review.** Adversarial: the reviewer tries to make each consumer skip something that changed.

**Size.** 9 bouts. Most capable model: the structure's API and the review. Sonnet: one bout per consumer.

## Phase 3: `update` as declared transitions

**Goal.** An application states its Messages as one machine. Every package takes that machine as input. Hand-written `update` arms keep working beside it.

**Scope.**

1. *Design note* (`docs/design/metakit-declared-update-DESIGN.md`), fed by the gap list of the third bout below. It fixes the names; the rest of this list is the recommended shape.
2. *The application layer*, in `foldkit-surface` on a new subpath beside `writes` (proposed: `foldkit-surface/declared`). From a composed machine it gives: the Foldkit Message union, typed from the transitions' inputs; a map from each described Command to the Effect that runs it, exhaustive by type; for each Command, the Message tags it may send back, so the graph has Message-to-Message edges; and `update`, derived from the machine.
3. *Coexistence.* A Message with no transition is handled by a hand-written arm, recorded in the graph as reading and writing unknown paths. In development and tests `WritesCheck.verify` compares what each declared Message actually changed with its declaration. An application moves one Message at a time.
4. *Kernel additions the layer needs*, in `packages/metakit`: children chosen while the application runs (a path through a keyed collection, writes that insert, remove, replace and move an element, footprints with a wildcard segment); several Commands from one transition; values bound at dispatch (the time, a new id) recorded in the Message so a replay is exact.
5. *Opaque but confined children.* A Bundle without a machine is placed as a child whose writes are confined to its path and whose reads are unknown within it. The graph stays exact outside the child. The write verifier holds the confinement.
6. *Each package takes the machine.* Surface: `Writes.of` is the default drawing path. Bundle: a Bundle exposes its machine, a placement is `Machine.lift` at its path. Remote: its Messages are writers of the store path; `Data.can` asks the machine. Sync: `make({ transitions })` takes the durable subset of the application's machine. Form: a submit is a transition and a control's disabled state is its guard. Agent: `machineTools` takes the application's machine. SSR: Phase 6. Mixins: the widget Bundles in `packages/mixins-ui` gain machines in batches, three first (a disclosure, a tabs, a dialog), the rest confined until moved.

**Depends on.** Phases 1 and 2.

**Replaces or deletes.** `SyncDeclared.transition` per Message: the application's machine replaces it (breaking for users of `foldkit-sync/metakit`). `Writes.of` stays as the lower-level call; the layer calls it, so an application on the layer no longer calls it itself. An application that adopts the layer gets its Messages typed from the machine; one that does not is unaffected.

**Hazards and tests.** *A declared arm and its hand-written original disagree during a move:* a test replays each example's recorded Messages through both and compares Models with `toBe` on no-ops. *A no-op returns a new Model:* the derived `update` returns the Model it was given, tested. *Frame lag* (`docs/state-model.md`): Messages carry intent, so a transition computes from the Model, not from a drawn value; the held-frames test of `examples/registry` is repeated on the proof example. *Type cost of a large composed machine:* measured on the proof example.

**Done when (measured).** `examples/todo-app` and then `examples/foldkit/domains-plus` run with a composed machine. Each example's README lists the Messages left hand-written, with the reason for each. Their budgets are within the ledger's readings plus the measured size of the code every page with a machine runs, which the ledger records. View and patch time per Message is at or below the ledger's.

**Review.** Adversarial review of the derived `update` (ordering of Commands, no-ops, refusals) and of the confinement rule.

**Size.** 12 bouts. Most capable model: the design note, items 2 and 4, the review. Sonnet: per-package adoption, widget machines.

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

   A maintained value keeps its identity while nothing it reads changed. So a Surface over one row is not drawn again when another row changes, which is the finer half of #588.

3. *The cost of a pending write on a large list.* A pending optimistic write on a 100,000-row list costs about 400 ms today because placing it walks the list: `insertsPlaced` in `packages/remote/src/layers.ts` calls `placeIn` (`placement.ts`), which scans and copies each segment's edges for every inserted row. Placement uses the order index.
4. *Coverage.* Whether a held list contains every candidate of another query is an implication between two predicates, decided by the synchronous checker when the queries are defined, never by the solver on a page. Only forms the checker decides count; the rest ask the server.
5. *Offline as-of reads* (#580's fourth work package): a retained result is "complete as of revision R", kept apart from "current", and never restores a server cursor.
6. *Indexes*, each added where the benchmark at 25, 100, 400, 5,000 and 100,000 rows shows it pays, and absent from a page that maintains nothing.
7. *On the server.* A derived member defined by a row aggregate can be stored: the writer in `packages/remote-drizzle` updates the parent's stored total in the transaction that writes the child. On Postgres it locks the parent row first (`select … for update`), which is also what makes a rule over an aggregate enforceable there, and declares `parentRowLock: true`. A Durable Object keeps the same totals in its storage. D1: see Phase 5.
8. *Change replay* (#580's sixth work package) is built for the Durable Object journal, which is ordered. For Postgres and D1 it is deferred: no ordered change log exists there, and adding one is a store design of its own.
9. *Dependent queries* (#606): a query whose parameters come from another read is asked only once `Graph.queryReadiness` says they are bound, so a cascading choice (a state, then its cities) sends no half-filled query. This gives `queryReadiness` its first caller.

**Depends on.** Phase 1 (related rows, aggregates over decimals), Phase 2 (the graph selects what a delta reaches).

**Replaces or deletes.** `aggregated` moves under the new subpath (breaking: the import path). `filtered` keeps its public meaning and is maintained underneath. The list-placement walk goes.

**Hazards and tests.** *A maintained result drifts from the truth:* seeded differential tests compare every maintained value with a full recomputation after each delta, over overlapping optimistic layers, a live echo while pending, a failed write, reconnect and restore. *A partial list presented as complete:* negative cases for each coverage form. *The lock deadlocks:* parents are locked in id order; a test runs two transfers in opposite directions on a real Postgres. *Indexes cost memory:* recorded beside the time.

**Done when (measured).** One changed row in a maintained list of 100,000 evaluates that row only (evaluations counted). A pending write on that list is placed in under 16 ms on the ledger's machine, against about 400 ms. A 25-row page is not slower and its budget does not move. Two concurrent overdrawing transfers on Postgres leave one refused.

**Review.** Adversarial: the reviewer writes delta sequences that try to double-count or lose a row.

**Size.** 13 bouts. Most capable model: the mechanism's API, coverage, the Postgres lock, the review. Sonnet: each kind, benchmarks.

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

**Depends on.** Phase 1. Item 3 is Phase 4's item 7. The rest is independent of Phases 2 to 4.

**Replaces or deletes.** `EntityWriter.store` becomes required (breaking: a writer that names no store is refused at registration, where today only a rule reading other rows is).

**Hazards and tests.** *A capability is declared and not true:* each declared capability has a concurrency test on the real store (PGlite cannot run two connections; the Postgres tests use the CI service). *A walk that cannot fail:* each walk has a mutation that removes the protection and must report `Broken` with a seed.

**Done when.** No store in the repository is undeclared; the obligations test passes with zero open; each protocol has a walk with a killing mutation.

**Review.** Adversarial concurrency review.

**Size.** 8 bouts. Most capable model: items 2, 4, 5 and the review.

## Phase 6: resume without the runtime

**Goal.** A server-drawn page answers a declared press before Foldkit's runtime is loaded and ships only the data its changeable parts read. It keeps what a person did before any script ran, and hands over to the full runtime without rebuilding an element. Issues #436, #472, #607 and #608; the maintainer asked for this in full on #432.

**The baseline** (`metakit-phase-6-DESIGN.md`, domains-plus, CPU slowed four times): 212,869 B of compressed script before the first press; 1,474 ms of blocking; the runtime takes over at 1,333 ms; the first press reaches the next paint in 104 ms and shows in the cart at 280 ms (over the runs, that last figure ranged by 123 ms); the envelope is 10,741 B, 857 B compressed.

**Scope.**

1. *Design note and three probes.* Does a region Foldkit holds as trusted HTML keep changes another script makes inside it across later renders? Does `Runtime.hydrate` adopt every element when it starts from a Model the binder changed? How many bytes is the smallest script that can evaluate a transition?
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

**Size.** 14 bouts. Most capable model: the design note, the live set, the binder's contract, both reviews. Sonnet: anchors, input keeping, end-to-end tests, measurements.

## Phase 7: script cut along Messages

**Goal.** The page loads the script a press needs when it needs it.

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

**Size.** 9 bouts. Most capable model: the manifest's contract and the review. Sonnet: the plugin, tests.

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
| No example declares its Messages as a composed machine | Bout 3, then 3 and 8 |
| New guides not in the site catalog; no cold reader; "Checked against" lines | 0, item 4 |
| The CI flake (`VITEST_BROWSER_CONNECTION_CLOSED`) | 0, item 6 |
| Budgets raised this week; others under 350 B of headroom | 0, item 3 |
| PR #592 and the `ui-polish-ci` branch | 0, item 5 |
| The blog image folder named for 0.41 | 0, item 5 |
| `npx jev-pref sync`; `pnpm check:changed` never verified | 0, item 5 |
| #580: coverage proofs, offline as-of reads, indexes | 4, items 4 to 6 |
| #580: change replay for Postgres and D1 | Deferred: no ordered change log there |
| #606: dependent queries | 4, item 9; a guide in 8 |
| #588: Remote projections declare no path | Store field done this week; finer reads in 4, item 2 |
| #579: content fingerprints of definitions | Not in this plan: no phase here needs one yet |
| #609: machines on a cluster | Not in this plan: no design exists |

## Order, and what can run side by side

Phase 0 comes first and is small; Phase 1's design note is written beside it. Phase 1 is the long pole: Phases 2, 3, 4 and 5 all read its one walker and its writes-as-transitions, so they wait for its items 1 to 5. They do not wait for the standard library (item 8), which runs alongside them in `packages/metakit/src/ops` and `src/domain`.

Once Phase 1's items 1 to 5 are reviewed, three lines run side by side. The graph's structure and its drawing consumers (Phase 2) are in `packages/metakit/src/graph*`, `packages/surface`, `packages/bundle`, `packages/bundle-surface` and `packages/mixins-surface`. Stores and orderings (Phase 5) are in `packages/remote-drizzle`, `packages/remote-server`, `packages/durable` and the temporal tests. The standard library is in metakit's operation files. Four packages are shared between lines, and a bout in one of them is never scheduled beside another bout in the same one: `packages/remote` (Phases 2, 4 and 5), `packages/remote-drizzle` (Phase 1 item 7, Phases 4 and 5), `packages/sync` (Phases 2 and 5) and `packages/ssr` (Phase 2's `coverOf`, then Phases 6 and 7).

Phase 3 waits for Phase 2's structure. Phase 4 waits for Phase 2's structure and Phase 1's related rows. Phases 6 and 7 wait for Phase 3 and are sequential with each other, since both rebuild the loader in `packages/ssr`. Phase 8's proof example moves with each phase; its remaining examples are disjoint from each other and run in parallel at the end.

Within a phase, a design note always precedes the bouts that implement it, and the review always follows the last of them.

## The first three bouts, as briefed

Bout 1 is Phase 1's item 1. Bout 2 is Phase 0's item 1. Bout 3 produces the example Phase 2 measures on and the gap list Phase 3's design note starts from. Bout 1 reads and writes while bout 2 runs its commands; bout 1's own compile and prototype runs come after bout 2 has pushed. Bout 3 starts after bout 2 has pushed too, for two reasons: it compiles `packages/metakit` from source, which bout 2 is moving, and only one heavy command runs at a time while memory is short. Every brief also carries the git rules of `CLAUDE.md` ("Git in the shared tree"): one tree and one branch, explicit-path commits in one command, the never list, push and report, no CI wait.

### Bout 1: the kernel convergence design note

- **Model.** The most capable: it decides a published API's shape across several packages.
- **Commits.** Only `docs/design/metakit-kernel-convergence-DESIGN.md`. Its prototype (below) is temporary files in `examples/kitchen-sink`, deleted before the commit.
- **Reads.** Whole (a large file in pages, with the Read tool's offset): `packages/entity/src` (`expr.ts`, `evaluate.ts`, `write.ts`, `laws.ts`, `bounds.ts`, `enumerate.ts`, `invariant.ts`, `refine.ts`, `footprint.ts`, `operators.ts`, `memoryTable.ts`, `law.ts`, `collation.ts`, `context.ts`); in `packages/metakit/src`, `node.ts`, `expr.ts`, `path.ts`, `transition.ts`, `machine.ts`, `ops/*`, `aggregates.ts`, `sqlLowering.ts`; this plan's Phase 1; `docs/design/601-expression-standard-library-DESIGN.md`; `docs/design/600-solver-pass-DESIGN.md`; issues #597 and #598 with every comment (`gh issue view <n> --comments` prints comments only; read the body too). By their exports and the functions that walk an expression: `packages/metakit/src/abstract/check.ts` and `prove.ts`; `packages/remote-drizzle/src/compile.ts`, `operators.ts`, `checks.ts`; `packages/guard/src/condition.ts`, `may.ts` and `index.ts`.
- **Form of the note.** As `docs/agents/writing-docs.md` asks of an explanation, under 700 lines: the decision first, then one section per question below, each ending in what is deleted and what breaks, then rejected alternatives.
- **Must decide.** For each entity node and predicate, the metakit node it becomes. How a relation hop and `exists` are expressed and typed. How a collation reaches a text operation in every reader. How insert and delete are transitions. The environment an Entity expression reads. The wire names. What `foldkit-entity`'s main entry imports from metakit, and the expected byte change. The type-check cost of `Expr<Env, A>` under entity's field types. Both come from one prototype: a temporary copy of three entity constructors (`Expr.eq`, `Expr.gte`, `Expr.add`) building metakit nodes, with a temporary page entry that uses them. Bytes: that entry and the same entry on today's constructors, each measured with `clientBudget` from `scripts/bundle-budget.mjs`, which the budget tests use. Type-check time: `pnpm exec tsc -b examples/kitchen-sink --force --extendedDiagnostics` with each version of the file. The order of Phase 1's steps and the breaking changes of each. It may overrule a row of this plan's overlap table, with the reason.
- **Inner loop.** Each snippet compiled in a temporary `*.test-d.ts` in `examples/kitchen-sink` with `pnpm exec tsc -b examples/kitchen-sink`, proved checked by a deliberate error, then deleted. That project compiles `packages/metakit` from source, so the snippets are compiled once bout 2 has pushed. Probes of behaviour run from inside the package they probe.
- **End checks.** Every claim about the code names its file. The bout's own agent starts a cold reader (Sonnet, given only the note's path, briefed as `docs/agents/writing-docs.md` describes), fixes each problem it reports or says in its report why one does not apply. No Jev: no published API changes yet.
- **Must not touch.** It leaves no file in the repository changed but the note (the temporary snippet file is deleted before the commit). It reads GitHub and posts nothing there.

### Bout 2: split the two files Jev cannot take

- **Model.** Sonnet: a mechanical move with a clear target.
- **Writes.** `packages/metakit/src/abstract/check.ts` and new `abstract/fields.ts`, `abstract/state.ts`, `abstract/ops.ts`; `packages/metakit/src/prove.ts` and new files under `src/prove/`; the `file` anchors in `packages/metakit/test/metakit.mutations.ts`, `core-review.mutations.ts`, `consumers-review.mutations.ts` and `temporal.mutations.ts`. The build needs no change: `packages/metakit/tsdown.config.ts` makes every file under `src` an entry.
- **What goes where.** `abstract/fields.ts`: `FieldKind`, `FieldInfo`, `collectFields` and their helpers. `abstract/ops.ts`: `TermOp`, `PredicateOp`, `AbstractOp` and the `abstractOps` table. `abstract/state.ts`: the facts kept while checking and the functions that narrow them. `abstract/check.ts` keeps `checkInvariant` and `checkTransition` and re-exports the rest, so `Abstract.*` is unchanged. `prove/lower.ts`: expressions to solver terms. `prove/witness.ts`: reading and replaying a counterexample. `prove/machine.ts`: `machine` and its report types. `prove/policy.ts`: `policy`, `policyImplies`, `policyConsistent`. `prove.ts` keeps `ProveOptions`, `invariant`, `transition` and re-exports. A helper that more than one new file uses goes in the lowest of them that needs it (fields, then state, then ops). If a piece is still over the limit, split it again by operation family (`abstract/ops/num.ts`, …) and say so in the report. The new files are built but not importable by users: `package.json`'s `exports` does not change.
- **Rules.** No behaviour change and no change to exported names. Each resulting file under 20,000 characters (`wc -m`), checked at the end. Comments move with what they document. Imports between the new files have no cycle that changes evaluation order. A mutation spec entry is `{ name, edits: [{ file, find, replace }], tests }`: update the `file` of every edit whose `find` text moved. Four specs name the two files today; search all of `packages/*/test` and `examples/*/test` for others, change only the `file` of an edit found there, and name it in the report. Before the first edit, run `pnpm --filter metakit build` and save the list of exported names of `dist/prove.d.ts` and `dist/abstract/check.d.ts` in the session's scratch directory, for the comparison below.
- **Inner loop.** `pnpm exec tsc -b packages/metakit`, and `npx vitest run packages/metakit/test/abstract-soundness.test.ts packages/metakit/test/prove.test.ts --project unit` from the repository root.
- **End checks, once.** `npx vitest run packages/metakit/test --project unit` (read `Test Files` as well as `Tests`); `pnpm mutate` on each of the four specs, one call per spec; `pnpm mutate:check`; `pnpm --filter metakit build`, then a comparison of the exported names in `dist/prove.d.ts` and `dist/abstract/check.d.ts` before and after; `npx vitest run scripts/test/publishedBuild.test.ts -t metakit --project unit`; `pnpm exec oxfmt` on the files it wrote, then `pnpm format:check`. No Jev: the API is unchanged.
- **Must not touch.** Any other package's source; `packages/plus`; the lockfile; tsconfig paths; `examples/todo-app` (bout 3).

### Bout 3: the first example as a composed machine

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

**Bundles grow.** Putting metakit under `foldkit-entity` adds a dependency to pages that pass their budgets by tens of bytes. Limit: bout 1 measures a prototype before the move starts; one module per operation; the ledger records every reading; a raise needs code every such page runs. If the prototype shows a net growth that the deleted entity code does not cover, bout 1 says so and Phase 1 is re-planned before it starts.

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

## Assumptions to verify, each in its phase's first bout

- That `foldkit-entity`'s expressions can all be expressed in six metakit node kinds plus relation operations. Read at the level of exports and module comments, not line by line. (Bout 1.)
- That metakit's checker decides every pair `bounds.ts` and `enumerate.ts` decide. (Phase 1, the differential test.)
- That the entity page budgets do not grow net. (Bout 1's prototype.)
- That the older test runners and records outside metakit (`Walk`, `Scenario`, and the `Evidence` kinds that say how a rule was shown) fit `metakit/temporal`'s walk without a second runner. Their sources were not read. (Phase 5.)
- That a region Foldkit holds as trusted HTML is left alone across renders, and that hydration adopts a page the binder changed. Neither was tried. (Phase 6, the probes.)
- That a script able to evaluate a transition fits the 20 kB bar with room for the binder. metakit's main entry is 722 B, but the evaluator and operations a transition needs were not measured. (Phase 6, probe 3.)
- That the cause of the stale-drawing case in Phase 2 item 5 is that Remote's reducer steps are not writers in the graph. It is recorded from the brief; the bout reproduces it first.
- Which budgets have under 350 B of headroom: none was built or measured for this plan. The raises listed in Phase 0 come from the comments in the budget files. (Phase 0, the ledger.)
- That the flake is a resource limit of the CI runner. Its cause is unknown. (Phase 0.)
- Line numbers quoted from issue #581's audit were read at `4b9bc344c` and may have moved.
