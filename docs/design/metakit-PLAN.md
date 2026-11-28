# MetaKit: the plan

**Status:** Written 2026-11-28 from the source at `3694c771f`, every MetaKit design note in `docs/design/`, every open and closed MetaKit issue, and two independent code reviews. Nothing in this plan has been executed; §6 says, per defect, whether it was confirmed by reading the code or still needs a probe.

**Where MetaKit sits:** [`docs/direction.md`](../direction.md). MetaKit is stage 1 of three: MetaKit, then a successor to Foldkit and Effect UI built on it, then Foldkit Plus rebuilt on that successor.

**This file is the map.** Step-level detail for the portable contract and the Reffect adapter is in [`598-612-metakit-reffect-adapter-PLAN.md`](./598-612-metakit-reffect-adapter-PLAN.md). The older plans (`metakit-unification-PLAN.md`, `metakit-phases-2-6-PLAN.md`, `metakit-next-slice-PLAN.md`, `metakit-fn-PLAN.md`) are history: §3 says what they decided and what they left behind. Where an older plan and this one disagree, this one is the current intent.

---

## 0. How to use this plan

- **To pick work:** read §7 (order) and take the first workstream whose "needs" are met.
- **To do a step:** read §4 (the rules), then the workstream in §8, then the defect entries in §6 it names.
- **To fix a defect in §6:** write the failing test first, from the entry's input. If the test passes, the defect is not real: say so in the ledger and stop. Then make the smallest fix, add a mutation that the test kills, add the changelog line, and file or update the GitHub issue (a defect in our package is an issue, per `CLAUDE.md`).
- **To add anything new** (an operator, a node kind, an export, an entry point): it must pass §4.3 first.
- **Who does the work:** §8.0. Implementation is delegated to the `agy` and `codex` command-line agents; the coordinating session writes briefs, verifies and reviews.
- **The plan ends with a full audit** (W10) before anything is released.
- Every rule of the repository's `CLAUDE.md` applies. The traps files to read before touching MetaKit: `traps-types.md`, `traps-effect-4.md`, `traps-tests-general.md`, `traps-tests-mutation.md`, `traps-data-and-sql.md`, `traps-bundling-and-builds.md`, `traps-claims.md`.

---

## 1. What MetaKit is for

A rule written as a JavaScript closure can only be run. To use it in a database constraint, a form, an agent's tool list or a proof, someone rewrites it, and the copies drift. MetaKit keeps a rule as data: an expression tree over Effect Schema, and a state change as a guard plus writes. One declaration is then read by many consumers.

The issues describe four end states. They are layered, and each rests on the one before:

1. **One rule, many readers.** Evaluation, partial evaluation, SQL, an interval checker, a solver, forms, JSON Schema. Each reader gives the reference evaluator's answer or refuses by name. (`#598`, `#645`, `packages/metakit/docs/why-metakit.md`.)
2. **A toolkit for small typed languages.** A language author states the terms, the operations, what they mean and what is known about them, and inherits evaluation, analysis and tooling. (`#647`, `#649`.)
3. **A portable semantic contract.** A definition can leave the process as versioned data, be fingerprinted, and be run by another implementation (SQL, native Rust through Reffect) to the extent that target's semantics justify. A definition is named by a hash of its content, so a rename costs nothing, an unchanged definition is never re-proved or recompiled, and a change marks exactly what depends on it (§5.1). (`#579`, `#645`, `#649` §8.)
4. **The base of a successor to Foldkit and Effect UI**, with its own runtime: transitions, machines, dependency graphs, incremental maintenance and resumable rendering built on the single-step core. This is the project's stage 2, and Foldkit Plus is then rebuilt on it (`docs/direction.md`; `#612`, `#635`, `#637`, `#643`).

The issues pull in two directions on what MetaKit is: "a tiny, decidable calculus, not a general-purpose language workbench" (`#597`, `#598`, 2026-11-20) and "an elegant, general toolkit for crafting TypeScript DSLs" (`#647`, `#649`, 2026-11-27). This plan resolves it by layering, not by choosing:

- **The kernel is the calculus.** Small, closed, decidable, and what every reader implements.
- **The toolkit is built from the kernel's public API**, the same API a third-party author gets (`#649` §9). If a toolkit piece needs a private hook, the kernel's API is missing something; fix that instead.
- **Success is measured at the bottom**: "the simplest MetaKit language is genuinely simple" (`#649`). Today it takes five imports and nine statements (§6, T-ceremony), and some of those lines exist only because the API demands them.

What MetaKit is not, and stays not: a general programming language (no user function bodies with recursion, loops, I/O, randomness or a clock inside an operation), an effect runtime (Effect owns time, concurrency and I/O), a compiler you must run, or a global registry.

---

## 2. Where it stands

### 2.1 The package

`packages/metakit`, version 0.1.0, first committed 2026-11-20, about 217 commits, 31,448 lines of source, 167 test files (87 tests, 20 type tests, 59 mutation specs), 29 entry points, no runtime dependencies. Peers: `effect ^4.1.0`, and optionally `drizzle-orm` and `z3-solver`. PR `#610` merged it to `main` on 2026-11-28.

Sixteen workspace packages depend on it. What they import shows what is load-bearing:

| Used widely | Used by a few | Used by nothing outside MetaKit's own tests |
|---|---|---|
| `metakit` (68 files), `/build` (18), `/machine` (13), `/graph/match` (10), `/operation` (8), `/store` (5) | `/domain`, `/inspect`, `/graph`, `/aggregates`, `/graph/prune`, `/graph/readiness`, `/policy`, `/pairs`, `/temporal`, `/sql`, `/conformance`; and through examples only: `/language`, `/prove`, `/relation`, `/drizzle`, `/operation/sql` | `/artifact`, `/fn`, `/interpreter`, `/syntax`, `/tooling`, `/store/check`, `/aggregates/sql` |

The right-hand column is the whole of the newest layer (`#645`–`#648`). It has tests and reviews but no consumer yet. That is expected for work a week old, and it is the reason W5 (two real languages) and W4 (bundles, corpus) come before more surface.

### 2.2 What is true today that the documents get wrong

- **CI is red.** On `main` the run for the `#610` merge failed in `examples/site/e2e/components.e2e.ts` (a timeout). On `ui-polish` the latest run failed `examples/cloudflare/test/media.test.ts` (500 where 403 was expected); the two before failed a Worker bundle ceiling and a typecheck. None is in MetaKit's own tests.
- **The package cannot be published under its name.** `metakit` on npm is another project's package. The working name is `@doeixd/metakit` (§9.2), which is free.
- **The operator count is stated four ways.** There are 50 core operators (`CoreOpId`, `ops/table.ts`). `node.ts` line 3, `index.ts`, the README (twice) and the skill reference say 33; `node.ts` line 15 and `docs/semantics.md` say 50.
- **The README names `Node.foreign`**, removed in `9a7a0d72f`, and its subpath table omits nine entries.
- **`metakit-unification-PLAN.md` says phases 4, 6, 7 and 9 are not started; `-HANDOFF.md` says all are done.** The LEDGER records gates that were missed and then counted: the binder ships 54.6 kB against a 20 kB bar and blocks 1,357–1,512 ms against 200 ms (it stayed opt-in, which the plan allowed, but the "done when" was not met); the Todo handler ratio is 1.57 against 1.5.
- **Four issues were closed without a recorded resolution:** `#640`, `#641`, `#642` (no closing comment), and `#638`, whose closing comment does not mention the SQL, checker and prover readers its acceptance required.
- **Jev never reviewed** `abstract/check.ts`, `conformance.ts` or `prove.ts` (over its size limit, per the `#610` description). Seventeen source files exceed the unification plan's own 20,000-character rule; the largest are `artifact.ts` (53k) and `fn.ts` (51k).

### 2.3 What the issues claim landed, and what nothing claims

| Issue | Claimed landed (comment, 2026-11-28) | No claim |
|---|---|---|
| `#645` | Portable codec, registry, limits, `docs/semantics.md`; fingerprints, `EvidenceKey`; `Language.compose`/`restrict`/`readiness`; `Interpreter.prepare` | The non-UI vertical slice; interpreted-versus-prepared benchmarks; standalone documentation; declaration-emit tests for composed languages |
| `#646` | `SemanticIndex`, `references`, `dependencies`, `impact`, `diagnostics`, `explain`, `semanticDiff` | A CLI; Vite, editor, DevTools and MCP integrations |
| `#647` | `dual`, `dualLanguage`, staged `grammar`, `testCase`/`testLanguage` | `Syntax.fromSchema`, derived-operation helpers, interpreter conveniences, scope fixtures |
| `#648` | P0 #1–#3 (function contracts, return soundness, foreign rewrites), #4 (binders), #5 (`matchTags`), #7 (derived operations) | #6 control flow versus logical operations; #8 language profiles; #9 budgets and traces; the cross-project fixtures |
| `#649` | (no comments) | All eleven boxes |
| `#597`, `#598`, `#612`, `#635`, `#637`, `#643`, `#644` | `#635` notes observed write deltas (`#614`) | Everything else |

A claim is not evidence. §6 lists places where a claimed item has a defect.

---

## 3. History, and what it teaches

### 3.1 Lineage

| When | What |
|---|---|
| 2026-09 | `foldkit-entity` and its `Expr`: "what a query says about one row". |
| 2026-11-10 to 11-12 | Expression contracts (`478-…-DESIGN.md`) and the laws notes. A first "no `Fn`, no `Num`" decision is reversed two days later. |
| 2026-11-19 | `601-expression-standard-library-DESIGN.md`: from "only operations a query needed exist" to "a deliberate set ships". |
| 2026-11-20 | First MetaKit commit: an `Env`-indexed calculus with 15 operators. Domain types, aggregates, graph, `Prove.machine` the same day. |
| 2026-11-21 | `metakit-kernel-convergence-DESIGN.md`: Entity's `Expr` and MetaKit's become one, by translation, one reader at a time. `Rows` becomes the seventh node kind. 20 operators. |
| 2026-11-22 to 11-25 | Unification phases 1–9: Entity, Guard, Sync, Form, Agent, Surface, Remote and SSR onto MetaKit; checked custom operations; stores; resume; script cut by Message; `metakit/language`. Five adversarial reviews, each followed by hardening commits. 50 operators. |
| 2026-11-26 to 11-27 | The toolkit layer: `fn`, the Effect integration, `interpreter`, `artifact`, `syntax`, `tooling`, and the `#648` hardening. |
| 2026-11-28 | `#610` merges. `#649` asks for simplification. |

Eight days from first commit to merge, with the kernel growing from 15 to 50 operators and from 6 to 7 node kinds, and a new layer added in the last two days.

### 3.2 Decisions that stand

These were argued and settled; do not reopen them without new evidence.

