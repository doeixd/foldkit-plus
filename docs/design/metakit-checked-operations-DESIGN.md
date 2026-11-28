# How does an application declare an operation every reader trusts?

Status: design note for Phase 4 part A of [the unification plan](./metakit-unification-PLAN.md) ("the plan"), bout 4.1, written 2026-11-22 against the tree at `f0409ccc4`. It fixes the names and signatures bouts 4.4 to 4.12 build, records the three probes the plan asked for, and lists where it changes the plan and why.

## The problem, and the decision

Say your application stores a user's permissions as bits in one integer, and grants a permission by combining bits with "or". You want the page, the server and the database to agree on what "or" means, and you want the tools that reason about your state to use what you know about it: granting twice is the same as granting once, and two grants can arrive in either order. Today you can write such an operation (`Node.foreign` in `packages/metakit/src/node.ts`), and you can even list what it keeps, in a field named `properties`. Nothing reads that field and nothing checks it. If you claimed that "exclusive or" is idempotent, which it is not, nothing would tell you, and a reader that trusted the claim would show wrong state.

The decision: an operation is declared once, with a Schema for each argument and for its result, and with its claims. The declaration is a typed function that builds calls. Each claim is typed by the signature, so a claim that cannot hold of that shape does not compile. A generated test checks each claim against each implementation the application's tests name, over values drawn from the argument Schemas. A claim whose check did not run keeps the obligations test red: that is the repository test that fails while any declared obligation has no passing check. Readers then act on the claims: partial evaluation, the checker, `Transition.commutes`, folds and replay.

This note uses the plan's words (expression, reader, refusal, transition, way of writing, obligation, registry), which "Words this plan uses" in the plan explains. Three more:

- A **claim** is a property (identity, absorbing, idempotent, commutative, associative, invertible, monotone) declared of one operation. The set of properties stays closed (decision 11); what is open is which operations claim them.
- An **implementation** is the JavaScript function that computes the operation; a **lowering** is the SQL that computes it in one database dialect.
- The **domain** of a claim is the set of argument values it holds for. In this design it is exactly what the argument Schemas admit (an Effect Schema describes a value's shape and checks, as `Schema.Int.check(Schema.isBetween(…))`).
- The **null rule**: `nulls: 'strict'` means a null argument gives null, and a refused one its refusal, before the implementation runs; `nulls: 'own'` hands nulls to the implementation, which answers for them.

Numbered rules and decisions ("rule 10", "decision 11") are the plan's, in its "Rules for every phase" and "Decisions taken".

## What the three probes found

Each probe ran from a temporary file, since deleted; its method and command are given so anyone can run it again.

### Probe 1: does `effect/Arbitrary` take a seed and honour range checks?

A script in `packages/metakit` (run there with `node`, so it resolves that package's `effect@4.1.4`) sampled `Flags = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 2147483647 }))` with `Effect.runSync(Arbitrary.sampleEffect(Arbitrary.schema(Flags), { count, seed }))`.

| Question | Answer |
| --- | --- |
| Is a seed taken? | Yes: `seed` is a number or a string; seed 7 twice gave identical lists, seed 8 another |
| Are `isBetween` bounds honoured? | Yes: 2,000 values all integers in range; `-3..3` gave all seven values |
| Are exclusive bounds honoured? | Yes: `(0, 1)` gave 5e-324 to 0.9999999999999999, never an end |
| Are the range's ends sampled? | Not reliably: 200 values from seed 7 held neither 0 nor 2147483647; 2,000 held both |
| How far does an unbounded `Schema.Int` reach? | About ±100 at the default size; `size: 1000` reached ±1,000,000 |
| Does `Schema.Number` yield NaN, ±Infinity, −0, unsafe integers? | Yes, all four, in 3,000 values; `Schema.Finite` none of the first two |
| Does `Schema.String` yield the empty text, NUL, a lone surrogate? | Yes, all three, and astral characters |
| Is it synchronous? | Yes: `Effect.runSync` works, seeded or not |
| How fast? | 200 values and 1,000 triples of `Flags` in 4 ms |

`Arbitrary.checkEffect` also ran: it falsified "xor is idempotent" at its first run and shrank the input to 1, and passed "or is commutative" over 1,000 pairs. Two things the plan did not say: the module is marked `@stability unstable` in 4.1.4, and its replay tokens are not promised across releases. A range check's bounds can be read back from the Schema: each check's `annotations.representation` is `{ id: 'effect/schema/isBetween', payload: { minimum, maximum, exclusiveMinimum? } }`, and likewise for `isGreaterThan`, `isGreaterThanOrEqualTo`, `isLessThan`, `isLessThanOrEqualTo`.

**What follows.** Generation uses `Arbitrary.schema` and `sampleEffect`, seeded. The range's ends, the ends of the safe integer range for an unbounded number, and the awkward values are always added by hand, since the generator reaches none of them reliably. Checking is our own loop, not `checkEffect` (see "How is a claim checked?").

### Probe 2: do SQLite's and Postgres's bitwise operators agree with JavaScript?

A script in `packages/metakit` (`node`, using `node:sqlite` 3.53.3 and `@electric-sql/pglite` 0.5.11, which is Postgres 18.6) stored 2,000 pairs: the 49 pairs of seven chosen values (0, 1, 2^31−1, 2^31−2, 2^30, 0x55555555, 0x2aaaaaaa) and 1,951 pairs drawn by mulberry32 from seed 4001 (the generator `Temporal.generator` uses) over 0 to 2^31−1. One `select` per database computed or, xor and and-not; each answer was compared with JavaScript's `a | b`, `a ^ b`, `a & ~b`.

| Database | `a \| b` | xor | `a & ~b` |
| --- | --- | --- | --- |
| SQLite | 0 of 2,000 differ | `(a \| b) - (a & b)`: 0 differ | 0 differ |
| Postgres | 0 differ | `a # b`: 0 differ | 0 differ |

Found on the way:

- **Postgres's `^` is exponentiation**: `select 5 ^ 3` is 125. SQLite has no `^` at all (`unrecognized token: "^"`). The plan's Phase 4 header writes "`#`/`^`"; only bout 4.1's brief has it right. A lowering of xor is `a # b` on Postgres and `(a | b) - (a & b)` on SQLite.
- **Postgres's `bit_or` and `bit_xor` over no rows give null**, not 0. Both agree with JavaScript over the 2,000 values. SQLite has neither (`no such function: bit_or`).
- **Outside the domain they part.** `2147483647 | 2147483648` is −1 in JavaScript (32-bit) and 4294967295 in SQLite (64-bit). The claims hold only because the argument Schema stops at 2^31−1, which is why this design checks arguments against their Schemas when an operation runs.

### Probe 3: what does a typed declaration cost the type checker?

The prototype of this note's types (`Operation.define`, the claim types, `implement`, `lowering`, `reduce`, `combine`) was written in a temporary `examples/kitchen-sink/test/*.test-d.ts`, with the permissions domain and every negative case below. Instantiations were counted with `pnpm exec tsc -p <scratch tsconfig> --extendedDiagnostics` (`tsc` 7.0.2), the scratch tsconfig extending `examples/kitchen-sink/tsconfig.json` with only one file in `files`. A scratch project was used instead of `tsc -b examples/kitchen-sink --force` to avoid rebuilding every referenced package while memory was short; each count repeated exactly over two runs.

| File | Instantiations | Difference |
| --- | --- | --- |
| prototype types and `Flags`, no operation | 92,638 | |
| the same, three `define` calls | 93,130 | 492, so 164 per operation |
| the same, a call and an `implement` of each | 95,183 | 2,053, so 684 per operation |
| `foldkit-entity` imported and `Flags`, no operator | 236,358 | |
| the same, one `Expr.operator` with four laws | 236,571 | 213 |
| the same, a call and an `Operators.implement` | 237,480 | 909 |

A typed declaration costs less than an entity operator does today: 164 instantiations against 213, and 684 against 909 with one call and one implementation. The plan's bar (part A, "Bytes and compile cost") becomes: a declaration costs at most 164 instantiations, and with one call and one implementation at most 684, measured this way. Rule 21's counts for the three examples are bout 4.3's and the audit's.

## How is an operation declared?

```ts sketch
import { Schema } from 'effect'
import * as Operation from 'metakit/operation'

const Flags = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 2147483647 }))

const flagsOr = Operation.define({
  id: 'flags.or',
  version: 1,
  args: [Flags, Flags],
  returns: Flags,
  nulls: 'strict',
  claims: { commutative: true, associative: true, idempotent: true, identity: { value: 0, side: 'both' } },
})

flagsOr($.granted, 4) // Expr<State, number | null>
```

Here `$` is the path accessor of a state Schema (`Path.from(State)`), and `$.granted` reads its `granted` field, a `Flags`.

`Operation.define` lives in `packages/metakit/src/operation.ts`, subpath `metakit/operation`. Its result is a function that builds a call, plus a `descriptor`, which is the `ForeignOp` a call node carries. Its signature, as it compiled in the prototype:

```ts sketch
export interface Operation<Id extends string, V extends number, Args extends ReadonlyArray<Schema.Top>,
  R extends Schema.Top, N extends 'strict' | 'own', C extends Claims<Args, R>> {
  <const A extends { readonly [K in keyof Args]: ExprInput<never, Schema.Schema.Type<Args[K]> | null> }>(
    ...args: A): Expr<EnvOfAll<A>, Schema.Schema.Type<R> | null>
  readonly descriptor: ForeignOp & { readonly id: Id; readonly version: V; readonly args: Args
    readonly result: R; readonly nulls: N; readonly claims: C }
}

export const define: <const Id extends string, const V extends number, const Args extends ReadonlyArray<Schema.Top>,
  R extends Schema.Top, const N extends 'strict' | 'own', const C extends Claims<Args, R> = {}>(spec: {
  readonly id: Id & NotCore<Id>; readonly version: V; readonly args: Args; readonly returns: R
  readonly nulls: N; readonly claims?: C }) => Operation<Id, V, Args, R, N, C>
```

`EnvOfAll` intersects the environment of each argument, left to right; a literal argument adds none. A first attempt took the intersection of the union of the arguments' environments, and a literal argument (environment `unknown`) erased every other one.

### What a claim may say, by the signature

| Claim | Written | Compiles only where |
| --- | --- | --- |
| `identity` | `{ value, side }`, `value` of the result's type | the signature is `(S, S) => S` |
| `absorbing` | `{ value, result, side }` | `(S, S) => S` |
| `idempotent` | `true` | `(S) => S` (twice is once) or `(S, S) => S` (`op(x, x)` is `x`) |
| `commutative` | `true` | `(S, S) => S` |
| `associative` | `true`, or `{ unlessRefused: true }` | `(S, S) => S` |
| `invertible` | `{ inverse }`: `'self'`, or an operation `(R, B) => A` | the signature is `(A, B) => R` |
| `monotone` | one of `'up'`, `'down'`, `'none'` per argument | a tuple as long as the arguments |

`side` is `'left'`, `'right'` or `'both'`. `unlessRefused` says the two groupings agree wherever neither is refused; without it they agree everywhere, refusals included. `'self'` exists because exclusive or is its own inverse, and a declaration cannot name itself in its own initializer.

Where a claim does not fit the shape, its type is a sentence rather than `never`. With `never`, `commutative: true` on `(Int, Text) => Int` reported "Type 'true' is not assignable to type 'undefined'"; with the sentence it reports "Type 'true' is not assignable to type '"commutative needs two arguments of one Schema and a result of that Schema"'". Bout 4.4 writes one sentence per claim.

### What `define` refuses when it runs

Each names the thing, the reason and the fix (rule 20); a test asserts each text.

- `[metakit] Operation.define: "num.half" is under the core prefix "num."; choose an id outside bool., eq., null., ord., num., str., arr., rows.` (also a type error on `id`)
- `[metakit] Operation.define: the version of "flags.or" is 0; a version is a positive integer, and a changed meaning takes a new one.`
- `[metakit] Operation.define: argument 1 of "geo.near" holds a Date; an operation takes and gives numbers, booleans and text.`
- `[metakit] Operation.define: argument 1 of "x.parse" decodes from another form (NumberFromString); declare the Schema of the value as stored, such as Schema.Number.` A Schema is refused here when `ast.encoding` is set, which `Schema.NumberFromString` has and a checked `Schema.Int` has not (probed).
- `[metakit] Operation.define: the identity of "flags.or" is -1, which its argument Schema does not admit (a value between 0 and 2147483647).` The same for an absorbing value or result.

### The domain is the argument Schemas, checked when the operation runs

The plan gave claims an `over` field: a narrower domain each claim holds on. This design drops it. A TypeScript type cannot tell `Flags` from `Schema.Number` (both are `number`), so a call compiles with any number, and only a check at run time keeps a claim's domain honest. Evaluation therefore checks each argument against its Schema before the implementation runs, and the answer against the result Schema after:

- An argument outside its Schema is refused with reason `ill-typed`: `flags.or@1: argument 2 is 2147483648, outside its Schema (a value between 0 and 2147483647)`.
- An answer outside the result Schema is refused the same way: `flags.or@1: the implementation gave -1, outside its result Schema (…)`.

A refusal reaches you as every refusal does: `Expr.evalResult` returns it as the failure, `Expr.evaluate` throws it, and the judge answers Unknown. Each `Schema.is` is built once, at `define`. With that check every claim holds over exactly what the Schemas admit, null and a refusal included, and an operation whose claim holds on less is declared with narrower argument Schemas. One domain per operation instead of one per claim is the cost; entity's `Law.within` is used only in tests today.

### What changes in `node.ts`

`ForeignOp` gains `args` and `result` (the Schemas) and renames `properties` to `claims`, of the type `ForeignClaims`: `OpProperties`'s seven fields, with `invertible.inverse` a `ForeignOp` or `'self'` instead of a core id. `Node.foreign` and `build.call` over a foreign operation leave the public API: `Operation.define` is the only way to make one. Entity still calls `Node.foreign` until bout 4.11, so it stays exported from `metakit/build` alone until then, and bout 4.11 deletes it.

## How is an operation implemented, and lowered to SQL?

```ts sketch
export const implement: <O extends AnyOperation>(op: O,
  run: (...args: RunArgs<O>) => Schema.Schema.Type<O['descriptor']['result']> | null) => Implementation<O>
export const implementations: (name: string, ...is: ReadonlyArray<Implementation<AnyOperation>>) =>
  ForeignImplementations

const page = Operation.implementations('page',
  Operation.implement(flagsOr, (a, b) => a | b),
  Operation.implement(flagsXor, (a, b) => a ^ b))
```

In the prototype `implement` and `lowering` infer `Args`, `R` and `N` from `op` as type parameters of their own: a mapped type over `O['descriptor']['args']` is not known to be an array, so it cannot type a rest parameter. `RunArgs<O>` gives each argument its Schema's type, and adds `null` only where the operation is `nulls: 'own'` (a strict operation's implementation never sees one). An implementation returns a value or null. To refuse, it throws: the reader turns the throw into a refusal with reason `failed` and the message, as `applyForeign` does today, so user code never builds a `Refusal`.

`implementations` takes a name first, which reports and obligations use (`page`, `server`). It refuses one operation and version given twice: `[metakit] Operation.implementations: "flags.or@1" is implemented twice in "page"; pass one implementation per operation and version.` Its result, `ForeignImplementations`, becomes an opaque type only `implementations` builds; every reader's `foreign` option takes it. A hand-written record keyed by `"flags.or@1"` stops compiling, so no table carries a key that names nothing. A reader asked to run a call it has no implementation for refuses with the plan's text: `[metakit] evaluate: no implementation of "flags.or@1" was given; pass Operation.implementations(…, Operation.implement(flagsOr, …)) to this reader.`

SQL lowering lives apart, in `packages/metakit/src/operationSql.ts`, subpath `metakit/operation/sql`, so no page carries it:

```ts sketch
import { lowering, lowerings, piece } from 'metakit/operation/sql'

const orSql = lowering(flagsOr, {
  sqlite: (a, b) => piece`(${a} | ${b})`,
  postgres: (a, b) => piece`(${a} | ${b})`,
  aggregate: { postgres: x => piece`bit_or(${x})` },
})
const xorSql = lowering(flagsXor, {
  sqlite: (a, b) => piece`((${a} | ${b}) - (${a} & ${b}))`,
  postgres: (a, b) => piece`(${a} # ${b})`,
  aggregate: { postgres: x => piece`bit_xor(${x})` },
})
const server = lowerings(orSql, xorSql) // ForeignLowerings, for metakit/sql and metakit/drizzle
```

Each dialect's function takes one piece per argument, so a lowering of the wrong arity does not compile. `piece` is a tagged template whose text is the author's code and whose holes are only other pieces: no value enters SQL as text. Both renderers (`metakit/sql`'s text-and-parameters and `metakit/drizzle`'s Drizzle `SQL`) render the same pieces, so one lowering serves both; their `foreign` option takes `ForeignLowerings` instead of today's `ForeignSqlTable` and `ForeignDrizzle` records. A dialect with no lowering refuses by name: `[metakit/sql] no postgres lowering of "flags.or@1"; declare one with lowering(flagsOr, { postgres }) from metakit/operation/sql.`

An aggregate lowering is wrapped by metakit in `coalesce(…, <identity>)`, because probe 2 found `bit_or` over no rows is null while a fold over no rows answers the identity. SQL aggregates skip a null contribution, which is what `reduce` does in memory (below).

## How is a claim checked?

```ts sketch
export const checkOperation: <O extends AnyOperation>(op: O, implementations: ForeignImplementations,
  options?: { readonly seed?: number; readonly sql?: ReadonlyArray<ParityRunner> }) => OperationReport
