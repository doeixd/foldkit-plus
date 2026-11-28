# MetaKit → Reffect Native Adapter Spike Plan (`#598`, `#612`)

**Status:** Revised 2026-11-28 after checking the first draft against the MetaKit and Reffect source. Ready for Phase A.
**Issues:** `#598` (MetaKit / Reffect convergence), `#612` (Foldkit successor native execution boundary), `#645` (portable artifacts)
**Landed in `#610`:** `metakit/artifact` (`PortableArtifactV1`, `ArtifactFingerprint`, `EvidenceKey`), `Expr.matchTags` / `Expr.matchTagsExhaustive`, `Operation.derived` / `expandDerived`, `Interpreter.prepare`.

---

## 1. The question

MetaKit (`doeixd/foldkit-plus`) owns a pure expression calculus over Effect Schema and a single-step `Transition`. Reffect (`doeixd/reffect`) compiles to dependency-free Rust and already lowers `foldkit-entity` queries (`packages/reffect/src/foldkit.ts`).

> Can Reffect run a real MetaKit slice (tagged-message match, guarded `Transition`, named views) natively, with every answer equal to MetaKit's reference evaluator, while the two repositories share only versioned data and neither depends on the other's code?

Speed is measured and reported, not a gate. For scalar rules over a small state there is no reason to expect native code to beat `Interpreter.prepare` by a useful margin, and a subprocess will lose to it. What the spike can establish is a capability (a native Reffect server evaluates MetaKit rules with no JavaScript runtime) and its price (how much adapter, and how tightly coupled).

---

## 2. What checking the source changed

Each row is a claim in the first draft that the code does not keep.

| First draft | What the source says | Consequence |
|---|---|---|
| Reffect installs MetaKit and runs it in a three-way differential test | `metakit` on npm is another project's package (motionbank, 0.4.0); ours has never been published. Reffect pins `effect` 4.0.0 exactly; MetaKit peers on `^4.1.0` | Couple through data files, not a package (D1). The name is a release blocker for all 16 packages that depend on `metakit` and needs its own issue |
| "`reffect` CI compiles and executes real Rust binaries on every PR" | `doeixd/reffect` has no `.github/workflows`; its checks are local (`vp test`, `runtime:check`). Last push 2026-10-09; the local checkout is at 2026-10-06 | Checks in B1–B4 are run locally and reported. Pull before starting |
| The adapter consumes `PortableArtifactV1` plus "Schema/Transition structural descriptors" | `PortableArtifactV1` is `{ codecVersion, node, requiredOps }`. It carries no Schema, and `metakit/artifact` has no Transition encoding. A `Path` is bare string segments | MetaKit must publish both descriptors first (Phase A) |
| `ensures` is validated after the writes | `evaluateStep` (`packages/metakit/src/transition.ts`) never evaluates `ensures`; it is a proof obligation | A Rust step that checked it would refuse where MetaKit succeeds. Carry it as data, do not execute it (D7) |
| Guard refusal returns a separate `ExprRefusal` | `when !== true` gives one `Refused('transition guard evaluated to false')` for false, null and a refusal alike | One guard disposition (D7) |
| Emits are evaluated, then writes | Write values are computed first, in order, then each emit's `when` and fields. Every refusal is collected and the first is reported; no write is applied | Order fixed in D7; it decides which refusal is reported |
| The step starts at the guard | It first checks `input` and `supplied` against their Schemas | Boundary validation is part of the contract (D5, D7) |
| `null.coalesce` is lazy in MetaKit | `Call` evaluates every argument; `coalesceOp` then ignores the fallback when the value is non-null | Lazy code is allowed because it is observationally equal (expressions are pure), not because it mirrors the evaluator (D6) |
| "Core Ops (19)" | The row lists 25, names `eq.oneOf` (the id is `eq.in`), and omits `str.endsWith`, `str.concat`, `str.upperAscii` without a reason | Matrix redone against the 50 ids in `ops/table.ts` (§4) |
| Reject NUL and replace lone surrogates "on the wire boundary" | MetaKit refuses NUL only inside an operator that screens for it; a bare `Path` read returns the string as held, lone surrogates included | Such inputs are outside the profile, not a parity case (D5) |
| D5 gives `Result<Option<Val>, Refusal>` with seven refusals; B2 gives `Value` with a `Null` variant and four | The two sections disagree | One representation (D6) |
| A tagged union lowers to a Rust enum | `matchTags` lowers to `Match` over the path `<subject>._tag`, and each branch reads payload fields as ordinary paths into the same subject. A field its variant lacks reads as null | A path is a nullable slot; no Rust enum is needed (D3) |

