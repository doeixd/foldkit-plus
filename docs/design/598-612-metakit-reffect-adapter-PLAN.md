# MetaKit → Reffect Native Adapter Spike Plan (`#598`, `#612`, `#649`)

**Status:** Third revision, 2026-11-28. Checked against the MetaKit source at `364a88ada` and Reffect `origin/master` at `c3be420`. Ready for Phase A.
**Issues:** `#598` and `#612` (their 2026-11-27 comments ask for this spike), `#649` §8 (the same adapter, sequenced as its P3), `#645` (portable artifacts), `#597` (per-target refusal).

---

## 0. How to use this plan

If you are implementing a step, read these in order and nothing else first:

1. §2 (words this plan uses), §3 (what MetaKit does today; every rule there was read from the source and names the function).
2. The step you were given in §8 (Phase A, this repository) or §9 (Phase B, the Reffect repository).
3. The section that step points at (§5 fragment, §6 formats).

Rules that hold for every step:

- **§3 is the authority, the source is above it.** If the code disagrees with §3, the code wins: stop, fix §3 in the same commit, and say so in your report. Never change MetaKit's behaviour to make Rust agree.
- **Do not widen.** Anything not listed as admitted in §5 is refused with a located error. Do not add an operator, a kind or a write because it "is easy".
- **Refuse, do not approximate.** No default, no fallback value, no silent skip.
- **Each step ends with its "Done when" list satisfied and its own tests able to fail** (mutate the guard, see the test go red, revert).
- Phase A follows this repository's `CLAUDE.md`. Phase B follows Reffect's `AGENTS.md`, which differs (§9.0).

---

## 1. The question

MetaKit (`packages/metakit` here) is a library of pure expressions and single-step state transitions that several readers interpret: a JavaScript evaluator, SQL, a solver. Reffect (`doeixd/reffect`) compiles a small typed language to dependency-free Rust and already runs `foldkit-entity` queries that way (`packages/reffect/src/foldkit.ts`).

> Can Reffect run a real MetaKit slice (a tagged-message match, a guarded transition, named views) natively, with every answer equal to MetaKit's JavaScript evaluator, while the two repositories share only versioned data files?

Speed is measured and reported, not a gate. What the spike can establish is a capability (a native Reffect server evaluates MetaKit rules with no JavaScript runtime, which `#649` §8 asks to be demonstrated) and its price (how much adapter, how tightly coupled).

---

## 2. Vocabulary

| Word | Meaning here |
|---|---|
| **Expression** | A MetaKit `Expr<Env, A>`: an immutable tree of nodes (`Lit`, `Path`, `Call`, `If`, `Match`, plus `Rows` and `Opaque`, which this spike refuses). |
| **Path** | A node that reads the environment at a list of string segments, such as `['state', 'count']`. |
| **Null** | Absence. A missing key and an explicit `null` read the same. |
| **Refusal** | The evaluator declining to answer, with a reason such as `unsafe-integer` or `unmatched`. Not null, and not an exception. |
| **Three-valued logic** | A boolean expression gives true, false or null, as SQL's does. |
| **Reference evaluator** | `evalNode` in `packages/metakit/src/ops/eval.ts` for expressions, `evaluateStep` in `src/transition.ts` for steps. Every other implementation is judged against these. |
| **Transition** | A guard (`when`), a list of writes, and a list of emitted records, all computed from the state before the step. |
| **Slot** | One distinct path an expression reads, with its kind (`int`, `bool`, `text`) and whether it may be null. The host supplies one value per slot. |
| **Bundle** | The JSON document MetaKit writes for one expression or transition: its nodes plus its slots. |
| **Profile** | A named, bounded fragment with exact semantics. This spike defines one: `metakit/safe-int-k3@1` (§5). |
| **Corpus** | A JSON file of bundles, each with input vectors and the outcome the reference evaluator gave. |
| **Vector** | One assignment of values to a bundle's slots, with the expected outcome. |

---

## 3. What MetaKit does today

Every rule below must hold in Rust. Paths are relative to `packages/metakit/src`.

### 3.1 Expressions (`ops/eval.ts`, `node.ts`)

`evalNode` returns a value, `null`, or a `Node.Refusal`.

- **`Lit`** gives its value.
- **`Path`** (`readSegments`) walks the segments; a missing key, a non-object, `null` or `undefined` anywhere gives `null`.
- **`Call`** evaluates **every** argument, left to right, then applies the operator through `Node.applying`:
  - A **strict** operator (`nulls: 'strict'`): if any argument is a refusal, return the first one in argument order. Otherwise, if any argument is null, return null. Otherwise compute.
  - An **own-null** operator (`nulls: 'own'`) receives nulls and refusals and decides for itself (table below).
- **`If`** (`ifArm`) evaluates the condition. `true` evaluates and returns `then`; `false` does the same with `otherwise`; null returns null; a refusal returns that refusal. The other arm is never evaluated.
- **`Match`** (`matchArm`) evaluates the subject once. A refusal returns that refusal. Otherwise the first case whose label equals the subject is evaluated and returned. With no matching case: `otherwise` if there is one (this includes a null subject); else null if the subject is null; else a refusal with reason `unmatched`.

### 3.2 Operators in the fragment

`T` is any one kind. "Strict" means the strict rule above applies before the formula.

