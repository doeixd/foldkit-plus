# Verify a state machine in CI

A state machine here is a set of named transitions over one Effect `Schema`: each transition has a guard (when it may run) and writes (what it changes), and the Schema's rules must still hold afterwards. When the machine grows, someone eventually weakens a guard on a critical transition or adds an opaque helper (a plain JavaScript function metakit cannot read). If the proof then quietly falls from "proved" to "could not decide", CI stays green while the guarantee disappears.

`Prove.machine` checks every transition of a `Machine` and gives each one of three results: `proved` (no state the guard allows can break a rule), `refuted` (it found a state and input that do break one) or `undecided` (it could not tell). Under its default rules the report fails unless every transition is proved, or is `undecided` and named in `allowUnknown` with a reason. `pin` names the transitions that must stay proved. A refuted transition prints the values that break it and a `Transition.run` call that repeats the failure.

## Pin critical transitions and allow opaque ones explicitly

Install `metakit` and `effect`, and `z3-solver` as a dev dependency: the opaque transition below cannot be proved by the built-in checks, so this example needs the solver (see "`Prove.*` fails with `SolverUnavailableError`"). Run the file as an ES module, since it uses top-level `await`, or put the call inside a test.

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

What happened: `Withdraw` is proved, and the label `(zone)` names the checker that proved it (`concrete`, `interval` and `zone` run in the same process, `z3` is the solver). `ExternalReconcile` reads an opaque function, so it stays undecided; its reason in `allowUnknown` makes that acceptable, and the line prints the reason beside the result. `report.ok` is `true`.

## What causes `report.ok` to be `false`

By default (`strict: true`), `Prove.machine` sets `report.ok = false` when any transition is:

1. **`refuted`**: Z3 proposed a `(before, input)` pair and it replayed: both pass their Schemas, the guard holds, and `Transition.run` gives a state `stateSchema` refuses. A proposal that does not replay is `undecided`, never `refuted`.
2. **`undecided` without an entry in `allowUnknown`**: an `Opaque` term, a non-linear expression, a solver timeout (`timeoutMs`, default 10,000) or a proposal that did not replay prevented a proof, and no reason was documented.
3. **`pinBroken`**: a transition listed in `pin` returned `undecided` or `refuted` instead of `proved`, even with `strict: false`.

`Prove.machine` throws when it is called, before it proves anything, if `allowUnknown` has an empty or whitespace-only reason, if `pin` or `allowUnknown` names a transition the machine does not have, or if one transition is in both. A pinned transition must be proved, so there is nothing to allow.

To see what a failed result asks of you: a `refuted` transition needs its guard or writes fixed (read the witness below); an `undecided` one needs the cause removed (an `Opaque` term, a non-linear expression, a number field that may be `NaN`), a higher `timeoutMs` if the solver gave up, or an entry in `allowUnknown` that says why it is acceptable.

## A transition is `undecided` and names a field that "may hold NaN"

The checkers treat every number as ordered: `x <= 0` is what is left when `x > 0` is false. That is not so of `NaN`, which plain `Schema.Number` accepts and evaluation refuses to compare. A proof that reads such a field, in the guard, in an invariant or in a written value, stays `undecided` and its reason names the path. Declare the field `Schema.Finite` or `Schema.Int` to have it proved. A counterexample is still reported: its values are ordinary numbers.

## A rule over text stays `undecided`

Postgres cannot store text holding a NUL character (U+0000), so evaluation refuses every text operation and equality that meets one, before it looks at a null, and `and` or `or` do not let their other side decide past a refusal. Plain `Schema.String` accepts a NUL, so a rule that reads such a field may be refused and the checkers leave it `undecided`. Declare the field `Text.schema` from `metakit/domain`, which refuses a NUL where it is decoded:

```ts
import { Schema } from 'effect'
import { Text } from 'metakit/domain'

const Owned = Schema.Struct({ owner: Text.schema, balance: Schema.Int })
```

A rule over `Owned`'s `owner` can then be proved, and partial evaluation answers `Expr.judge` as soon as one side of a comparison is a known null.

## A transition is `refuted` by a null, or by a number past 2^53 − 1

The solver reads a rule as `Expr.eval` does. A field that may be null (`Schema.NullOr`, `Schema.optionalKey`, a field under a nullable parent) makes every comparison of it null, and a rule holds only where it is true: say what a null means with `Expr.any(Null.isNull(x), …)` (`Null` is imported from `metakit` like `Num`). An integer result outside ±(2^53 − 1) is refused by evaluation, so a rule over unbounded integers that adds or multiplies them is refuted at the edge: bound the fields.

A transition that writes a whole struct is checked against the rules that read its fields, and a written value is held to the bounds its field declares, also inside `Schema.NullOr`.

## `Prove.*` fails with `SolverUnavailableError`

`z3-solver` is an optional peer, the solver `Prove.*` hands a goal to when the built-in checks cannot decide it. A goal the built-in checks prove never loads it; one they leave undecided needs it, and without it the Effect fails with `SolverUnavailableError`. Install it as a dev dependency (`pnpm add -D z3-solver`, or the same with your package manager).

To use a different solver, provide `Prove.Solver` with an Effect Layer such as `Layer.succeed(Prove.Solver, backend)`. The backend's `solve` runs in a scope that closes when the proof finishes or is interrupted. Unsatisfiable results name the backend and its semantic encoding. MetaKit validates and replays candidate counterexamples before reporting them.

## Reading a counterexample witness

When a transition is refuted, `entry.witness` holds `Option.some(report)` with structured `before` (the state it started from), `input`, `after` (the state it produced, which the Schema refuses), the `violated` rules as text, and a `reproducer` string, a `Transition.run` call you can paste into a test where your transition is in scope. `report.format()` prints all five. If `Withdraw` above lost its `Num.lte(input.amount, …)` guard, it would print:

```text
REFUTED Withdraw [PIN BROKEN]
  before:   {"balance":0,"reserved":0,"status":"open"}
  input:    {"amount":1}
  after:    {"balance":-1,"reserved":0,"status":"open"}
  violated: (((balance >= 0) && (reserved >= 0)) && (reserved <= balance))
  repro:    Transition.run(Withdraw, {"balance":0,"reserved":0,"status":"open"}, {"amount":1})
```

In a Vitest test, assert `expect(report.ok, report.format()).toBe(true)` so a failing proof prints the formatted witness directly in the test output. That assertion is how CI fails: the test goes red when any transition is refuted, undecided without a reason, or pinned and not proved.

## Next

- A proof of one step says nothing about two writers at once or replies that arrive out of order: [Check what a proof of one step cannot](./stores-and-order.md).
- Declare the rules and transitions this page proves: [Write a business rule once](./getting-started.md).
