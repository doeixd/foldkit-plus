# MetaKit Core Semantics & Reader Capability Matrix

Every MetaKit expression (`Expr<Env, A>`) is a pure, terminating AST over 50 closed-set core operators (`Node.CoreOpId`), optional versioned foreign operations (`Node.ForeignOp`), conditionals (`If`, `Match`), list/relation folds (`Rows`), and an explicit escape hatch (`Opaque`).

## 1. Value Domain & Observable Outcomes

Evaluation of a node against an environment produces one of four outcomes:

1. **Concrete value** — number, boolean, string, array, or plain object.
2. **`null`** — absence (including `Option.none()` and missing/undefined optional keys read through a `Path`).
3. **`Refusal`** — evaluation declined to answer (`unsafe-integer`, `non-finite`, `ill-typed`, `unmatched`, `unportable`, `unsupported`, `failed`).
4. **`Unknown`** *(static/partial readers only)* — insufficient information to decide. **`Unknown` is never `null` and never a concrete value.**

### Precedence & Evaluation Order

- **Refusal decides before `null`:** for any strict operator (`nulls: 'strict'`), if any operand evaluates to a `Refusal`, or triggers the operator's `refuses` screen (e.g. `NaN` in ordering/equality, NUL byte `\u0000` in text/equality), the call returns that `Refusal` even if another operand is `null`.
- **Null propagation:** for strict operators, if no operand is refused and any operand is `null`, the result is `null`.
- **Own-null operators (`nulls: 'own'`):** Kleene three-valued logic (`bool.and`, `bool.or`), null-safe equality (`eq.is`, `eq.isNot`), `null.isNull`, `null.coalesce`, and SQL-compatible membership (`eq.in`, `eq.among`) handle `null` explicitly. All of them except `null.coalesce` still propagate refusals. `null.coalesce` answers its first operand where it has a value, whatever the fallback is, as SQL's `coalesce` does, so `coalesce(1, <refused>)` is `1`. (Evaluation may still compute the fallback: an `Opaque` fallback's host function can run.) The list folds `any` and `every` also settle past a refused element, as SQL's `EXISTS` does: `any` is `true` once one element's test is `true`, and `every` is `false` once one is `false`, whichever other element is refused.
- **Short-circuiting:** `If` evaluates `cond` first; if `cond` is `true` only `then` is evaluated, if `false` only `otherwise` is evaluated, if `null` the result is `null`, if refused the refusal is returned. `Match` evaluates `on` once, then only the matching branch (or `otherwise`).
- **Predicates:** a rule or guard holds **only** when it evaluates to `true`. `false`, `null`, and `Refusal` do not hold.
- **Text normalization:** strings are compared after replacing lone UTF-16 surrogates with `U+FFFD` (`Node.wellFormed`), matching Postgres and SQLite drivers. Text holding `\u0000` is refused (`unportable`) by every equality (`eq.is`, `eq.isNot`, `eq.in`, `eq.equals`, `eq.among`) in any operand or candidate, and by a `Match` in its subject, before null decides: Postgres cannot hold such text and SQLite can. A `Match` case label holding `\u0000` is an error where the expression is built.
- **Numbers:** integer arithmetic refuses results outside `Number.MIN_SAFE_INTEGER..Number.MAX_SAFE_INTEGER` (`unsafe-integer`). Ordering (`ord.lt`, `ord.lte`, `ord.gt`, `ord.gte`) and every equality (`eq.is`, `eq.isNot`, `eq.in`, `eq.equals`, `eq.among`) refuse `NaN` in any operand or candidate (`non-finite`), before null decides: Postgres holds NaN equal to itself and above every number, and SQLite stores it as NULL. One exception to both screens: `eq.among` against a null list is null and against no candidate is `false`, whatever the value, as SQL writes `FALSE` for an empty `IN` without sending the value.
  A `-0` read from the environment reads as `0`, as arithmetic results do.