- **SQL's meaning wins**, "because SQL is the reader nobody can change" (convergence design). The one exception: arithmetic past ±(2^53−1) is refused.
- **An operator is admitted only if every reader implements it or refuses it by name**, with conformance cases, total over its Schema. Reader tables are typed by `CoreOpId`, so a missing entry fails to compile.
- **Lists are folded by `Rows`**, not by calls taking a function, which would be opaque to readers.
- **A custom operation has one domain: its argument Schemas.** No per-claim `over`. Its implementation refuses by throwing.
- **Properties live in one table keyed by operator id**, not on operator descriptors, and a property is declared only if a generated check runs and a reader decides from it.
- **Proofs of a rule on data never assume a guard about who is asking.**
- **Decimals are integer units; money has its currency in the type; timestamps are integer milliseconds; calendar arithmetic exists only on dates.** No database `round`, `/`, `cast`, `least` or `min` is emitted.
- **No source transform.** Script is cut only where declarations name a dynamic import.
- **`Fn` inlines its body and adds no operator**; no general recursion.
- **Entity keeps its public constructors** and builds MetaKit nodes underneath.
- **Checks, the prover, SQL lowering and conformance never reach a page.** An opt-in feature has its own subpath and costs a page that does not use it zero bytes.
- **"Measurements order the work and set defaults; they do not cancel it."**

One settled decision is reopened here, with the new evidence that requires it. The unification plan's decision 10 put fingerprints (`#579`) outside its scope. Since then `#645` landed expression fingerprints and evidence keys, the adapter needs a bundle fingerprint, and three implementations were about to exist with none covering types (K16–K18). §5.1 and W4 steps C1–C7 bring the fingerprint half of `#579` into this plan; its Block-composition and graph-query halves stay out.

### 3.3 Decisions reversed, and the pattern

- "No `Fn`, no `Num`" (11-10) → both built (11-12, 11-26).
- "Partial hydration and Message-scoped splitting fall below the thresholds: not built" (11-21) → built in full (11-25), and missed their gates.
- "Six node kinds forever" (`#598`, 11-20) → seven the next day.
- `Algebra.make` proposed (`#597` body), dropped (11-19), returned as `Language.make` (11-25).
- Layer-based context for the successor proposed and retracted the same day (`#612`, 11-26).

The pattern: a limit is stated as a principle, then a concrete need arrives and the limit moves. The lesson is not "never limit". It is that a limit should name the evidence that would move it, which §4.3 now requires.

### 3.4 Defect classes that recur

Every review found the same kinds of bug, and the two reviews for this plan found them again (§6):

1. **A reader disagrees with the evaluator** on null, NaN, `-0`, a refusal or a range edge.
2. **A claim is trusted without a check**: a declared law drives a rewrite; evidence is asserted by its author.
3. **SQL dialect differences** from the JavaScript reference.
4. **A document or comment says what the code does not do.**
5. **A guarantee is dropped by composition**: lifting, expanding, composing or restricting loses a contract, an option or a check.
6. **Hardening follows every feature phase.** Reviews found Critical and High items in each of the five rounds.

Class 6 is the process finding. Features have been landing faster than they are held to the reference. W1–W4 exist to change the order: the contract and its corpus first, then surface.

---

## 4. The rules

### 4.1 Meaning

1. **One reference.** `evalNode` (`ops/eval.ts`) for expressions and `evaluateStep` (`transition.ts`) for steps. Every other reader gives the same observable outcome or refuses by name. An analysis may only weaken toward `Unknown`.
2. **Four outcomes, never confused:** a value; null (absence); a refusal (declined, with a reason); and, for static readers only, `Unknown` (cannot tell). `Unknown` is never null, never false, never "unaffected", and for authorization grants nothing.
3. **A refusal decides before null.**
4. **A claim authorizes nothing.** Declared, sampled, proven and trusted evidence stay distinguishable, and evidence is tied to an operation, its version, its domain and the implementation it was checked against.
5. **Valid, implemented, supported and permitted are four questions.** A term can be valid in a language, lack an implementation in an interpreter, be unsupported by a target, and be forbidden to an actor. No one boolean answers them.
6. **Refuse, do not approximate.** A refusal names the thing, the reason and the fix, and where it applies the operator, the target and the originating transition.

### 4.2 Shape

7. **Effect Schema is the type authority.** No parallel type system.
8. **No second AST, evaluator or graph for expressions.** A language of another shape (a view, a route grammar) may have its own representation; it shares contracts and analyses, not nodes.
9. **No global registry, no hidden state.** Collisions are explicit errors, never last-wins.
10. **Interpretation is the default.** No compiler, bundler plugin or solver is needed to evaluate.
11. **Definition-time mistakes throw; data-dependent failures are typed values.** A wrong argument to a constructor is a programmer error and throws at definition time. A failure that depends on run-time data returns a `Result` (synchronous) or fails an `Effect` (when a service is involved). Do not wrap a pure function in `Effect.sync` to make an API "Effect-native".
12. **Absence is an Effect `Option`** in MetaKit's own API. `null` is MetaKit's value-level absence inside expressions, by design, and nothing else.
13. **Programs from users or agents are data, not authority.** Untrusted terms are decoded against limits before anything reads them.
22. **A thing is named by a string once, where it is defined; everywhere else it is the value that definition returned** (maintainer, 2026-11-28: typed references over magic strings in all places, because inference is better). `phase.Closed`, `msg.Increment`, `model.qty`, the transition value, the operation value: never `'Closed'`, `'Increment'`, `'qty'` or a tag typed `keyof` something. A reference carries its type, so the call site infers the payload, completion lists what exists, a rename is one edit, and a mistake is an error on the line it was made. A string typed by a union of keys is better than `string` and is still not this. Strings remain only at a definition, on the wire, and in a report for people. This widens the `CLAUDE.md` rule on options naming a member (`#251`).

### 4.3 Admission: what a new thing must show

Before adding an operator, a node kind, an export or an entry point, write down:

- **What existing constructors, plain TypeScript or Effect cannot already do it.** If they can, it is a helper in the standard library, not a kernel addition.
- **Two consumers.** Tests count as one. An example or a package is the second.
- **Every reader's answer**, for an operator or node: implements it exactly, or refuses it by name. With conformance vectors.
- **Its cost**: bytes on a page that uses it and on one that does not; type-instantiation count on a representative file (the 10% rule of the unification plan).
- **What evidence would remove or widen it.** A limit states what would move it.

### 4.4 Bytes and types

14. One module per operation; a page that uses one operator ships one.
15. An entry point's import closure matches its doc comment. An entry that says "browser-safe" does not reach SQL lowering.
16. Every public API has a type test with positive and negative cases, no casts in tests or examples, and no `any` in emitted declarations.
17. A new source file stays under 20,000 characters.

### 4.5 Process

18. Every behaviour has a mutation that a test kills.
19. Every sentence in `docs/semantics.md` has a test that would fail if the sentence were false (W1).
20. A phase ends with an independent review on the most capable model, given the diff and not the conclusions.
21. A gate that is missed is recorded as missed, with what was decided because of it.

---

## 5. Architecture: three layers

`#649` asks for an inventory in three categories. This is the assignment; W3 turns it into a checked document.

| Layer | What belongs | Entry points today |
|---|---|---|
| **Kernel** (indispensable) | Nodes, paths, the 50 operators and their reader tables, the reference evaluator, partial evaluation, transitions, verdicts | `metakit`, `/build` |
| **Standard library** (derived from the kernel's public API) | Domain Schemas, aggregates, relations, machines, policies, functions, custom and derived operations, languages, stores | `/domain`, `/aggregates`, `/relation`, `/machine`, `/policy`, `/fn`, `/operation`, `/language`, `/store`, `/pairs`, `/temporal`, `/graph`, `/graph/match`, `/graph/prune`, `/graph/readiness`, `/inspect` |
| **Adapters and tooling** (optional, never on a page unless asked) | SQL, Drizzle, the solver, conformance, the portable codec, the interpreter service, authoring helpers, the semantic index | `/sql`, `/drizzle`, `/aggregates/sql`, `/operation/sql`, `/prove`, `/conformance`, `/store/check`, `/artifact`, `/interpreter`, `/syntax`, `/tooling` |

### 5.1 Identity: a definition is named by its content

`#579` states the aim: "Unison-like benefits within the declarative TypeScript subset: change-impact analysis, incremental verification, deterministic compiled-plan caching, exact semantic versioning of durable operations, and eventually portable definition resolution, without a new programming language". Unison names a definition by a hash of its syntax tree, so a rename changes nothing, an unchanged definition never needs re-testing, and code can be sent to another machine by hash. MetaKit can have that for what is written as MetaKit data, and for nothing else: TypeScript closures and Effect programs cannot be hashed.

A definition has three identities. They answer different questions and must never stand in for one another.

| Identity | What it is | Changes when | Used for |
|---|---|---|---|
| **Name** | A logical id a person chose (`DeclarationId`, an operation's `id@version`, a transition's tag) | Someone renames it | Finding it; reading a report. A name is metadata and is never hashed |
| **Definition hash** | A hash of the definition's canonical form, the types it reads, and the hashes of the definitions it refers to | Its meaning could change | Deciding whether two definitions are the same one; keying anything derived from the definition alone |
| **Evidence key** | The definition hash plus who checked it and under what: the reader and its version, each implementation's identity, the assumptions | Any of those change | Reusing a proof, a test result, a compiled plan. Exists today as `Artifact.evidenceKey` |

A definition hash has two strengths, as `#579` asks:

- The **executable hash** covers what a reader runs: an expression's tree; a transition's guard, writes and emits; a function's parameters and body.
- The **contract hash** covers the executable hash plus what is claimed about it: a transition's `ensures`, a function's `where`, `returns` and `ensures`, an operation's declared claims.

A compiled SQL statement or native artifact is keyed by the executable hash, so adding a postcondition does not recompile anything. A proof is keyed by the contract hash, so adding a postcondition does invalidate it.

**What goes into a hash**, in a canonical form whose rules are written down and versioned:

1. **A domain tag**: the kind and the canonical format's version (`metakit/expr@1`, `metakit/transition@1`, `metakit/operation@1`, `metakit/fn@1`, `metakit/machine@1`), so a transition and an expression can never collide and a change of rules cannot be mistaken for an unchanged definition.
2. **The term**, in evaluation order, with local binders renamed. No reassociation, no reordering of commutative operands: two trees that mean the same thing but are written differently have different hashes. That is deliberate (`#579`: "do not attempt to prove algebraic equivalence").
3. **The interface**: every path the definition reads, with its kind, nullability and admitted literals (the slots of §6.1 of the adapter plan). Without this, one tree over an integer field and the same tree over a text field share a hash.
4. **References, by hash.** A call to a derived operation contributes that operation's hash, which covers its parameters, result, null rule and body. So changing a body changes every definition that calls it, with no version to remember to bump. A machine's hash is the hashes of its transitions.
5. **Opaque leaves, by name.** A primitive custom operation is implemented by a JavaScript function and has no content to hash. It contributes its `id@version`, and the definition is marked as depending on a named leaf. Its implementation's identity belongs in the evidence key, where it already is. `id@version` is a compatibility assertion by its author, not a proof that two implementations agree.

Never in a hash: names, documentation, source positions, test evidence, the TypeScript variable a definition was assigned to.

**What a hash is not.** Not an authorization token, not a proof of correctness, not a result-cache key (a result also depends on the data, the principal and freshness), and not Remote's `QueryRef.identity` (a query's name plus its input, which stays as it is).

