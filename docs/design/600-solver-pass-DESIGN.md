# A solver as a second pass for `Laws.check` (#600)

Status: design, 2026-11-19. Nothing here is built. It reverses one line of #536 and #541 ("No solver"), for an optional dev-time package only; `Laws.check` stays as those notes made it.

## 1. The decision

**Yes: use an off-the-shelf solver, Z3 through the `z3-solver` npm package (its WebAssembly build), in a dev-time package of its own that takes `Laws.check`'s report and decides the pairs the built-in pass left undecided.** The reason in one sentence: the obligations the built-in pass cannot decide (two unknowns in one comparison, a sum read against a bound, an input related to a member, a weakened `when`) are linear integer arithmetic over booleans and SQL's three values, which an SMT solver decides completely in milliseconds, and our rules and writes are already data, so the translation is one more reader of `Expr` beside the judge and the two SQL compilers; anything we wrote ourselves to decide that fragment would be a smaller, less tested SMT solver.

The main cost is a second semantics of the language. Every construct the solver reads must mean what the judge, SQLite and Postgres say it means, and that agreement is kept the way the SQL compilers' is: by a differential test and conformance cases, which this note specifies (section 5). The rest of the cost is measured and small for a dev tool: 39 MB in `node_modules`, about 200 ms to load, about 210 MB of memory while it runs, Node only. A project that does not install the package sees exactly today's report.

The maintainer asked whether owning the expression language lets us do more than Alchemy. It does, in six concrete places, each settled below: nothing is "not read" (no source to parse); the safe-integer bound Alchemy assumes is a fact we can prove (section 5); doubles can be modelled exactly where Alchemy refuses them (phase 2); an operator's declared laws become axioms; each proof stands alone because the writer enforces the induction hypothesis (section 6); and candidate invariants for a proof that is too weak can be drawn from the atoms of the declared `when`s (section 7).

## 2. What a solver adds over the built-in pass

Today `Laws.check` enumerates finite fields and says `undecided` for any number (`packages/entity/src/enumerate.ts`: "No solver: a member that is not finite ... makes the question undecided"). The interval pass being built now decides a member against constant bounds, carrying an obligation on each pair it leaves undecided. Intervals hold one variable at a time, so these stay out of their reach:

| Class | Example | Built-in verdict, with intervals | With the solver |
| --- | --- | --- | --- |
| Two unknowns in one comparison | `examples/writes`: `reservedWithinStock` is `reserved <= stock`; `Restock` does `stock += quantity` with `quantity: Schema.Int` | undecided: the hypothesis `reserved <= stock` is relational, which no interval holds | **refused**, witness `stock 1, reserved 1, quantity -1` leaves `stock 0` (probed). Bounding `quantity` with `isGreaterThan(0)` makes it **proved** |
| A sum read against a bound | bank `WithdrawMoney x withinDailyLimit`: `when withdrawnToday + amount <= 500`, `withdrawnToday += amount`, rule `withdrawnToday <= 500` | undecided unless the interval pass matches the sum syntactically | **proved** (probed, 24 ms) |
| A `when` relating an input and members | the issue's regression: `when amount <= balance + limit`, `limit` a nullable field kept `>= 0` by a rule | undecided: three variables | **refused**, witness `balance 0, limit 1, amount 1` leaves `balance -1` (probed); with the original `amount <= balance` it is **proved** |
| A state over numbers | `examples/writes`: `Sell` declares `becomes: InStock` (`stock > reserved`) and increments `stock` | `enforced`: the postcondition is held where it commits | **refused**: from `stock 1, reserved 1` with `quantity 0` the row is not in `InStock`; with `quantity > 0` the arrow **holds** and the write needs no `ensures` |
| A rule that cannot apply | bank `CloseAccount x neverOverdrawn`: `becomes: Closed`, rule bound to `Open` | an item of the built-in checker's own work in #600 | proved as a matter of course |
| Rules across a write and the rows it reaches | a delete through a relation declared `onDelete: 'setNull'` clears a link that the pointing Entity's rule reads | `kept: a delete leaves no row` (`laws.ts`, `judgeWrite`), which is wrong for that rule | phase 3: the cleared rows are a write of their own, judged against their Entity's rules |
| Sequences | a reserve-then-capture pair where `Capture` keeps `balance >= 0` only because every write also keeps `reserved <= balance`, which nobody stated | undecided | phase 1: **refused** from `{ balance: 0, reserved: 1 }`, "a row the rules allow"; phase 4: no sequence of writes from a create reaches it, so the report proposes `reserved <= balance` as the missing invariant |

