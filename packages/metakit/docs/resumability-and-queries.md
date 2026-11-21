# Prune SSR payloads and gate dependent queries

Server-rendered pages often serialize the entire model to the browser even when half the UI is behind a disabled feature flag or never changes after load. And cascading forms (country -> region -> city) often fire broken queries before upstream selections are filled in.

`metakit/graph` solves both statically from your `Machine` and `Expr` definitions without running a runtime subscription tracker.

## Compute static `affectedBy` maps and dead bindings

`Graph.analyze(machine, bindings)` compares every transition's write paths against every view binding's read paths (symmetrically along parent and child prefixes). It returns:

- `affectedBy[tag]`: the exact bindings invalidated when `tag` fires.
- `deadBindings`: bindings that depend on no path written by any transition, so they never need client subscriptions.
- `liveModelPaths`: the minimal set of model paths touched anywhere.

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

- **A part that is not there refuses its messages.** `savings` may be null: `SavingsWithdraw` is refused while it is, and `affordances` lists it as `disabled`. A key that is absent (an optional field) is refused the same way when dispatched, and reads as `pending` in `affordances`, which takes a missing key to mean "not known yet".
- **Two transitions cannot share a tag.** `Checking` with `Withdraw` and an own transition named `CheckingWithdraw` do not compile, and `Machine.compose` throws naming both. The name `''` keeps a part's tags as they are.
- **A composed machine is a machine.** Lift it again under a larger model, prove it with `Prove.machine`, or give it to `Graph.analyze`.

## Shrink SSR resume payloads (`Graph.pruneStatic`)

At SSR time, pass known server-side values (feature flags, tenant settings, fixed constants) to `Graph.pruneStatic`. Bindings that fold completely to a literal move into `staticValues` (including known `null`, which stays distinct from omitted `Unknown` fields), and `resumePaths` returns the exact minimal model paths still needed by `liveBindings`.

```ts
const pruned = Graph.pruneStatic(bindings, { promoEnabled: false })
// pruned.staticValues -> { promoBonus: 0 }
// Object.keys(pruned.liveBindings) -> ['available', 'statusLabel', 'accountId']
// Option.map(pruned.resumePaths, ps => ps.map(Path.format))
//   -> Some(['balance', 'reserved', 'status', 'id'])
```

## Gate dependent queries (`Graph.queryReadiness`)

For a cascading filter over `{ row, params }`, `Graph.queryReadiness(expr, partialEnv)` partially evaluates the predicate and reports whether any non-row paths remain unbound. It is ready only when none do and what is left lowers to SQL: a predicate SQL refuses (an `Expr.opaque` term over the row, a fraction beside an integer column) has nothing `missing` and names the reason in `unsupported`.

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
// step2 -> { ready: true, residual } (short-circuited: countryId and regionId are not required)

const step3 = Graph.queryReadiness(filter, {
  params: { all: false, countryId: 'US', regionId: 'CA' },
})
if (step3.ready) {
  const where = Result.getOrThrow(
    Sql.toWhere(step3.residual, { dialect: 'postgres', rowPrefix: ['row'] }),
  )
  // where.text   -> (("countryId" IS NOT DISTINCT FROM $1) AND ("regionId" IS NOT DISTINCT FROM $2))
  // where.params -> ['US', 'CA']
  void where
}
void Option.isSome(analysis.liveModelPaths)
void pruned
void step1
void step2
```