---

## 3. Decisions

### D1. The repositories share data, not code
MetaKit emits two JSON documents. Reffect reads them and imports nothing from `foldkit-plus`.

1. A **lowering bundle**: the portable expressions or transition, plus the interface they read (D2).
2. A **conformance corpus**: inputs and the outcome MetaKit's reference evaluator gave for each (D8).

The adapter code lives in `doeixd/reffect`, beside `foldkit.ts`. `foldkit-plus` gains no Rust toolchain and no dependency.

Rejected: a `metakit` dev dependency in Reffect (unpublishable name, Effect version skew, and it would let the adapter read private `Node` structure); Rust code generation inside `foldkit-plus`; extracting a shared semantic IR package before one slice works.

### D2. MetaKit publishes the interface and the transition
The first draft had Reffect walk Effect `SchemaAST` and a live `Transition`. That makes Reffect a second reader of MetaKit's private structure, which drifts. MetaKit owns the encoding instead, in `metakit/artifact`:

```ts
// Illustrative; Phase A fixes the names.
interface PortableSlot {
  readonly path: ReadonlyArray<string>
  readonly kind: 'int' | 'bool' | 'text'
  readonly nullable: boolean // NullOr, optional key, or a field some union variant lacks
}
interface PortableTransitionV1 {
  readonly codecVersion: 1
  readonly slots: ReadonlyArray<PortableSlot>
  readonly when: PortableNode
  readonly writes: ReadonlyArray<{ target: ReadonlyArray<string>; way: 'set' | 'add'; value: PortableNode }>
  readonly emits: ReadonlyArray<{ tag: string; when?: PortableNode; fields: ReadonlyArray<readonly [string, PortableNode]> }>
  readonly ensures?: PortableNode // an obligation for provers; no executor runs it
  readonly requiredOps: ReadonlyArray<PortableOpRef>
}
```

An expression bundle is the same with `node` in place of `when`/`writes`/`emits`. Encoding refuses a `Path` whose Schema is not one of the three scalar kinds, a write way outside the fragment, and `Transition.opaque`. `Artifact.fingerprint` covers the whole bundle, slots included, so a Schema change that alters a slot's kind or nullability changes the fingerprint.

This is the "portable schema/domain identity" that `#645` P1 asks for, and `#646` tooling can read it too.

### D3. Lower over slots, not Rust structs
Every distinct `Path` becomes one input slot holding `Option<Value>`. The host reads the slots; generated Rust never sees a struct or an enum.

- A tagged message is a text slot (`input.msg._tag`) and a nullable slot per payload field (`input.msg.count`). This is exactly how MetaKit's `readSegments` answers the same reads.
- A step returns a plan, not a state: the value of each write in order, and the emitted records. The host applies the writes.
- This matches the precedent in `foldkit.ts`, whose generated functions take `&[Value]`.

Cost: the host marshals slots on every call. B4 measures it. Typed struct binding (so a native Reffect crate passes its own state by reference) is the first widening to consider after B4, and only if that measurement says marshalling dominates.

Rejected: lowering into Reffect's general `Kernel.Expr`. Its `U64Type` wraps; MetaKit's integers are signed, bounded by ±(2^53−1) and refuse on overflow.

