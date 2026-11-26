# Define an operation and check its laws

Built-in arithmetic and text operations do not cover domain rules like permission bitmasks or clamped scores. `metakit/operation` lets you declare a typed custom operation with its algebraic claims (`commutative`, `associative`, `idempotent`, `identity`, `invertible`, `monotone`), test those claims automatically, and lower the operation to SQL.

## Example

Declare a bitwise OR operation over non-negative 31-bit integers, implement it in memory, and check its claims:

```ts
import { Schema } from 'effect'
import * as Operation from 'metakit/operation'
import { checkOperation } from 'metakit/conformance'

const Flags = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 2147483647 }))

export const flagsOr = Operation.define({
  id: 'flags.or',
  version: 1,
  args: [Flags, Flags] as const,
  returns: Flags,
  nulls: 'strict',
  claims: { commutative: true, associative: true, idempotent: true, identity: { value: 0, side: 'both' } },
})

export const impls = Operation.implementations(
  'permissions',
  Operation.implement(flagsOr, (a, b) => a | b),
)

const report = checkOperation(flagsOr, impls)
```

`checkOperation` samples boundary values, 200 seeded pairs, and 1,000 triples to verify every claim. If you mistakenly claim `idempotent: true` on XOR, `checkOperation` fails with the counterexample (`flags.xor(5, 5) is 0, not 5`).

## Use it in folds and transitions

- **Row folds:** `Arr.reduce($.roles, flagsOr, each => each.bits)` requires `commutative`, `associative`, and a two-sided `identity` at compile time.
- **Commutative writes:** `Transition.combine(state.flags, flagsOr, input.grant)` lets `Transition.commutes`, `Transition.idempotent`, and `foldkit-sync` reason about concurrent updates.

## Lower to SQL

Keep SQL lowering out of browser bundles by importing `metakit/operation/sql` on the server only:

```ts
import { lowering, lowerings, piece } from 'metakit/operation/sql'

export const sqlLowerings = lowerings(
  lowering(flagsOr, {
    sqlite: (a, b) => piece`(${a} | ${b})`,
    postgres: (a, b) => piece`(${a} | ${b})`,
    aggregate: { postgres: a => piece`bit_or(${a})` },
  }),
)
```

If a dialect lacks a lowering (such as SQLite's missing `bit_or` aggregate), `metakit/sql` refuses by operation name and dialect at compile/query time rather than silently falling back.

## Next

- Group operations into a versioned domain language: [Write your own language, store or protocol](./custom-language-and-protocol.md).
- Reference: [`examples/metakit/src/permissions.ts`](../../examples/metakit/src/permissions.ts).
