# A query body on LiveStore

A spike, not a package: what refusing looks like when an engine can say very
little. It compiles a `foldkit-entity` query body to SQL through
[LiveStore](https://livestore.dev)'s query builder and runs
`foldkit-entity`'s conformance suite (`foldkit-entity/conformance`) against it.

LiveStore's `where` takes a column, an operator and a value from a fixed list
(`=`, `!=`, `<`, `>`, `<=`, `>=`, `LIKE`, `IN`). It has no null predicate, and
`LIKE` has no `ESCAPE`, so this interpreter declares one operation, `eq`, and
refuses every body needing another. [`examples/tanstack`](../tanstack) asks the
same question of a wider engine.

## Run it

From the repository root:

```bash
npx vitest run examples/livestore
```

There is no app and no server: `test/conformance.test.ts` is the example. It
compiles each case to SQL with LiveStore's builder and runs that SQL on Node's
SQLite, without standing up a LiveStore store, which would be a great deal of
machinery to run one operator through.

## What it shows

- **What it runs agrees.** The cases needing only `eq` come back as the case
  expects them, and a defined operator that expands to an equality runs too.
- **What it cannot run, it refuses before compiling.** `Query.unsupported(body,
  supported)` names every operation a body needs that is not declared, and
  `compile` throws `LiveStoreCompileError` naming them.
- **It never approximates.** `x = null` is not a null check (in SQL it is
  unknown for every row), so `isNull` is refused rather than compiled to it.

## Limits

- One operation, one table: a path, an exists, `Expr.viewer` and `Expr.now`
  are refused, and it orders by fields only.
- Declaring by operation is coarser than what it can run: an `eq` whose
  operand is another predicate, or an `eq` against null, needs no operation
  beyond `eq` yet is refused when compiled, not when declared. Only running the
  suite finds such cases.
