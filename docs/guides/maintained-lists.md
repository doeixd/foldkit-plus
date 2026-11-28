# Keep a list up to date

Recomputing a total, a grouped lookup, or a sorted list over 100,000 loaded rows on every edit stalls the main thread. `foldkit-remote/maintained` keeps a value over a loaded query up to date from only the rows that changed (server patches, optimistic writes, rollbacks, and live echoes).

## Example

Define a maintained value once at module scope, then read it from your `Model` with `Maintained.value`:

```ts
import { Aggregates } from '@doeixd/metakit/aggregates'
import { Maintained } from 'foldkit-remote/maintained'
import { Data, InvoiceList } from './remote'

const TotalCents = Aggregates.sum<Invoice>(row => row.cents)
const ByStatus = Maintained.join<Invoice>(row => row.status)

const total = Maintained.value(Data, model, InvoiceList, TotalCents)
const byStatus = Maintained.value(Data, model, InvoiceList, ByStatus)
```

`total` returns `{ value: number, complete: boolean }`. When one invoice changes, `TotalCents` adjusts the running sum in O(1) and `ByStatus` updates only the affected status bucket via a `ReverseIndex`. `complete` is `false` whenever pages are missing, a gap exists, or a row could not be judged.

## Fold with a custom operation

Pass a commutative monoid defined with `Operation.define` to `Maintained.reduce(op, pick, implementations)`:

- If the operation claims `invertible` (such as bitwise XOR), deletes and updates run in O(1).
- If it has no inverse (such as bitwise OR or `Min`), inserts run in O(1) and deletes mark the value to rescan on the next read.

## Check which values rescan

Call `classify(definition)` or `rescanReport(entries)` in a test to list every maintained value that rescans on delete and why:

```ts
import { rescanReport } from 'foldkit-remote/maintained'

const rescans = rescanReport([{ name: 'minPrice', definition: MinPrice }])
// [{ name: 'minPrice', reason: 'fold-not-invertible-on-delete', message: '[foldkit-remote] maintained "minPrice" rescans on delete: min has no inverse.' }]
```

## Cascade dependent queries

When one query's input depends on a value read from another query (such as loading cities after a state is chosen), wrap it with `dependentQuery` from `foldkit-remote`. It uses `queryReadiness` from `@doeixd/metakit/graph/readiness` and sends no request until every parameter is bound.

## Next

- Define a custom operation and check its algebraic laws: [Define an operation and check its laws](./custom-operations.md).
- Reference: [`foldkit-remote` README](../../packages/remote/README.md).
