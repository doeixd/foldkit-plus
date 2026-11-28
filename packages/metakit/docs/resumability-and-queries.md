# Prune SSR payloads and gate dependent queries

Server-rendered pages often serialize the entire model to the browser even when half the UI is behind a disabled feature flag or never changes after load. And cascading forms (country -> region -> city) often fire broken queries before upstream selections are filled in.

`metakit/graph`, a subpath of the `metakit` package (`pnpm add metakit effect`), works both out from your `Machine` and `Expr` definitions before the page runs, so no runtime tracker has to watch what each view reads. A `Machine` is a named set of transitions over one Schema (see [Write a business rule once](./getting-started.md)); an `Expr` is a rule or a value written as data. This page also shows how to build one machine from the machines of a model's parts.

A binding is a named expression a view reads, such as the balance the screen shows. A path is a field's address in the Model, such as `['balance']`.

## Compute static `affectedBy` maps and dead bindings

`Graph.analyze(machine, bindings)` compares every transition's write paths against every binding's read paths (also when one path is a parent or child of the other). It returns:

- `affectedBy[tag]`: the bindings that must be read again when the transition named `tag` runs.
- `deadBindings`: bindings that depend on no path written by any transition, so the page never needs to watch them for changes.
- `liveModelPaths`: the paths that some transition writes or some binding reads, as a minimal set.

```ts
import { Option, Schema } from 'effect'
import { Eq, Expr, Num, Path, Transition } from 'metakit'
import * as Graph from 'metakit/graph'
import * as Machine from 'metakit/machine'

const Account = Schema.Struct({
  id: Schema.String,
  balance: Schema.Int,
  reserved: Schema.Int,
  status: Schema.Literals(['open', 'frozen']),
  promoEnabled: Schema.Boolean,
})

const AccountMachine = Machine.make({
  state: Account,
  transitions: {
    Withdraw: Transition.make({
      state: Account,
      input: Schema.Struct({ amount: Schema.Int }),
      apply: ({ state, input }) => [
        Transition.set(state.balance, Num.sub(state.balance, input.amount)),
      ],
    }),
    Freeze: Transition.make({
      state: Account,
      input: Schema.Struct({}),
      apply: ({ state }) => [Transition.set(state.status, 'frozen')],
    }),
  },
})

const $ = Path.from(Account)
const bindings = {
  available: Num.sub($.balance, $.reserved),
  statusLabel: Expr.match($.status, { open: 'Active', frozen: 'Frozen' }),
  accountId: $.id,
  promoBonus: Expr.when($.promoEnabled, { then: Num.sub($.balance, $.reserved), else: 0 }),
}

const analysis = Graph.analyze(AccountMachine, bindings)
// analysis.affectedBy.Withdraw -> ['available', 'promoBonus']
// analysis.affectedBy.Freeze   -> ['statusLabel']
// analysis.deadBindings        -> ['accountId']
```

What happened: `Withdraw` writes `balance`, which `available` and `promoBonus` read, so only those two bindings need reading again; `Freeze` writes `status`, which only `statusLabel` reads; nothing writes `id`, so `accountId` is dead. The analysis follows the paths an expression names, not which branch runs, so `promoBonus` counts as reading `balance` even while `promoEnabled` is false.

If a binding contains an `Expr.opaque` node without explicit `reads`, `Graph.analyze` conservatively marks it affected by every transition that writes at least one path.

## Build one machine from the machines of its parts

A model is usually made of parts, and a part's transitions are written against the part alone: `Withdraw` above knows an account, not the household that holds two of them. To analyze the whole model you need each transition's reads and writes as paths from the whole.

`Machine.lift(path, machine)` moves every transition of a part's machine under `path`, and `Machine.compose` makes one machine from the lifted parts and the whole's own transitions. Each part is given a name, which goes in front of its tags, so one machine used at two paths gives two sets of messages.

```ts
const Household = Schema.Struct({
  name: Schema.String,
  checking: Account,
  savings: Schema.NullOr(Account),
})
const home = Path.from(Household)

const HouseholdMachine = Machine.compose({
  state: Household,
  transitions: {},
  children: {
    Checking: Machine.lift(home.checking, AccountMachine),
    Savings: Machine.lift(home.savings, AccountMachine),
  },
})
// Object.keys(HouseholdMachine.transitions)
//   -> ['CheckingWithdraw', 'CheckingFreeze', 'SavingsWithdraw', 'SavingsFreeze']
// HouseholdMachine.footprints.SavingsWithdraw.writes -> [['savings', 'balance']]

const household = Graph.analyze(HouseholdMachine, {
  checkingBalance: home.checking.balance,
  savings: home.savings,
})
// household.affectedBy.CheckingWithdraw -> ['checkingBalance']
// household.affectedBy.SavingsWithdraw  -> ['savings']
```

