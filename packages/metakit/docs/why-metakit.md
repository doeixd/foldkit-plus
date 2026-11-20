# Why Effect Schema needs inspectable expressions (and what changes when you have them)

If you already use [Effect](https://effect.website) and `effect/Schema`, you know the value of keeping structure as data. Because an Effect `Schema` carries an inspectable `SchemaAST`, one declaration gives you TypeScript types, runtime decoding, encoding, JSON Schema, and `Arbitrary` test generators without writing them four times.

That stops the moment you write a business rule or a state transition.

## The cliff: opaque JavaScript closures

In plain Effect `Schema`, a cross-field rule is a JavaScript predicate passed to `Schema.makeFilter`, and a state update is a plain TypeScript function:

```ts sketch
import { Schema } from 'effect'

const Account = Schema.Struct({
  balance: Schema.Int,
  reserved: Schema.Int,
  status: Schema.Literals(['open', 'frozen']),
}).pipe(
  Schema.check(
    Schema.makeFilter(a => a.balance >= 0 && a.reserved >= 0 && a.reserved <= a.balance),
  ),
)

function withdraw(account: typeof Account.Type, amount: number) {
  if (account.status !== 'open' || amount <= 0 || amount > account.balance - account.reserved) {
    return null
  }
  return { ...account, balance: account.balance - amount }
}
```

Both work at runtime when you have every value in memory. Neither can be read by any other tool, because JavaScript functions are black boxes. Four concrete costs follow immediately:

1. **Database drift:** You cannot turn `a => a.reserved <= a.balance` into a Postgres `CHECK` constraint or a Drizzle `WHERE` clause, so you write a second copy in SQL.
2. **UI and agent drift:** You cannot call `withdraw(frozenAccount, ???)` before the user types an amount. To disable the "Withdraw" button or hide an AI agent tool when `status === 'frozen'`, you write a second `canWithdraw(account)` function by hand.
3. **Silent invariant bugs:** TypeScript checks that `account.balance - amount` is a `number`, not that `reserved <= balance - amount` still holds. If someone accidentally deletes `amount <= account.balance - account.reserved`, the code compiles cleanly.
4. **Over-serialization and wasted queries:** Because selectors and updates are opaque closures, SSR cannot tell which model fields a page actually needs to serialize for resumability, and a cascading form cannot tell which filter parameters are still missing before issuing a query.

## The natural extension: keep Effect Schema, make the rules data

`metakit` does not replace Effect or `effect/Schema`. It extends `SchemaAST` by replacing only the opaque predicate with a small, typed expression tree (`Expr`) and replacing imperative update logic with a single-step `Transition` (`when` + simultaneous `apply` writes).

Your `Account` is still an ordinary Effect `Schema`: `Schema.decodeUnknownSync`, `Schema.is`, `Arbitrary`, `Option`, `Result`, and `Effect` all keep working unchanged.

```ts
import { Effect, Result, Schema } from 'effect'
import { Eq, Expr, Num, Path, Transition, Verdict } from 'metakit'
import * as Graph from 'metakit/graph'
import * as Inspect from 'metakit/inspect'
import * as Machine from 'metakit/machine'
import * as Prove from 'metakit/prove'
import * as Sql from 'metakit/sql'

const Account = Schema.Struct({
  id: Schema.String,
  balance: Schema.Int,
  reserved: Schema.Int,
  status: Schema.Literals(['open', 'frozen']),
  promoEnabled: Schema.Boolean,
}).pipe(
  Expr.refine($ =>
    Expr.all(Num.gte($.balance, 0), Num.gte($.reserved, 0), Num.lte($.reserved, $.balance)),
  ),
)

const Withdraw = Transition.make({
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
})
```

## Five implications you get from that single change

### 1. One rule runs in JS, SQL, forms, and JSON Schema

Every reader consumes the exact same AST attached to `Account`:

```ts
// Runtime decode (standard Effect Schema)
const bad = Schema.decodeUnknownResult(Account)({
  id: 'a1',
  balance: 10,
  reserved: 20,
  status: 'open',
  promoEnabled: false,
})
// Result.isFailure(bad) -> true

// Postgres CHECK constraint
const check = Result.getOrThrow(Sql.toCheck(Account, { dialect: 'postgres' }))
// check.text -> ((("balance" >= 0) AND ("reserved" >= 0)) AND ("reserved" <= "balance"))

// Form field bounds & JSON Schema
const specs = Inspect.fieldSpecs(Account)
// balance spec has min: Some(0), kind: 'integer'
// status spec has literals: Some(['open', 'frozen'])
const jsonSchema = Inspect.toJsonSchema(Account)
void bad
void check
void specs
void jsonSchema
```

### 2. Partial evaluation answers "is this allowed?" before inputs exist

`Transition.can` evaluates `Withdraw.when` against whatever slice of `{ state, input }` you have right now, returning a three-valued `Verdict` (`True`, `False`, or `Unknown`):

```ts
const frozen = {
  id: 'a1',
  balance: 50_000,
  reserved: 10_000,
  status: 'frozen' as const,
  promoEnabled: false,
}
const open = { ...frozen, status: 'open' as const }

const onFrozen = Transition.can(Withdraw, { state: frozen })
// Verdict.isFalse(onFrozen) -> true  (disable the button before any input is typed)

const onOpen = Transition.can(Withdraw, { state: open })
// Verdict.isUnknown(onOpen) -> true  (account is open; waiting on input.amount)

void Verdict.isFalse(onFrozen)
void Verdict.isUnknown(onOpen)
```

Runtime `null` is kept strictly separate from missing (`Unknown`) fields: `{ discount: null }` is a known `null` and folds immediately, while omitting `discount` leaves it `Unknown`.

### 3. Validity vs. authority is enforced by TypeScript

Every `Expr<Env, A>` is indexed by the environment `Env` it can read. `Account`'s invariant has `Env = Account`, so referencing a `principal` inside `Account`'s `Expr.refine` is a compile-time error. A policy built with `Expr.in({ row: Account, principal: Principal }, ...)` has both in scope. You cannot accidentally leak an authorization check into a table `CHECK` constraint.

### 4. Invariant preservation is proved—or refuted with a reproducer

`Prove.machine` checks every transition against `Account`'s invariants. Linear arithmetic and `OrderedEnum` rules prove synchronously via Interval + Zone in microseconds; if a guard is weakened, Z3 produces a concrete counterexample:

```ts
const AccountMachine = Machine.make({ state: Account, transitions: { Withdraw } })
const proof = await Effect.runPromise(Prove.machine(AccountMachine, { pin: ['Withdraw'] }))
// proof.ok -> true
// proof.format():
//   PROVED (zone) Withdraw [pinned]
void proof
```

If someone removes `Num.lte(input.amount, Num.sub(state.balance, state.reserved))`, `proof.ok` becomes `false` and `proof.format()` prints:

```text
REFUTED Withdraw [PIN BROKEN]
  before:   {"id":0,"balance":0,"reserved":0,"status":"open","promoEnabled":false}
  input:    {"amount":1}
  after:    {"id":0,"balance":-1,"reserved":0,"status":"open","promoEnabled":false}
  violated: (((balance >= 0) && (reserved >= 0)) && (reserved <= balance))
  repro:    Transition.run(Withdraw, {"id":0,"balance":0,"reserved":0,"status":"open","promoEnabled":false}, {"amount":1})
```

When a transition genuinely needs arbitrary JavaScript (such as a third-party fraud callback), `Expr.opaque` lets it live beside declarative transitions while degrading soundly to `Unknown`—never fabricating a fake proof.

### 5. Static dependency graphs and minimal SSR payloads come for free

Because reads and writes are inspectable paths, `metakit/graph` computes which view bindings each transition invalidates, which bindings never change (`deadBindings`), and which model paths SSR must serialize after folding static flags:

```ts
const $ = Path.from(Account)
const bindings = {
  available: Num.sub($.balance, $.reserved),
  accountId: $.id,
  promoBonus: Expr.when($.promoEnabled, { then: Num.sub($.balance, $.reserved), else: 0 }),
}

const analysis = Graph.analyze(AccountMachine, bindings)
// analysis.affectedBy.Withdraw -> ['available', 'promoBonus']
// analysis.deadBindings        -> ['accountId']

const pruned = Graph.pruneStatic(bindings, { promoEnabled: false })
// pruned.staticValues -> { promoBonus: 0 }
// pruned.resumePaths  -> Some([['balance'], ['reserved'], ['id']])
void analysis
void pruned
```

## What stays in plain Effect

`metakit` deliberately stops at single-step, synchronous expressions and transitions:

- **I/O, concurrency, retries, and services** stay in `Effect` (`Transition` emits pure data via `emits` for your Effect runtime to execute).
- **Encoding, decoding, and bidirectional codecs** stay in `effect/Schema`.
- **Rendering and layout** stay in your UI layer.

## Next

- Run every consumer above live in one file: [`examples/metakit/src/demo.ts`](../../../examples/metakit/src/demo.ts).
- Build your first schema, SQL `CHECK`, affordances, and proof step by step: [Getting started](./getting-started.md).