### D4. Integers
`int` is Rust `i64`. `num.add`, `num.sub`, `num.mul`, `num.neg` use `checked_*` and then require `|v| <= 9_007_199_254_740_991`, else `Refusal::UnsafeInteger`. A number literal that is not an integer in that range is a compile error, since a `Lit` carries no kind of its own. `Schema.Number`, `num.div`, `num.rem` and `num.mulScaled` are outside v1.

### D5. Text, and the input domain
Text is a native Rust `String`.

| Operator | Rust | Why not the obvious call |
|---|---|---|
| `str.len` | `s.chars().count()` | MetaKit counts code points |
| `str.lt` and friends | `a.cmp(b)` | Rust orders `str` by scalar value, as `byCodePoint` does |
| `str.trim` | `trim_matches(&[' ', '\t', '\n', '\r'][..])` | `str::trim` also strips NBSP and other Unicode space |
| `str.lowerAscii`, `str.upperAscii` | `to_ascii_lowercase`, `to_ascii_uppercase` | A to Z only |
| `str.startsWith`, `endsWith`, `contains`, `concat` | the `str` methods | Equal on well-formed text |

**Profile `metakit/safe-int-k3@1` admits an input only if** every slot value matches its slot's kind and nullability, every integer is within the safe range, and every text is well-formed UTF-16 with no NUL. The boundary refuses anything else as `InputOutsideProfile`, before evaluation. That is a narrowing, declared as such: MetaKit itself returns a lone surrogate or a NUL unchanged from a bare path read, and no Rust `String` can hold the first. The corpus marks such vectors `outsideProfile`; they test the boundary, not parity.

The checker also refuses a text literal holding a NUL or a lone surrogate. With both doors shut, `unportable` cannot arise in v1.

### D6. One evaluation contract
Every expression evaluates to `Result<Option<T>, Refusal>`: `Ok(Some(v))` a value, `Ok(None)` null, `Err` a refusal. `T` is known statically, because the checker types every node from the slot kinds and each operator's signature. A term MetaKit would refuse at run time as `ill-typed` (`ord.lt` over text) is a compile error here.

Refusals that can arise in v1: `UnsafeInteger` and `Unmatched`. Parity compares the refusal's reason, not its message.

- **Strict operators:** arguments evaluate left to right; the first refusal wins, before null; then any null gives null.
- **`bool.and`, `bool.or`:** both arguments evaluate; a refusal wins over a deciding `false`/`true`; then Kleene.
- **`eq.is`, `eq.isNot`, `null.isNull`:** total over null, still propagate a refusal. `eq.equals` is strict.
- **`null.coalesce(a, b)`:** `b` may be skipped when `a` is a value (see §2).
- **`If`:** condition first; `true` takes `then`, `false` takes `otherwise`, null gives null, a refusal is returned. The other arm is not evaluated.
- **`Match`:** subject once, then only the matching arm. Null subject gives `otherwise`, or null without one. A value no case names, with no `otherwise`, is `Unmatched`.

### D7. The step, in MetaKit's order
1. The boundary validates `input` and `supplied` against the profile (D5). MetaKit checks them against their Schemas here.
2. Evaluate `when`. Anything but `true` is `Refused(Guard)`: false, null and a refusal alike.
3. Evaluate every write's value in order, then for each emit its `when` and, if `true`, its fields in order. All of it reads the state before the step. A refusal anywhere gives `Refused(Evaluation(reason))` with the first refusal in that order, and the plan is discarded.
4. Return the write values and the emitted records. `Transition.add` arrives as an ordinary `num.add` call in the write's value.
5. `ensures` is not evaluated.

No effect runs inside the step. Emitted records are data for the host.

### D8. Two legs and a corpus
The first draft's third leg, a "Reffect Reference" evaluator in TypeScript, would be a third implementation of the same semantics with no user. Drop it. Parity is MetaKit's reference evaluator against generated Rust, through a corpus MetaKit writes:

