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
- **Importing `metakit/sql`, `metakit/drizzle`, or `metakit/prove` in browser bundles.** Keep browser code on `metakit`, `metakit/domain`, `metakit/aggregates`, `metakit/machine`, and `metakit/inspect`.

## Main exports by subpath

- `metakit`: `Path`, `Expr`, `Bool`, `Eq`, `Null`, `Ord`, `Num`, `Transition`, `Verdict`, `Abstract`
- `metakit/domain`: `Money`, `CalendarDay`, `OrderedEnum`, `Domain`
- `metakit/aggregates`: `sum`, `count`, `min`, `max`, `every`, `any`
- `metakit/machine`: `make`, `Machine`, `MessageOf`, `EmitOf`
- `metakit/inspect`: `fieldSpecs`, `toJsonSchema`, `affordances`
- `metakit/graph`: `analyze`, `pruneStatic`, `queryReadiness`
- `metakit/sql`: `toCheck`, `toWhere`, `toUpdate`, `SqlUnsupportedError`
- `metakit/drizzle`: `toCheck`, `toWhere`, `toUpdate`
- `metakit/prove`: `invariant`, `transition`, `policy`, `machine`
- `metakit/conformance`: `checkOpSoundness`, `checkResidualizeSoundness`

## See also

- [metakit README](https://github.com/doeixd/foldkit-plus/blob/main/packages/metakit/README.md)
- [Getting started](https://github.com/doeixd/foldkit-plus/blob/main/packages/metakit/docs/getting-started.md)
- [Domain types & aggregates](https://github.com/doeixd/foldkit-plus/blob/main/packages/metakit/docs/domain-types.md)
- [Proving transitions in CI](https://github.com/doeixd/foldkit-plus/blob/main/packages/metakit/docs/proving-transitions.md)
- [Resumability & dependent queries](https://github.com/doeixd/foldkit-plus/blob/main/packages/metakit/docs/resumability-and-queries.md)
- [Runnable example](https://github.com/doeixd/foldkit-plus/blob/main/examples/metakit/src/demo.ts)
