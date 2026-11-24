# Check what a proof of one step cannot

With `metakit` you wrote a withdrawal as data and [had `Prove.machine` show](./proving-transitions.md) that it never overdraws an account. Then two withdrawals arrive at the same moment. Each reads a balance of 100, each takes 80, and the account ends at -60. Nothing in the proof was wrong: it showed that one step, started from a valid account, leaves a valid account. It said nothing about two steps reading the same account before either wrote, and nothing about a reply that arrives after a later one.

Two things decide whether the rule still holds, and neither is in the rule:

- **How the database runs concurrent writes.** If it runs them one at a time, the second withdrawal reads 20 and is refused.
- **The order events arrive in.** If a page applies an old reply over a newer one, it shows a state no single step produced.

This guide shows how to turn the first into an error when the server starts, and the second into a list of tests still to write, with a function that runs your steps in many orders for you. It assumes you have read [the tutorial](./getting-started.md); the account here is a smaller one with only a `balance`. Install `metakit` and `effect`; the proof step needs `z3-solver` only if one of your transitions is one the built-in checks cannot decide. The code blocks below continue one file as an ES module (they use top-level `await`); the comment under each is its result.

## Refuse a store that cannot hold a rule

A *store* here is whatever persists your state: Postgres, SQLite, a table in memory. Describe it with a name and three facts about how it runs writes, defined just below. The values here are Postgres as it comes: its default level is read committed, it runs a transaction of several statements as one unit, and nothing locks a parent row unless your writes do.

```ts
import * as Store from 'metakit/store'

const postgres: Store.StoreCapabilities = {
  name: 'Postgres',
  isolation: 'read-committed',
  isolates: 'transaction',
  parentRowLock: false,
}
```

`isolation` is how the store runs writes that overlap in time. `'serializable'` means the result is as if they ran one at a time. `'read-committed'` means each statement sees what has been committed so far, so two writers can both read a value that one of them is about to change. `'eventual'` means copies of the data accept writes separately and merge them later. `isolates` says how far that reaches: `'transaction'` when a read and a write made later in the same transaction are one unit, `'statement'` when only one statement, or one batch that cannot branch on what it read, is (Cloudflare D1 is such a store). A store that leaves it out is taken to isolate one statement. `parentRowLock` says whether a write locks the row that a group of rows belongs to (the account, for its ledger entries) until it commits.

Now declare the rules. A *transition* is one change to one record, with an optional condition (`when`) that must hold for it to apply. A *machine* is a record's Schema with its named transitions. An *aggregate* is a value computed over many rows, such as the sum of an account's entries.

```ts
import { Schema } from 'effect'
import { Expr, Num, Transition } from 'metakit'
import * as Rows from 'metakit/aggregates'
import * as Machine from 'metakit/machine'
import * as Temporal from 'metakit/temporal'

const Account = Schema.Struct({ balance: Schema.Int }).pipe(
  Expr.refine($ => Num.gte($.balance, 0)),
)
const Amount = Schema.Struct({ amount: Schema.Int.pipe(Expr.refine($ => Num.gt($, 0))) })

const Bank = Machine.make({
  state: Account,
  transitions: {
    Deposit: Transition.make({
      state: Account,
      input: Amount,
      apply: ({ state, input }) => [
        Transition.set(state.balance, Num.add(state.balance, input.amount)),
      ],
    }),
    Withdraw: Transition.make({
      state: Account,
      input: Amount,
      when: ({ state, input }) => Num.lte(input.amount, state.balance),
      apply: ({ state, input }) => [
        Transition.set(state.balance, Num.sub(state.balance, input.amount)),
      ],
    }),
  },
})

const Entry = Schema.Struct({ account: Schema.String, delta: Schema.Int })
const aggregates = { balanceIsItsEntries: Rows.sum(Entry, $ => $.delta) }

const needed = Temporal.requirements({ machine: Bank, aggregates })
// [
//   { rule: 'Deposit', needs: 'row-atomic', because: 'it writes from the state it read' },
//   { rule: 'Withdraw', needs: 'row-atomic', because: 'it writes from the state it read' },
//   { rule: 'balanceIsItsEntries', needs: 'parent-serialized',
//     because: 'it reads every row under one parent' },
// ]
```