```ts
// Illustrative.
interface ConformanceCorpusV1 {
  readonly profile: 'metakit/safe-int-k3@1'
  readonly metakitCommit: string
  readonly cases: ReadonlyArray<{
    readonly fingerprint: string
    readonly bundle: PortableExprV1 | PortableTransitionV1
    readonly vectors: ReadonlyArray<{ slots: ReadonlyArray<Scalar | null>; outsideProfile?: true; expected: Outcome }>
  }>
}
```

It is generated by a seeded, type-directed generator plus a fixed adversarial list, and checked into Reffect at a recorded MetaKit commit. Coverage is stated by class, not by count: every admitted operator appears with a null in each position, a refused operand in each position, and its boundary values; every structural node appears with a refused untaken arm.

The same corpus can hold any later reader to the reference (a WASM target, another SQL dialect), which is what Reffect's `docs/reuse-strategy.md` asks for under "reuse Foldkit-Plus's conformance tests".

### D9. Identity and execution modes
- The bundle carries its MetaKit fingerprint. Reffect treats it as opaque and derives its cache key from the fields `Artifact.evidenceKey` already takes: `reader: { id: 'reffect/metakit-rust', version }`, `profile: 'metakit/safe-int-k3@1'`, `fingerprint`. Reffect cannot recompute the fingerprint without MetaKit's canonical JSON rules; publishing those is an open item (§9).
- Subprocess line protocol `reffect-metakit-v1` for corpus replay, mirroring `reffect-query-v1`. `Metakit.embed(...)` for in-process calls from a Reffect crate, mirroring `Foldkit.embed`; benchmarks use this one.

---

## 4. Fragment v1

All 50 core operator ids are accounted for: 28 admitted, 22 refused.

| | Admitted | Refused with a `CompileError` |
|---|---|---|
| **Slot kinds** | `int` (`Schema.Int`), `bool`, `text` (`Schema.String`, `Schema.Literals` of strings, a `_tag`), each optionally nullable | `Schema.Number`, arrays, records, `Schema.Option`, any non-scalar read |
| **Nodes** | `Lit` (integer, boolean, text, null), `Path`, `Call`, `If`, `Match` | `Rows`, a foreign call (expand derived operations before encoding). `Opaque` never encodes |
| **Operators** | `bool.and` `or` `not`; `eq.is` `isNot` `equals`; `ord.lt` `lte` `gt` `gte`; `num.add` `sub` `mul` `neg`; `null.isNull` `coalesce`; `str.len` `trim` `lowerAscii` `upperAscii` `startsWith` `endsWith` `contains` `concat` `lt` `lte` `gt` `gte` | `num.div` `rem` `mulScaled`; `eq.in` `among`; `arr.*` (7); `set.*` (5); `time.*` (5) |
| **Writes** | `set`, `add` | `combine`, the list and set ways, `Transition.opaque` |

---

## 5. The slice: `CounterAccount`

- **State:** `{ count: Schema.Int, limit: Schema.Int, status: Schema.Literals(['open', 'frozen']), note: Schema.NullOr(Schema.String) }`
- **Message:** `Increment {}` | `Decrement {}` | `SetCount { count }` | `Add { delta }` | `Freeze {}`
- **Views:** `remaining` = `Num.sub(limit, count)`; `canIncrement` = `Bool.and(Eq.is(status, 'open'), Ord.lt(count, limit))`; `noteLen` = `Null.coalesce(Str.len(Str.trim(note)), 0)`
- **Transition `UpdateCounter`:** `nextCount` by `Expr.matchTagsExhaustive(input.msg, …)`; guard `status` is open and `0 <= nextCount <= limit`; `set(count, nextCount)`; emit `CountChanged { previous, next }` when `nextCount` differs from `count`.

`Freeze` writes `status`, so the slice needs either a second write under a `Match` or a second transition. Decide in A2; a second transition keeps each one readable.

---

## 6. Phases

### Phase A: MetaKit publishes the contract (`foldkit-plus`, TypeScript only)
Worth doing whatever B concludes: it closes part of `#645` and feeds `#646`.