One more class is free once the solver is loaded: a write whose `when` no row the rules allow can meet is reported as dead, and a write that can leave a number outside its field's Schema (a bound, a whole number, the safe range) is reported with a witness.

## 3. Which solver, and how it is loaded

### What is usable from Node today

| Candidate | How it runs | Measured or read | Verdict |
| --- | --- | --- | --- |
| **Z3, `z3-solver` 5.4.1** (npm, MIT) | WebAssembly with emscripten threads, async API | 39 MB installed (wasm 39.2 MB, 9.0 MB gzipped), 3 packages, 2 s install; import 86-144 ms, init 85-107 ms; first query about 110 ms, then 6-30 ms; 204-224 MB peak; same answers on Node 26 and 22 on Windows and Node 22 on Linux | **chosen** |
| Z3 native binary over SMT-LIB on stdin | a `z3` executable per platform | 5.4.1 from PyPI's wheel: `z3.exe` 18.5 MB plus `libz3.dll` 17.9 MB; GitHub release zips 54-71 MB; 57 ms per process; 3.3 times faster than wasm on a hard query | **fallback** |
| cvc5 1.4.2 | native only; no npm or wasm build exists (`cvc5`, `cvc5-wasm`, `@cvc5/cvc5` are all 404 on npm) | static release zips 32-43 MB; BSD for the non-GPL builds | rejected: a native install for no theory we need that Z3 lacks |
| Yices 2.8.0 | native only | GPLv3; no strings theory | rejected |
| Boolector (`@yowasp/boolector`) | wasm, 1.4 MB | bit-vectors and arrays only | rejected: no integers, reals or strings |
| OxiZ (`@cooljapan/oxiz` 0.3.4) | wasm, 2.6 MB | a young Rust SMT solver | rejected: no record of soundness to lean on |
| Pure JavaScript | none credible: `logic-solver` is SAT only (2016); `javascript-lp-solver`, `yalps` and `highs` are LP/MILP, with no booleans, no three values and no strings | | rejected |

