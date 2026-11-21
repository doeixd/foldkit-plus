Checked against metakit 0.1.0, effect 4.1.4.

# `metakit`

Use `metakit` when you want one inspectable Effect `Schema` + `Transition` declaration to drive runtime validation, partial evaluation (disabled buttons / agent affordances), SQL or Drizzle `CHECK`/`WHERE`/`UPDATE`, static dependency & SSR pruning, and Zone/Z3 proofs—without pulling in Foldkit.

Use `foldkit-entity` + `foldkit-guard` instead when you want Foldkit's entity relations, Remote/Sync wiring, and CRUD/CMS adapters.

## Normal path

```ts
import { Effect, Result, Schema } from 'effect'
import { Eq, Expr, Num, Path, Transition } from 'metakit'
import { Money } from 'metakit/domain'
import * as Graph from 'metakit/graph'
import * as Machine from 'metakit/machine'
import * as Prove from 'metakit/prove'
import * as Sql from 'metakit/sql'

const Usd = Money.make('USD')

const Account = Schema.Struct({
  id: Schema.String,
  balance: Usd,
  reserved: Usd,
  status: Schema.Literals(['open', 'frozen']),
}).pipe(
  Expr.refine($ =>
    Expr.all(Num.gte($.balance, 0), Num.gte($.reserved, 0), Num.lte($.reserved, $.balance)),
  ),
)

const Withdraw = Transition.make({
  state: Account,
  input: Schema.Struct({ amount: Usd }),
  when: ({ state, input }) =>
    Expr.all(
      Eq.is(state.status, 'open'),
      Num.gt(input.amount, 0),
      Num.lte(input.amount, Num.sub(state.balance, state.reserved)),
    ),
  apply: ({ state, input }) => [
    Transition.set(state.balance, Money.sub(state.balance, input.amount)),
  ],
})

const AccountMachine = Machine.make({
  state: Account,
  transitions: { Withdraw },
})

const check = Result.getOrThrow(Sql.toCheck(Account, { dialect: 'postgres' }))
const $ = Path.from(Account)
const analysis = Graph.analyze(AccountMachine, {
  available: Num.sub($.balance, $.reserved),
  accountId: $.id,
})
const proof = await Effect.runPromise(Prove.machine(AccountMachine, { pin: ['Withdraw'] }))
void check
void analysis
void proof
```

## Mistakes to avoid

- **Wrapping `Money.make('USD')` with `.schema`.** `Money.make('USD')` is already a `Schema.Codec<MoneyValue<'USD', 2>, number>`. Only `CalendarDay.schema` and `OrderedEnum.make(...).schema` expose `.schema`.
- **Using `Num.sub` to assign back to a `Money` field.** `Num.sub` returns `Expr<Env, number>`, which drops the currency brand. Use `Money.add` / `Money.sub` so `Transition.set(state.balance, ...)` keeps currency and scale safety.
- **Passing 3 positional args to `Expr.when` or a bare string to `Expr.opaque`.** Use `Expr.when(cond, { then, else })` and `Expr.opaque({ name: '...', reads: [...] }, fn)`.
- **Conflating `null` with missing (`Unknown`) in partial evaluation.** `{ discount: null }` is a known `null` (folds to a literal in `Expr.residualize` and `Graph.pruneStatic`); omit the key to leave it `Unknown`.
- **Expecting a proof over plain `Schema.Number`.** Evaluation refuses to order `NaN`, so a rule that compares one does not hold, and no check proves anything that reads a number that may be `NaN`: `Abstract.*`, `Prove.*` and the `metakit/policy` checks answer `Unknown` and name the path. Declare a compared number `Schema.Finite` or `Schema.Int`.
- **Expecting a comparison of a null to hold.** A value that may be null (`Schema.NullOr`, `Schema.optionalKey`, a field under a nullable parent) makes every operator over it null, and a rule holds only where it is true. `Prove.*` reads it so: `Ord.gte(row.left, 0)` over a nullable `left` is refuted by the null, and `Expr.any(Null.isNull(row.left), Ord.gte(row.left, 0))` is proved. The synchronous `Abstract.*` checks leave such a goal `Unknown`.
- **Expecting a rule over a `Schema.String` field to be proved.** Every text and equality operation (`Eq.is`, `Eq.equals`, `Eq.oneOf`, `Str.*`) refuses text holding a NUL character, which Postgres cannot store, and a `Schema.String` admits one. The checkers answer `Unknown` for such a rule unless a rule they assume already took the text without refusing it; a field of `Schema.Literals` holds no NUL.
- **Comparing an `Option` field with `Option.none()`.** A path to an `Option` field (`Schema.Option`, `Schema.OptionFromNullOr`) reads as its value or null: test it with `Null.isNull(state.editingId)` or `Eq.isNot(state.editingId, null)`, and write `Transition.set(state.editingId, null)` to store `Option.none()`. A write to a field inside an `Option` is refused; write the whole value.
- **Expecting integer arithmetic past 2^53 − 1 to be proved.** Evaluation refuses a result outside the safe range, so `Prove.*` refutes a goal that needs one. Bound the fields.
- **Importing `metakit/sql`, `metakit/drizzle`, `metakit/aggregates/sql` or `metakit/prove` in browser bundles.** Keep browser code on `metakit`, `metakit/domain`, `metakit/aggregates`, `metakit/machine`, and `metakit/inspect`.
- **Building a SQL `UPDATE` from an input that was never checked.** `Sql.toUpdate` and `Drizzle.toUpdate` refuse (`Refused`) an input the transition's input Schema refuses; a fraction beside an integer column, `NaN`, an infinity, and two paths that come to one column name (`a_b` and `a.b`) are `SqlUnsupportedError`.