- **A1.** `Artifact.encodeTransition` and the slot interface on expression bundles (D2), with validated decoding, fingerprinting and refusals for everything outside the fragment. Type tests, unit tests, a mutation spec, Jev review, changelog and skill reference.
- **A2.** The corpus generator (D8) and the `CounterAccount` fixture, writing one deterministic JSON file. A test proves two runs with one seed are byte-equal.
- **A3.** `packages/metakit/docs/semantics.md` gains the step order (D7) and the profile's definition (D5), each sentence checked against the source.
- **Exit:** a corpus file at a known commit; no Rust anywhere.

### Phase B1: checker (`reffect`)
Read Reffect's `AGENTS.md` and pull first. Decode the bundle as untrusted JSON with depth and node limits, type every node, resolve every path to a slot, and refuse everything outside §4 with a `CompileError` naming the path. No Rust is emitted.

- **Tests:** each admitted form accepted; each refused operator, node, kind and literal refused with its code; an out-of-scope path; `__proto__` and `constructor` as keys; an ill-typed call.

### Phase B2: runtime, expression lowering, corpus replay
`metakit_eval.rs` (zero crates) and `emitMetakitExpr` through Reffect's `Rs` emitter, then `Metakit.compile`, `embed`, `build`, `run`.

- **Exit:** every expression vector in the corpus agrees; every `outsideProfile` vector is refused at the boundary; `cargo test` and `cargo clippy -- -D warnings` clean.

### Phase B3: the transition
Lower the step (D7) and replay the `CounterAccount` vectors: open and frozen, in and out of bounds, null and non-null note, the suppressed emit, overflow, each guard disposition.

- **Exit:** dispositions, write values and emitted records agree on every vector. Changing one expression changes the fingerprint and misses the cache; changing a slot's nullability does too.

### Phase B4: measure and decide
Benchmark `Interpreter.prepare` against `Metakit.embed` and the subprocess, on one step and on batches of 1k, 10k and 100k, reporting compute and marshalling separately, plus cold `cargo build` time and binary size. Write `docs/design/598-612-metakit-reffect-FINDINGS.md` and update `#598` and `#612`.

---

## 7. What decides the outcome

| Outcome | Condition |
|---|---|
| **Go** (keep the adapter, consider widening) | Zero mismatches on the corpus; the adapter reads only the bundle and corpus; nothing in MetaKit's semantics changed to make Rust agree |
| **Narrow** | A class of vectors cannot agree without a semantic change: remove that operator or kind from the profile and say so |
| **Stop** | The adapter needs MetaKit's private structure, or agreement needs a second semantics |

Widening the fragment (arrays, `Rows`, floats, struct binding) needs a named consumer first. The likeliest is a native Reffect Remote or RPC handler that evaluates a guard or policy with no JavaScript runtime. A benchmark number alone does not justify it.

---

## 8. Review after each phase

1. **Checks.** Phase A follows this repository's rules (project typecheck, the phase's tests, `pnpm mutate`, Jev on the API change). Phases B follow Reffect's own, run locally.
2. **Self-review against the source**, one question per decision: does `bool.and(false, refused)` refuse; is an untaken arm's refusal silent; does `str.trim` keep NBSP; is `str.len` of an emoji 1; do the three overflow cases refuse without a panic; is a guard that refuses reported as a guard failure; is the first refusal the first write's, not the first emit's; is `ensures` untouched.
3. **An independent reviewer** after B2 and after B3, given the diff and the corpus, not this plan's conclusions.
4. **Commits** are small and per unit of work, with explicit paths.

---

## 9. Open items

- **The npm name.** `metakit` cannot be published. Not this plan's work, but it blocks every release that includes MetaKit.
- **Canonical JSON.** Publish the fingerprint's canonicalisation rules so a consumer without MetaKit can verify a bundle.
- **Not verified for this revision:** whether `Artifact.encodeExpr` already refuses a NUL in a text literal; what changed in Reffect between the local checkout (2026-10-06) and `origin/master` (2026-10-09); the first draft's claim that `Money`, `Decimal` and `CalendarDay` are integer-backed (dropped from v1 until checked).
