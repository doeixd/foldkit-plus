# MetaKit → Reffect Native Adapter Spike Plan (`#598`, `#612`)

**Status:** Decision-complete design & execution plan (ready for Phase B1)  
**Issues:** `#598` (MetaKit / Reffect convergence), `#612` (Foldkit successor native execution boundary)  
**Prerequisites landed in `#610`:** `metakit/artifact` (`PortableArtifactV1`, `ArtifactFingerprint`, `EvidenceKey`), `Expr.matchTags` / `Expr.matchTagsExhaustive`, `metakit/fn` (`FnObligation`, `ReturnCarrier`), `Operation.derived` / `expandDerived`, `Interpreter.prepare`, `Language.readiness`, `metakit/tooling` (`SemanticIndex`, `semanticDiff`).

---

## 1. Purpose & Core Question

Both **MetaKit** (`doeixd/foldkit-plus`) and **Reffect** (`doeixd/reffect`) now have real, tested implementations:
- MetaKit owns the target-neutral pure semantic calculus: `Expr<Env, A>` over Effect `Schema`, `Transition`, `Machine`, portable wire artifacts (`PortableArtifactV1`), Kleene $K_3$ partial evaluation, SQL/Drizzle lowering, and Tier 3/4 Z3 verification.
- Reffect owns native Rust compilation (`Compile`, `Rs`, `CargoApi`, `NativeRunner`), ownership/representation planning, and native Effect/Foldkit SSR/Remote/RPC execution (`packages/reffect/src/foldkit.ts` already lowers `foldkit-entity` queries to dependency-free Rust).