**The manifest.** A build can emit one deterministic file: every definition's hash, kind, references and canonical form, and a separate table from names to hashes. Comparing two manifests then says exactly what happened: *renamed* (same hash, new name), *changed*, *added*, *removed*, and *affected* (everything whose hash changed because something it refers to did). Nothing at run time needs the manifest; it is for tooling and build comparison.

**What stays out**, so this does not grow into a second system:

- No codebase-as-database, no hash-addressed imports, no structural editor. TypeScript files stay the source.
- No hashing of closures, `Opaque` nodes or Effect programs. A definition holding one has no hash, and says why.
- Renaming a Schema field changes the hash. That is a real change against stored data; Entity versions and upcasters own it.
- A server never runs a definition a client sent. It resolves a hash against its own manifest, or refuses.
- Ordinary evaluation never hashes anything.

### 5.2 Phases: a machine whose states are named

**The problem**, as a public critique of an Effect UI component put it (2026-11-27): a dialog modelled as `{ open: boolean, asking: boolean, … }` has four combinations of which one is impossible; `asking: false` is reset by hand in six handlers; and the one real decision (close, or ask first) is hidden in a ternary inside a handler. MetaKit today answers only the third well. An invariant plus `Prove.machine` *catches* the impossible state but does not make it unrepresentable; the resets are as repetitive as anywhere; and there is no named state, so nothing says "this transition goes from Editing to Confirming" (`#612` mentions "named domain phases" once, with no design).

**The design, in one sentence:** a phase is a variant of a tagged union in the state Schema, a transition names the phases it leaves and the phase it enters, and all of it lowers to guards and writes the kernel already has.

```ts
// Illustrative; not compiled. Names are settled in §9.3.
const Dialog = Schema.Struct({
  saved: Schema.String,
  phase: Schema.Union([
    Schema.TaggedStruct('Closed', {}),
    Schema.TaggedStruct('Editing', { draft: Schema.String }),
    Schema.TaggedStruct('Confirming', { draft: Schema.String }),
  ]),
})

const DialogMachine = Machine.make({
  state: Dialog,
  phase: state => state.phase,
  // `phase` holds one typed reference per variant, derived from the Schema:
  // phase.Closed, phase.Editing, phase.Confirming. No phase is named by a string here.
  transitions: ({ from, phase, state }) => ({
    Open: from(phase.Closed).to(phase.Editing, { draft: state.saved }),
    Edit: from(phase.Editing).to(phase.Editing, ({ input }) => ({ draft: input.value })),
    RequestClose: from(phase.Editing).choose(editing => [
      { when: Eq.is(editing.draft, state.saved), to: phase.Closed },
      { otherwise: true, to: phase.Confirming, with: { draft: editing.draft } },
    ]),
    KeepEditing: from(phase.Confirming).to(phase.Editing, confirming => ({ draft: confirming.draft })),
    Discard: from(phase.Confirming).to(phase.Closed),
    Save: from(phase.Editing, phase.Confirming).to(phase.Closed, undefined, leaving => [
      Transition.set(state.saved, leaving.draft),
    ]),
  }),
})
```

The string `'Closed'` appears once, where the variant is defined. Everywhere else a phase is the value `phase.Closed` (rule 22). A misspelt phase is then an unknown property at the place it was typed, completion lists the phases, and `to(phase.Editing, …)` can require exactly that variant's fields because the reference carries its type.

**The same design in the vocabulary of `#612`.** The successor RFC already has most of the frame, and this is where phases plug in:

- *What `#612` already gives.* Its transitions are **arms**: `Transition.on(msg.RequestClose).when(…)`, with `update` a list, so one message having several guarded arms is native (today's `Machine` allows one transition per tag). Admission is first-class: a control built with `Slot.action({ invoke: discard.intent() })` derives its enabled state from the arm's guard, and a refused guard is a typed rejection distinct from a no-op. It refers to things by typed reference throughout (`msg.Increment`, `model.qty`, `increment.intent()`). So the third complaint, a decision hidden in an `if`, is answered by the RFC as written.
- *What `#612` leaves open.* §3 says a transition has "an admission predicate" and §5 says the machine evaluates "one pure synchronous arm", but not which arm when two admit. §10 says only "Named domain phases can produce runnable statecharts", with no design. Its model is any `Schema.Struct` and its writes are `.set(path, expr)`, so the impossible state is caught by an invariant, not excluded, and the resets are as repetitive as in the critique.
- *What this section adds to it.*

```ts
// Illustrative; in the shape of the RFC's own §4 sketch.
const Dialog = Block.define({
  model: Schema.Struct({ saved: Schema.String, phase: DialogPhase }),
  messages: { Open: Schema.Void, RequestClose: Schema.Void, Discard: Schema.Void /* … */ },
}).build(({ model, msg, phase }) => {
  const open = Transition.on(msg.Open).from(phase.Closed).to(phase.Editing, { draft: model.saved })
  const closeClean = Transition.on(msg.RequestClose)
    .from(phase.Editing)
    .when(editing => Eq.is(editing.draft, model.saved))
    .to(phase.Closed)
  const askFirst = Transition.on(msg.RequestClose)
    .from(phase.Editing)
    .otherwise()
    .to(phase.Confirming, editing => ({ draft: editing.draft }))
  const discard = Transition.on(msg.Discard).from(phase.Confirming).to(phase.Closed)

  return {
    update: [open, closeClean, askFirst, discard],
    surface: Surface.define({
      // Enabled only while confirming, derived from the arm's `from`; nobody writes that condition.
      discard: Slot.action({ label: 'Discard changes', invoke: discard.intent() }),
      // A conditional range bound to the phase: mounted in Confirming, gone otherwise.
      confirm: Slot.when(phase.Confirming, confirming => /* … */),
    }),
  }
})
```

  Three things the RFC should then say: **arm selection** (arms for one message are tried in declaration order, and an arm fires only if no earlier one admitted, so they are disjoint by construction; `otherwise()` is the arm with no condition of its own); **`from` and `to`** as sugar over an admission conjunct and a `replace` write; and **phases as the structural dependency of §4.1**: a conditional range's read set is the phase tag, so entering `Confirming` mounts one range and patches nothing else.
- *What the successor gains beyond the critique.* A control knows which phase enables it before anyone clicks. The nested-dismissal behaviour of §4 (Escape closes the innermost eligible owner) gets its eligibility from the phase: a dialog in `Closed` is not eligible. The SSR planner of §7 can reason about reachability by phase: a closed dialog's confirm template and its draft need not ship until an arm into `Confirming` is reachable.

What each part does to the three complaints:

- **The impossible state cannot be written down.** There is no `asking` flag; "asking" is the `Confirming` variant, and a closed dialog has no draft at all.
- **Nothing is reset by hand.** Entering a phase replaces the whole variant, so the fields of the phase being left are gone. No handler mentions them.
- **The decision is an edge.** `RequestClose` has two named outcomes with their conditions, as data.

**Why this shape and not another.**

- *Effect Schema stays the type authority (rule 7).* The phases are an ordinary union of `TaggedStruct`s. There is no phase type of MetaKit's own, and a model with no declared phase is still a valid machine.
- *It is derived, not a new kernel concept (rule 4.3).* `from(phase.Editing)` is the guard conjunct `Eq.is(state.phase._tag, 'Editing')`, with the tag string supplied by the reference. `to(phase.Closed)` is a write. So every reader works unchanged: SQL sees a tag column and nullable payload columns, the prover sees an equality fact it already case-splits on, the dependency graph sees the paths written, the Reffect adapter sees a text slot. `Expr.matchTags` already reads such a union.
- *One message, several outcomes, without relying on order.* `choose` lowers each alternative to its own transition whose guard is its condition **and the negation of every earlier one**, so exactly one can fire. A statechart resolves this by document order; here the alternatives are disjoint by construction, which a reader can rely on. Today a machine holds one transition per message tag, so this is the one change to `Machine`'s shape.
- *Inside `from(phase.Editing)`, the variant's `draft` is typed and never null.* The narrowed accessor is what `matchTags` already hands a branch.
- *A flat set of phases, on purpose.* Nested states are `Machine.lift` and `Machine.compose`, which exist. "From any of these states" is `from(phase.Editing, phase.Confirming)`. History states, parallel regions and entry or exit actions are not built until an example needs one: with whole-variant replacement, the usual reason for an entry action (resetting fields) is gone.

**What it needs that does not exist.**

1. **A write that replaces a struct or variant from field expressions.** Expressions are scalar; nothing builds `{ _tag: 'Confirming', draft: <expr> }`. The kernel's idiom for this already exists in list writes: `Transition.append(list, { id: …, title: input.title })` takes a record of field expressions. The addition is the same for a single value: a `replace` way of writing whose value is a record of field expressions and whose target is a struct or union path. This is a thirteenth way of writing, against a settled "the set is fixed", so it goes through admission: every reader's answer (evaluation builds the value; SQL sets the tag and payload columns and nulls the rest; the prover assigns the fields; the graph records the target; a bundle carries one write value per slot), conformance vectors, and its commute and idempotence properties in `writeProperties`.
2. **`Machine` accepting several transitions for one message**, produced only by `choose`.
3. **The phase helpers** (`from`, `to`, `choose`) in `metakit/machine`, built from the public API.

A phase with no payload needs none of item 1: `Schema.Literals(['closed', 'editing', 'confirming'])` and `Transition.set` work today. So phases can ship on a literal field first, and gain payloads when `replace` lands.

**What falls out once edges are data.**

- **A state diagram** generated from the machine, never drawn by hand.
- **Reachability:** a phase no edge enters; a phase no edge leaves; an edge whose guard the prover shows can never hold.
- **A phase-by-message table:** for each phase, which messages move it and where, and which are refused. The gaps are visible instead of discovered.
- **Invariants scoped to a phase.** "A confirming dialog has unsaved changes" is a refinement on the `Confirming` variant's Schema, and `Prove.machine` checks every edge into `Confirming` establishes it.
- **A database constraint for free:** payload columns are null unless the tag matches.
- **Affordances per phase**, from the `affordances` that exists.

**Risks to settle by probe before building.**

- Whether TypeScript infers the phase names and each variant's fields through the `({ from }) => …` callback with no annotations. `matchTags` suggests yes; a type test decides.
- What the reference evaluator does today when a transition writes a field under a union variant that is not the current one (related to K3).
- What upstream Effect UI ships. The critique ended "not for long", so they may add states themselves. W7 reads their source first and learns from whatever they build; the successor is its own runtime (`docs/direction.md`), so nothing here waits on them.

Questions this table raises, which W3 answers:

- **`Fn` and `Operation.derived` overlap.** A derived operation adds a named identity and a Schema refusal at the call, but refuses any `Fn` that has a `where`, an `ensures` or obligations. So contracts and identity cannot be had together today.
- **`Language` adds little over a plain object of operations**: a duplicate-id check and an exhaustive `implement` type. `Operation.implementations` builds the same table a second way.
- **`syntax.grammar` references no `Expr`, `Operation` or `Language`.** Nothing in it is specific to MetaKit.
- **Entries that look light pull heavy code.** `/graph` reaches SQL lowering through `/graph/readiness`; `/language`, and through it `/syntax`, `/tooling` and `/interpreter`, reach SQL lowering and `temporal`; `/policy` closes over 55 files.
- **`/conformance` mixes test tooling with `coreOps`**, and `/sql` re-exports lowering internals.

---

## 6. Defect ledger

Severity: **High** a wrong answer, a lost guarantee or an unsound type; **Medium** a misleading contract or a defect on an unusual input; **Low** design or clarity. Status: **Read** means the code path was followed and the finding confirmed by a second reading for this plan; **Reported** means an independent reviewer traced it and it has not been re-read; **Probe** means it needs the listed snippet run or compiled to settle. Nothing here was executed.

### 6.1 Kernel

| Id | Sev | Status | Defect | Smallest fix |
|---|---|---|---|---|
| K1 | High | Read | `Expr.judge` and `residualize` answer True where evaluation refuses. `holdsNoNulText` (`ops/kind.ts:67`) accepts any array without looking at its elements, so the reflexive rule (`ops/laws.ts:284`) folds `Eq.is(row.tags, row.tags)` to true; with `tags: ['a\u0000']` evaluation refuses `unportable`. | Drop arrays from `holdsNoNulText`, or require a no-NUL element Schema. |
| K2 | Medium | Read | `Transition.can` (`can.ts:27`) ignores `options.rewritePolicy`; an absent policy is treated as trusted (`ops/laws.ts:439`), so unverified claims rewrite a guard. `intent().can` and `affordances` pass no options at all, so a guard calling a custom operation is always `Unknown`. | Pass the policy; thread options through `intent` and `affordances`. |
| K3 | Medium | Read | A write under a null parent invents a partial struct. With `profile: NullOr(Struct({ name, age }))` and state `{ profile: null }`, `set(state.profile.name, 'x')` succeeds with `{ profile: { name: 'x' } }`, not a value of the state Schema (`path.ts:163-177`, `transition.ts:651`). `transitionLift.ts` already says a write never invents its struct; only lifted transitions get that guard. | In `writeAt`, refuse when a proper prefix reads null or absent. |
| K4 | Medium | Read | `Refused` is `{ reason: string }` for five different failures; its doc comment claims only the guard; a guard that itself refuses reports "guard evaluated to false" and discards the refusal. | Step A1 of the adapter plan: a `cause` and an `Option` of the refusal. |
| K5 | Medium | Read | `docs/semantics.md:18` and `node.ts:77` say `null.coalesce` propagates refusals and "no operator absorbs it". `coalesce(1, <refused>)` is `1` (`ops/null.ts:20`), by design. | Correct the two sentences. |
| K6 | Medium | Read | `semantics.md` overstates two refusals: "strings containing NUL are refused", but `Match` takes an arm labelled `'a\u0000'` where the equivalent `Eq.is` refuses; "ordering and equality refuse NaN", but `Eq.is(NaN, NaN)` is true. | Qualify the sentences, or screen the `Match` subject. Decide which under W1. |
| K7 | Medium | Reported | `encodeExpr` and `decodeExpr` accept different sets. A literal's values never count toward the node limit on encode, so a 40,000-element list encodes and then fails to decode with an error naming the wrong bound; a literal nested 100 deep decodes and then cannot be re-encoded or fingerprinted, so `Interpreter.prepare` silently has no fingerprint. Encode checks no arity. String length and path segment count are unbounded. | One bound counted the same in both directions; a string-size limit; arity on encode. |
| K8 | Medium | Read | Two definitions share a fingerprint. Canonicalisation renames binders to `$r0`, `$r1`, …, but leaves a free path whose first segment is literally `$r0` alone (`artifact.ts:1237`, `1275`). | Escape free heads beginning `$r`, or mark bound paths distinctly. |
| K9 | Medium | Probe | A partial struct counts as wholly known when its missing keys are optional (`ops/partial.ts:29`), so `judge(Eq.is(a, b), { a: { x: 1 }, b: { x: 1 } })` may decide although `a.y = 2` evaluates otherwise. Probe: that call, then `Expr.evaluate(e, { a: { x: 1, y: 2 }, b: { x: 1 } })`. | Count an object whole only if it holds every declared key. |
| K10 | Low | Probe | `Expr.all` and `Expr.any` build a left-deep chain (`expr.ts:79`): 66 terms exceed the depth limit and cannot be encoded; a few thousand may overflow the stack instead of refusing. Probe: `Expr.evaluate(Expr.all(...Array(20000).fill(true)), {})`. | Build a balanced tree; the leftmost-refusal order is kept. |
| K11 | Low | Reported | `-0`: arithmetic normalises it, but the rewrites `x + 0 → x`, `x * 1 → x`, `neg(neg(x)) → x` return the read, so for `x = -0` evaluation gives `0` and the residual `-0`. And `Num.add(MAX_SAFE_INTEGER, 0.5)` returns `2^53`: the result check runs only when every operand is an integer, contradicting the file header. | Normalise in the rewrites; check the result whenever it is an integer. |
| K12 | Low | Read | The interpreter allowlist matches `key.split('@')[0]` (`interpreter.ts:141`) and `Operation.define` permits `@` in an id, so entry `pay` admits an operation named `pay@v2`. The artifact allowlist matches full names. | Refuse `@` in `define`; match full names in both. |
| K13 | Low | Reported | Evaluation can throw or leave the four outcomes: `matchArm` formats its refusal with `JSON.stringify(target)`, which throws on a BigInt or a cycle; `coalesce` built with fewer than two arguments returns `undefined`. | A safe formatter; an arity check in `build.call`. |
| K14 | Low | Reported | Tree rewrites lose information: `Node.mapRows` drops `Related.cardinality`, so the solver loses its `total = 1` fact after a lift (sound, weaker); `rewriteStatePrefix` ignores `Rows` binders, so a binder named `state` is re-rooted; a lift along an `Option`-held child can never apply a write and says so only at run time. | Carry `cardinality`; respect binders; refuse the lift at definition time. |
| K15 | Low | Read | `Transition.lift` drops `ensures` silently. `ensures` is stored as an `Option` in an optional field (two absences). | Lift it or refuse; one absence. |
| K16 | Medium | Read | A fingerprint does not cover what the definition reads. `PortableArtifactV1` is the tree and its operator list, so one tree over `Schema.Int` and over `Schema.String` share a hash. `EvidenceKeyInput.schemaFingerprint` exists for this, is optional, and nothing in `src` computes one. | §5.1 item 3; W4 step C2. |
| K17 | Medium | Read | A derived operation's body is not in the hash of what calls it: a call encodes as `{ id, version }` only (`artifact.ts`, `encodeExpr`). Change a body without bumping `version` and every caller keeps its fingerprint, so evidence is reused for a different meaning. | §5.1 item 4; W4 step C3. |
| K18 | Medium | Read | There are two fingerprint implementations and the adapter plan was about to add a third. `tooling.ts` has a private `fingerprintTransition` that hashes a hand-built payload with plain `JSON.stringify`, brands the result as an expression's `ArtifactFingerprint`, copies `sha256Hex`, and turns **every** error into "no fingerprint" (`Effect.catch(() => none)`), so a limit error reads as "not portable". Expression fingerprints carry no domain tag. | One hashing module with domain tags; `tooling` calls it; W4 step C1. |

### 6.2 Toolkit

| Id | Sev | Status | Defect | Smallest fix |
|---|---|---|---|---|
| T1 | High | Read | `Operation.expandDerived` removes the refusals the call makes (`operation.ts:746-793`). A derived operation with `returns: Bounded(0..10000)` and body `Num.add(a, b)`: called, `Op(9000, 9000)` is refused (result outside its Schema); expanded, it is `18000`. SQL built from the expansion selects rows evaluation refuses. | Leave the call unexpanded when an argument or result Schema carries checks, or return the refinements as an `assumes` expression beside the expansion. |
| T2 | High | Reported | A symbolic `Fn` call drops every contract (`fn.ts:559`). `f({ x: row.balance })` in a guard is the bare substituted body: no `where`, no parameter Schemas, no `returns`, no `ensures`; a literal `f({ x: 1.5 })` is not checked against `Schema.Int`. The doc comment says so, but this is the main way a function enters an expression. | Check literal arguments at substitution; add a call form that returns the expression and its precondition together. Decide the default under W3. |
| T3 | High | Probe | A branded `returns` may type an unchecked body as the brand: `Fn.params({ x: Number }).returns(USD).body(({ x }) => Num.add(x, 1))`, then `const v: typeof USD.Type = f.run({ x: 1 })`. If that compiles, `run` and the symbolic call promise a type nothing enforced. | Type `run` and the symbolic call by the carrier; only `runChecked` returns the declared type. |
| T4 | High | Read | `Machine.each` evaluates child guards, emits and steps with no implementations (`machine.ts:385`, `407`, `481`, `490`): a child whose guard calls a custom operation is refused as `unsupported` whatever the caller passes. | Pass reader options into the child evaluation. Not one line: `Opaque.run` receives only the environment. |
| T5 | Medium | Reported | A derived operation runs its inner operations from the table it was defined with, never the one it is evaluated with (`operation.ts:709`). With no table at definition the inner call is `unsupported`; with one, a different binding at evaluation is ignored. | Pass the evaluating table to `run`. |
| T6 | Medium | Reported | `Language.implement` ignores a derived operation's own implementation, so it must be written again by hand and the two can disagree silently. | Use the derived implementation when present and drop the key from what must be supplied. |
| T7 | Medium | Reported | The `total` claim is checked by nothing (`operationChecks.ts` has no branch) and compared by nothing (`describe`, `compare` omit it), yet it decides `foreignCallCannotRefuse`, which lets an absorbing rewrite drop an operand. | A totality check over the sampled pools; add it to the description. |
| T8 | Medium | Reported | Rewrites fire on unchecked claims by default: `Expr.residualize(e, partial, { foreign })` with no policy applies every declared claim. Evidence is typed by hand (`foreignEvidence(op, table, { assurance: 'proven' })`); `checkOperation` produces discharges, not evidence. | `checkOperation` returns the evidence for the claims that held; decide the default policy under W2. |
| T9 | Medium | Read | A later allowlist widens an earlier one: `rebind` takes `next.allowlist ?? allowlist` (`interpreter.ts:200`), so an inner `withAllowlist({a, b})` escapes an outer `{a}`. | Intersect. |
| T10 | Medium | Probe | A second `.returns()` replaces the first without complaint, so the first Schema is no longer checked. The method is type-gated; probe whether `Fn.make(…).returns(NonNegative).returns(Schema.Int)` compiles. | Throw when a return Schema is already set. |
| T11 | Medium | Read | `Language.compose` and `restrict` drop `options.lowerings` (`language.ts:273`, `320`): after composing, `.sql('sqlite')` throws "no sqlite lowering" for operations that had one. | Carry the option; on `compose`, merge or fail with `LanguageConflictError`. |
| T12 | Medium | Reported | `Inspect.fn` misreports: a scalar return's JSON Schema is an object with a `$` property; a struct return reports only its first field; a composed function says it has no `ensures` although one lives on in its obligations. | Fix each; one fact stated once (`hasWhere` and `whereCount` state one twice). |
| T13 | Low | Reported | `Interpreter.runFn` skips `where`, `returns` and `ensures` unless `{ checked: true }`. | Check by default. |
| T14 | Low | Reported | Sibling signatures disagree: `define` requires `nulls`, `derived` defaults it; operations take positional arguments, functions a named record, and `derived` needs `paramOrder` to bridge; `derived` requires `returns` even when the function declares it; `compose` fails in an Effect while `make` and `restrict` throw; `readiness` wraps a pure function in `Effect.sync`; `grammar.step` throws while `grammar.validate` fails in an Effect. | W3, by rule 11. |
| T15 | Low | Probe | `tooling` indexes expressions and transitions only (not a function, an operation or a language); `dependsOn` is hand-written strings; a transition's writes are formatted `state.x` while an expression's reads are probably `x`, so `writes-read-field` may never match. Probe: index a rule over `balance` and a transition that writes it, and ask for the rule's references. | W6. |
| T16 | Low | Read | `semanticDiff` matches definitions by name (`tooling.ts:661`), so a rename is reported as one removed and one added, and everything downstream is invalidated. Its transitive dependencies are the hand-written `dependsOn` strings of T15. | Match by hash first, then by name; derive references from the definitions (W4 step C5). |
| T17 | Low | Read | Public API refers to defined things by string (rule 22). `Machine.intent(machine, tag)` takes a tag (`can.ts:72`); `Prove.machine`'s `pin` and `allowUnknown` take tags (`prove/machine.ts:80`); `Language.implement(name, …)` names a table by string (`language.ts:70`); `tooling`'s `dependsOn` is a list of ids. Most are typed by `keyof`, which catches a typo but gives no payload inference and no single place to rename. | W3 step 9: each takes the value (the transition, the definition) or is derived. |
| T-ceremony | — | Not compiled | The smallest three-operation integer language with one function and one evaluation is five imports and nine statements, no casts. Lines that exist only because the API demands them: `version: 1` and `nulls: 'strict'` three times each; the family level in both `make` and `implement`; the table name `'js'`; `{ foreign: js }` on every evaluation; `Language.make` itself, since `Operation.implementations` would do. | W3 and W5 measure this and set a budget. |

### 6.3 Package and documents

| Id | Defect | Where it is fixed |
|---|---|---|
| P1 | The npm name `metakit` is taken. | §9, W0 |
| P2 | "33 operators" in `node.ts:3`, `index.ts:5`, the README (lines 128, 146) and the skill reference; there are 50. | W0 |
| P3 | The README names `Node.foreign` (removed) and omits `/artifact`, `/fn`, `/interpreter`, `/syntax`, `/tooling`, `/store/check` and the three `/graph/*` entries. `SKILL.md`'s row omits more. | W0 |
| P4 | CI is red on `main` and `ui-polish` (§2.2). | W0 |
| P5 | The unification PLAN's status table is stale; the HANDOFF contradicts itself; missed gates are recorded as passes; `cloudflare` and `domains-plus` are over their bundle ceilings in the LEDGER. | W0 |
| P6 | `#640`, `#641`, `#642` closed with no recorded resolution; `#638` closed without its SQL, checker and prover acceptance. | W0 |
| P7 | Entry closures heavier than their doc comments say (§5). | W3 |
| P8 | Seventeen files over 20,000 characters; three never reviewed by Jev. | W3 |
| P9 | Copied helpers: `wellFormed` twice, `isPlainObject` four times, the integer-check on `effect/schema/isInt` in nine files, `notFinite` three times. Same name, different meaning: `kindOfValue`, `kindOfAst`, `admitsNull`. | W3 |
| P10 | Phase and issue labels in published doc comments ("Phase 9 Bout 9.1", "#645 P0"). | W3 |
| P11 | `conformance.ts` (418 lines) is named by no mutation spec. | W1 |
| P12 | Process-wide state: an identity counter and a `symbols` map in `node.ts` that never clears; `Symbol.for` in two modules and local symbols in `operationSql.ts`, so two copies of the package interact inconsistently. | W3 |
| P13 | `| undefined` returns where the rule is `Option` (`refusedForEquality`, `Op.refuses`); `Refusal.at` is a bare string; 122 `throw new Error` sites, some for data-dependent failures. | W3, by rules 11 and 12 |

---

## 7. Order

```text
W0 truth ──► W1 kernel ──► W4 contract ──► W6 targets (SQL replay, Reffect)
               │              ▲
               └► W2 toolkit ─┴► W3 simplify ──► W5 two languages ──► W8 docs and release
                                                      │
                                   W7 successor spike ┘ (needs W1; independent of W4–W6)
                                   W9 tooling (needs W3)

W1–W9 ──► W10 full audit ──► release (W8 step 4)
```

- **W10 is last and gates the release.** Nothing is published before it finds no High or Medium.

- **W0 first, and small.** Nothing else can be judged while CI is red and the documents disagree.
- **W1 before W4.** The corpus (W4) records the reference evaluator's answers. Recording them before K1–K8 are fixed would freeze wrong answers into a file another repository copies.
- **W2 before W3.** Fix what is wrong before deciding what to merge or remove; some fixes change which abstraction earns its place.
- **W5 is the test of W3.** If two small languages still need private hooks or casts, W3 is not done.
- **W7 can start after W1.** It needs a sound kernel, not the toolkit.

Do not start new surface (`#646` P1 and later, `#647` P2 and later, anything in `#637`) until W1, W2 and W4 are done. That is the lesson of §3.4.

---

## 8. Workstreams

Each lists what it needs, its steps, what "done" means and a tier: **mechanical** (a decided text or config change), **ordinary** (implementation with a clear design), or **judgement** (an API's shape, what a guarantee means, a review).

### 8.0 Who does the work

The maintainer's instruction (2026-11-28): to save money, implementation of this plan is delegated to two external command-line agents, not to Claude subagents.

| Agent | Command (non-interactive) | Model |
|---|---|---|
| Gemini | `agy --dangerously-skip-permissions --model gemini-4-neon-high -p "<brief>"` | Gemini 4 Neon |
| Codex | `codex exec -m gpt-6.2-sol "<brief>"` (the user's `~/.codex/config.toml` already sets this model, no approval prompts and full access) | GPT Sol 6.2 |

Both were checked to exist on this machine (`agy` 1.5.18, `codex-cli` 0.160.0) and to list these models. Neither has been run for this plan yet, so the first delegated step should be a small one (W0 step 2), to learn how each reports.

**Division of labour.**

- **The coordinating Claude session** decides (the **judgement** tier: T1, T2, T3, T8, K6, W3's overlaps, every design note), writes each brief, reads each diff, runs the deciding checks, commits, reads CI and closes issues. It does not hand a decision to a builder.
- **Gemini and Codex build** the **mechanical** and **ordinary** tiers: a defect fix with its test and mutation, a file split, a document correction, a corpus generator.
- **A builder's work is reviewed by the other family.** What Gemini built, Codex reviews (`codex exec review`, or a review brief), and the reverse; the coordinator reads both. A model reviewing its own output tends to confirm it.
- **Alternate them** on comparable steps and note in the ledger which built what, so by W3 there is evidence of which is better at which kind of step.

**What every brief must carry**, because these agents run with all permissions in the shared tree and start with no context:

- The step from this plan, pasted, with the files it may touch and the files it must not (always: `examples/metakit/src/forma/`, the lockfile, `packages/plus` generated entries, tsconfig paths, anything another running agent was given).
- The git rules of `CLAUDE.md`, pasted, not referenced: no worktrees (never `codex --worktree`), no branches, no `git stash`, no `git checkout -- <file>`, no `git add -A`, no force push; stage and commit in one command with explicit paths. **Default: the builder does not commit.** It leaves its changes in the tree and reports the paths; the coordinator diffs, checks and commits. Allow a builder to commit only for a step with one file.
- The inner loop only: the one project's `pnpm exec tsc -b packages/metakit` and the one test file, from the repository root. Not the whole suite, not a build, not e2e.
- "Write the failing test first. If it passes, stop and report: the defect may not be real."
- "Do not weaken an assertion, raise a budget, add a cast, or widen a type to make a check pass. If you cannot finish, say what blocked you."
- The traps files to read for the area (§0).
- What to report: files changed, the test's name, the command run and its last lines, anything it could not do.

**Limits.**

- **One builder at a time while memory is tight**, or two only on disjoint files with each told what the other holds. Never two running typechecks or test suites at once.
- **Never give a builder Wrangler, a publish, a GitHub write (issue, comment, PR), or a secret.** `--dangerously-skip-permissions` and Codex's full-access mode mean nothing stops them; the brief is the only fence, so keep those actions with the coordinator.
- **A builder's report is a claim.** The coordinator re-runs the deciding command and reads the diff before committing. A step is not done because an agent said so.
- **Their code leaves this machine** for Google's and OpenAI's services. That is the maintainer's choice for this repository; do not include secrets or `.env` contents in a brief.

### W0. Truth and stability

*Needs:* nothing. *Tier:* Haiku for the text fixes, Sonnet for CI.

1. **CI green.** Diagnose the three failures in §2.2. For the site e2e timeout, reproduce the one file (`pnpm e2e` for `examples/site/e2e/components.e2e.ts`). For `media.test.ts`, the 500 is a thrown error where a 403 was expected: read the route. Do not raise a budget or a timeout to pass; rule 21.
2. **One operator count.** Replace "33" with 50 in `node.ts:3`, `index.ts:5`, the README and the skill reference. Better: a test that counts `CoreOpId` against `coreOps` and against the number each document states, so the next operator fails a test instead of four documents.
3. **README and skill.** Remove `Node.foreign`; add the missing entries to the README table and the `SKILL.md` row; compile every snippet (`docs/agents/skill.md`).
4. **Close the old plans honestly.** Add a status line to `metakit-unification-PLAN.md`, `-HANDOFF.md`, `metakit-phases-2-6-PLAN.md`, `metakit-next-slice-PLAN.md` and `metakit-fn-PLAN.md`: superseded by this file on 2026-11-28, with the gates that were missed (§2.2) named in the HANDOFF. Fix the "seetest" typo in `metakit-phases-2-6-PLAN.md`, which is an uncommitted stray edit.
5. **Issue hygiene.** On `#640`, `#641`, `#642`: find the fix in `5a4ec42f4`, and comment with what was chosen (for `#641`: lifted, or refused loudly). On `#638`: test whether SQL, the checker and the prover read a nested fold or refuse it by name, and record which. Reopen any whose acceptance is not met.
6. **File the defects.** One issue per High and Medium entry of §6, each with the entry's input, linked from this ledger. Low entries go in one tracking issue.
7. **The name:** rename to `@doeixd/metakit` (§9.2) in one commit: the package's `name`, the 16 dependents' `package.json`, every `from 'metakit…'` import, the tsconfig paths, the `packages/plus` wrappers, the documents and the skill. The coordinator runs `pnpm install` for the lockfile. Nothing is published in this step.

*Done when:* CI is green on the branch; a grep for "33" in MetaKit's documents finds nothing; the count test exists; every old plan carries its status line; every High and Medium defect has an issue number in §6.

### W1. Kernel correctness

*Needs:* W0. *Tier:* Sonnet per defect; the default model for K6 (a semantic decision) and for the review.

1. **K1–K15, most severe first**, each by the recipe in §0.
2. **Decide K6.** Two honest options: screen the `Match` subject and `eq.is` operands so the documents become true, or state the narrower rule. The convergence design's principle is "the meaning SQL has wins": check what Postgres and SQLite do with a NUL in a `CASE` label and with `NaN IS NOT DISTINCT FROM NaN`, and follow them.
3. **`semantics.md` as tested claims** (rule 19). A test file with one case per sentence of §1 of that document, named by the sentence. K5 and K6 show the document drifted within a week of being written; this stops that.
4. **Three-reader agreement, generated.** The reviewers confirmed the prepared evaluator matches the reference by reading. Make it a test: seeded random expressions, typed by construction, through `Expr.evaluate`, `Interpreter.prepare`, and `residualize`-then-evaluate, asserting equal outcomes. This is the generator the corpus (W4) reuses, so build it once here.
5. **A mutation spec for `conformance.ts`** (P11).
6. **Jev on the three files it skipped**, by splitting the review per file with `--include` (the memory note on Jev's limits), or after W3 splits them.

*Done when:* every K entry is fixed or struck as not real, each with a killed mutation; the generated agreement test runs in CI; the `semantics.md` test exists; an independent review of the diff finds no High.

### W2. Toolkit soundness

*Needs:* W1. *Tier:* the default model for T1, T2, T3, T8 (they decide what a guarantee means); Sonnet for the rest.

1. **T1–T13.**
2. **Decide T2 and T8 together**, because they are one question: is the unchecked form the default? Today a symbolic call drops contracts, `runFn` is unchecked, and rewrites trust claims unless told otherwise. `#648` asked that "existing fast behaviour can remain, with explicit documentation and an opt-in checked path". This plan's recommendation is the reverse default for anything that changes an answer: rewrites require evidence unless the caller passes `{ mode: 'trusted' }` by name; a symbolic call carries its precondition unless the caller asks for the bare body. A guarantee that must be opted into is lost in composition (defect class 5).
3. **A composition test table.** For each of `compose`, `map`, `contramap`, `partial`, `ifElse`, `and`, `or`, `not`, `iterate`, `Operation.derived`, `expandDerived`, `Language.compose`, `Language.restrict`, `Machine.lift`, `Machine.each`, `Transition.lift`: one row asserting that each of {precondition, parameter Schema, return Schema, postcondition, implementations table, SQL lowerings, rewrite policy, allowlist} that applies survives. The reviewers traced the `Fn` combinators as sound; T1, T4, T9 and T11 are four rows of this table that fail.

*Done when:* the composition table passes with no skipped cell; T3 and T10 are settled by compiled type tests; every T entry is fixed or struck.

### W3. Simplify: the inventory and what it removes

*Needs:* W2. *Tier:* the default model. This is `#649` P0 and P1.

1. **Write the inventory** as a checked document: every export of every entry, with its layer (§5), what it adds beyond existing primitives, who uses it, whether it holds run-time state, and whether it could be derived. Generate the export list from the source so it cannot drift; write the judgements by hand.
2. **Decide each overlap in §5.** Recommendations, to be confirmed by the inventory:
   - **`Fn` and `Operation.derived` become one path.** A derived operation should accept a function with contracts, and carry them (this also fixes the root of T1). Identity without contracts, or contracts without identity, is the wrong pair of choices.
   - **`Language` stays, as an optional convenience**, if after T6 and T11 it earns its exhaustive-implementation check; `Operation.implementations` and `Language.implement` must not both be the way to build a table.
   - **`syntax.grammar` leaves MetaKit** unless W5's non-expression language uses it. Two consumers, or it goes.
   - **`Language.readiness` becomes a pure function** (rule 11) and gains the profile target (W4).
3. **Align sibling signatures** (T14) by rule 11.
4. **Make entry closures match their comments** (P7). `/graph` must not reach SQL lowering: `/graph/readiness` is already its own entry, so stop re-exporting it from `/graph`. `/language` must not reach SQL lowering or `temporal` unless `.sql(...)` or obligations are used: move those behind their own imports. Add a build test per entry asserting what its closure excludes, as `scripts/test/publishedBuild.test.ts` already does for a page.
5. **Split the seventeen oversized files** along their existing internal seams (`artifact.ts`: schemas, encode, decode, canonical; `fn.ts`: spec, combinators, checked run), and deduplicate P9 into one module each.
6. **Remove process-wide state** (P12) or state exactly why each piece is safe across two copies of the package.
7. **Strip phase and issue labels from published doc comments** (P10).
8. **Set budgets from measurements**: bytes per entry, type instantiations on a representative file, and the ceremony count of the smallest language.
9. **References, not strings** (rule 22, T17). Sweep every public signature for a parameter or option that names a previously defined thing by string, and for each: take the value instead, or derive it. `machine.transitions.Withdraw` (or the transition value itself) replaces `'Withdraw'` in `intent`, `pin` and `allowUnknown`; an implementations table is a value, not a name; a definition's dependencies come from what it refers to. Add the count of remaining string-named members to the inventory, with the reason for each that stays. Each change gets a type test showing the payload inferred from the reference and the misspelling rejected at its line.

Breaking changes are acceptable here (the package is 0.x and unpublished), each with a changelog line and a migration note. Deprecate nothing; remove.

*Done when:* the inventory is committed and its generated half is checked in CI; every overlap has a decision and the code matches it; no entry's closure contradicts its comment; no source file exceeds 20,000 characters; Jev has reviewed every public file.

### W4. The portable contract

*Needs:* W1 (and W3's decision on `readiness`). *Tier:* per the adapter plan.

This is Phase A of [`598-612-metakit-reffect-adapter-PLAN.md`](./598-612-metakit-reffect-adapter-PLAN.md) §8, unchanged except for what this plan adds:

- **A1** is K4.
- **A2** (the profile as a readiness target) follows W3's decision that `readiness` is pure.
- **A3** (bundles) is written **after** K7 and K8, so the bundle codec inherits one size bound and a collision-free canonical form.
- **A4** (the corpus) reuses W1's generator, and is written **after** K1–K6, so it records correct answers.
- **A5** (replay through the SQL reader) is the third leg `#649` §8 asks for.

**Content-addressed definitions** (§5.1; `#579` WP3–WP5, `#645` P1) are built in the same workstream, because a bundle's fingerprint and a definition's hash must be one thing. Steps C1–C3 come before A3; C4–C7 after A4. *Tier:* judgement for C1–C3 (they fix a format that stored hashes will depend on); ordinary for the rest.

- **C1. One hashing module.** After K8 is fixed. A single place that takes a kind, a canonical payload and the format version, and returns the hash. It owns the canonical JSON rules, the domain tags and `sha256Hex`. `Artifact.fingerprint`, `tooling`'s transition fingerprint (deleted in favour of this) and the bundle fingerprint all call it. An error is an error: only "holds an `Opaque` or an unhashable leaf" yields "no hash", as a typed reason, never a caught exception (K18). Write the canonical rules into `packages/metakit/docs/semantics.md`, since a consumer outside this repository must be able to recompute a hash.
- **C2. Schema identity.** Effect 4.1 ships `SchemaRepresentation`, a stable, serializable representation of a Schema (`node_modules/effect/src/SchemaRepresentation.ts`, with `toJson`), in which a check carries a persistence identity `{ id, payload }`. **Probe it before writing anything**: does it give equal JSON for two structurally equal Schemas built separately; what does it emit for `Schema.Int`, `NullOr`, optional keys, a tagged union, `Money`, `Text.schema`, and a filter with no identity. Then: the interface of §5.1 item 3 is derived from it, MetaKit's own checks (the no-NUL check, the domain annotations) carry a representation identity so they are portable, and a Schema holding a check or transformation with no identity makes the definition unhashable with a reason naming the field. Do not write a second Schema serializer if the probe shows Effect's suffices; if it does not, record what is missing in §9.3 and decide there.
- **C3. References by hash.** A derived operation gets a definition hash over its parameter and result interfaces, its null rule and its body. A definition that calls it includes that hash (K17). This needs the body to be reachable from the call: today the node holds only the operator's descriptor. Decide in §9.3 whether the descriptor carries a reference to its definition or the hash is computed against a supplied table; the first cannot give two answers for one expression, which is the reason to prefer it. Cycles are refused (derived expansion already detects them). A primitive operation stays a named leaf.
- **C4. Executable and contract hashes** for a transition, a function and a machine, as §5.1 defines them. The bundle of A3 carries the executable hash; `ensures` and claims enter only the contract hash.
- **C5. The manifest and its diff.** A deterministic manifest from a set of named definitions, and a comparison of two manifests reporting renamed, changed, added, removed and affected. `semanticDiff` becomes this comparison: it matches by hash first (T16) and takes references from the definitions instead of hand-written `dependsOn` (T15).
- **C6. Two consumers**, which rule 4.3 requires before this counts as built:
  1. **Proofs that do not rerun.** `Prove.machine` and `Prove.fn` results stored under the evidence key (contract hash, solver identity and version, timeout). A CI run proves only what changed and what is affected by it. A stored "proved" is reused only on an exact key match; a stored "unknown" or timeout is never reused as a pass. Measure the solver time saved on `examples/metakit`.
  2. **Compiled output that does not rebuild.** SQL text per dialect, prepared plans, and the Reffect native artifact (adapter plan D9) keyed by executable hash plus the compiler's identity.
- **C7. Golden hashes.** A committed fixture of a few dozen definitions with their expected hashes, and a test that recomputes them. Any unintended change to the canonical form fails this test. An intended one bumps the format version in the domain tag, which changes every hash at once and visibly, instead of silently reusing stale evidence.

**Later consumers**, each needing its own design note and a named user before it is built:

- **Durable and Sync compatibility:** a journalled operation records the executable hash of the transition it was authored against; on replay a mismatch is a typed refusal or an upcaster, never a silent run of different code. A hash does not replay old semantics by itself: that needs the old definition or a migration (`#579`).
- **Resume across deploys:** a resume envelope carries the machine's hash, so a client holding an older build's envelope takes over in full instead of resuming against changed transitions. Finer than a build id (`210-build-id-DESIGN.md`). Belongs to W7.
- **Definitions by reference on the wire:** a client names a definition by hash and the server resolves it against its own manifest.

*Done when:* that plan's Phase A exit; and for content addressing: one hashing module with no second implementation left; the golden-hash test in CI; a rename of a definition shown as a rename by the manifest diff; a body change to a derived operation changing the hash of every caller in a test; both consumers of C6 running on `examples/metakit` with the time or work saved recorded.

### W5. Two small languages and the flagship slice

*Needs:* W3. *Tier:* Sonnet, with a default-model review of what the exercise exposed.

`#649` §9: "a good public API is best tested by building reusable languages with it".

1. **An integer language** with checked overflow, one reusable function and a JavaScript interpreter: the reviewer's ceremony exercise, compiled, with its line count recorded against W3's budget.
2. **A language that is not expression-shaped** (a route or configuration grammar), to find out where the architecture stops generalising. It decides `syntax.grammar`'s fate (W3).
3. **The flagship, non-UI slice** `#645` asks for: a reservation or inventory rule with an invariant, a guarded write and a custom operation; one definition read by evaluation, a SQL lowering, the checker and an agent-readable description, with an explicit list of what each reader does not support.
4. **A third-party fixture** (`#597`, 2026-11-23): a custom operator declared outside the package, used in a child transition's guard, lifted into a parent, compiled for SQLite first without its lowering (the refusal must name the operator, the target and the transition) and then with it.

5. **Phases** (§5.2), in three stages, each usable alone:
   1. **Probe** the two open risks: the inference type test, and what a write under a non-current variant does today. Record both in §9.3.
   2. **Phases over a literal field**: `phase`, `from`, `to` and `choose` in `metakit/machine`, several transitions per message in `Machine`, the generated state diagram, the reachability checks and the phase-by-message table. No kernel change. The example is the dialog of §5.2 with `phase: Schema.Literals([...])` and the draft as an ordinary field.
   3. **Phases with payloads**: the `replace` way of writing, through admission (§4.3), then the tagged-union form of the same dialog, with the phase-scoped invariant proved and the SQL constraint emitted.

   *Tier:* judgement for the API shape and for `replace`; ordinary for the diagram and tables. *Done when:* the §5.2 dialog compiles with no annotations and no casts; the impossible state is a type error to construct; `Prove.machine` proves the phase-scoped invariant; the diagram and table are generated in a test; every reader either reads `replace` or refuses it by name.

Every place one of these needs a cast, a private import or a repeated signature is a defect in the toolkit, filed and fixed, not worked around in the example.

*Done when:* all four exist under `examples/metakit`, compile without casts, and run in CI; the list of what each exposed is written into the inventory.

### W6. Targets

*Needs:* W4. *Tier:* per the adapter plan.

1. **Prepared against interpreted** (`#645`'s open box): cold preparation, warm evaluation, memory. Report before making `prepare` a default anywhere.
2. **The Reffect adapter**: Phase B of the adapter plan.

*Done when:* that plan's B4, with its findings document.

### W7. The successor spike

*Needs:* W1. *Tier:* the default model for the design note; Sonnet for the slice.

The direction (maintainer, 2026-11-28; [`docs/direction.md`](../direction.md)): the successor is its own runtime and renderer on MetaKit and Effect, not an adapter onto Effect UI. This supersedes the 2026-11-26 comments on `#612` and `#644` that made Effect UI the first integration target. Effect UI is the baseline to beat and a source of ideas.

This workstream is the bridge from stage 1 to stage 2: a plan and one measured slice. The rest of stage 2 (`#612` phases P2 to P5) and stage 3 are outside this plan.

1. **Write `docs/design/successor-PLAN.md`** to the standard of this plan. Read `#612`, `#635`, `#637`, `#643` and `#607` whole. Read Effect UI's source at a pinned commit, and check every claim `docs/direction.md` makes about it against that source. Read `packages/successor`, `packages/ssr` and `packages/surface` as the starting material, and the LEDGER's missed gates as the starting evidence. Cover every section of `docs/direction.md`'s stage 2: fine-grained performance, rendering on more than one target (`#637`, and the four meanings of "capability" to rename first), and routing, data and the server (parallel reads, single-flight mutations from declared footprints, streaming, branches). Set measurable gates before any code.
2. **One vertical slice**: the keyed cart of `#612` (or `domains-plus`, where measurements exist; decide in §9.3), with phases (§5.2), binding-level updates, a named derived subtotal maintained incrementally, and a cold resume.
3. **Measure against the baseline `#643` defines**: the same behaviour in idiomatic Effect UI (`h.lazy`, keyed children), not a weakened one. Report cold start, bytes shipped, update latency, cost of derived values, memory, and type-check time, with counts of view calls, projection evaluations and DOM mutations per update. The speed thesis is fine-grained rendering end to end (`docs/direction.md`, "Performance"): the repository's own measurements of 2026-11-10 found drawing under half of a slow frame and derivation most of the rest, so the grain must reach derived values, and the fixture must include costly ones. Upstream reports 0.7 to 1.1 ms per update on 1,000 rows, so also measure 10,000 and 100,000 rows on a slowed CPU.
4. **Say what MetaKit still lacks for the successor**, found by building the slice, and feed it back into this plan's ledger.

*Done when:* the plan exists; the slice runs; the measurements are published with their method; each gate is met or recorded as missed with what was decided.

### W8. Documents, skill and release

*Needs:* W3 and W5. *Tier:* Sonnet, with a cold-reader pass by an agent with no context.

1. **Standalone documentation** (`#645`, `#649`): the minimal language, adding a second interpreter, composition, supported targets and their limits, progressive adoption from plain Effect Schema. Each to `docs/agents/writing-docs.md`: one page, one job; the first 150 words name the reader's problem; every snippet compiled.
2. **A profile and conformance matrix and a divergence register** (`#649` §5), modelled on Reffect's `native-divergences.md`: per reader, what is equal, what is refused at compile time, what is not yet tested.
3. **The skill**: row and reference updated, version bumped.
4. **Release** under the final name, **after W10**. Extraction to its own repository stays last (`#598`, 2026-11-20), after the import graph is acyclic and the bundle guardrails hold.

### W9. Tooling

*Needs:* W3. *Tier:* Sonnet.

1. **T15**: index functions, operations and languages; derive `dependsOn` from the definitions instead of hand-written strings; settle the path-format probe.
2. **A CLI** over the index (`#646` P0 lists one; nothing claims it).
3. **Vite, editor, DevTools, MCP** only after a consumer inside the repository asks for one. `#646`'s own order is diagnostics-only first.

### W10. The full audit

*Needs:* W1–W9. *Tier:* judgement. This is the last workstream and gates the release.

Everything before this fixes what was known. W10 looks for what was not, across the whole package as it then stands, in six dimensions. Each has a method that produces evidence, not an opinion.

| Dimension | Question | Method | Passes when |
|---|---|---|---|
| **Soundness** | Can any reader give an answer the reference does not? Can a claim act without evidence? Can a guarantee be lost? | Extend W1's generated agreement test to every reader on its supported fragment: prepared, residualize, judge, PGlite, SQLite, the interval checker, Z3 (a solver "proved" must hold on the generated inputs; "refuted" must replay through the evaluator). Rerun W2's composition table. Fuzz the codec and bundle decoders with malformed input. Re-derive each law-driven rewrite's precondition. | Zero disagreements over a recorded seed and count; no rewrite fires without evidence under the default policy; every cell of the composition table passes |
| **Correctness** | Does each function do what its name and doc comment say, on every edge? | Run every mutation spec (`pnpm mutate` per spec, several names per run) and account for each survivor. Run the `semantics.md` test, the corpus, and the examples' unit tests. Trace each public function against the edge list of `CLAUDE.md` ("empty, missing, duplicate, out-of-order, called twice"). | Every survivor has a written reason; every doc-comment claim checked is kept |
| **De-slop** | Is anything dead, duplicated, restated, or wrong while looking finished? | Apply the De-slop list of `CLAUDE.md` file by file: unused exports (an export nothing imports and the inventory does not list as deliberate), wrappers that only forward, options nobody passes, comments that restate, copied helpers, quiet fallbacks, tag comparisons the checker cannot see, `null` or `undefined` for absence. Re-take the inventory's counts and compare. | Each count is at or below its target (below), and each remaining instance has a reason on the line |
| **Type safety** | Does any public type promise what nothing enforces? | List every cast in `src` with its justification; none may sit on a public boundary without a test that would fail if the promise broke. No `any` in emitted declarations (the existing declared-any check). A type test with a positive and a negative case for every export, and a type mutation for each. The T3 pattern (a declared type the body does not satisfy) tried against every constructor that takes a Schema and a body. | No unjustified cast; no export without a type test; no constructor that types an unchecked value as checked |
| **Inference** | Does a call site work without annotations, and does a mistake fail where it was made? | For every public constructor, a test that calls it with no type arguments and no annotations and asserts the inferred type. For each common mistake (wrong path, wrong operand kind, missing implementation, write to an input), a `@ts-expect-error` test on the line of the mistake, not three calls later. Declaration emit across modules for every example (the `#640` class). Type-instantiation counts and check time on the representative files, against W3's budget. | Every constructor infers; every listed mistake errors at its line; counts within budget |
| **Developer experience** | Can someone who has never seen MetaKit build with it from the documents? | A cold run: an agent with no context and only the published documents builds W5's integer language and the flagship slice; every stumble, wrong guess and cast is recorded. Every refusal and thrown error collected into one table and judged against rule 6 (names the thing, the reason, the fix). The ceremony count of the smallest language against its budget. A cold-reader pass on every document. | The cold run finishes with no cast and no question the documents do not answer; every message in the table passes rule 6 |

**Baselines for the de-slop and type-safety counts** (from the 2026-11-28 inventory; W3 sets the targets):

| Signal in `src` | Today |
|---|---|
| Casts of any kind (` as <Type>`) | 892 in 110 files (`fn.ts` 54, `artifact.ts` 35, `machine.ts` 32) |
| `as unknown as` | 53 |
| `as never` | 8 |
| Non-null assertions | about 271 |
| `throw new Error(` | 122 |
| `._tag ===` comparisons | 21 |
| `default:` in a `switch` | 3 |
| `: any` | 2 |
| Source files over 20,000 characters | 17 |

**How it is run.**

1. **Three independent auditors per dimension**, one from each model family (the coordinating Claude session on the default model, Gemini, Codex), each given the code and the dimension's question, and none given this plan's conclusions or each other's findings. Split the package by area so no auditor holds more than it can read whole.
2. **Merge and verify.** Each finding is settled by a failing test, a compile error or a probe before it is believed. A finding two families report independently is prioritised; one that cannot be reproduced is struck with the reason.
3. **Fix** by the recipe in §0, most severe first.
4. **Audit again** the areas that changed. Stop when a round finds no High and no Medium. After three rounds with High or Medium findings still appearing, stop fixing one by one: that pattern means a design problem, not a list of bugs. Record it in §9.3 and decide by §9.1 what to redesign or narrow, then tell the maintainer what was found and decided.
5. **Record** in `docs/design/metakit-AUDIT.md`: the seed and counts of every generated run, every finding with its fate, every survivor's reason, the before and after of each count, and what was not examined.

*Done when:* the last round finds no High or Medium; the audit document is committed; CI is green. Then, and only then, W8 step 4 (release).

---

## 9. Decisions

### 9.1 How a decision is made

The maintainer's instruction (2026-11-28): whenever this plan needs a decision, record it, and have Fable (the coordinating Claude session on the default model) research it and decide.

1. **Record it first**, as a row in §9.3 with status *open*: the question in one sentence, where it came up (a step, a defect, a builder's report), and what is blocked on it.
2. **A builder never decides.** If Gemini or Codex meets a choice the brief did not settle, it stops and reports the choice; it does not pick one and carry on. Say this in every brief.
3. **Fable researches**: reads the source and the designs in §3.2 (a settled decision is not reopened without new evidence), probes what can be probed, and looks up what the databases, Effect or the upstream project actually do. A decision made from memory of how a library behaves is not researched.
4. **Fable decides and writes it down** in the same row: the decision, the alternatives rejected and why, the evidence (file and line, a probe's output, a source link), and what would change it. Then the work continues. No list of options is handed back.
5. **A decision that shapes a published API** also gets a line in the changelog and, where it is large, a design note.

Two things stay with the maintainer, because they cannot be undone or are his to own: anything published or sent outside this repository (an npm publish, a post on another project, a deploy), and anything he has already decided. Those are confirmed with him, not decided for him.

### 9.2 Decided

| Decision | Reason |
|---|---|
| **The package is published as `@doeixd/metakit`** (maintainer, 2026-11-28: "might have to be"). The name is free on npm; `metakit` is another project's. Treat it as the working name: the rename is one mechanical commit in W0 step 7, across 16 packages' `package.json` and every `from 'metakit…'` import, and the publish itself waits for W10 and the maintainer's go-ahead | `metakit` is taken; a scope the maintainer owns needs nothing claimed |
| **`NUL` and `NaN` (K6): follow what Postgres and SQLite do**, then make `semantics.md` say exactly that. W1 step 2 probes both databases for a NUL in a `CASE` label and for null-safe equality over NaN, and records the outputs here before changing code | §3.2: "the meaning SQL has wins" is a settled decision, and K6 is an instance of it |
| **The successor (`#612`) is its own runtime on MetaKit and Effect, not an Effect UI adapter** (maintainer, 2026-11-28; `docs/direction.md`). The order is MetaKit, then the successor, then Foldkit Plus rebuilt on it. This reverses the 2026-11-26 comments on `#612` and `#644`, and an earlier row of this table that followed them | Foldkit became Effect UI and the maintainer does not want to build on that implementation. A transition as data, not as a function, is the decision the rest follows from |
| Fix before build: W1 and W2 precede any new surface | §3.4: five review rounds, each finding Critical or High items after the feature landed |
| The corpus is written after the kernel defects are fixed | It freezes answers another repository copies |
| Checked is the default; trusted is opt-in by name (W2) | A guarantee that must be opted into is lost in composition |
| `Fn` and `Operation.derived` converge (W3) | Today contracts and identity are mutually exclusive |
| Definition-time errors throw; data-dependent failures are typed (rule 11) | The current mix (T14) makes callers guess |
| `syntax.grammar` needs a second consumer or leaves | Rule 4.3 |
| The older MetaKit plans are closed as history | Their status tables contradict each other |

### 9.3 Register

Decisions the plan already knows it will need. Each is decided by §9.1 when its workstream reaches it; add rows as questions arise.

| # | Question | Arises in | Status |
|---|---|---|---|
| 1 | Is the unchecked form ever the default? (A symbolic `Fn` call carrying its precondition; rewrites requiring evidence.) The plan's leaning is checked by default; the cost on call-site ergonomics and on existing callers is not yet measured | W2 step 2 (T2, T8) | open |
| 2 | How `Fn` and `Operation.derived` converge: one constructor, or a derived operation that accepts a function with contracts | W3 step 2 | open |
| 3 | Does `Language` earn its place over a plain object of operations once T6 and T11 are fixed | W3 step 2 | open |
| 4 | Does `syntax.grammar` stay | W5 step 2 decides by use | open |
| 5 | Which files split where, and the byte, instantiation and ceremony budgets | W3 steps 5 and 8 | open |
| 6 | What `T1`'s fix is: leave a checked call unexpanded, or return its refinements beside the expansion | W2 | open |
| 7 | Whether a builder may commit for single-file steps, after the first delegated steps show how each agent behaves | §8.0, after W0 | open |
| 8 | Is Effect's `SchemaRepresentation` enough to be a Schema's identity, or what must MetaKit add | W4 step C2, after its probe | open |
| 9 | How a call reaches its derived operation's body for hashing: the descriptor carries the definition, or a table is supplied. Leaning: the descriptor | W4 step C3 | open |
| 10 | Whether a derived operation still needs a hand-written `version` once it is named by its content. Leaning: keep `id@version` as the name people read and the wire reference; the hash decides sameness | W4 step C3 | open |
| 11 | Where stored evidence lives for C6: a committed file, the CI cache, or both | W4 step C6 | open |
| 12 | Phases: the names (`from`/`to`/`choose`, `replace`), and whether the builder is a callback on `Machine.make` or a separate constructor | W5 step 5 | open |
| 13 | Whether `replace` is a new way of writing or `Transition.set` accepting a record of field expressions when its target is a struct. Leaning: a new way, since its commute and idempotence properties differ from a scalar `set` | W5 step 5, stage 3 | open |
| 14 | Whether an optional Effect UI interoperability adapter is worth keeping, now that the successor is its own runtime | W7 step 1 | open |
| 17 | The successor's first application: the keyed cart of `#612`, or `domains-plus` where measurements exist | W7 step 2 | open |
| 18 | The successor's name and package names (`foldkit-successor` is a placeholder) | W7 step 1 | open |
| 15 | Where a variant's typed reference comes from: an accessor derived from the phase path (`phase.Closed`), or the variant's own Schema value passed as the reference. Leaning: the derived accessor, as `msg.Increment` is in `#612`; one way, not both | W5 step 5 | open |
| 16 | Arm selection in `#612`: declaration order with each arm excluding its predecessors (disjoint by construction), or unordered arms whose disjointness the prover must show. Leaning: the first, with the prover reporting an arm that can never fire | W5 step 5, W7 | open |

---

## 10. What each issue needs to close

| Issue | Closes when |
|---|---|
| `#648` | W1 and W2 done; its #6 (control flow versus logical operations) is K5 and K6 plus the `semantics.md` test; #8 is W3 and W4's profile; #9 is K7 and W4 |
| `#645` | W4 (codec fixes, bundles, corpus), W5 step 3 (the slice), W6 step 1 (benchmarks), W8 step 1 (documentation) |
| `#579` | Its WP3 (fingerprints), WP4's `diff` and WP5 (a manifest and one real consumer) are W4 steps C1–C7. WP1, WP2 and the rest of WP4 (shared facts, Block composition, graph queries) are not in this plan |
| `#647` | W3 (alignment, `grammar`'s fate) and W5 (the test languages) |
| `#646` | W9 |
| `#649` | W3 (P0, P1), W4 and W8 step 2 (P2), W6 (P3), W5 and W8 (P4) |
| `#597` | W5 step 4 (the third-party fixture) and W3 (algebra as a plain family) |
| `#598` | It is the umbrella; close it last, when the others have |
| `#612`, `#635`, `#637`, `#643` | Stage 2 (`docs/direction.md`). W7 writes their plan and one measured slice; they are not closed by this plan |
| `#644` | No longer the path. Close it, or narrow it to an optional interoperability adapter (§9.3 row 14). The maintainer's to post |

---

## 11. Sources

- **Design notes read whole** (by research agents, each reporting line ranges): `metakit-unification-PLAN.md`, `-LEDGER.md`, `-HANDOFF.md`, `metakit-phases-2-6-PLAN.md`, `metakit-kernel-convergence-DESIGN.md`, `metakit-phase-6-DESIGN.md`, `478-479-483-185-64-expr-contracts-DESIGN.md`, `601-expression-standard-library-DESIGN.md`, `metakit-checked-operations-DESIGN.md`, `metakit-declared-update-DESIGN.md`, `metakit-fn-PLAN.md`, `effect-integration-PLAN.md`, the five `*-REVIEW.md` files, `metakit-next-slice-PLAN.md`, and `packages/metakit/README.md` and `docs/`.
- **Issues read whole, body and comments:** open `#597`, `#598`, `#612`, `#635`, `#637`, `#643`–`#649`; closed `#611`, `#613`–`#633`, `#638`–`#642`; referenced `#479`, `#480`, `#579`, `#580`, `#600`, `#601`, `#607`, `#629`, `#634`, `#636`; PR `#610`.
- **Code:** a package inventory (entries, exports, closures, consumers, tests, mutation specs) by reading and grep; two independent reviews, one of the kernel and one of the toolkit layer, each tracing its findings in the source. The entries marked **Read** in §6 were re-read for this plan.
- **Not done:** no test, build, typecheck or probe was run. The inventory's closure sizes include type-only imports and overstate what a bundle keeps. Reffect was read at `origin/master` `c3be420`; Effect UI's documentation was read in part for `docs/direction.md`; its source was not read (W7 step 1).