What to expect from a composed machine:

- **A part that is not there refuses its messages.** `savings` may be null: `SavingsWithdraw` is refused while it is, and `Machine.affordances` lists it as `disabled`. A key that is absent (an optional field) is refused the same way when dispatched, and reads as `pending` in `Machine.affordances`, which takes a missing key to mean "not known yet".
- **Two transitions cannot share a tag.** `Checking` with `Withdraw` and an own transition named `CheckingWithdraw` do not compile, and `Machine.compose` throws naming both. The name `''` keeps a part's tags as they are.
- **A composed machine is a machine.** Lift it again under a larger model, prove it with `Prove.machine`, or give it to `Graph.analyze`.

## Shrink SSR resume payloads (`Graph.pruneStatic`)

A resumable page is one the browser continues from the Model the server sent, so every Model field a view reads has to be in that payload. At server-render time, pass the values you already know (feature flags, tenant settings, fixed constants) to `Graph.pruneStatic`. Bindings that fold completely to a literal move into `staticValues` (a known `null` counts: it is a value, unlike a field you left out, which stays unknown). `liveBindings` are the others, and `resumePaths` is the minimal list of Model paths they still read, wrapped in an `Option` that is `None` when a binding reads something no path names (an `Expr.opaque` term with no declared `reads`).

```ts
const pruned = Graph.pruneStatic(bindings, { promoEnabled: false })
// pruned.staticValues -> { promoBonus: 0 }
// Object.keys(pruned.liveBindings) -> ['available', 'statusLabel', 'accountId']
// Option.map(pruned.resumePaths, ps => ps.map(Path.format))
//   -> Some(['balance', 'reserved', 'status', 'id'])
```

## Gate dependent queries (`Graph.queryReadiness`)

For a cascading filter over `{ row, params }`, `Graph.queryReadiness(expr, partialEnv)` fills in the choices you have. The `residual` is the filter simplified by those choices. It is ready by default once its remaining reads are row fields and its expression can be lowered to SQL pieces.

To check a specific renderer, pass a `prepare` function that sends the residual to `Sql.toWhere` or `Drizzle.toWhere` with your configuration. Readiness then includes the renderer's checks for foreign operations, columns and relation mappings. `missing` lists any unbound parameters. Once they are bound, `unsupported` gives the reason preparation refused the filter.

```ts
import { Result } from 'effect'
import * as Sql from 'metakit/sql'

const City = Schema.Struct({ id: Schema.String, countryId: Schema.String, regionId: Schema.String })
const Params = Schema.Struct({
  all: Schema.Boolean,
  countryId: Schema.String,
  regionId: Schema.String,
})

const filter = Expr.in({ row: City, params: Params }, ({ row, params }) =>
  Expr.any(
    Eq.is(params.all, true),
    Expr.all(Eq.is(row.countryId, params.countryId), Eq.is(row.regionId, params.regionId)),
  ),
)

const step1 = Graph.queryReadiness(filter, { params: { countryId: 'US' } })
// step1 -> { ready: false, missing: Some([['params', 'all'], ['params', 'regionId']]),
//            unsupported: None, residual }

const step2 = Graph.queryReadiness(filter, { params: { all: true } })
// step2 -> { ready: true, residual } (`all` is true, so countryId and regionId are not required)

const prepare = (residual: typeof filter) => Sql.toWhere(residual, { dialect: 'postgres' })
const step3 = Graph.queryReadiness(
  filter,
  { params: { all: false, countryId: 'US', regionId: 'CA' } },
  { prepare },
)
if (step3.ready) {
  const where = Result.getOrThrow(prepare(step3.residual))
  // where.params -> ['US', 'CA']
  void where
}
void Option.isSome(analysis.liveModelPaths)
void pruned
void step1
void step2
```

## Next

- Prove the machines you analyze here: [Verify a state machine in CI](./proving-transitions.md).
- Expose a machine's transitions to an AI assistant: [Let an agent call your state machine's transitions](../../agent/docs/machine-tools.md).