The question this spike answers is **not** *"should we merge both repos into a mega-kernel?"* (Reffect's `docs/reuse-strategy.md` explicitly defers that). The concrete question is:

> **Can a small, strictly checked adapter lower a real MetaKit `Expr.matchTagsExhaustive` + guarded `Transition` + named-view vertical slice to Reffect's Rust target with 100% 3-way semantic parity (`MetaKit JS` === `Reffect Reference` === `Reffect Rust`), zero external Rust crate dependencies, and measurable native execution benefit — without weakening MetaKit's semantics or adding a Rust dependency to `foldkit-plus`?**

---

## 2. Design Thoughts & Locked-In Architectural Decisions (D1–D7)

### D1. Repo Placement & Dependency Direction
- **Decision:** Implement the adapter inside `doeixd/reffect` (`packages/reffect/src/metakit.ts` + `packages/reffect/src/metakit-runtime.ts` + Rust runtime source in `RuntimeSources.metakit_eval`), right beside Reffect's existing `packages/reffect/src/foldkit.ts`.
- **Consumed contract:** MetaKit's JSON-serializable `PortableArtifactV1` + `ArtifactFingerprint` + Schema/Transition structural descriptors (no private MetaKit `Node` internals or closures).
- **Alternatives rejected:**
  - *Putting Rust codegen inside `foldkit-plus`:* would force `cargo`/`rustc` into `foldkit-plus` CI or leave native tests unrunnable in CI.
  - *Extracting `@doeixd/semantic-ir` first:* premature abstraction archaeology before a single real cross-repo vertical slice exists.
- **Implication:** `foldkit-plus` stays 100% pure TypeScript with zero Rust toolchain requirement, while `reffect` CI compiles and executes real Rust binaries on every PR.

### D2. Lowering Target Inside Reffect
- **Decision:** Emit **zero-dependency Rust** backed by a dedicated `metakit_eval` runtime (mirroring `foldkit.ts` + `foldkit-runtime.ts`), reusing Reffect's `CompileError`, `SemanticRef`, `Rs` AST emitter, `CargoApi`, and `records.ts` naming/layout helpers (`rustFieldNames`, `rustVariantName`).
- **Alternatives rejected:**
  - *Lowering MetaKit directly into Reffect's general `Kernel.Expr` (`U64Type`, `NumberType`, `OptionIR`):* Reffect's `U64Type` uses wrapping unsigned arithmetic and standard `Option`/`Result`, whereas MetaKit uses signed safe-53-bit checked integers (`±(2^53−1)`), Kleene $K_3$ three-valued logic, and refusal-before-null propagation. Forcing MetaKit through `U64Type` would either silently corrupt semantics or pollute Reffect's general kernel.
- **Implication:** Exact semantic parity, zero external Cargo crates (sub-second `cargo build`), and clean `Metakit.embed(...)` composability into Reffect's SSR/Remote/RPC crates.

### D3. Numeric Representation (`i64` Checked Safe-53 vs Floats)
- **Decision:** Represent `Schema.Int` (and integer-backed domain types `Money`, `Decimal`, `CalendarDay`) as Rust `i64` with explicit checked arithmetic and a safe-integer guard:
  ```rust
  pub const MAX_SAFE_INT: i64 = 9_007_199_254_740_991; // (1 << 53) - 1
  ```
  Every `mk_add`, `mk_sub`, `mk_mul`, `mk_neg` uses Rust `checked_*` followed by `v.abs() <= MAX_SAFE_INT`, returning `Err(Refusal::UnsafeInteger)` on violation.
- **v1 boundary:** Reject `Schema.Number` (IEEE-754 floats), `num.div`, `num.rem`, and `num.mulScaled` in v1 with `CompileError('UNSUPPORTED_REPRESENTATION' | 'UNSUPPORTED_OPERATOR')`.
- **Implication:** Eliminates `-0`, `NaN`, and float rounding divergence in v1 while covering 100% of business-domain integer/money/counter/limit rules.

### D4. Text & Unicode Semantics (Native UTF-8 vs UTF-16)
- **Decision:** Use **native Rust UTF-8 `String` / `&str`** (NOT `foldkit-runtime.ts`'s UTF-16 bridge).
  - On the JS → wire boundary: run MetaKit's `wellFormed()` (lone surrogates `\uD800`–`\uDFFF` → `U+FFFD`) and reject `\u0000` (NUL) before null (`Refusal::Unportable`).
  - In Rust `metakit_eval`:
    - `str.len`: `s.chars().count() as i64` (Unicode code points — matches MetaKit `codePointLength`, Postgres `char_length`, and SQLite `length`).
    - `str.lt`/`lte`/`gt`/`gte`: `a.cmp(b)` (Rust `&str` ordering is exact UTF-8 / Unicode scalar value order!).
    - `str.lowerAscii`: `s.to_ascii_lowercase()` (ASCII A–Z only — matches MetaKit `ops/str.ts`).
    - `str.trim`: **`s.trim_matches(&[' ', '\t', '\n', '\r'][..])`** — **NOT** Rust's `str::trim()`!
- **Trap avoided:** Rust's built-in `str::trim()` strips Unicode whitespace like `\u00A0` (NBSP) and `\u2003`, whereas MetaKit's `str.trim` strips **only** ASCII space, tab, LF, and CR. Explicit `trim_matches` guarantees 100% parity.

### D5. Kleene $K_3$ & Refusal-Before-Null Evaluation Order
- **Decision:** Every MetaKit expression evaluates to `Result<Option<Val>, Refusal>` in Rust:
  - `Ok(Some(v))` = non-null value
  - `Ok(None)` = `null` (or absent optional key)
  - `Err(r)` = `Node.Refusal` (`UnsafeInteger`, `NonFinite`, `IllTyped`, `Unmatched`, `Unportable`, `Unsupported`, `Failed`)
- **Strict evaluation rules (matching `packages/metakit/docs/semantics.md`):**
  - `Call` arguments evaluate **eagerly left-to-right** before the operator runs, so `bool.and(false, <refused>)` and `bool.or(true, <refused>)` return `Err(<refused>)` (refusal decides before null and before boolean absorption!).
  - `eq.is` / `eq.isNot` are **total** over null (`eq.is(null, null) == Ok(Some(true))`, `eq.is(null, 1) == Ok(Some(false))`), whereas `eq.equals` is SQL 3-valued (`eq.equals(null, null) == Ok(None)`).
  - `If` and `Match` evaluate **only the selected branch** (an untaken branch holding a refusal must NEVER fire!). `If(null, t, e)` returns `Ok(None)`. `Match` on `null` returns `otherwise` if present else `Ok(None)`; unmatched non-null tag returns `Err(Refusal::Unmatched)`.
  - `null.coalesce(a, b)` evaluates `a` first; if `Ok(Some(v))` returns `Ok(Some(v))` without evaluating `b` (matches `ops/null.ts`: `b`'s refusal does not reach the answer when `a` is non-null).

### D6. `Transition` Purity & Emitted Commands Boundary (`#612`)
- **Decision:** Lower a guarded `Transition` as a pure function:
  ```rust
  (state: &State, input: &Input, supplied: &Supplied) -> Result<TransitionOutcome<State, Emit>, TransitionRefusal>
  ```
  - Step 1: Validate guard `when` (`Ok(Some(true))` proceeds; `Ok(Some(false))` or `Ok(None)` returns `Err(TransitionRefusal::GuardNotMet)`; `Err(r)` returns `Err(TransitionRefusal::ExprRefusal(r))`).
  - Step 2: Evaluate all `emits` conditions and field expressions against **pre-step** `state` (matching `packages/metakit/src/transition.ts`), keeping emitted records as plain data (`Vec<Emit>`).
  - Step 3: Evaluate all `writes` (`set` and `add` in v1) against **pre-step** `state`, apply them to produce `next_state`, and validate any `ensures` clauses over `(state, input, next_state)`.
  - **Never execute side effects inside the lowered Rust transition.** Host runtimes (JS or Reffect `EffectFn`) execute emitted commands after commit.

### D7. Fingerprint Continuity, Caching & Wire vs In-Process Boundary
- **Decision:**
  - Every `MetakitArtifact` records the source MetaKit `ArtifactFingerprint` (`sha256:...`) and derives a Reffect-side `EvidenceKey` (`reader: { id: 'reffect/metakit-rust', version }`, `profile: 'metakit/safe-int-k3@1'`, `fingerprint`).
  - Support two execution modes:
    1. **Subprocess wire protocol (`reffect-metakit-v1`)**: dependency-free line protocol for Phases B1–B3 CLI & 3-way differential fuzzing (mirroring `reffect-query-v1`).
    2. **In-process embedding (`Metakit.embed(...)`)**: emits Rust module functions directly callable from Reffect SSR/Remote/RPC crates (mirroring `Foldkit.embed`) for honest Phase B4 micro-benchmarks without subprocess spawn overhead.

---

## 3. Admitted Fragment v1 Matrix

| Category | Admitted in v1 | Rejected in v1 (`CompileError`) |
|---|---|---|
| **Types** | `Schema.Int` (safe-53), `Schema.Boolean`, `Text.schema`, `Schema.Literals`, `Schema.NullOr`, `Schema.optional` / `optionalKey`, `Schema.Struct`, `Schema.Union` of `Schema.TaggedStruct` | `Schema.Number` (floats), `Schema.Array`, `Schema.Record`, non-tagged unions, `Schema.Unknown`, `Schema.Any` |
| **AST Nodes** | `Lit` (int, bool, string, null), `Path`, `Call` (admitted core ops), `If`, `Match` | `Opaque`, `Rows`, unbound `Foreign` ops (use `Operation.expandDerived` before lowering) |
| **Core Ops (19)** | `bool.and`, `bool.or`, `bool.not`, `eq.is`, `eq.isNot`, `eq.equals`, `ord.lt`, `ord.lte`, `ord.gt`, `ord.gte`, `num.add`, `num.sub`, `num.mul`, `num.neg`, `null.isNull`, `null.coalesce`, `str.len`, `str.trim`, `str.lowerAscii`, `str.startsWith`, `str.contains`, `str.lt`, `str.lte`, `str.gt`, `str.gte` | `num.div`, `num.rem`, `num.mulScaled`, `eq.oneOf`, `eq.among`, `arr.*`, `set.*`, `time.*` |
| **Transition Writes** | `Transition.set`, `Transition.add` | List writes (`append`, `insert`, `remove`, `patch`, `include`, `exclude`), `Transition.opaque` |

---

## 4. Target Vertical Slice (`CounterAccount` — `#612` + `#598`)

One realistic slice exercising every part of the v1 contract:

- **State Schema (`CounterAccount`):**
  `{ count: BoundedInt, limit: BoundedInt, status: Schema.Literals(['open', 'frozen']), note: Schema.NullOr(Text.schema) }`
- **Tagged Message (`Expr.matchTagsExhaustive`):**
  `Increment {}` | `Decrement {}` | `SetCount { count: Schema.Int }` | `Add { delta: Schema.Int }` | `Freeze {}`
- **Named View Derivations (`Expr`):**
  - `remaining`: `Num.sub(state.limit, state.count)`
  - `canIncrement`: `Bool.and(Eq.is(state.status, 'open'), Ord.lt(state.count, state.limit))`
  - `noteLen`: `Null.coalesce(Str.len(Str.trim(state.note)), 0)`
- **Guarded `Transition` (`UpdateCounter`):**
  - Computes `nextCount` via `Expr.matchTagsExhaustive(input.msg, ...)`
  - `when`: `Bool.and(Eq.is(state.status, 'open'), Bool.and(Ord.gte(nextCount, 0), Ord.lte(nextCount, state.limit)))`
  - `apply`: `[Transition.set(state.count, nextCount)]`
  - `emits`: `[Transition.emit('CountChanged', { previous: state.count, next: nextCount }, { when: Eq.isNot(nextCount, state.count) })]`

---

## 5. Step-by-Step Execution Plan

### Phase B1 — Admitted-Fragment Checker, Schema Translator & Diagnostics
**Goal:** Validate `PortableArtifactV1` + Schema descriptors and reject everything outside v1 with exact `CompileError` diagnostics before generating a single line of Rust.

- **Steps:**
  1. Define `MetakitInput` wire types in `packages/reffect/src/metakit.ts` accepting `PortableArtifactV1`, `ArtifactFingerprint`, environment Schemas, and optional `Transition` descriptor.
  2. Implement `checkMetakitSchema` translating Effect `SchemaAST` (`Struct`, `TaggedStruct` unions, `Literals`, `NullOr`, `optional`, `Int`, `Boolean`, `Text`) to Reffect slot/layout metadata (`rustFieldNames`, `rustVariantName`), rejecting unsupported types with `UNSUPPORTED_REPRESENTATION`.
  3. Implement `checkMetakitNode` walking `PortableNode` with cycle/depth/node limits, verifying every `Call` is in the admitted core-op set, every `Path` resolves in scope, and rejecting `Opaque`/`Rows`/unsupported ops with `UNSUPPORTED_NODE` / `UNSUPPORTED_OPERATOR`.
  4. Emit structured `MetakitAnalysis` (parallel to `QueryAnalysis` in `foldkit.ts`: `name`, `fingerprint`, `evidenceKey`, `slots`, `operations`, `profile: 'metakit/safe-int-k3@1'`, `crates: []`).
- **Tests:**
  - Positive check tests for all admitted types, `Expr.matchTagsExhaustive`, `If`, `Match`, and all admitted core ops.
  - Negative tests verifying exact `CompileError` codes + paths for: `Opaque`, `Rows`, `Time.*`, `Sets.*`, floats (`Schema.Number`), unknown foreign ops, out-of-scope paths, and prototype keys (`__proto__`, `constructor`).
- **Exit Criteria:** Checker passes all positive/negative tests; zero Rust emission yet.

### Phase B2 — `metakit_eval` Rust Runtime, Expression Lowering & 3-Way Differential Fuzzer
**Goal:** Lower any checked `PortableArtifactV1` expression to dependency-free Rust and prove 100% 3-way parity (`MetaKit JS` === `Reffect Reference` === `Reffect Rust`).

- **Steps:**
  1. Write the zero-dependency Rust runtime `metakit_eval.rs` (added to `RuntimeSources`) implementing:
     - `Value` enum (`Int(i64)`, `Bool(bool)`, `Str(String)`, `Null`), `Refusal` enum (`UnsafeInteger`, `IllTyped`, `Unmatched`, `Unportable`), and `EvalResult = Result<Value, Refusal>`.
     - All admitted core ops with exact MetaKit semantics (safe-53 checked arithmetic, Kleene $K_3$ with refusal-before-null, `eq.is` vs `eq.equals`, 4-char `trim_matches`, ASCII `to_ascii_lowercase`, code-point `str.len` and `str.cmp`, NUL check before null).
     - `reffect-metakit-v1` line encoder/decoder (escaping `\n`/`\r`/`\\`, rejecting `\u0000` on wire).
  2. Implement `emitMetakitExpr` using Reffect's `Rs` AST emitter:
     - Lazy `If` and `Match` codegen (inactive branches never evaluated).
     - Lazy `null.coalesce(a, b)` codegen (matches `ops/null.ts` short-circuiting).
     - Eager left-to-right argument evaluation for all other `Call`s (preserves refusal-before-null).
  3. Implement `Metakit.compile`, `Metakit.embed`, `Metakit.build`, and `Metakit.run` (mirroring `Foldkit.*`).
  4. Build a 3-way differential fuzzer: 200+ randomly generated well-scoped trees + deterministic adversarial suite (`MAX_SAFE_INTEGER`, `-MAX_SAFE_INTEGER`, overflow at `+1`/`-1`/`*2`, `null` in every slot, untaken-branch overflow refusal, `bool.and(false, overflow)`, `str.trim("\u00A0hi ")`, emoji/surrogate pairs `"🎉"`, lone surrogate `"\uD800"`, NUL byte `"a\0b"`, `Expr.matchTagsExhaustive` on all variants + `null`).
- **Exit Criteria:** 100% 3-way agreement across all 200+ fuzz trees and every adversarial edge case; `cargo test` and `cargo clippy -- -D warnings` pass with zero warnings.

### Phase B3 — Guarded `Transition` & Named View Vertical Slice (`#612`)
**Goal:** Compile and run the full `CounterAccount` vertical slice (tagged `Message` update + guarded `Transition` + pre-step `emits` + named view derivations) natively in Rust and verify 100% parity with MetaKit JS.

- **Steps:**
  1. Extend `Metakit.compile` / `Metakit.embed` with `compileTransition` supporting `when`, `writes` (`set`, `add`), `emits` (evaluated over pre-step `state`), and `ensures`.
  2. Wire the `CounterAccount` vertical slice: encode from MetaKit (`Artifact.encodeExpr` + Transition descriptor), compile with Reffect, and run against a comprehensive state × message matrix (open/frozen, in-bounds/out-of-bounds, `null`/non-null `note`, no-op emit suppression, overflow refusal, guard refusal).
  3. Verify `EvidenceKey` cache invalidation: changing one expression or guard changes `ArtifactFingerprint` → invalidates cached native artifact; non-semantic metadata edits leave `ArtifactFingerprint` unchanged.
- **Exit Criteria:** 100% parity between `Transition.step` (MetaKit JS) and compiled Rust on state, refusals, emitted records, and view derivations.

### Phase B4 — Benchmarks, Convergence Report & Go/No-Go Decision (`#598`)
**Goal:** Measure real performance and document what should (and should not) be shared going forward.

- **Steps:**
  1. Benchmark **MetaKit `Interpreter.prepare` (JS)** vs **Reffect `Metakit.embed` (in-process Rust)** vs **subprocess `reffect-metakit-v1`** on single-step transition + batch evaluation (1k / 10k / 100k rows) and report both raw compute time and wire/serialization cost.
  2. Write `docs/design/598-612-metakit-reffect-FINDINGS.md` recording:
     - Measured parity results and any semantic gaps discovered.
     - Measured latency/throughput numbers (including cold `cargo build` time and binary size).
     - Concrete recommendation on which contracts genuinely eliminate duplication (`PortableArtifactV1`, `ArtifactFingerprint`, `EvidenceKey`, `TaggedUnion`, structured diagnostics) vs what should stay separate in each repo.
- **Exit Criteria:** Findings doc published, `#598` and `#612` updated with measured evidence.

---

## 6. Success Criteria

| Criterion | Concrete Threshold |
|---|---|
| **3-way semantic parity** | 0 mismatches across 200+ randomized expression trees + full adversarial edge-case suite + `CounterAccount` transition matrix (`MetaKit JS` === `Reffect Reference` === `Reffect Rust`). |
| **Sound refusal boundary** | 100% of out-of-fragment inputs (`Opaque`, `Rows`, floats, `Time.*`, `Sets.*`, unbound foreign ops) fail at `check` stage with structured `CompileError` — never silently approximated. |
| **Zero Rust creep in `foldkit-plus`** | `foldkit-plus` has 0 new dependencies, 0 Rust toolchain requirements, and 0 bundle size regression. |
| **Zero external Rust crates** | Generated `reffect_generated` crate has empty `[dependencies]` and passes `cargo clippy -- -D warnings`. |
| **Honest benchmark evidence** | Both in-process (`embed()`) and wire-boundary numbers measured and reported before expanding the fragment beyond v1. |

---

## 7. Review & Verification Protocol (Mandatory Gate After Every Phase)

Every phase (B1, B2, B3, B4) must pass this review loop before moving to the next phase:

1. **Automated checks:**
   - Typecheck (`tsc -b`), lint/format, unit tests, and mutation tests (verify every guard in `checkMetakitSchema`, `checkMetakitNode`, and `metakit_eval` can fail).
   - For B2–B4: `cargo test` + `cargo clippy -- -D warnings` on generated Rust artifacts + full 3-way differential suite.
2. **Adversarial self-review checklist (explicitly audit each item on the phase diff):**
   - **Refusal-before-null:** Does `bool.and(false, refused)` still refuse (not return `false`)? Does `eq.is(null, refused)` refuse? Does `str.len("a\0b")` refuse before null?
   - **Lazy vs eager:** Do inactive `If` / `Match` branches and the fallback of `null.coalesce(nonNull, refused)` stay unevaluated?
   - **Unicode & trim:** Does `str.trim("\u00A0x ")` keep `\u00A0`? Does `str.len("🎉")` return `1` (not `2`)? Does lone surrogate `\uD800` map to `U+FFFD` identically?
   - **Integer bounds:** Does `MAX_SAFE_INTEGER + 1`, `-MAX_SAFE_INTEGER - 1`, and `MAX_SAFE_INTEGER * 2` return `Refusal::UnsafeInteger` without panicking or wrapping?
   - **Prototype & wire safety:** Are `__proto__`, `constructor`, inherited properties, getters/accessors, and truncated/extra wire lines rejected cleanly?
   - **Pre-step `emits`:** Do `Transition` emits read pre-step `state`, not `next_state`?
3. **Independent adversarial subagent review:**
   - After Phase B2 (expression lowering) and after Phase B3 (transition vertical slice), run an independent read-only adversarial reviewer over the diff to hunt for parity holes, silent fallbacks, or unsound shortcuts. Fix every Critical/High finding before advancing.
4. **Commit cadence:**
   - One clean, coherent commit per phase (and follow-up fix commits for review findings) with explicit paths and green verification before moving on.