| Id | Arguments → result | Null rule | Formula, and the trap |
|---|---|---|---|
| `bool.not` | bool → bool | strict | `!a` |
| `bool.and` | bool, bool → bool | own | A refusal in either argument wins, **even when the other is `false`**. Then `false` if either is false. Then null if either is null. Else true. (`kleene` in `ops/bool.ts`) |
| `bool.or` | bool, bool → bool | own | As `bool.and` with true and false exchanged. |
| `eq.is` | T, T → bool | own | A refusal wins. Else true when both are null or both are equal values; **never null**. |
| `eq.isNot` | T, T → bool | own | The negation of `eq.is`. Never null. |
| `eq.equals` | T, T → bool | strict | Equality. Null if either side is null. |
| `ord.lt` `lte` `gt` `gte` | int, int → bool | strict | Integer comparison. |
| `num.add` `sub` `mul` | int, int → int | strict | Refuses `unsafe-integer` when the exact result is outside ±9 007 199 254 740 991. Never wraps. |
| `num.neg` | int → int | strict | As above. |
| `null.isNull` | T → bool | own | A refusal wins. Else whether the argument is null. Never null. |
| `null.coalesce` | T, T → T | own | `a` if it is not null (a refused `a` is returned as the refusal), else `b`. When `a` is a value, a refusal in `b` does **not** reach the answer. |
| `str.len` | text → int | strict | Count of Unicode code points, not UTF-16 units and not bytes. An emoji is 1. |
| `str.trim` | text → text | strict | Removes leading and trailing space, tab, line feed and carriage return **only**. A no-break space stays. |
| `str.lowerAscii` `upperAscii` | text → text | strict | Changes A–Z or a–z only. `É` stays. |
| `str.startsWith` `endsWith` `contains` | text, text → bool | strict | Substring tests. |
| `str.concat` | text, text → text | strict | Concatenation. |
| `str.lt` `lte` `gt` `gte` | text, text → bool | strict | Order by code point (`byCodePoint`), which is **not** JavaScript's `<` on strings. |

`num.neg(0)` and `num.mul(0, -5)` give `0`: the evaluator normalises `-0` away.

### 3.3 A step (`evaluateStep` in `transition.ts`)

1. If `input` is not a value of the transition's input Schema: refuse. The same for `supplied`.
2. Evaluate `when`. If the result is not exactly `true` (so: false, null, **or a refusal**): refuse, with the message `transition guard evaluated to false`.
3. Evaluate the value of every write, in order. Then, for each emitted record in order: evaluate its `when` (absent means true); if that is exactly `true`, evaluate its fields in order. Everything reads the state **before** the step. Every refusal met on the way is collected.
4. If any refusal was collected, refuse with the **first** one collected. No write is applied.
5. Apply the writes in order and return `{ state, emitted }`.

Three things the first draft got wrong, so check them twice:

- **`ensures` is never evaluated.** It is stored on the transition for provers.
- **A refused guard is a guard failure**, not an evaluation refusal.
- **Write values come before emits.** That decides which refusal is "first".

`Transition.add(target, amount)` stores its value as an ordinary `num.add(target, amount)` call, so a reader needs no special case for it. `Transition.make` already refuses two writes to one target.

Today every failure is `new Refused({ reason: string })`, so a caller can tell a guard failure from a refused evaluation only by reading the message. Step A1 fixes that.

### 3.4 What the portable codec carries (`artifact.ts`)

- `PortableArtifactV1` is `{ codecVersion: 1, node, requiredOps }`. No Schema, no slots, no transition.
- A portable `Path` is `{ _tag: 'Path', segments }`: the Schema it was built from is dropped.
- `encodeLiteral` accepts any finite number that is not `-0`, and any string, including one holding a NUL.
- `resolveAstSegments`, `kindOfAst`, `inferNodeKind` and `kindCompatible` already resolve a path against a root Schema and name its kind. `resolveAstSegments` adds null when only some members of a union have the field. Reuse these; do not write a second resolver.
- `Language.readiness(expr, target)` in `language.ts` already reports each unsupported node with its path, for targets `portable`, `js`, `sql` and `z3`.

### 3.5 How a tagged match is built (`buildTagMatch` in `expr.ts`)

`Expr.matchTagsExhaustive(subject, cases)` becomes a `Match` whose subject is the path `<subject>._tag`. Each case reads its payload through ordinary paths into the same subject, for example `input.msg.count`.

**Trap.** Inside the `SetCount` case the path `input.msg.count` carries the Schema of that one variant, where `count` is never null. Read against the whole message it is null for every other variant. A slot's nullability must therefore come from resolving the segments against the **root** Schema, never from the Schema attached to the path node.

---

## 4. Decisions

### D1. The repositories share data, not code
MetaKit writes two kinds of JSON: bundles and a corpus. Reffect reads them and imports nothing from this repository.

Why not a package dependency:

- `metakit` on npm is another project's package (motionbank, 0.4.0). Ours has never been published and cannot be under that name.
- Reffect pins `effect` 4.0.0 exactly; MetaKit peers on `^4.1.0`.
- A dependency would let the adapter read MetaKit's private node structure.

Reffect's existing Foldkit test imports `cases` and `rows` from `foldkit-entity/conformance`. The corpus file is the same idea without the install.

### D2. MetaKit owns the encoding and the profile
Reffect must not walk Effect `SchemaAST` or a live `Transition`: that would be a second reader of private structure. MetaKit publishes the slots, the transition encoding and the profile's definition (§6, steps A2–A3). `#645` P1 asks for a "portable schema/domain identity", and `#649` §5 for bounded profiles with a located support report; this is one small instance of both, built on `Language.readiness` rather than beside it.

### D3. Lower over slots, not Rust structs
Generated Rust takes `&[Slot]` and never sees a struct or an enum. A tagged message is a text slot for `_tag` and a nullable slot per payload field (§3.5). A step returns the write values and the emitted records; the host applies the writes.

This follows `foldkit.ts`, whose generated functions take `&[Value]`. The cost is marshalling on every call, which B4 measures. Binding to a caller's own Rust struct is the first widening to consider afterwards, and only if marshalling dominates.

### D4. A dedicated evaluator module, not Reffect's `R` language
`#598` (2026-11-27) and `#649` §8 picture lowering into an `R` program, which would give `Reference.run` and `Compile.run` for free. That does not fit today, and this is a deliberate deviation the findings must report:

- `R`'s numbers are `R.U64` (wraps modulo 2^64) and an IEEE `Number`. MetaKit integers are signed, bounded by ±(2^53−1), and refuse on overflow.
- `R` has no three-valued null; `R.Option` and `R.Result` are tagged data with their own semantics.
- Reffect's Rust target "accepts only verified built-in operations and representations", so a checked safe-integer type would be new kernel work in Reffect, larger than the adapter.

So there is no "Reffect Reference" leg. The existing Foldkit adapter has none either: its oracle is `foldkit-entity`'s evaluator. **Revisit** if Reffect gains a checked signed integer witness and a null-carrying value in `R`.

### D5. Numbers and text
Integers are Rust `i64`, with `checked_*` arithmetic and a range test. Text is a Rust `String`:

| Operator | Rust | Not this |
|---|---|---|
| `str.len` | `s.chars().count()` | `s.len()` (bytes) |
| `str.lt` and friends | `a.cmp(b)` on `&str` | anything locale-aware |
| `str.trim` | `s.trim_matches(&[' ', '\t', '\n', '\r'][..])` | `s.trim()` (strips Unicode space too) |
| `str.lowerAscii`, `upperAscii` | `to_ascii_lowercase()`, `to_ascii_uppercase()` | `to_lowercase()` |
| `startsWith`, `endsWith`, `contains`, `concat` | the `str` methods | |

Rust orders `str` by Unicode scalar value, which is `byCodePoint`'s order. Substring tests agree with JavaScript's on well-formed text.

### D6. The profile narrows the input domain, and says so
`metakit/safe-int-k3@1` admits a vector only if every slot value has its slot's kind and nullability, every integer is within ±(2^53−1), every text is well-formed UTF-16 without a NUL, and a slot with a literal set holds one of its literals.

MetaKit itself is wider: a bare path read returns a NUL or a lone surrogate unchanged, and a Rust `String` cannot hold a lone surrogate at all. The boundary refuses such a vector as outside the profile, before evaluating. Reffect's divergence register already records the same choice for cookies ("Refuse lone surrogates in R strings throughout").

Consequences: a text literal holding a NUL or a lone surrogate is refused when the bundle is encoded, and the refusal reasons that can arise at run time in v1 are exactly `unsafe-integer` and `unmatched`.

### D7. One evaluation contract in Rust
Every expression has the Rust type `Result<Option<T>, Refusal>`: `Ok(Some(v))` a value, `Ok(None)` null, `Err(r)` a refusal. `T` is fixed at compile time, because the checker types every node (§9, B1). A term the reference evaluator would refuse at run time as `ill-typed`, such as `ord.lt` over text, is a compile error instead.

`null.coalesce` may skip its second argument when the first is a value. The reference evaluator computes it and throws it away, and expressions are pure, so the two cannot be told apart.

### D8. Two legs and a corpus
Parity is the reference evaluator against generated Rust, through a corpus MetaKit writes. The corpus is copied into Reffect at a recorded commit.

Coverage is stated by class, not by count. Every admitted operator appears with: a null in each argument position, a refusal in each position, its boundary values (§8, A4). Every `If` and `Match` appears with a refusing arm that is not taken.

A third leg belongs on the MetaKit side: A5 replays the corpus through the SQL reader, as Reffect's Foldkit test compares `evaluate`, SQLite and Rust. It gives the corpus a second consumer in this repository.

### D9. Identity and how the code is run
- A bundle carries its fingerprint. Reffect treats it as opaque and builds its cache key from the fields `Artifact.evidenceKey` takes: `reader: { id: 'reffect/metakit-rust', version }`, `profile: 'metakit/safe-int-k3@1'`, `fingerprint`.
- Two ways to run: a subprocess speaking the line protocol in §6.3 (for corpus replay, as `reffect-query-v1` is today), and `Metakit.embed(...)` returning Rust source for another generated crate to call (as `Foldkit.embed` does). Benchmarks use the second.

### D10. Step outcomes use three names
`#612` §5 lists rejection, successful no-op, stale target and committed change. A single MetaKit step can produce three of them, and the adapter reports exactly these:

| Adapter outcome | When | `#612` name |
|---|---|---|
| `guard` | `when` was not `true` | rejection |
| `refused(reason)` | a write value or an emit refused | rejection, with the reason |
| `ok(writes, emitted)` | otherwise | committed change; a no-op is `ok` whose writes equal the current values, which the host can see |

"Stale target" belongs to the host that owns versions, not to a step.

---

## 5. Profile `metakit/safe-int-k3@1`

All 50 core operator ids in `ops/table.ts` are accounted for: 28 admitted, 22 refused.

