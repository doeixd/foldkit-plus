# Hold a rule to a store

A rule that sums child rows (such as keeping an account balance non-negative across its entries) can be broken by two concurrent writes unless the database serializes writers of the same parent row. `metakit/store` declares what each store guarantees (`StoreCapabilities`), refuses mismatched rules at mount time, and `metakit/store/check` tests a store adapter against real concurrent races.

## Example

Pass `parentLock` to `writer` on Postgres (`foldkit-remote-drizzle`) so every child write locks its parent row(s) in ascending id order with `SELECT ... FOR UPDATE` and declares `store.parentRowLock = true`:

```ts
import { writer, withParentLock } from 'foldkit-remote-drizzle'
import { checkAggregateRule } from 'foldkit-remote-server'

const entryWriter = writer(PgDb.Entry, {
  parentLock: {
    table: pgAccounts,
    id: pgAccounts.id,
    by: ['accountId'],
    onWrite: async ({ parentIds, tx }) => {
      // Update stored parent totals inside the locked transaction.
    },
  },
})

checkAggregateRule(entryWriter.store, {
  name: 'neverOverdrawn',
  entity: 'Account',
  over: 'Entries',
})
```

On Postgres with `parentLock`, `checkAggregateRule` succeeds. Two concurrent overdrawing transfers leave one refused, and two opposite-direction transfers (`a -> b` and `b -> a`) acquire locks in sorted id order without deadlocking.

## Why D1 and SQLite refuse read-first aggregate rules

D1 isolates one statement or batch at a time (`isolates: 'statement'`), not a read followed by a write across round trips. Calling `checkAggregateRule` against D1 throws:

> `[foldkit-remote-server] the rule "neverOverdrawn" of Account sums its Entries and needs parent-serialized; D1 (serializable per statement) judges it from a read first. Judge it on Postgres with the parent lock, or as a guard in the statement.`

## Replay changes from a Durable Object journal

When a client reconnects to a `foldkit-durable` journal, call `journal.replay(doc, { after, epoch, limit })`. It returns either `{ _tag: 'Operations', operations, cursor, hasMore }` for incremental catch-up or `{ _tag: 'Snapshot', snapshot, cursor, epoch, reason }` when the client's epoch changed or its cursor fell behind the compaction floor.

## Next

- Test a custom store adapter against concurrency probes: [Write your own language, store or protocol](./custom-language-and-protocol.md).
- Reference: [`packages/remote-drizzle/test/parentLock.test.ts`](../../packages/remote-drizzle/test/parentLock.test.ts).
