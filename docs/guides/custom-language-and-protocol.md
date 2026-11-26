# Write your own language, store or protocol

Applications often need domain-specific operations, custom storage adapters, or multi-step protocol invariants that every Foldkit Plus reader treats as first-class. `metakit/language`, `metakit/store/check`, and `Temporal.protocol` provide the typed extension seams.

## Bundle custom operations into a `Language`

`Language.make` (from `metakit/language`) groups your `Operation.define` families into one object with exhaustive `implement`, partial `implementSome` (for browser pages), dialect-checked `sql('sqlite' | 'postgres')`, `describe()` (for client/server compatibility checks and `foldkit-agent/metakit`'s `x-metakit-operations` metadata), and `obligations()`:

```ts
import * as Language from 'metakit/language'
import { flagsAndNot, flagsOr, flagsXor } from './operations'

export const Permissions = Language.make({
  flags: { or: flagsOr, xor: flagsXor, andNot: flagsAndNot },
})

const serverImpls = Permissions.implement('server', {
  flags: {
    or: (a, b) => a | b,
    xor: (a, b) => a ^ b,
    andNot: (a, b) => a & ~b,
  },
})
```

Forgetting `flags.xor` in `Permissions.implement` fails to compile.

## Check a custom store adapter

Import `checkStore` from `metakit/store/check` (test-only; never imported by server mains) to probe a custom store against its declared `StoreCapabilities`:

```ts
import { checkStore } from 'metakit/store/check'

const report = await checkStore(myStoreCapabilities, {
  connect: async () => openConnection(),
  seed: async ({ parent, children }) => seedRows(parent, children),
})
```

If an adapter claims `isolation: 'serializable'` over transactions but two concurrent writers both read `10` and write `5`, `checkStore` fails with a counterexample naming the broken capability.

## Declare typed protocol obligations

Use `Temporal.protocol(['undo-before-expire', ...])` from `metakit/temporal` to create typed `obligation(name, ...)` and `discharge(name, ...)` helpers. Misspelling an obligation name fails to compile, and an undischarged obligation fails your conformance test suite.

## Next

- Define the operations that go inside a `Language`: [Define an operation and check its laws](./custom-operations.md).
- Working example: [`examples/metakit/test/permissionsLanguage.test.ts`](../../examples/metakit/test/permissionsLanguage.test.ts).