## 2. Five-Reader Capability & Evidence Matrix

| Feature / Node | JS Reference (`Expr.evaluate`) | Partial Eval / Judge (`Expr.judge`) | PostgreSQL (`Sql.toCheck` / `toWhere`) | SQLite (`Sql.toCheck` / `toWhere`) | Tier 3 / Z3 (`Abstract` / `Prove`) |
| --- | --- | --- | --- | --- | --- |
| Core scalar ops (`Bool`, `Eq`, `Null`, `Ord`, `Num`, `Str`, `Time`) | Exact | Exact when known, else residual / `Unknown` | Equivalent SQL (safe-int / dialect caveats noted below) | Equivalent SQL (with SQLite NULL/text guards) | Sound approximation (exact on linear/QF_NIA/QF_SLIA/QF_S fragments; `Unknown` on timeout/unsupported) |
| `Arr` & `Sets` ops | Exact | Exact when known, else residual / `Unknown` | Supported subset lowered; unsupported refused loudly | Supported subset lowered; unsupported refused loudly | Sets via native Z3 `SMTSet`; array folds bounded/sound |
| `If` & `Match` | Exact (short-circuiting) | Exact when branch decided; residualized otherwise | `CASE WHEN ... THEN ... END` | `CASE WHEN ... THEN ... END` | Encoded as SMT `ite` |
| `Rows` (list & nested folds) | Exact | Partial when list/element known; residualized otherwise | Supported folds lowered (correlated/exists where supported); unsupported refused | Supported folds lowered; unsupported refused | Sound over-approximation / Z3 encoding where supported; `Unknown` otherwise |
| `ForeignOp` (`id@version`) | Runs caller-supplied `ForeignImplementations`; `unsupported` refusal if absent | Runs only when args known & impl supplied; else residual / `Unknown` | Runs caller-supplied `ForeignLowerings` for dialect; refused if absent | Runs caller-supplied `ForeignLowerings` for dialect; refused if absent | Uses declared algebraic `claims` / `Unknown` unless lowered |
| `Opaque` | Executes JS closure | Runs if declared `reads` are all known; else `Unknown` | **Refused** (not portable) | **Refused** (not portable) | Soundly `Unknown` |
| Portable codec (`@doeixd/metakit/artifact`) | Round-trips all non-`Opaque` nodes | Identical post-decode | Identical post-decode | Identical post-decode | Identical post-decode |

> **Sound approximation vs. equivalence:** SQL `CHECK` constraints pass when a row is valid and reject when the predicate is `FALSE` (`IS TRUE` / null-aware guards for `Schema.optional` and `Schema.NullOr`). Z3 proofs establish validity under the declared Schema constraints and timeout; a solver timeout or `Unknown` is **neither** a proof nor a counterexample.

## 3. Portable Artifact Versioning Policy (`@doeixd/metakit/artifact`)

- **Wire version (`CODEC_VERSION = 1`):** Every encoded artifact carries `codecVersion: 1`. Decoders reject unknown versions with `ArtifactDecodeError` (`phase: 'version'`). Additive changes that preserve v1 decoding stay in v1; breaking wire changes bump `CODEC_VERSION` and ship an explicit migration decoder.
- **Core operators (`Node.CoreOpId`):** Closed set of 50 operators. Existing core operator semantics do not change incompatibly; new behavior gets a new operator ID.
- **Foreign operations (`id@version`):** Identified by `(id, version)` where `version` is a positive integer. Breaking signature or behavioral changes must increment `version`. Registries reject conflicting registrations for the same `id@version` (`DuplicateOperationError`).
- **Untrusted wire inputs:** Always decode with `limits` (default `maxDepth: 64`, `maxNodes: 2048`) and an explicit `allowlist` (e.g. `{ foreign: [] }` for core-only untrusted inputs). `Opaque` nodes and non-JSON-safe literals (`NaN`, `Infinity`, `-0`, functions, symbols, class instances) are always rejected.