`z3-solver` needs `SharedArrayBuffer`, which Node always has; a browser would need cross-origin isolation, which is one more reason the package is Node-only. Alchemy reports that it does not start under Bun (its loader's error message says so); I did not check Bun.

### The probe

In `solver-probe/` in the session scratchpad (scripts and `RESULTS.md` kept; `node_modules` deleted). Each query is SMT-LIB text loaded with `solver_from_string`, seeds `smt.random_seed` and `sat.random_seed` 0, a work budget (`rlimit`) and no timeout.

| Query | Answer | Witness |
| --- | --- | --- |
| Withdrawal: `open => balance >= 0` before, `amount >= 0`, `when open and amount <= balance`, `balance' = balance - amount`, can `open' and balance' < 0`? | unsat (proved) | |
| Weakened: `when amount <= balance + limit`, `limit` nullable (a value and a defined flag), `limit >= 0` where defined | sat | `balance 0, limit 1 (defined), amount 1, balance' -1` |
| Daily limit: `0 <= w <= 500`, `w + amount <= 500`, `w' = w + amount` | unsat | |
| `examples/writes` `Restock` against `reserved <= stock` | sat | `stock 1, reserved 1, quantity -1, stock' 0` |
| Two strings under `str.<` and `str.prefixof` | sat | differs between front ends (below) |
| `x * y = 1000000016000000063`, `x, y > 1` | unknown, reason `canceled` | |

Three runs on Node 26, one on Node 22 (Windows) and one on Node 22 in a Linux container gave identical answers and identical models. The budget is work, not time: at `rlimit` 4,000,000 the factoring query stopped after 2.1 s in wasm and 1.46 s native; at 40,000,000, after 45 s and 13.7 s. The linear queries never came near it. The native binary agreed on every verdict and on every integer witness, but its text witness was `"a\u{1}", "a\u{2}"` where wasm's was `"a\u{2}", "aQ"`: a witness is repeatable for one solver build called one way, not across front ends.

### What Alchemy chose, and whether it applies

Alchemy (alchemy-run/alchemy#3260, merge `e4adb720`) depends on `z3-solver` 5.3.3 as a plain dependency pinned in its catalog, loads it with a dynamic `import()` only when a verification runs, and keeps one Z3 context with a fresh solver per query. It loads each query with `solver_from_string` because `eval_smtlib2_string` hands the text to another thread and frees it first, so the solver "now and then reads garbage" (its comment in `Prove/internal/Smt.ts`). It sets `rlimit` 40,000,000, both seeds to 0, and a 60 s timeout only for a query that hangs; it builds SMT-LIB text as strings and parses the printed model back. A number whose Schema says whole is `Int`, any other `Real`; arithmetic on numbers that may not be whole is refused; its report assumes "a number stays within ±2^53".

Its reasons apply to us: a dev tool that must run in CI and on every contributor's machine with `npm install` and nothing else, where a native solver would be a per-platform install. We take its loading pattern, its `solver_from_string` workaround, its seeds and budget, and its choice to speak SMT-LIB text (which keeps the native fallback a change of transport). We do not take its interpreter of JavaScript source, since ours reads `Expr`, or its assumption about ±2^53, which we prove (section 5).

### Recommendation

`z3-solver`, pinned to an exact version as a dependency of the new package (not a peer: the version decides the verdicts and the witnesses, so it is ours to choose and to move deliberately). The fallback is a native `z3` given by path (`solver: { native: '/path/to/z3' }`) that receives the same SMT-LIB text on stdin; it is for speed on large domains and for runtimes where the wasm build does not load.

Determinism, decided:

- **A work budget, not a clock.** `rlimit` per question, default 4,000,000 (about two seconds of a hard nonlinear question in wasm on this machine; linear questions use a small fraction). A spent budget is its own answer (`Undecided` with the budget named), the same on every machine.
- **Fixed seeds:** `smt.random_seed` and `sat.random_seed`, 0 unless `seed` says otherwise.
- **One pinned version and one front end.** A version bump of `z3-solver` is a change of its own, with the differential suite and the snapshot of verdicts re-run. Tests compare verdicts, and replay witnesses (section 5) rather than snapshot their values, since the native front end picks different ones.
- **A hang guard** of 60 s wall time per question, after which the threads are killed (`killThreads`) and the pair reads "the solver hung". It is the only answer that can differ by machine, and it means a bug to report.

## 4. The translation

Everything below is SMT-LIB text the package writes; the solver is asked whether a row before, an input and the row after exist such that every hypothesis holds and the rule does not. Unsat is a proof; sat is a witness, replayed (section 5) before it is believed; unknown and a spent budget are reported as such.

Three-valued truth is modelled by two booleans per predicate, *is true* and *is false*; unknown is neither. Every nullable value is a pair, a value and a *defined* flag. A rule is kept only when it is true (the judge's "SQL's unknown, from a null, fails one" in `invariant.ts`, and the CHECK's `(…) is true` in `remote-drizzle/src/checks.ts`), so a hypothesis asserts *is true* and the negated goal asserts *not is true*.

An approximation is allowed only in the sound direction: a hypothesis may be weakened (a check the solver cannot read is dropped, a construct it cannot read becomes a fresh unconstrained boolean or value), which can lose proofs and can produce witnesses that are not real, never the reverse. Every witness is replayed, so a witness resting on such a stand-in is reported as unknown, never as refused. Nothing in the goal is ever approximated.

### Values

| Ours | Solver | Status |
| --- | --- | --- |
| A number field whose Schema has `isInt` | `Int`, with `-(2^53-1) <= x <= 2^53-1` assumed: Effect's `isInt` is `Number.isSafeInteger` (`effect` 4.1.4, `Schema.js:4673-4674`; a probe: `Schema.Int` refuses `2 ** 60`) | exact |
| A number field with `isFinite` and no `isInt` | `Real`; a literal is the exact rational of its double (0.1 is 7205759403792794/72057594037927936, probed), so every double assignment is a real one with the same truth | exact for comparisons; arithmetic refused in phase 1, `(_ FloatingPoint 11 53)` with round-to-nearest in phase 2 |
| A number field admitting NaN or an infinity (`Schema.Number` admits both, probed) | none | refused where a rule or a `when` reads it: the judge refuses NaN (`evaluate.ts`, `refusedNaN`) and SQLite stores it as null, so the readers part. The reason names the fix: `Schema.isFinite` or `Schema.Int` |
| Boolean | `Bool` | exact |
| A literal or a union of literals | the constant, or a string or integer constrained to the set | exact |
| Text | `String`, every character neither NUL nor a surrogate (both refused or rewritten by every reader, `traps-data-and-sql.md`) and at most U+2FFFF, Z3's largest character (probed) | exact for equality; the alphabet bound is printed under Assumed |
| A date | its stored form: ISO text is `String`, epoch milliseconds `Int` | exact, as the readers compare the stored form |
| An id, a `one` relation's id | `String`; equality only | exact |
| A nullable field, `Schema.OptionFromNullOr`, an optional link | value plus *defined* | exact |
| An input key that may be absent | value plus *given*; a key not given writes nothing | exact |
| `Expr.viewer` | a free `String` with *defined* (a visitor is null) | exact |
| `Expr.now` | a free `Int` (milliseconds, `context.ts`) | exact |
| A derived member (`Derived.count`, `exists`) | nothing: a derived member is not an operand (`docs/expressions.md`) | not applicable |

### Predicates and scalars

| Ours | Solver | Status |
| --- | --- | --- |
| `Expr.eq` | true when both defined and equal, false when both defined and unequal, else unknown | exact |
| `isNull`, `isNotNull` | never unknown | exact |
| `lt`, `lte`, `gt`, `gte` on numbers | arithmetic comparison, unknown on a null | exact |
| The same on text under `Collation.binary` | `str.<`, `str.<=` (by code point, as `Binary` is) | exact (phase 2) |
| The same under `asciiFold` or a locale collation | none | refused: collation decides it, and only the server knows a locale |
| `and`, `or`, `not`, `implies` | Kleene's tables over the two booleans (`implies` is already `or(not a, b)` in nodes) | exact |
| `in` over a literal list | a disjunction with SQL's rules (empty list false, null value unknown, no match beside a null unknown) | exact |
| `in` over an input list | none | refused in phase 1-2 |
| `contains` | none: it folds ASCII case | refused (a fresh boolean in a hypothesis, which is sound) |
| `Text.startsWith` under `binary` | `str.prefixof` | exact (phase 2) |
| `Expr.add`, `Expr.sub` on integers | `+`, `-`, strict on null, each node also checked against the safe range (section 5) | exact |
| `Expr.add`, `Expr.sub` on reals | `fp.add`, `fp.sub` (RNE), compared with `fp.eq` so `0` and `-0` agree | phase 2, exact given double storage |
| An operator defined by an expression (`definedAs`) | its expansion | exact |
| A primitive operator with no solver meaning | an uninterpreted function, strict on null, with each declared `Law` instantiated over the call terms in the question | sound over-approximation, witnesses replayed |
| A path, a viewer path | a fresh symbolic row of the target holding its state invariants, null when the link is null or the row unseen | phase 3, sound |
| `Expr.exists` in a `when` | true: one fresh row holding `where` and its invariants; under a `not`: dropped from the hypothesis | phase 3, sound |
| `Expr.exists` or a path in a rule | none: a rule reads its own row only today (`invariant.ts` refuses another Entity) | not applicable |

A custom operator declares what the solver may assume through the `Law`s it already declares (`packages/entity/src/law.ts`: associative, commutative, idempotent, identity, absorbing, inverse, distributes, monotonic, each narrowed with `Law.within`). Each becomes ground instances over the calls the question holds, never a quantifier: `monotonic('increasing', 0)` gives, for every two calls `f(a, …)` and `f(b, …)` in the question, `a <= b => f(a, …) <= f(b, …)`, guarded by the law's domain. That keeps every question quantifier-free and decidable. Laws are declarations: the report's Assumed section lists each one used, and says whether the operator table given carries `Conformance.laws` evidence for it. An operator that declares nothing is uninterpreted: the solver knows only that equal arguments give equal results. Entity gains no solver vocabulary; there is no SMT definition on `Expr.operator`.

### Writes

| Ours | Solver | Status |
| --- | --- | --- |
| A field not written by an update | `after = before` | exact |
| `set` from an input | `after = input`, or `before` where the key may be absent and is not given | exact |
| `increment`, `decrement` (being added) | `after = before + input`, `before - input` | exact for integers |
| `compute` | the translation of its expression over the row before and the input | as its expression |
| `Entity.sets` (context) | `after = now` or the viewer's id | exact |
| A link | `after = input id` | exact |
| `expect` (the revision) | a fresh value: the writer moves it | sound |
| A field an insert leaves to the store | a fresh value in its Schema | sound |
| `when`, including what `when` reads of the input (being added) | hypothesis: true over the row before and the input | exact |
| `from` | already inside `when` | exact |
| `becomes`, `ensures` | an extra goal: the row after is in the state | exact |
| A delete | kept; phase 3 adds what `onDelete: 'setNull'` and `'cascade'` do to other Entities | |
| An input's Schema checks | hypotheses where the solver has words: `isInt`, `isFinite`, `isGreaterThan(OrEqualTo)`, `isLessThan(OrEqualTo)`, `isBetween`, `isMultipleOf` (on integers), code-point lengths (`str.len`), `isStartingWith`, `isEndingWith`, `isIncluding`. Others (`isMinLength`/`isMaxLength`, which count UTF-16 units, `isPattern`) are dropped and named | sound |
| The induction hypothesis | the row before holds every state invariant of its Entity and every field's Schema; a create has no row before; a transition invariant is not assumed of the row before; a refinement (`Entity.refine`) is its predicate | exact |

The Schema check reader is the one `remote-drizzle/src/checks.ts` already has for CHECK constraints, moved where both can read it, so a check is read one way.

### Why the hypothesis may be assumed of every pair

Alchemy proves a rule only when every command keeps it, since one that does not could leave a state that breaks the hypothesis. Ours does not need that: the writer judges every invariant where a write commits and refuses a row that breaks one, and a bound table's CHECK holds each state invariant against other SQL. So every stored row holds the state invariants, whatever any other pair's verdict is, and each pair's proof stands alone. What a proof then says is narrower and still worth having: this write is never refused by this rule, the page's prediction never shows a row the server refuses on its account, and the law needs no `runtimeOnly` line.

## 5. Soundness and agreement with the other readers

**The differential test** is the first deliverable, before any solver code (phase 0). A seeded generator makes small domains from a grammar: an Entity of two to four fields drawn from bounded integers (`Schema.Int.check(Schema.isBetween(-3, 3))`), booleans, literal unions and their nullable forms; one to three invariants drawn from comparisons, `eq`, `isNull`, `and`, `or`, `not`, `implies`, `add` and `sub`; and two to four writes with `set`, `increment`, `decrement`, `compute` and a `when`. With every Schema bounded the domain is finite, so brute force over every row before that holds the invariants and every input gives the exact answer to each pair. The test requires that answer to agree with every verdict the passes give, in both directions: a pair proved must have no breaking step, and a pair with a breaking step must not be proved. It runs against the built-in pass first, which gives the interval pass a test it does not have today, and then against the solver. Each solver witness must break the rule when the reference judge replays it (`judgeAgainst` over the row the write's own memory semantics computes, not the row the solver printed). The translator's mutation spec (a Kleene table flipped, a hypothesis dropped, a definedness flag ignored, a law instance reversed) must turn it red.

**Conformance cases.** `foldkit-entity/conformance` holds bodies, rows and the expected ids, run today by `evaluate`, Remote's store, SQLite, Postgres and `Judge`. The solver joins as a ground reader: for each case and row it asserts the row's values and asks for the predicate's truth, which must equal the judge's true, false or unknown. Every case added for any reader is then a solver case too, and an arithmetic case the SQL readers part on is one the solver must refuse.

**Where SQL and JavaScript part, and the rule for each.**

| Difference | Readers | Rule |
| --- | --- | --- |
| Integer range | JavaScript is exact to 2^53; SQLite to 2^63, then real; Postgres raises past `int4` or `int8` | Inputs and fields with `isInt` are safe integers by their Schema. Each `add` and `sub` node is also asked whether it can leave the safe range; if it can, the pair is undecided with that witness and the hint to bound the input, and the write is listed as able to leave its field outside its Schema. An `int4` column raising is a refusal, never a broken rule, and is not this pass's concern |
| Non-integer arithmetic | doubles in JavaScript, SQLite `REAL` and Postgres `double precision`; Postgres `numeric` is decimal | phase 1 refuses it; phase 2 models doubles exactly and prints "real numbers are stored as doubles" under Assumed |
| Division, multiplication | not in the language | an operator for them is uninterpreted; a product of two unknowns, if one is ever added, is nonlinear and may spend the budget (the probe's factoring question did) |
| NaN | the judge refuses it; SQLite stores null; Postgres orders it after every number | refused wherever a Schema admits it |
| `-0` | equal to `0` everywhere | `fp.eq`, never `=`, on doubles |
| Text | lone surrogates become U+FFFD in the drivers and in memory; NUL is refused; collation decides order | the witness alphabet excludes both; only `binary` order is read |

## 6. The API and the report

### The package

`foldkit-entity-prove`. Dependencies: `z3-solver` (exact version). Peers: `foldkit-entity`, `foldkit-metadata`, `effect`. Nothing in `foldkit-entity` imports it, so the dependency points one way. That no page reaches it is held three ways: the package is Node-only and loads `z3-solver` with a dynamic `import()` inside the call; a bundle budget for the examples gains `z3-solver` and `foldkit-entity-prove` under `absent`; and `scripts/evidence-check.mjs` names its module as the one producer of the new evidence.

### The call

A sketch of the shape, not code to copy:

```ts sketch
import { Laws } from 'foldkit-entity'
import { Prove } from 'foldkit-entity-prove'

const report = Laws.check({ writes })              // synchronous and unchanged
const proved = await Prove.laws(report, {
  budget: 4_000_000,                               // rlimit per question
  seed: 0,
  require: { proved: [neverOverdrawn, [WithdrawMoney, withinDailyLimit]] },
  allow: { undecided: [[Rename, nameIsShort]] },
})
console.log(Prove.show(proved))
expect(Prove.notDone(proved)).toEqual([])
```

- `Laws.check` stays pure and synchronous. Phase 0 adds to each pair from a declared write an `obligation`: the write, the rule and the hypotheses as the values they already are (the `Write`, the `Invariant`s, the operator table), with no new language. The interval pass carries obligations on undecided pairs already in its brief; this one extends it to every pair, which the differential test needs.
- `Prove.laws(report, options)` returns a `ProvedReport`, which is a `LawReport` (so `Laws.show`, `Laws.facts`, the CLI and `Graph` take it as they are) with three more fields: `solver` (name, version, front end, budget, seed), `assumed` and `notDone`. It re-asks only pairs that are `Undecided` and carry an obligation, and the dead-write and Schema questions of each write.
- `require.proved` takes the rule's declaration (every pair of that rule) or a `[write, rule]` pair, typed by the declarations, never by a string (De-slop: an option naming a member).
- `allow` names what a pass may leave: `refused`, `undecided` (which covers a construct the solver does not read, an unknown and a spent budget, each distinguishable in the reason) by pair.
- `Prove.notDone(report)` lists every pair refused or undecided that `allow` does not name, and every pinned pair not proved. A pass is an empty list: everything asked was done.

### The verdicts

| Solver answer | Verdict | Evidence |
| --- | --- | --- |
| unsat | `Kept { by: 'proof' }` | a new `Proved { transition, law, solver, budget }` record in `foldkit-metadata`, issued by `foldkit-entity-prove` |
| sat, and the replay breaks the rule | `Refused { steps }`, the step holding the row before, the input and the row after | none |
| sat, and the replay does not break it | `Undecided`, "the witness rests on what `acme.slug` returns, which the solver does not know" | none |
| unknown | `Undecided`, with the solver's reason | none |
| the budget spent | `Undecided`, "the solver stopped at its budget of 4,000,000" | none |

`Evidence` gains a variant, so every exhaustive match over it gains a case (`surface/src/graph.ts`'s `evidenceText` prints "proved by z3 5.4.1"). `Graph.validate` admits a `Proved` record as it admits `Enumerated`, and `Laws.facts` draws a `keeps` edge where every pair of a transition and a law has a record, as now. A pinned pair is the test's business, not the graph's.

### The report

A header with counts, then tiers, each saying exactly how far its claim goes:

```text
Account: 4 writes, 3 rules, 12 pairs (z3 5.4.1, budget 4,000,000 per question, seed 0)

Proved: for every row its invariants allow and every input its Schema accepts, so after any number of writes (see Assumed)
  DepositMoney    x neverOverdrawn       proved by z3
  WithdrawMoney   x neverOverdrawn       proved by z3
  WithdrawMoney   x withinDailyLimit     proved by z3
  OpenAccount     x neverOverdrawn       enumerated
  ...

Refused: a row its invariants allow and an input its Schema accepts, for which the write leaves a row that breaks the rule; the writer refuses it as Invalid
  (none)

Undecided: neither proved nor refused
  Rename          x nameIsShort          reads isMaxLength, which counts UTF-16 units; the solver counts code points (walk it, or use isMaxCodePoints)

Assumed
  - every write of Account is among the 4 given; a write not given, an import, a migration or SQL run by hand is outside these proofs
  - every row stored before a rule was declared holds it: adding a rule refuses nothing already stored
  - the writer judges every invariant where a write commits, and a bound table's CHECKs hold the state invariants against other SQL
  - number.add and number.subtract are what JavaScript, SQLite and Postgres compute within ±(2^53-1), which each sum was shown to stay inside

Not done
  (none)
```

The sentence "after any number of writes" rests on what the Assumed lines say, and only there: a write the call was not given, rows imported or written by SQL a CHECK does not cover, a transition invariant a database does not hold (`serverOnly` in `checks.ts`), and rows stored before the rule. Each line appears only when it applies (the doubles line only where phase 2 modelled one; an operator's law only where one was used).

"Too weak" in phase 1 is a refusal from a row the rules allow, said as such: "from `{ balance: 0, reserved: 1 }`, a row the invariants allow". Phase 4 tells the reachable from the unreachable (section 7) and, for the second, prints: "No sequence of up to 4 writes from a create reaches a row like it. If none can, say so in an invariant, and this one is proved: `reserved <= balance` would do."

`npx foldkit-plus laws` loads `foldkit-entity-prove` from the project as it loads `foldkit-entity` (`packages/plus/src/laws.ts`), and prints `Prove.show` when it is installed. When it is not, the built-in report prints as now, followed by one line: "7 pairs are undecided; install foldkit-entity-prove to send them to a solver." The one-call `Laws.verify` the issue proposes takes the prover as a capability (`prove: Prove.laws`), so that entry carries no solver unless given one.

## 7. Beyond one write

What belongs where:

| Question | Owner |
| --- | --- |
| Can one write break one rule, for any row and input | this package (induction over one step) |
| Is a refusing row reachable from a create in a few writes | this package, phase 4: bounded model checking, the writes unrolled on one row to a depth `k` |
| Which inputs reach the boundaries of a `when` | this package, phase 4: `Prove.cases(writes)` returns `Walk` cases whose generators pick, for the Model they reach, the input a solver model gives at each atom's edge |
| A sequence through the real writer, the page, a ledger | `Walk`, `Scenario` |
| A write sent twice, two writes from one read | `Walk` and `Scenario`. `RemoteServer.write` already refuses an increment with neither `expect` nor a ledger (`docs/declared-writes.md`), so the structural risk Alchemy explores by redelivering events is refused at declaration here |
| A prediction against the answer | `Law.check` in `foldkit-remote/testing` |
| Shrinking a failing walk to a `Scenario` to paste | `Walk` |

Candidate invariants, for a proof that is too weak, come from our own language: the atoms of every declared `when` and every rule of the Entity, and their sums and differences, form a finite candidate set. The largest subset that every write keeps together (each candidate assumed before, each asked after, dropping any that fails, until none fails) is inductive, and any member of it that makes the failing pair proved is printed as the suggestion. Alchemy has to ask the author; we can propose one because every `when` is data.

What we do not take from Alchemy, because our model differs: no events, so no redelivered events and no reordered reactions; no policies, sagas or schedules, so no exploration of them; no external systems whose answers a solver picks. Our nearest analogues are Sync's durable Messages and `foldkit-durable`'s journal, which answers an operation sent twice instead of applying it again; a Sync document's laws are functions (`holds({ before, after })`), which this package cannot read and does not try to.

Rules across records (phase 3), proved for a fixed few and searched otherwise:

- the rows a write reaches through its `when`'s paths and exists, each a symbolic row of its Entity holding that Entity's state invariants, two names of one Entity tried both as two rows and as one (Alchemy's choice for a decision's reads, which is where its examples break);
- the rows a delete changes through `onDelete: 'setNull'` (a write that clears the link) and `'cascade'` (a delete), each judged against its own Entity's rules, which today read every delete as kept;
- a rule over two rows joined by a `one` relation, once there is a way to declare one (open question 3). A rule over every row of an Entity stays searched, by `Walk`.

## 8. Costs and risks

| Cost | Measured or decided |
| --- | --- |
| Install | 39 MB, 3 packages, about 2 s from npm; a dev dependency only |
| Start | 85-145 ms import, 85-160 ms init, about 110 ms for the first question |
| Per question | 6-30 ms linear; capped by the budget, about 2 s of a hard question in wasm at the default |
| Memory | 204-224 MB peak |
| CI | the bank's 12 pairs should take under a second after start (estimated from the probe's per-question times, not measured on the real translation); the differential suite's run is sized by its seed count, chosen so it stays under 30 s in the unit project |
| A user who does not install it | today's report, plus one line naming the package |
| Version drift | an exact pin; a bump re-runs the differential suite and the verdict snapshots |
| Non-termination | `rlimit` per question, a 60 s hang guard that kills the threads |
| A second semantics | the differential test, the conformance cases and a mutation spec of the translator, all in the repository's CI |
| Licence | Z3 and `z3-solver`: MIT |
| Platform | Node 22 and 26 on Windows and Linux probed; macOS not probed; Bun not supported (Alchemy's report); not for a browser |

## 9. Rejected alternatives

- **Our own decision procedure beyond intervals.** The fragment that matters is linear integer arithmetic with boolean structure, SQL's three values and string equality. Deciding it is Fourier-Motzkin or the Omega test under a SAT search with theory propagation: an SMT solver, written again and less tested. Intervals stay as the fast, dependency-free first pass.
- **Property testing alone.** `Walk` samples, and a weakened `when` breaks only on a boundary (`balance 0`, `limit > 0`, `amount = balance + limit`) that random inputs rarely meet; sampling never proves. Walks stay for sequences, the real writer and delivery faults, and phase 4 feeds them solver-picked inputs.
- **Asking a database.** A database evaluates rows it holds; it does not search for a row and an input that break a rule. Over bounded grids that is the enumeration `Laws.check` already does, and it would answer for one dialect at a time.
- **Requiring the solver always.** `Laws.check` would become asynchronous and carry 39 MB and 200 MB of memory into every caller, the CLI and `Graph` included, for pairs the built-in pass decides instantly. The solver stays optional and additive.
- **A native solver as the default.** A per-platform binary for every contributor and CI image. It stays the fallback.

## 10. Plan

| Phase | Delivers to a user | Acceptance | Decision needed |
| --- | --- | --- | --- |
| 0 | each write's pairs carry their obligation; a differential harness that already tests the built-in and interval passes | the harness over 1,000 seeded bounded domains agrees with every decided pair; a mutation of the interval pass turns it red | no |
| 1 | `foldkit-entity-prove` with `Prove.laws`, `Prove.show`, `Prove.notDone`: integers, booleans, literals, nullable values, `add`/`sub`, every write effect, `when`/`from`/`becomes`, input bounds; witnesses replayed; `Proved` evidence; pins and `allow`; dead writes; numbers leaving their Schema; the CLI | bank: `WithdrawMoney` and `DepositMoney` keep `neverOverdrawn` and `withinDailyLimit` proved; the weakened `when` refused with `balance 0, limit 1, amount 1`; `examples/writes` `Restock` refused with `quantity -1` and proved once `quantity > 0`; the harness agrees with the solver on 1,000 domains; every conformance case agrees as a ground reader; the bundle budget's `absent` holds | no |
| 2 | text (equality, binary order, `startsWith`, code-point lengths), ids and links, `viewer`, `now`, context sets, custom operators with law instances, real numbers exact as doubles | conformance cases with 0.1 + 0.2 on SQLite and Postgres agree with the solver; a custom monotone operator proves a pair it could not without its law | open question 2 |
| 3 | rules across records: paths and exists in `when`, `setNull` and `cascade` effects, rules over two joined rows | a `setNull` that clears a link a rule reads is refused with the two rows; two names of one Entity tried as one row | open question 3 |
| 4 | sequences: reachability of a refusing row to a depth, too-weak hints with a candidate invariant, `Prove.cases` for `Walk` | the reserve-then-capture domain prints `reserved <= balance` as the missing invariant, and is proved once it is declared | no |

## 11. Open questions for the maintainer

1. **The package's name and boundary.** Recommended: `foldkit-entity-prove`, exporting `Prove`, with `z3-solver` as an exact dependency. If it should instead be a subpath of `foldkit-entity` (`foldkit-entity/prove`), the bundle test must also hold that no other subpath reaches it, and the 39 MB arrives with every install of `foldkit-entity`.
2. **Exact doubles (phase 2).** Recommended: model non-integer numbers as IEEE doubles with the floating-point theory (probed: `0.1 + 0.2 = 0.3` is false and `b - a >= 0` for `0 <= a <= b` is proved), printing "real numbers are stored as doubles" under Assumed, since SQLite `REAL`, Postgres `double precision` and the judge all compute in doubles. If you prefer Alchemy's rule, non-integer arithmetic stays undecided with the hint to store whole units, and phase 2 loses that row.
3. **How a rule across two rows is declared (phase 3).** Recommended: a rule over the row and the row one of its `one` relations points at, declared beside `Entity.invariant` and held by the writer of either side; the solver proves it for each write of either Entity. If such rules stay a handler's business, phase 3 keeps only the `when` paths and the `setNull`/`cascade` effects.