`Temporal.requirements` reads what each rule needs from the declarations. A transition that reads the record it writes needs `row-atomic`: its guard and its writes must apply to the row as one step. An aggregate needs `parent-serialized`: writers of the rows under one parent must run one at a time, which a `'serializable'` store gives, and a `'read-committed'` one gives only with `parentRowLock`. Each `rule` is typed as a key of what you declared.

Whether a store gives either also depends on where your writer checks the rule. Unless a requirement says otherwise, it is taken to be checked from a read made before the write, which at read committed may be stale by the time the write lands.

Call `Store.mount` where the server sets the store up:

```ts
const mounting = () => Store.mount(postgres, needed)
// throws StoreRefused:
// [metakit] store "Postgres" (read-committed per transaction, does not lock the parent row) cannot hold:
//   - "Deposit" needs row-atomic (a guard and its writes apply to one row as one step),
//     judged from a read before the write: it writes from the state it read
//   - "Withdraw" needs row-atomic (…), judged from a read before the write: it writes from the state it read
//   - "balanceIsItsEntries" needs parent-serialized (writers of the rows under one parent
//     run one at a time), judged from a read before the write: it reads every row under one parent
```

It throws `StoreRefused`, an error, for a store that cannot hold one of the rules, and returns nothing for one that can. `Store.refused(postgres, needed)` gives the same list without throwing.

If your writer checks a transition's `when` inside the `UPDATE` that writes the row, say so with `judged: 'in-statement'`. The statement re-reads the row it writes, so the transitions hold at read committed; the aggregate does not, since its rows are other rows:

```ts
const checkedInUpdate = needed.map(rule =>
  rule.needs === 'row-atomic' ? { ...rule, judged: 'in-statement' as const } : rule,
)
const stillRefused = Store.refused(postgres, checkedInUpdate).map(({ rule }) => rule)
// ['balanceIsItsEntries']
```

To get past the refusal, change what is true of the database and then what you declare: run it at the serializable level (`isolation: 'serializable'`), or have every write of an entry lock its account row first (`select … for update`) and declare `parentRowLock: true`. `Store.mount` believes the facts; it does not inspect the database.

### A store that isolates one statement