## Main exports by subpath

- `metakit`: `Path`, `PathAccessor`, `Expr`, `Bool`, `Eq`, `Null`, `Ord`, `Num`, `Str`, `Arr`, `Transition`, `Verdict`, `Abstract`, `opProperties`
- The 29 core operators include SQL's `=` and `in` (`Eq.equals`, `Eq.among`: null for a null value, and `among` null where nothing matches beside a null candidate; `Eq.is` and `Eq.oneOf` never give null), `Str.lowerAscii` (A to Z only), `Str.trim` (space, tab, LF, CR), the code-point orders `Str.lt`, `Str.lte`, `Str.gt`, `Str.gte`, and `Null.coalesce(value, fallback)`. Text is compared by character: a lone surrogate reads as U+FFFD.
- `Expr.evalResult(expr, env)` gives the value, null (an operand was null or its key absent), or the `Node.Refusal` of an integer past 2^53 − 1, a non-finite number, an operand of the wrong type, a `Match` value no case names, text holding a NUL (`unportable`) or a foreign operation with no implementation (`unsupported`). `Expr.eval` returns the value and throws the refusal. `Expr.holds(rule, env)` is true only where the rule evaluates to true. An operator takes a nullable operand and its result type then includes `null`.
- `Node.foreign({ id, version, returns, nulls })` declares an operation your application implements; build a call of it with `call` from `metakit/build`. Evaluation, `Expr.residualize` and `Expr.judge` take its implementation as `{ foreign: { [id]: { version, run } } }`, `Sql.toWhere` and `Drizzle.toWhere` as `foreign: { [id]: { version, sql } }`; without one, evaluation refuses, `judge` answers `Unknown`, SQL refuses naming `id@version`, and the checkers answer `Unknown`.
- `Transition.make({ state, input, supplied: { now: Schema.Int, id: Schema.String }, apply })` reads values no caller passes and no state holds as `supplied`; `Transition.run(t, state, input, { now, id })` takes them, and a machine's message carries them as `supplied`. `Transition.add(target, amount)` writes the sum. `Transition.opaque({ name, state, input, reads, writes, run })` declares a step written as code by its footprint; it throws where `run` changes a path `writes` does not name.
- `Transition.run` and `Transition.step` refuse (`Refused`) an input or supplied value its Schema refuses, a guard that is not true, and a written value that is refused. `Transition.make` throws for two writes where one target is under the other; `Transition.set` takes its type from the target, so a wider value does not compile. `Transition.lift(path, transition)` is refused where the model holds no child at `path`. `Transition.footprint` gives `reads` from `{ state, input, supplied }`, and `stateReads` and `writes` from the state.
- `Interval` (`top`, `bottom`, `between`, `constant`, `contains`, `within`, `meet`, `join`, `add`, `sub`, `neg`, `mul`, `monotone`, `lt`, `lte`, `is`) and `Zone` are the checker's own domains, exported for tools built on it; bounds round outward. `Abstract.abstractOps` has one row per operator, a `TermOp`, a `PredicateOp` or a `ValueOp`.
- `opProperties` holds what each core operator keeps (`identity`, `absorbing`, `idempotent`, `monotone`, and `reflexive`, `involution`); partial evaluation and the checker's bounds read it, and `checkAllProperties` in `metakit/conformance` checks each entry against the evaluator.
- `Abstract.checkTransition(stateSchema, transition)` is `True` only where every rule holds after the writes and every written value is one its field's Schema takes (bounds, also inside `NullOr`; being an integer; a literal of the enumeration; not null). `Abstract.checkGoal(stateSchema, transition, { assume, goal })` decides one goal that reads the state before as `state` and after as `next`. `Abstract.checkInvariant` and both answer `True` for "evaluates to true in every admitted environment" and `False` for "evaluates to false in every one".
- `Expr.rulesOf(schema)` lists each `Expr.refine` and Effect numeric bound with the property path it sits on (`at`, `[]` for the schema itself) and its `message` annotation as an `Option`, so a form can show the message beside the field. `Expr.refinementsOf` gives the expressions alone. Neither reads a check inside `Schema.optional` or `Schema.NullOr`.
- `metakit/domain`: `Money`, `Decimal`, `CalendarDay`, `OrderedEnum`, `Domain`. `Decimal.format(value, { scale })` and `Money.format(amount, code, { scale })` take the value's own scale. `Decimal.mul` and `Money.mul` multiply exactly and round half-even; they are evaluated in memory only (SQL refuses them, the checkers read them as unknown). `CalendarDay.toIso` and `fromIso` return a `Result` over years 0001 to 9999 (`CalendarDay.earliest` to `CalendarDay.latest`).
- `metakit/aggregates`: `sum` (of an integer expression), `count`, `min`, `max`, `every`, `any`. It imports no SQL.
- `metakit/aggregates/sql`: `toSql(aggregate, options)` gives an aggregate as a SQL expression (server side).
- `metakit/machine`: `make`, `Machine`, `MessageOf`, `EmitOf`. A machine's `affordances(state)` sorts its transitions into `available`, `disabled` and `pending` (the guard still needs its input); `dispatch` and `canDispatch` refuse a tag that names no transition. `lift(path, machine)` lifts every transition of a child machine under `path` (which may lead to a nullable or optional field: the transitions are refused while no child is there), and `compose({ state, transitions, children: { Left: lift(left, Counter), Right: lift(right, Counter) } })` makes one machine of them, naming each child transition by its child then its tag (`LeftAdded`; the name `''` keeps the tag). Two transitions that would share a tag do not compile, and `compose` throws. The composed `footprints` are paths from the parent state, so `Graph.analyze` and `foldkit-surface/writes` read them as any machine's.
- `metakit/inspect`: `fieldSpecs`, `toJsonSchema`. A nullable enum lists `null` in its `enum`. A field spec keeps one bound per side, the tightest whichever order the checks were declared, and says whether the key is `optional`. `toJsonSchema` gives an array its `items` and a nested struct its `properties`, claims no `type` for a field whose shape it cannot read, and lists only non-optional keys in `required`. A `CalendarDay` travels as an integer, so it carries `x-metakit-domain` and no `format`.
- `metakit/graph`: `analyze`, `pruneStatic`, `queryReadiness`. `queryReadiness` is ready only when every parameter is bound and what is left lowers to SQL; otherwise `missing` names the parameters and `unsupported` the reason.
- `metakit/sql`: `toCheck` (a `CHECK (...)` string that fails where a rule is null), `toWhere` and `toUpdate` (`{ text, params }`), `SqlUnsupportedError`, and `SqlPiece` for the SQL of a foreign operation. `toUpdate`'s `whereId` names a field of the state.
- `metakit/drizzle`: `toCheck`, `toWhere`, `toUpdate`, each over a Drizzle table; the same lowering as `metakit/sql`.
- `metakit/policy`: `make` builds named boolean rules over a row and a principal. `checkConsistent` looks for an unreachable rule and `checkImplication` checks whether one rule implies another.
- `metakit/store`: a store declares `StoreCapabilities` (`{ name, isolation: 'eventual' | 'read-committed' | 'serializable', parentRowLock }`). `gives(store, capability)` answers for `'row-atomic'` (any store but an eventual one) and `'parent-serialized'` (serializable, or read-committed with a parent row lock). `mount(store, requirements)` throws `StoreRefused`, naming each rule, what it needs and the store; `refused` returns the same list. It imports no expression code.
- `metakit/temporal` (tests and CI): `requirements({ machine, aggregates })` gives each rule's need, typed by the declaration's keys: a transition that reads the state it writes, or writes a state with rules, needs `'row-atomic'`; an aggregate needs `'parent-serialized'`. `obligations(machine)` names each pair of transitions where one writes what the other reads or writes (`{ kind: 'walk', name: 'A/B', detail, over }`); `Prove.machine`'s report carries them as `obligations` and they do not move `ok`. `walk(scenario, { seed, runs })` runs a scenario's steps (`{ name, of?, after?, run }`) in seeded orders that respect `after`, asks `holds` after every step, and answers `Held` or `Broken` with the failing `seed`, the `interleaving` and the `minimal` steps. `discharge(obligation, scenario)` walks for one obligation and throws when the scenario lacks steps `of` what it is over. `undischarged(obligations, discharges)` lists what no held walk covers: assert it is empty. `obligation({ name, shows, over })` makes one of your own.
- `metakit/prove`: `invariant`, `transition`, `policy`, `machine`, `policyConsistent`, `policyImplies`. The last two accept policy definitions from `metakit/policy` or `Guards.check` and escalate undecided checks to Z3. Each takes `{ timeoutMs }` (default 10,000) and fails with `SolverUnavailableError` when a goal needs `z3-solver` and it is not installed. A `False` carries an environment that was replayed through the Schemas and the evaluator; an assignment that does not replay is `Unknown`.
- `metakit/conformance`: `checkOpSoundness(id)` and `checkAllOps()` hold each primitive operator to one answer from evaluation, partial evaluation and the Tier 3 checker over null, absent keys, NaN, the ends of the safe range and text holding a NUL; `checkProperties(op, properties, { arity, resolve })` and `checkAllProperties()` check declared properties against the evaluator; `checkResidualizeSoundness` does so for an expression over sampled values; `coreOps` is every operator's descriptor.
- `metakit/build`: `wrap`, `toNode`, `isExpr`, `call`, `evalNode`, `residualizeNode`, `judgeNode`, `readsOfNode`, for a language that builds its own constructors on metakit's nodes.

## See also

- [metakit README](https://github.com/doeixd/foldkit-plus/blob/main/packages/metakit/README.md)
- [Why Effect Schema needs inspectable expressions](https://github.com/doeixd/foldkit-plus/blob/main/packages/metakit/docs/why-metakit.md)
- [Getting started](https://github.com/doeixd/foldkit-plus/blob/main/packages/metakit/docs/getting-started.md)
- [Domain types & aggregates](https://github.com/doeixd/foldkit-plus/blob/main/packages/metakit/docs/domain-types.md)
- [Proving transitions in CI](https://github.com/doeixd/foldkit-plus/blob/main/packages/metakit/docs/proving-transitions.md)
- [Resumability & dependent queries](https://github.com/doeixd/foldkit-plus/blob/main/packages/metakit/docs/resumability-and-queries.md)
- [Runnable example](https://github.com/doeixd/foldkit-plus/blob/main/examples/metakit/src/demo.ts)