| | Admitted | Refused, with the located reason |
|---|---|---|
| **Slot kinds** | `int`: `Schema.Int`, and anything that is `Schema.Int` plus annotations (`Money`, `Decimal` in `src/domain`). `bool`: `Schema.Boolean`. `text`: `Schema.String`, `Text.schema`, `Schema.Literals` of strings, a `_tag`. Each may also be null (`Schema.NullOr`, an optional key, a field only some union members have). | `Schema.Number` without the integer check, arrays, records, structs read whole, `Schema.Option`, and any Schema check the slot cannot carry (a range, a pattern, a length) |
| **Nodes** | `Lit` (a safe integer, a boolean, admissible text, null), `Path`, `Call`, `If`, `Match` over a text subject | `Rows`; a foreign call (run `Operation.expandDerived` first). `Opaque` already fails to encode |
| **Operators (28)** | `bool.and` `or` `not`; `eq.is` `isNot` `equals`; `ord.lt` `lte` `gt` `gte`; `num.add` `sub` `mul` `neg`; `null.isNull` `coalesce`; `str.len` `trim` `lowerAscii` `upperAscii` `startsWith` `endsWith` `contains` `concat` `lt` `lte` `gt` `gte` | `num.div` `rem` `mulScaled`; `eq.in` `among`; `arr.*` (7); `set.*` (5); `time.*` (5) |
| **Writes** | `set`, `add` | `combine`, every list and set way, `Transition.opaque` |
| **Limits** | depth 64, 2 048 nodes per expression (MetaKit's `DEFAULT_LIMITS`) | anything larger |

Why refuse Schema checks on a slot: step 1 of §3.3 refuses an input outside its Schema. A slot that silently dropped `isGreaterThan(0)` would let Rust evaluate a value MetaKit refuses.

---

## 6. Formats

Names are proposals; A3 fixes them. Shapes are requirements.

### 6.1 Bundle

```ts
type Scalar = number | boolean | string

interface PortableSlot {
  readonly path: ReadonlyArray<string>
  readonly kind: 'int' | 'bool' | 'text'
  readonly nullable: boolean
  readonly literals?: ReadonlyArray<string> // text only: the admitted values
}

interface PortableExprBundleV1 {
  readonly _tag: 'Expr'
  readonly codecVersion: 1
  readonly profile: 'metakit/safe-int-k3@1'
  readonly slots: ReadonlyArray<PortableSlot> // sorted by JSON.stringify(path), no duplicates
  readonly node: PortableNode
}

interface PortableTransitionBundleV1 {
  readonly _tag: 'Transition'
  readonly codecVersion: 1
  readonly profile: 'metakit/safe-int-k3@1'
  readonly slots: ReadonlyArray<PortableSlot>
  readonly when: PortableNode
  readonly writes: ReadonlyArray<{
    readonly target: ReadonlyArray<string>
    readonly kind: 'int' | 'bool' | 'text'
    readonly nullable: boolean
    readonly way: 'set' | 'add'
    readonly value: PortableNode
  }>
  readonly emits: ReadonlyArray<{
    readonly tag: string
    readonly when?: PortableNode
    readonly fields: ReadonlyArray<readonly [string, PortableNode]>
  }>
  readonly ensures?: PortableNode // carried for provers; no executor evaluates it
}
```

`PortableNode` is the existing type in `artifact.ts`, unchanged. Slots are sorted so that two encodings of one transition are byte-equal. The fingerprint is `sha256:` over the canonical JSON of the whole bundle, slots included.

### 6.2 Corpus

```ts
interface ConformanceCorpusV1 {
  readonly format: 'metakit-conformance@1'
  readonly profile: {
    readonly id: 'metakit/safe-int-k3@1'
    readonly operators: ReadonlyArray<string> // the 28, sorted
    readonly kinds: ReadonlyArray<'int' | 'bool' | 'text'>
    readonly nodes: ReadonlyArray<string>
    readonly writes: ReadonlyArray<string>
    readonly limits: { readonly maxDepth: number; readonly maxNodes: number }
  }
  readonly seed: number
  readonly cases: ReadonlyArray<{
    readonly name: string
    readonly fingerprint: string
    readonly bundle: PortableExprBundleV1 | PortableTransitionBundleV1
    readonly vectors: ReadonlyArray<{
      readonly slots: ReadonlyArray<Scalar | null> // one per bundle slot, in order
      readonly expected: Outcome
    }>
  }>
}

type Outcome =
  | { readonly value: Scalar | null }                      // an expression's answer
  | { readonly refused: 'unsafe-integer' | 'unmatched' }
  | { readonly step: 'guard' }
  | { readonly step: 'refused'; readonly reason: 'unsafe-integer' | 'unmatched' }
  | { readonly step: 'ok'; readonly writes: ReadonlyArray<Scalar | null>;
      readonly emitted: ReadonlyArray<{ readonly tag: string; readonly fields: ReadonlyArray<Scalar | null> }> }
  | { readonly outsideProfile: string }                    // the boundary must refuse; the text says why
```

The file holds no commit hash and no date, so regenerating it is byte-equal. Reffect records the MetaKit commit beside its copy.

### 6.3 Line protocol `reffect-metakit-v1`

The generated binary takes the entry name as its first argument and reads standard input, lines separated by LF.

```text
reffect-metakit-v1
<number of vectors>
<one token per slot, one per line, for each vector in turn>
```

Tokens: `n` null, `t` true, `f` false, `i<decimal>` an integer (`i-12`), `s<lowercase hex of the UTF-8 bytes>` text (`s` alone is the empty string).

One answer per vector on standard output:

```text
v <token>          an expression's value
r <reason>         a refusal: unsafe-integer or unmatched
x                  the vector is outside the profile
g                  step: guard not met
ok <W> <E>         step: W write tokens follow one per line, then E records
e <tag hex> <F>    one emitted record: F field tokens follow one per line
```

Extra or missing input lines are an error and a non-zero exit, as in `foldkit-runtime.ts`. A lone surrogate cannot be written as UTF-8, so the TypeScript host checks `isWellFormed()` and answers `x` itself without sending the vector.

---

## 7. The slice: `CounterAccount`

- **State:** `{ count: Schema.Int, limit: Schema.Int, status: Schema.Literals(['open', 'frozen']), note: Schema.NullOr(Schema.String) }`
- **Message** (input of `UpdateCounter`): `Increment {}` | `Decrement {}` | `SetCount { count: Schema.Int }` | `Add { delta: Schema.Int }`
- **Views** (three expression bundles):
  - `remaining` = `Num.sub(state.limit, state.count)`
  - `canIncrement` = `Bool.and(Eq.is(state.status, 'open'), Ord.lt(state.count, state.limit))`
  - `noteLen` = `Null.coalesce(Str.len(Str.trim(state.note)), 0)`
- **Transition `UpdateCounter`:** `nextCount` = `Expr.matchTagsExhaustive(input.msg, …)`; guard: `status` is `'open'` and `0 <= nextCount <= limit`; write `set(count, nextCount)`; emit `CountChanged { previous: count, next: nextCount }` when `Eq.isNot(nextCount, count)`.
- **Transition `Freeze`** (empty input): guard `Eq.is(status, 'open')`; write `set(status, 'frozen')`; emit `Frozen {}` with no condition and no fields.

`Freeze` is a second transition because it writes a text field, emits unconditionally and has no input: three shapes `UpdateCounter` lacks.

---

## 8. Phase A: MetaKit publishes the contract (this repository, TypeScript only)

Phase A is worth doing whatever Phase B concludes: A1 is a defect fix, A2–A3 serve `#645` and `#649` §5, A4 gives every later reader a test.

**Before any step:** read `docs/agents/traps-types.md`, `traps-tests-general.md`, `traps-tests-mutation.md`, `traps-effect-4.md` and `traps-claims.md`. Run `git status`; other sessions share this tree. `examples/metakit/src/forma/` is another session's untracked work: do not touch or stage it.

**Inner loop for every step:** `pnpm exec tsc -b packages/metakit` and the one test file, run from the repository root (`npx vitest run packages/metakit/test/<file> --project unit`). The whole list (format, `pnpm lint:cached`, `pnpm mutate <spec>`, `pnpm mutate:check`, Jev) runs once, at the end of the step.

**Committing:** one command with explicit paths, `git add <new files> && git commit -m "…" -- <paths>`; then `git show --stat HEAD`; then push. Never `git add -A`, `git stash`, `git checkout -- <file>`, a new branch or a worktree.

### A1. A step refusal says what refused
**Why.** §3.3: five different failures share `Refused({ reason })`, and its doc comment claims only the guard. The corpus (A4) needs to tell `guard` from `refused` without parsing a message.

**Change** `src/transition.ts`:
- `Refused` gains `cause: 'input' | 'supplied' | 'guard' | 'evaluation' | 'write'` and `refusal: Option.Option<Node.Refusal>` (some only for `'evaluation'`). Keep `reason`.
- Set them at each of the five `new Refused` sites in `evaluateStep` and `writeAt`. Fix the doc comment.
- `new Refused(` also appears in `packages/metakit/src/sqlStatements.ts` and `packages/composition/src/operation.ts` (check whether the second is MetaKit's class or its own). Grep `packages/` and `examples/` again, case-insensitively, for every construction and every reader of `.reason`. Do not guess a cause: read what each site refuses, and add a cause to the union if a site fits none of the five.

**Tests** in `packages/metakit/test/`. There is no single transition test file (`transition-path.test.ts`, `transition-lists.test.ts`, `transition-opaque-lift.test.ts`, `transition-idempotent.test.ts`); add `transition-refused.test.ts`:
- One case per cause, asserting `cause` and, for `evaluation`, the refusal's `reason`.
- A guard that itself refuses (for example `Ord.lt(Num.add(state.n, 1), 0)` with `n` at the maximum) gives `cause: 'guard'`.
- Two refusing writes and one refusing emit: the reported refusal is the first write's.

**Mutations** (add to the transition mutation spec): swap two causes; report the last collected refusal instead of the first.

**Also:** changelog entry under Unreleased; the skill reference for MetaKit if it documents `Refused`; Jev review (`npx jev-pref review --hunks --include <changed public files>`).

**Done when:** the tests above pass and each mutation is killed; `pnpm exec tsc -b packages/metakit` and the examples' unit tests (`npx vitest run examples --project unit`) are green.

### A2. The profile as a readiness target
**Change** `src/language.ts`:
- Add a variant to `ReadinessTarget` for a profile, carrying its id, its admitted operator ids, node tags and limits. Follow how the `sql` variant is declared and matched. `Match.exhaustive` will point at every place that must handle it.
- Export the constant for `metakit/safe-int-k3@1` with exactly the 28 operators of §5.
- `readiness` reports, with the node's path: an operator outside the set, a `Rows` or foreign node, a literal that is not a safe integer, a boolean, null or admissible text (D6).

Kinds are **not** checked here: `readiness` sees no root Schema. A3 checks slot kinds, and B1 types every node.

**Tests** (extend `test/language.test.ts`, type tests in `test/language.test-d.ts`, mutations in `test/language.mutations.ts`): a table of one expression per refused operator family, each asserting the reported path and reason; one admitted expression per admitted operator giving an empty report; a type test that the constant's operator ids are a subset of `Node.CoreOpId` (so a renamed operator fails to compile).

**Mutations:** drop one operator from the set; admit `num.div`; skip the literal check.

**Done when:** as A1. Changelog and Jev as A1.

### A3. Bundles
**Change** `src/artifact.ts` (add near `encodeExpr`; reuse `visit`'s node encoding, `resolveAstSegments`, `kindOfAst`, `stableStringify`, `sha256Hex`):

- `encodeExprBundle(expr, { env: Schema, profile })` and `encodeTransitionBundle(transition, { profile })`, each an `Effect` failing with the existing `UnsupportedNodeError` (or a sibling error that carries the readiness report; decide by reading how `UnsupportedNodeError` is used, and keep one way).
- Steps, in this order:
  1. Run `Language.readiness` (A2) on every expression: for a transition, `when`, each write value, each emit's `when` and fields, and `ensures` if present. Fail with the report if it is not empty.
  2. Collect every distinct path. For a transition the root Schema is `Schema.Struct({ state, input, supplied })` built from `stateSchema`, `inputSchema`, `suppliedSchema`; refuse a transition where one of those is `Option.none()`.
  3. For each path, resolve its segments against the **root** (§3.5 trap). Refuse if it does not resolve, if its kind is not `int`, `bool` or `text`, or if its Schema has a check other than the integer check and the no-NUL check of `Text.schema` (`declaresNoNul` in `ops/kind.ts`).
  4. Work out `nullable`. Probe how each of these appears in `SchemaAST` before coding it, and test each: `Schema.NullOr`, `Schema.optional`, `Schema.optionalKey`, a field present in only some members of a union.
  5. For a `Schema.Literals` of strings, fill `literals`. A `_tag` slot's literals are the union's tags.
  6. Sort the slots; encode the nodes; for writes, record the target's kind and nullability the same way and refuse a `way` other than `set` or `add`.
- `PortableBundleV1` as an Effect `Schema` (a union of the two shapes), so a consumer inside this repository can decode one. No function rebuilds a live `Transition` from a bundle: nothing needs it.
- `fingerprintBundle(bundle)`, canonical JSON then SHA-256, as `fingerprint` does.

**Tests** (new file `packages/metakit/test/bundle.test.ts`):
- The five `CounterAccount` bundles (§7) encode; a snapshot of each slot list written out by hand in the test, not generated.
- `input.msg.count` is `nullable: true` and `input.msg._tag` has the four tags as `literals`.
- Each refusal: a float path, an array path, a struct read whole, `Schema.Option`, a ranged integer, `Transition.opaque`, a list write, a missing input Schema, a NUL text literal, a lone-surrogate literal, `1.5` as a literal, `2 ** 53` as a literal.
- Encoding twice is byte-equal; reordering two independent emits changes the fingerprint; changing a field from `Schema.Int` to `Schema.NullOr(Schema.Int)` changes the fingerprint; renaming a TypeScript variable does not.
- The Schema decodes what the encoder wrote and refuses a bundle with an unsorted or duplicated slot list.

**Mutations** (new `bundle.mutations.ts`, in the format of `test/artifact.mutations.ts`): resolve against the path node's Schema instead of the root; skip the check test; skip sorting; leave slots out of the fingerprint.

**Also:** changelog; the skill's MetaKit reference; `packages/metakit/docs/semantics.md` §3 gains the bundle; `pnpm --filter foldkit-plus generate` and `pnpm paths` only if a new export path is added (prefer the existing `metakit/artifact`).

**Done when:** tests and mutations as above; Jev approves; `npx vitest run examples --project unit` is green.

### A4. The corpus
**Change:** `metakit/conformance` (`src/conformance.ts`) gains one function that, given a live expression or transition, its bundle and a list of environments, returns the vectors: slots read from each environment with `readSegments`' rule, and the outcome from `Expr.evaluate` or `Transition.step`. Vectors are derived **from** Schema-valid environments, never built from slot values, so the input check of §3.3 always sees a real input.

A test-side generator (`packages/metakit/test/corpus/`) writes `packages/metakit/test/fixtures/safe-int-k3.corpus.json`:

1. The five `CounterAccount` bundles with a hand-written matrix: open and frozen; count at 0, mid, at the limit; each message; `SetCount` out of bounds; a null and a non-null note; a note of only spaces; the no-change case that suppresses the emit; `Add` whose sum overflows.
2. One small bundle per admitted operator, with vectors for: every argument null in turn; every argument refused in turn (feed it `num.add(max, 1)`); boundary values (`±(2^53−1)`, 0, `""`, an emoji, a no-break space, `"É"`, text differing only above the BMP).
3. The traps of §3.2 as named cases: `bool.and(false, <refused>)`, `bool.or(true, <refused>)`, `eq.is(null, null)`, `eq.equals(null, null)`, `null.coalesce(1, <refused>)`, `null.coalesce(<refused>, 1)`, `If` and `Match` with a refusing untaken arm, `Match` on null with and without `otherwise`, `Match` on an unlisted value.
4. Seeded random expressions, typed by construction, a few hundred, depth at most 6, each with a dozen environments. Use a small local PRNG seeded by a constant; do not depend on a library's default seed.
5. Outside-profile vectors: a NUL in a text slot, a lone surrogate, an integer at `2^53`, a null in a non-nullable slot, a `status` outside its literals.

Keep the file under 2 MB.

**Tests** (`packages/metakit/test/corpus.test.ts`):
- Regenerating gives a file byte-equal to the committed one.
- Every case's `fingerprint` equals `fingerprintBundle(bundle)`.
- The coverage claim, computed from the file: each of the 28 operators has a null vector per argument position and a refused vector per position.
- The profile block's operator list equals A2's constant.

**Mutations:** none on the fixture; on the new function, swap `guard` and `refused`, and read slots after the step instead of before.

**Done when:** the file is committed, the four tests pass, and you have confirmed by hand that three outcomes of your choice in the file match what you compute on paper from §3.

### A5. The SQL leg (do after A4; skip only with a stated reason)
For each expression case whose `Language.readiness` against the `sql` target is clean, lower it with the existing SQL reader and evaluate each in-profile vector in PGlite (already a dev dependency), comparing with `expected`. Before writing it, read how `test/artifact.test.ts` and `test/decimal-mul-parity.test.ts` drive the database, and reuse that setup. A disagreement is a finding to report, not something to paper over in the test.

### A6. Documents
`packages/metakit/docs/semantics.md`: the step order of §3.3 and the profile of §5 and D6, each sentence checked against the source. Read `docs/agents/writing-docs.md` first.

**Phase A exit:** A1–A4 and A6 committed and pushed; CI read by the coordinator; no Rust anywhere in this repository.

---

## 9. Phase B: the adapter (the Reffect repository)

### 9.0 Before any step
- The checkout at `C:\Users\Patrick\reffect` is 56 commits behind `origin/master`. Run `git pull --ff-only`, then `vp install`.
- Read Reffect's `AGENTS.md`. It differs from this repository's rules:
  - **A research record comes first.** Before code, write `docs/research/metakit-adapter.md` (prior work, sources, alternatives, the chosen approach, acceptance) from this plan, link it from `PROGRESS.md` and `docs/README.md`.
  - Checks are `vp check` and `vp test`. There is no CI: run them and report the results, including failures that were already there.
  - After editing a runtime `.rs` file run `vp run runtime:gen`; `runtime-sources.test.ts` fails while the generated file is stale. Run `vp run runtime:check` for rustfmt, clippy and the crate's tests (add the new file to its `rustfmt` list).
  - Update `PROGRESS.md` when a step is done, `docs/open-work.md` for anything deferred, and the "refused while compiling" list at the end of `docs/native-divergences.md` with the profile's refusals. An accepted run-time difference gets a row in that register's table.
  - Commits are focused and conventional; a fix for a review finding is prefixed `review(<scope>):`. Tests import from `vite-plus/test`. No casts in tests or examples.
  - Reffect is on `effect` 4.0.0. Check each Effect API against the installed version, not against this repository's 4.1.
- Copy `safe-int-k3.corpus.json` to `packages/reffect/tests/fixtures/metakit/`, with a `SOURCE.md` naming the MetaKit commit it came from.
- Read `packages/reffect/src/foldkit.ts`, `src/foldkit-runtime.ts`, `runtime/src/foldkit_eval.rs` and `tests/foldkit.test.ts` whole. The adapter is their sibling: same `fail(code, stage, path, message)` errors, same `Rs` emitter, same `CargoApi` calls, same `nativeTestBudget` in tests.

### B1. The checker: `packages/reffect/src/metakit.ts`
No Rust is emitted in this step.

1. **Decode** the bundle as untrusted JSON: a local Effect Schema for the shapes of §6.1; reject unknown keys' effects by reading only declared fields; enforce depth 64 and 2 048 nodes while walking; look operators up in a `Map`, never by indexing a plain object with a name from the bundle.
2. **Check the profile**: `profile` is `metakit/safe-int-k3@1`; every operator is one of the 28; every node tag is admitted; slots are sorted and unique; every `Path` in a node is a slot; entry names match `/^[A-Za-z][A-Za-z0-9_]*$/`.
3. **Type every node** bottom-up. A type is `int`, `bool`, `text`, or `null` (the literal null, which fits any kind):

   | Node | Rule |
   |---|---|
   | `Lit` | integer within ±(2^53−1) → `int`; boolean → `bool`; well-formed text without NUL → `text`; null → `null`; anything else is an error |
   | `Path` | its slot's kind |
   | `bool.and`, `bool.or` | both `bool` → `bool` |
   | `bool.not` | `bool` → `bool` |
   | `eq.is`, `eq.isNot`, `eq.equals` | both the same kind → `bool` |
   | `ord.*` | both `int` → `bool` |
   | `num.add`, `sub`, `mul` | both `int` → `int`; `num.neg`: `int` → `int` |
   | `null.isNull` | any → `bool` |
   | `null.coalesce` | both the same kind → that kind |
   | `str.len` | `text` → `int` |
   | `str.trim`, `lowerAscii`, `upperAscii` | `text` → `text` |
   | `str.startsWith`, `endsWith`, `contains`, `lt`, `lte`, `gt`, `gte` | both `text` → `bool` |
   | `str.concat` | both `text` → `text` |
   | `If` | condition `bool`; both arms the same kind → that kind |
   | `Match` | subject `text`; every arm and `otherwise` the same kind → that kind |

   A `null`-typed operand takes the kind the rule asks for. Where no operand fixes a kind (`eq.is(null, null)`, an `If` whose arms are both the literal null) fail with `UNTYPED_NULL`; do not pick one.
4. **Check a transition**: `when` is `bool`; each write's value has the write's `kind`; an emit's `when` is `bool`. Do not type-check or lower `ensures`.
5. **Return an analysis**, shaped like `QueryAnalysis` in `foldkit.ts`: name, fingerprint, slots, the operators used, `profile: 'metakit/safe-int-k3@1'`, `crates: []`.

Error codes, each with the node's path (`when`, `writes[0].value.args[1]`, …): `UNSUPPORTED_PROFILE`, `UNSUPPORTED_OPERATOR`, `UNSUPPORTED_NODE`, `UNSUPPORTED_REPRESENTATION`, `UNSUPPORTED_WRITE`, `UNKNOWN_PATH`, `ILL_TYPED`, `UNTYPED_NULL`, `LIMIT_EXCEEDED`, `INVALID_NAME`, `MALFORMED_BUNDLE`. `#597` and `#612` ask that a refusal name the operator, the target and the originating transition: put all three in the message.

**Tests** `packages/reffect/tests/metakit.test.ts`:
- Every case in the corpus is accepted.
- The adapter's own operator list equals the corpus's `profile.operators`. This is the version-pinned compatibility table `#649` §8 asks for, as a test.
- One table of hand-built bad bundles, one row per error code; plus keys named `__proto__` and `constructor`; a depth-65 tree; an unsorted slot list.

**Done when:** `vp check` and `vp test` pass for this file; the research record and `PROGRESS.md` are updated.

### B2. Runtime and expression lowering
**`packages/reffect/runtime/src/metakit_eval.rs`** (no crates). The whole contract is small enough to write out:

```rust
pub const MAX_SAFE: i64 = 9_007_199_254_740_991;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Refusal { UnsafeInteger, Unmatched }

/// Ok(Some(v)) a value, Ok(None) null, Err(r) a refusal.
pub type Ev<T> = Result<Option<T>, Refusal>;

fn safe(v: Option<i64>) -> Ev<i64> {
    match v {
        Some(v) if v.unsigned_abs() <= MAX_SAFE as u64 => Ok(Some(v)),
        _ => Err(Refusal::UnsafeInteger),
    }
}

// Strict: the first refusal in argument order, then null, then the formula.
pub fn add(a: Ev<i64>, b: Ev<i64>) -> Ev<i64> {
    let (a, b) = (a?, b?);
    match (a, b) { (Some(a), Some(b)) => safe(a.checked_add(b)), _ => Ok(None) }
}

// Own-null: a refusal wins even over a deciding `false`.
pub fn and(a: Ev<bool>, b: Ev<bool>) -> Ev<bool> {
    let (a, b) = (a?, b?);
    Ok(match (a, b) {
        (Some(false), _) | (_, Some(false)) => Some(false),
        (Some(true), Some(true)) => Some(true),
        _ => None,
    })
}

// Total over null, never null.
pub fn is<T: PartialEq>(a: Ev<T>, b: Ev<T>) -> Ev<bool> {
    let (a, b) = (a?, b?);
    Ok(Some(a == b))
}
```

Write the other 25 the same way from §3.2. Both arguments of a call are evaluated before the function runs, which Rust does left to right; that is the order §3.1 requires.

Also in this file: the `Slot` value (`Int(i64)`, `Bool(bool)`, `Text(String)`, or absent), a `check_slots` that enforces D6 for what Rust can see (kind, nullability, integer range, NUL, literal set), and the token parser and printer of §6.3.

**`emitMetakitExpr`** in `metakit.ts`, through the `Rs` emitter:
- A `Path` reads its slot once into a typed local at the top of the function.
- A `Call` becomes a call to the runtime function with its arguments as expressions.
- `null.coalesce(a, b)` becomes `match a? { Some(v) => Ok(Some(v)), None => b }`.
- An `If` becomes `match cond? { Some(true) => then, Some(false) => otherwise, None => Ok(None) }`.
- A `Match` becomes `match subject? { Some(s) => match s.as_str() { "A" => …, _ => <otherwise, or Err(Refusal::Unmatched)> }, None => <otherwise, or Ok(None)> }`.
- Every text literal and case label goes through the emitter's string-literal helper. Never paste bundle text into Rust source by string concatenation.

For orientation, `canIncrement` should come out close to:

```rust
pub fn r_canIncrement(slots: &[Slot]) -> Result<Ev<bool>, Boundary> {
    check_slots(slots, &SLOTS_CAN_INCREMENT)?;
    let count: Ev<i64> = int(&slots[0]);
    let limit: Ev<i64> = int(&slots[1]);
    let status: Ev<String> = text(&slots[2]);
    Ok(and(is(status, Ok(Some("open".to_string()))), lt(count, limit)))
}
```

Then `Metakit.compile`, `embed`, `build` and `run`, mirroring the four on `Foldkit`, and the export from `src/index.ts`.

**Tests:**
- Corpus replay: build once per profile (debug and release, as `foldkit.test.ts` does), send every vector of every expression case, compare with `expected`. An `outsideProfile` vector must answer `x`.
- `runtime/src/tests.rs`: one unit test per runtime function for its trap in §3.2.

**Done when:** zero mismatches on every expression vector; `vp run runtime:check` clean (`cargo clippy -- -D warnings` included); the generated crate's `[dependencies]` is empty; the built binary answers a vector with Node absent from `PATH` (the "no JavaScript runtime" claim of `#649` §8, checked once by hand and recorded).

### B3. The transition
Lower a transition bundle to one function returning `Result<Step, Boundary>` where `Step` is `Guard`, `Refused(Refusal)` or `Ok { writes, emitted }`, following §3.3 line by line:

1. `check_slots`.
2. Evaluate `when`; anything but `Ok(Some(true))` returns `Guard`. This includes `Err(_)`.
3. Evaluate each write value in order, then each emit's `when` and (only if `Ok(Some(true))`) its fields in order. Keep the first `Err` seen. You may stop evaluating at that point: nothing after it is observable.
4. If an `Err` was seen return `Refused(it)`; else return the values.

**Tests:** replay the `CounterAccount` transition cases and the transition traps in the corpus. Then two cache tests: the cache key changes when the bundle's fingerprint changes, and does not change when the same bundle is compiled twice.

**Done when:** zero mismatches on every transition vector; the divergence register lists the profile's compile-time refusals; `docs/open-work.md` lists what was deferred (struct binding, arrays, floats, the `R` lowering of D4).

### B4. Measure and decide
- **What to time:** `Interpreter.prepare` in MetaKit, `Metakit.embed` called in-process from a small Rust harness, and the subprocess. One `UpdateCounter` step, and batches of 1 000, 10 000 and 100 000 vectors of `canIncrement`.
- **How:** the same vectors on both sides; release profile; five runs, report the median and the spread; state the machine. Report marshalling (building the slot array) separately from evaluation. Also report cold `cargo build` time and binary size.
- **Write** `docs/design/598-612-metakit-reffect-FINDINGS.md` in this repository: parity results, any gap found, the numbers, the deviation of D4, the compatibility table, and the recommendation under §10. Update `#598`, `#612` and `#649`.

---

## 10. What decides the outcome

| Outcome | Condition |
|---|---|
| **Go** (keep the adapter, consider widening) | Zero mismatches on the corpus; the adapter reads only bundles and the corpus; nothing in MetaKit's semantics changed to make Rust agree |
| **Narrow** | A class of vectors cannot agree without a semantic change: remove that operator or kind from the profile, bump its version, and say so |
| **Stop** | The adapter needs MetaKit's private structure, or agreement needs a second semantics |

Widening (arrays, `Rows`, floats, struct binding, lowering through `R`) needs a named consumer first. The likeliest is a native Reffect Remote or RPC handler that evaluates a guard or policy with no JavaScript runtime. A benchmark number alone does not justify it.

---

## 11. Review after each step

1. **The step's checks**, as its "Done when" lists them.
2. **Self-review against §3**, asking each question of the diff: does `bool.and(false, refused)` refuse; is an untaken arm's refusal silent; does `str.trim` keep a no-break space; is `str.len` of an emoji 1; do `max + 1`, `-max - 1` and `max * 2` refuse without a panic; is a refusing guard reported as a guard failure; is the reported refusal the first write's rather than the first emit's; is `ensures` untouched; is a slot's nullability read from the root Schema.
3. **An independent reviewer** after A3, B2 and B3, on the default model, given the diff and the corpus but not this plan's conclusions.
4. **Fix what the review finds** in a follow-up commit.

---

## 12. How this maps to the issues

| Issue asks | Where |
|---|---|
| `#598` 11-27: MetaKit's evaluator is the oracle; map safe integers, null, refusals, text, selected-branch evaluation explicitly | §3, D5–D7 |
| `#598` 11-27, `#649` §8: compare with "Reffect Reference" as well | Not done; D4 says why and when to revisit |
| `#612` 11-27: one tagged message, a guarded transition, a named view; commands stay data | §7, D3 |
| `#612` 11-27: benchmark the JS path before widening | B4, §10 |
| `#597` 11-19: every reader implements an operator exactly or refuses it by name, with passing conformance cases | §5, A4's coverage test |
| `#597` 11-23, `#612`: a refusal names the operator, the target and the transition | B1 |
| `#645`: versioned codec, fingerprints, resource limits on untrusted input | A3, B1 |
| `#649` §5: bounded profiles and a located support report | A2 |
| `#649` §8: adapter owned by the consumer; version-pinned compatibility table; refusal fixtures; no MetaKit JS runtime in the build | D1, B1, B2 |
| `#649` §10: a new primitive needs two consumers | Bundles: the adapter and the corpus. Corpus: the adapter and the SQL replay (A5) |

`#649` places the adapter in its P3, after an API inventory (P0) and two small languages (P1). Phase A overlaps its P2 and can start now. Phase B does not depend on P0 or P1, but if the inventory renames `Language.readiness` or the artifact module, A2 and A3 follow the new names.

---

## 13. Open items

- **The npm name.** `metakit` cannot be published. Not this plan's work; it blocks every release that includes MetaKit, and D1 exists partly because of it.
- **Canonical JSON.** Reffect cannot recompute a fingerprint without MetaKit's canonicalisation rules. Publish them in `semantics.md` when a consumer needs to verify a bundle rather than trust the file.
- **Unread input fields.** A bundle sees only the paths its expressions read. MetaKit validates the whole input against its Schema; a native host that builds slots from its own data must validate the rest itself.
- **Not checked for this revision:** how `Schema.optional` and `Schema.optionalKey` appear in `SchemaAST` (A3 probes it); whether `CalendarDay` is integer-backed (`Money` and `Decimal` are); the callers of `Refused` outside `transition.ts` (A1 finds them).

---

## Appendix: what the first draft claimed and the source says

| First draft | Source |
|---|---|
| Reffect runs MetaKit in a three-way test | The npm name is taken; `effect` 4.0.0 against `^4.1.0` |
| Reffect CI builds Rust on every PR | The repository has no workflows |
| The adapter consumes Schema and Transition descriptors | `PortableArtifactV1` has neither |
| `ensures` is validated after the writes | `evaluateStep` never evaluates it |
| A refused guard is a separate refusal | Any guard result but `true` is one guard failure |
| Emits are evaluated before writes | Write values first |
| `null.coalesce` is lazy | Both arguments are evaluated; the second is ignored |
| 19 core operators, `eq.oneOf` | 28 admitted of 50; the id is `eq.in` |
| NUL and lone surrogates are refused at MetaKit's boundary | Only inside operators that screen for them |
| A tagged union lowers to a Rust enum | It is a `Match` over a `_tag` path plus ordinary paths |