```

`checkOperation` lives in `packages/metakit/src/operationChecks.ts`, exported from `metakit/conformance`. It runs every claim of `op` against the implementation the table holds, through the same call path a reader uses (`applyForeign`, with its null rule and its Schema checks), and compares answers with `sameAnswer` (`propertyChecks.ts`: equal values, or refusals for one reason).

**The samples, per argument Schema.**

1. The awkward values of its kind (the lists in `propertyChecks.ts`: zero, −0, ±(2^53−1), a fraction, 1e200, NaN, ±Infinity; the empty text, mixed case, an astral character, a lone surrogate, NUL; both booleans), kept where the Schema admits them.
2. The ends of every range check, read from the check's `representation` payload; for an exclusive end, the nearest value inside (the next integer for an integer Schema, the next double otherwise).
3. Null, and a refusal, as a strict operation's operands.
4. 200 values from `Arbitrary.schema(arg)` with the run's seed (default 1).

Unary claims run over every sample. Binary claims run over every pair of the first three groups and 1,000 seeded pairs. Associativity runs over every triple of the range ends and the in-domain awkward values, and 1,000 seeded triples. The awkward values the Schema refuses are run too, once each, to show the call refuses them (the Schema check is in place). Probe 1 timed generation alone at 4 ms per operation; running the claims is not yet measured, and the plan's budget of 1 s per operation stands for bout 4.6 to meet.

**Why our own loop and not `Arbitrary.checkEffect`.** The SQL parity check below needs the exact list of calls the claims evaluated, and `checkEffect`'s shrinking and replay tokens are not promised across releases of an unstable module. Generation goes through one internal module, so an Effect upgrade that changes `Arbitrary` changes one file. A failure names the first failing tuple; the hand-picked samples come first, so it is usually small.

**A failure** reads: `[metakit] flags.xor@1 claims idempotent, and it does not hold: flags.xor(5, 5) is 0, not 5. Remove the claim, or narrow the argument Schemas.` The report carries every failure, the seed and the count of calls.

**SQL parity.** Each `ParityRunner` (one per dialect: it runs a statement on SQLite or PGlite) takes the list of calls the memory checks evaluated, intermediate results included, and computes them all in one statement, then requires each answer to equal the memory answer. Equality on exactly those calls carries every claim's sampled equations over to the dialect: for commutativity, SQL's `f(x, y)` and `f(y, x)` each equal memory's, which equal each other. So the plan's "one statement per property" becomes one statement per dialect.

**Where checks run.** In tests, through `*.obligations.ts` files (next section), and wherever a development server chooses to call `checkOperation` at start; metakit adds no hook for that. Never on a page: `publishedBuild.test.ts` asserts `operationChecks` and `operationSql` absent from every page.

## How are obligations named and collected?

Every claim reachable from what an application tests is an obligation, discharged only by a passing check in the same run (rule 10).

- **Name.** `law:<id>@<version>/<property>/<implementations name>`, as `law:flags.or@1/commutative/page`; a parity check is `law:flags.or@1/parity/postgres`. A version bump names new obligations.
- **Shape.** The registry holds `WalkObligation`s, so a law obligation is one with `over: []` (no steps), and a passing check records a `Discharge` whose result is `WalkResult.Held({ seed, runs })`; a failing one records `Broken` with the failing tuple as `reason`. The registry does not change.
- **Collection.** `lawObligations(from, implementations)` lists the obligations of every operation `from` reaches: `from` is a machine, a transition, an expression or a list of operations. It reaches a foreign call in a guard, a written value or an emitted record; the operation of a `combine` write or a `reduce` fold; and an inverse a claim names, with that inverse's own claims. One obligation per claim and per implementations table given, and one parity obligation per lowering.
- **Where.** An application's `test/*.obligations.ts` declares and records, as `packages/remote/test/protocols.obligations.ts` does for walks:

```ts sketch
// permissions: the application's machine; page and server: its two implementations tables;
// sqlite and postgres: ParityRunners over the server's lowerings.
const scope = { owner: 'permissions' }
Temporal.registry.declare(scope, lawObligations(permissions, [page, server]))
for (const op of [flagsOr, flagsXor, flagsAndNot, flagsClamp]) {
  for (const table of [page, server]) {
    const report = checkOperation(op, table, { sql: table === server ? [sqlite, postgres] : [] })
    for (const done of report.discharges) Temporal.registry.record(scope, done)
  }
}
```

`scripts/test/obligations.test.ts` imports every such file and fails while one is open, so deleting a `checkOperation` call turns it red. A forgotten `lawObligations` call is not caught, as a forgotten `Temporal.obligations(machine)` is not caught for walks today; the plan's assumption that every operation an application acts on is reachable from something its tests declare stays where it is (bout 4.6).

**Evidence.** Entity's `Evidence.Tested` becomes a discharge; `Evidence.Proven` is deleted and counts for nothing (decision 18).

## Which readers act on a claim, and when?

| Reader | Reads | Condition |
| --- | --- | --- |
| Partial evaluation, the page judge | identity, absorbing, idempotent | the dropped operand is within the argument Schema |
| The checker (`Abstract`) | monotone | implementations given, ends within the argument Schemas |
| `Transition.commutes`, `metakit/pairs`, Sync | commutative, associative | through `combine` (below) |
| `Transition.idempotent` | idempotent, associative | through `combine` |
| `foldProperties`, the update-or-rescan classifier | identity, commutative, associative, invertible | through `reduce` |
| The solver | nothing | answers Unknown, as today |

**Partial evaluation and the judge** (`ops/laws.ts`). A core law that returns an operand holds only where the operand is what the operation returns (`ofKind`: of its kind and a safe number). The rule for a custom claim: the operand is within the argument Schema. A reader can show that only from its static Schema: a path whose Schema is the argument's (the same AST), or carries every check the argument's carries, or a call of an operation whose result Schema is. Otherwise the call stays as it is (rule 6: weaken toward Unknown). Without this, `flagsOr(x, 0)` would rewrite to `x` while evaluation refuses an `x` of 2^31. An absorbing claim also needs the dropped operand to be one that cannot be refused, as the core's `unlessRefused` does.

**The checker** (`abstract/rowOf.ts`) takes `{ foreign?: ForeignImplementations }`. With it, a call whose claim is `monotone` gets the interval made by running the implementation at the corners: for each argument, its low end where the direction is `up` and its high end where it is `down`, and the opposite for the other bound. An argument marked `'none'` must be a single value; the interval's ends must lie in the argument Schemas, else the answer is Unknown. Test first, from the plan: `Abstract.checkInvariant` of `flagsClamp(x, 0, 10) <= 10` is Unknown today and True with the implementation.

## How does `reduce` fold over an operation?

```ts sketch
export const reduce: <L extends NullableItems, O extends CommutativeMonoid,
  V extends ExprInput<never, Schema.Schema.Type<O['descriptor']['result']> | null>,
  T extends ExprInput<never, boolean | null> = true>(list: L, op: O, value: (each: Each<ElementOf<L>>) => V,
  test?: (each: Each<ElementOf<L>>) => T) => Expr<EnvOfInput<L> & Outside<EnvOfInput<V>> & Outside<EnvOfInput<T>>,
  Schema.Schema.Type<O['descriptor']['result']>>

Arr.reduce($.roles, flagsOr, each => each.bits) // Expr<State, number>
```

`Arr.reduce(list, op, value, test?)` puts the operation where `Arr.sum` has its name and keeps `sum`'s `value` and `test` after it, so the folds read alike; the plan's sketch had the operation last. A `CommutativeMonoid` is an operation whose claims include `commutative: true`, `associative: true` (not `unlessRefused`) and an `identity` on both sides (decision 16); `reduce` over `flags.andNot` does not compile. The node is a `Rows` node with fold `'reduce'` and an `op` field.

In memory the answer over no element is the identity; a null contribution is skipped, as `sum` skips one and as SQL's aggregates do; a refusal is the answer. `foldProperties` for a `reduce` is derived from the operation: `from` (now `'num.add' | 'bool.or' | 'bool.and'` or a `ForeignOp`), `identity`, `commutative` and `associative` over the argument Schema, and `invertible` where the operation claims an inverse. In SQL it lowers through the operation's aggregate lowering, wrapped in `coalesce` with the identity; without one: `[metakit/sql] Arr.reduce over "flags.or@1" has no sqlite aggregate; declare lowering(flagsOr, { aggregate: { sqlite } }) or read the rows into memory.` An operation built at run time slips past the type, so `reduce` checks the claims again when it builds the node: `[metakit] Arr.reduce: "flags.andNot@1" does not claim commutative and associative with an identity, so its answer over rows would depend on their order.` Test first, from the plan: the classifier's answer for `reduce` over an addition equals its answer for `sum`.

## How does `combine` write with an operation?

```ts sketch
export const combine: <State, Input, V, Supplied = NoSupplied>(
  target: Path<TransitionEnv<State, Input, Supplied>, V>,
  op: BinaryOver<NonNullable<NoInfer<V>>>,
  value: ExprInput<TransitionEnv<State, Input, Supplied>, NoInfer<V>>) =>
  WriteEquation<State, Input, V, Supplied, 'combine'>

Transition.combine(state.granted, flagsOr, input.bit) // granted becomes granted | bit
```

`BinaryOver<V>` is an operation `(S, S) => S` whose Schema's type is `V`. The prototype showed the type error landing on the operation argument when the path's type differs (`combine(state.label, flagsOr, 'x')`). `WayOfWriting` gains `'combine'`, and its row of `writeProperties` reads the operation's claims through two new conditions:

- `CommuteCondition` `'same-operation'`: both writes name one operation (same id and version), which claims `commutative: true` and `associative: true`. With `{ unlessRefused: true }` the pair is Unknown, since the checker cannot range a custom result.
- `IdempotentCondition` `'idempotent-operation'`: the operation claims `idempotent` and `associative: true`. Twice is `op(op(p, v), v)`, which is `op(p, op(v, v))` by associativity and `op(p, v)` by idempotence; with associativity only unless refused, one grouping may refuse where the other does not.

`add` stays its own way with its own `in-range` condition, since `num.add` is associative only where neither grouping is refused, and `combine` takes only declared operations (a core operation is not an `Operation` value). The read of the target that belongs to the way is left to rule 4 in `commutes` and is not counted as a read of a written path in `idempotent`, as for `add`. `replayOver` replays a pending `combine` over a newer value when the page holds the implementation, and otherwise treats it as a `set`; `PendingPatch` gains `combines` beside `adds` (`packages/remote/src/ledger.ts`); Sync's convergence reads the row through `commutes`. Test first, from the plan: two `combine(flagsOr)` on one path are `commutes` True and `idempotent` True; two `combine(flagsAndNot)` are Unknown with a walk. Mutation: the row claiming that any operation commutes.

## What does a server compare with a page?

`Operation.describe(op)` gives an `OperationDescription`, a Schema-described JSON value: id, version, a JSON Schema per argument and for the result, `nulls`, and each claim with its witnesses (an inverse by `id@version` or `'self'`). Entity's `jsonSchemaOf` moves into metakit for it. `Operation.compare(local, remote)` gives `Option.none()` when the two are one, else the first difference, which a caller reports with the plan's text: `[foldkit-remote] the server describes flags.or@1 differently from this page (claims differ); bump the version where the meaning changed.` Nothing carries descriptions between a server and a page today: entity's `OperatorDescription` has no reader outside entity. The first channel is Phase 9's `Language.describe`; until then `describe` and `compare` have their own tests and no caller in a package.

## How do entity's operators move onto it?

`Expr.operator` builds on `Operation.define` (bout 4.11) and keeps what is entity's: Entity-field arguments, the stored form, `collation`, the id rule (namespaced lower camel case, `foldkit.`, `number.` and `text.` reserved besides metakit's prefixes) and `definedAs`.

| Entity today | Becomes |
| --- | --- |
| `laws: [Law.commutative, …]` | `claims: { commutative: true, … }` |
| `Associative`, `Commutative`, `Idempotent`, `Identity`, `Absorbing` | the claim of the name; an absorbing law's result is its value |
| `Monotonic(direction, position)`, one per argument | one `monotone` tuple, `'none'` where no law names the position |
| `Inverse(other, identity)`, `op(a, other(a))` is the identity | removed; `invertible: { inverse }` with a binary inverse is the rewrite |
| `Distributes`, `PreservesCollation` | removed: no reader; collations are folds placed by entity's constructors |
| `Law.within(law, domain)` | removed; narrow the argument Schemas instead |
| `nulls: 'handled'` | `nulls: 'own'` |
| `Operators.implement`, `implementHandlingNulls`, `memory` | `Operation.implement`, `Operation.implementations` |
| `DrizzleOperators` (`foldkit-remote-drizzle`) | `lowering` and `lowerings` from `metakit/operation/sql` |
| `Conformance.laws` | `checkOperation` and `lawObligations` |
| `Evidence.Tested`, `Evidence.Proven` | a discharge in the registry; nothing |

Two cases need a rule. **A defined operator** (`definedAs`) is its body: readers see the body's core operations and their properties, so it declares no claims, and one that does is refused: `[foldkit-entity] Expr.operator("cms.published"): a defined operator is its body, and readers read the body's operations; remove claims.` **The kernel's three** (`number.add`, `number.subtract`, `text.startsWith`) are metakit's core operations, whose rows in `opProperties` already say what they keep, so they declare nothing of their own; today `number.add` and `number.subtract` declare commutative and monotone laws over a finite domain (`expr/arithmetic.ts`), which go.

Since `Law` is deleted, a unary `Inverse` cannot be written at all; decision 17's refusal is the compiler error, and the upgrade guide names the binary rewrite. Entity's existing operator tests move onto metakit's checks; a test that declared `Distributes` becomes a type test that it no longer compiles.

## What breaks, and the error you see

Expected errors, from TypeScript's codes for each kind of change; bout 4.4 and 4.11 record the real text in the upgrade guide (Phase 8).

| You wrote | You see |
| --- | --- |
| `Node.foreign({ … })` from `metakit` (from `metakit/build` after 4.11) | TS2339: Property 'foreign' does not exist |
| `call(foreignOp, args)` from `metakit/build` | TS2345 on the operation: a `ForeignOp` is not an `Op`; call the operation |
| `foreign: { 'flags.or@1': { run } }` | TS2322: not assignable to `ForeignImplementations`; use `implementations` |
| `op.properties` on a `ForeignOp` | TS2339; it is `claims` |
| `foreign:` in `metakit/sql` or `metakit/drizzle` options | TS2322: takes `ForeignLowerings` from `lowerings` |
| `import { Law, Operators, Evidence } from 'foldkit-entity'` | TS2305: no exported member; see the table above |
| `Expr.operator(id, { laws })` | TS2353: 'laws' does not exist; write `claims` |
| `Conformance.laws(…)` | TS2339; use `checkOperation` |

## What it costs

**Bytes.** A page that names no custom operation does not change, and `operationChecks` and `operationSql` reach no page (plan, rule 3; asserted in `publishedBuild.test.ts`). A page that judges with a custom operation carries its descriptor, its claims, its argument Schemas and one `Schema.is` per argument. The plan expects under 300 B brotli per operation; bout 4.12 measures it with the permissions example.

**Type checking.** 164 instantiations per declaration, 684 with a call and an implementation (probe 3), below entity's 213 and 909.

## Where this note changes the plan

1. **No `over`.** The domain of every claim is the argument Schemas, checked when the operation runs; part A4's "a claim with `over` is used only where the checker shows the arguments lie in it" becomes the within-Schema rule above. Reason: a TypeScript type cannot tell two number Schemas apart, so only a run-time check keeps a domain.
2. **`N` (the null rule) is a type parameter of `Operation`**, because an implementation's argument types depend on it.
3. **`associative` is `true` or `{ unlessRefused: true }`**, not `{ unlessRefused: boolean }`, so a `CommutativeMonoid` is `associative: true`.
4. **`invertible.inverse` may be `'self'`**, and **`monotone` takes `'none'`**: the plan's xor and clamp need both.
5. **Identity and absorbing compile only on `(S, S) => S`.**
6. **`implementations` takes a name first**, which obligation names need.
7. **An implementation refuses by throwing**, so the plan's `StoredResult<O> | Refusal` return is a value or null.
8. **SQL lowering is `lowering`, `lowerings` and `piece` on `metakit/operation/sql`**, not `Operation.sql`: a page must not load it, and one lowering serves both renderers.
9. **Aggregate lowerings get `coalesce(…, identity)`** (probe 2).
10. **Parity runs one statement per dialect over the recorded calls**, not one per property.
11. **Generation uses `sampleEffect`; checking is our own loop**, not `checkEffect` (probe 1, and the parity check).
12. **`Arr.reduce(list, op, value, test?)`**, not `(source, each, op)`.
13. **The Phase 4 header's "`#`/`^`" is wrong for both databases**: Postgres's `^` is a power, SQLite has none (probe 2).
14. **`describe` and `compare` have no channel to compare over** until Phase 9.
15. **A defined entity operator declares no claims**, and **the kernel's three declare nothing** of their own.

## What was rejected

- **One domain per claim** (entity's `Law.within`, the plan's `over`). It needs a reader to show, per claim, that arguments lie in a second Schema, and it does not remove the run-time check, which the first domain needs anyway.
- **`Arbitrary.checkEffect` as the checker.** Its shrinking is better than a first failing tuple, but its calls cannot be recorded for parity without wrapping every property, and its replay format may change.
- **`never` for a claim that does not fit.** It compiles the same and reads worse.
- **A per-dialect function of Drizzle `SQL`** (today's `ForeignDrizzle`). It needs a second lowering per operation for `metakit/sql`.
- **A name per implementation** (`implement(op, run, { name })`). Implementations of one table share a name in every report, so the table carries it.
- **Folding `add` into `combine`.** `num.add` is associative only unless refused, so two `combine`s of it would be Unknown where two `add`s are True today.

## What is not decided

- **Bytes per operation** on a page: bout 4.12.
- **An operation over lists.** `arr.has` takes a list; a custom operation takes scalars only, and `define` refuses a list Schema. Nothing asks for one yet.
- **Whether `checkOperation` should also sample from the Schema of every path a machine passes to the operation**, which would catch a path whose Schema admits values the argument refuses before a user meets the refusal. It would be a definition-time warning, not a check of a claim.
