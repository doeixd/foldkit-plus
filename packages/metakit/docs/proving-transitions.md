# Verify a state machine in CI

When a state machine grows, someone eventually adds an opaque helper or weakens a guard on a critical transition. If a proof silently degrades from `True` to `Unknown`, CI stays green while the guarantee disappears.

`Prove.machine` verifies every transition in a `Machine` under strict CI rules: `pin` locks critical transitions to `proved`, `allowUnknown` requires an explicit non-empty reason for any transition that cannot be proved (such as an `Expr.opaque` escape hatch), and refuted transitions print a copy-pasteable reproducer.

## Pin critical transitions and allow opaque ones explicitly

Pass `pin` and `allowUnknown` to `Prove.machine`. Both keys are checked against the machine's transition names at compile time, so a typo fails typechecking.

```ts
import { Effect, Schema } from 'effect'
import { Eq, Expr, Num, Transition } from 'metakit'
import * as Machine from 'metakit/machine'
import * as Prove from 'metakit/prove'

const Account = Schema.Struct({
  balance: Schema.Int,
  reserved: Schema.Int,
  status: Schema.Literals(['open', 'frozen']),
}).pipe(
  Expr.refine($ =>
    Expr.all(Num.gte($.balance, 0), Num.gte($.reserved, 0), Num.lte($.reserved, $.balance)),
  ),
)

const AccountMachine = Machine.make({
  state: Account,
  transitions: {
    Withdraw: Transition.make({
      state: Account,
      input: Schema.Struct({ amount: Schema.Int }),
      when: ({ state, input }) =>
        Expr.all(
          Eq.is(state.status, 'open'),
          Num.gt(input.amount, 0),
          Num.lte(input.amount, Num.sub(state.balance, state.reserved)),
        ),
      apply: ({ state, input }) => [
        Transition.set(state.balance, Num.sub(state.balance, input.amount)),
      ],
    }),
    ExternalReconcile: Transition.make({
      state: Account,
      input: Schema.Struct({}),
      when: ({ state }) =>
        Expr.opaque({ name: 'fraudCheck', reads: [state.balance] }, () => true),
      apply: ({ state }) => [Transition.set(state.balance, Num.sub(state.balance, 1))],
    }),
  },
})

const report = await Effect.runPromise(
  Prove.machine(AccountMachine, {
    pin: ['Withdraw'],
    allowUnknown: {
      ExternalReconcile: 'Calls external fraudCheck callback',
    },
  }),
)
// report.ok -> true
// report.format():
//   PROVED (zone) Withdraw [pinned]
//   UNDECIDED (allowed: Calls external fraudCheck callback) ExternalReconcile: ...
```

## What causes `report.ok` to be `false`

By default (`strict: true`), `Prove.machine` sets `report.ok = false` when any transition is:

1. **`refuted`**: Z3 proposed a `(before, input)` pair and it replayed: both pass their Schemas, the guard holds, and `Transition.run` gives a state `stateSchema` refuses. A proposal that does not replay is `undecided`, never `refuted`.
2. **`undecided` without an entry in `allowUnknown`**: an `Opaque` term, a non-linear expression, a solver timeout (`timeoutMs`, default 10,000) or a proposal that did not replay prevented a proof, and no reason was documented.
3. **`pinBroken`**: a transition listed in `pin` returned `undecided` or `refuted` instead of `proved` (even if `strict: false` or listed in `allowUnknown`).

An empty or whitespace-only string in `allowUnknown` throws immediately at definition time.

## A transition is `undecided` and names a field that "may hold NaN"

The checkers treat every number as ordered: `x <= 0` is what is left when `x > 0` is false. That is not so of `NaN`, which plain `Schema.Number` accepts and evaluation refuses to compare. A proof that reads such a field, in the guard, in an invariant or in a written value, stays `undecided` and its reason names the path. Declare the field `Schema.Finite` or `Schema.Int` to have it proved. A counterexample is still reported: its values are ordinary numbers.

## A transition is `refuted` by a null, or by a number past 2^53 − 1

The solver reads a rule as `Expr.eval` does. A field that may be null (`Schema.NullOr`, `Schema.optionalKey`, a field under a nullable parent) makes every comparison of it null, and a rule holds only where it is true: say what a null means with `Expr.any(Null.isNull(x), …)`. An integer result outside ±(2^53 − 1) is refused by evaluation, so a rule over unbounded integers that adds or multiplies them is refuted at the edge: bound the fields.

A transition that writes a whole struct is checked against the rules that read its fields, and a written value is held to the bounds its field declares, also inside `Schema.NullOr`.

## `Prove.*` fails with `SolverUnavailableError`

`z3-solver` is an optional peer. A goal the synchronous checks prove never loads it; one they leave undecided needs it, and without it the Effect fails with `SolverUnavailableError`. Install it as a dev dependency (`pnpm add -D z3-solver`).

## Reading a counterexample witness

When a transition is refuted, `entry.witness` holds `Option.some(report)` with structured `before`, `input`, `after`, `violated` invariant strings, and a `reproducer` string. `report.format()` prints all five:

```text
REFUTED Withdraw [PIN BROKEN]
  before:   {"balance":0,"reserved":0,"status":"open"}
  input:    {"amount":1}
  after:    {"balance":-1,"reserved":0,"status":"open"}
  violated: (((balance >= 0) && (reserved >= 0)) && (reserved <= balance))
  repro:    Transition.run(Withdraw, {"balance":0,"reserved":0,"status":"open"}, {"amount":1})
```

In a Vitest test, assert `expect(report.ok, report.format()).toBe(true)` so a failing proof prints the formatted witness directly in the test output.