On D1 a writer cannot read in one round trip and write in the next as one unit, so a rule judged from a read before the write is refused there even though D1 runs one write at a time. A rule your writer judges inside the statement that writes (an aggregate's rows read by a subquery of the `UPDATE`) holds:

```ts
const d1: Store.StoreCapabilities = {
  name: 'D1',
  isolation: 'serializable',
  isolates: 'statement',
  parentRowLock: false,
}
const readFirst = () => Store.mount(d1, needed)
// throws StoreRefused: every rule, each judged from a read before the write
const inStatement = needed.map(rule => ({ ...rule, judged: 'in-statement' as const }))
Store.mount(d1, inStatement)
// returns: the rules are judged where D1 runs them as one step
```

Judging an aggregate in the statement does not make up for a weaker isolation: on the read-committed Postgres above, the subquery reads what had committed when the statement began, and its refusal stands.

### A rule the database enforces itself

A foreign key is a rule the database keeps on its own: no row may point at a row that is not there, and a delete of the row pointed at waits for, or refuses, a write linking to it, at any isolation. Where a foreign key holds your rule, say so with `judged: 'constraint'`. It holds on any store but an eventual one, whose copies each check the key against their own rows:

```ts
const linked: Store.Requirement = {
  rule: 'Entry.account',
  needs: 'parent-serialized',
  because: 'an entry may be written while its account is deleted',
  judged: 'constraint',
}
Store.mount(postgres, [linked])
// returns: the foreign key holds it on the read-committed Postgres above
```

## List the orders a proof leaves open

`Prove.machine` proves each transition alone. Its report also names what that leaves open: each pair of transitions (a transition can pair with itself, as two deposits do) where one writes what the other reads or writes, so the order their replies arrive in can matter.

```ts
import { Effect } from 'effect'
import * as Prove from 'metakit/prove'

const report = await Effect.runPromise(Prove.machine(Bank))
const owed = report.obligations.map(obligation => obligation.name)
// ['Deposit/Deposit', 'Deposit/Withdraw', 'Withdraw/Withdraw']
```

Each entry is an *obligation*: something a proof did not show and a test must. These have `kind: 'walk'`, a `detail` saying what must be shown, and `over`, the transitions involved. Transitions that touch different fields get none, since their order cannot matter.

## Discharge an obligation with a walk

A *walk* runs the steps of a scenario in many orders and checks a property after every step. You write the steps and say which must come before which. A *seed* fixes the walk's random choices so you can rerun it. A generated pair obligation needs passing samples in both relative orders.

This scenario is a page that shows a balance. It sends two deposits, and each reply carries the balance the server held after that deposit. The page must not go back to an older balance.

```ts
import { Option } from 'effect'

interface Page {
  readonly shown: number
  readonly latest: number
}

const reply =
  (request: number, balance: number) =>
  (page: Page): Page =>
    request < page.latest ? page : { shown: balance, latest: request }

const twoDeposits: Temporal.Scenario<Page, string, 'Deposit'> = {
  initial: () => ({ shown: 0, latest: 0 }),
  steps: [
    { name: 'send first', run: page => page },
    { name: 'send second', after: ['send first'], run: page => page },
    { name: 'reply first', of: 'Deposit', after: ['send first'], run: reply(1, 10) },
    { name: 'reply second', of: 'Deposit', after: ['send second'], run: reply(2, 30) },
  ],
  holds: (page, ran) =>
    ran.includes('reply second') && page.shown !== 30
      ? Option.some(`shows ${page.shown} after the second reply`)
      : Option.none(),
}

const deposits = report.obligations.find(obligation => obligation.name === 'Deposit/Deposit')
const discharges = deposits === undefined ? [] : [Temporal.discharge(deposits, twoDeposits)]
// Held over 202 runs, with both orders of reply first and reply second observed.
```

`after` names the steps that must run first. `holds` receives the names of the steps run so far and returns a reason if the property fails. `of` matches the replies to the transitions in the obligation. `Temporal.discharge` picks the first distinct matching occurrences in the scenario and tries each feasible direction before its seeded walk.

`Held` means every tried order passed. `coverage` names the matched steps and marks each direction as `observed`, `causally-forbidden`, or `unsampled`. A generated pair stays open when an `after` dependency prevents one direction.

Remove the `request < page.latest` check from `reply` and the same walk answers:

```text
{ _tag: 'Broken', seed: 1,
  interleaving: ['send first', 'send second', 'reply second', 'reply first'],
  minimal: ['send first', 'send second', 'reply second', 'reply first'],
  reason: 'shows 10 after the second reply' }
```

Repeat `Temporal.discharge` with the same scenario and options to replay the failure. For a failure returned directly by `Temporal.walk`, pass its `seed` with `runs: 1`. `interleaving` lists the steps through the failure, and `minimal` keeps the steps the failure depends on.

## Fail the build while an obligation is open

`Temporal.undischarged` lists the obligations that still need evidence. A generated pair needs a passing sample of both relative orders. Assert that the list is empty.

```ts
const open = Temporal.undischarged(report.obligations, discharges).map(({ name }) => name)
// ['Deposit/Withdraw', 'Withdraw/Withdraw']: two walks still to write
```

In a test, `expect(open).toEqual([])` fails while any obligation is open. To close `Deposit/Withdraw`, mark one reply step `of: 'Deposit'` and the other `of: 'Withdraw'`. Let the replies arrive in either order and use `holds` to check what the page displays. Any failing walk keeps the obligation open.

## What this does not do

- A walk tries the orders its seeds give (200 unless you pass `runs`), not every order. It finds races; it does not prove their absence.
- `Store.mount` trusts the facts you give it, and where you say a rule is judged. It does not inspect the database or your writer.
- The steps of a scenario are your model of the page and the server. A walk says nothing about code the steps do not call.

## Next

- [Verify a state machine in CI](./proving-transitions.md): the proofs these obligations sit beside.
- [Model domain types and row aggregates](./domain-types.md): `Rows.sum` and the other aggregates.
