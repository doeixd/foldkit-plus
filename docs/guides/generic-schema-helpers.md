# Writing a generic helper over a Schema

When you write a generic helper that wraps a caller's Effect `Schema` (for example, a `table(rowSchema)` helper that builds `Schema.Struct({ rows: Schema.Array(rowSchema) })`) and also decodes input synchronously with `Schema.decodeUnknownSync`, TypeScript rejects whichever single Effect constraint you pick.

## Why a single constraint fails

Effect splits schema construction and synchronous decoding into two different views:

- **`Schema.Top`** is what schema combinators (`Schema.Struct`, `Schema.Array`, `Schema.NullOr`, `Expr.refine`, `Inspect.fieldSpecs`) require. It allows arbitrary decoding services (`DecodingServices`), so `Schema.decodeUnknownSync` refuses it:

  ```text
  Argument of type 'Struct<{ readonly rows: $Array<S>; }>' is not assignable to parameter of type 'Codec<...>'.
    Type 'unknown' is not assignable to type 'never' (DecodingServices).
  ```

- **`Schema.ConstraintDecoder<unknown>`** is what `Schema.decodeUnknownSync` requires (no decoding services). It does not carry `Schema.Top`'s `pipe`, `Rebuild`, or `annotate` members, so `Schema.Struct` and `Schema.Array` refuse it:

  ```text
  Type 'S' does not satisfy the constraint 'Top'.
  ```

## Use `SchemaOf` when a helper both composes and decodes

`@doeixd/metakit` exports `SchemaOf` as the intersection `Schema.Top & Schema.ConstraintDecoder<unknown>`. Constrain your generic parameter to `SchemaOf` and you can compose the wrapper Schema, attach `Expr.refine`, and decode synchronously with no `any` and no cast:

```ts
import { Schema } from 'effect'
import { Arr, Expr, Num, type SchemaOf } from '@doeixd/metakit'

export function table<S extends SchemaOf>(row: S) {
  const Table = Schema.Struct({
    rows: Schema.Array(row),
  }).pipe(Expr.refine($ => Num.gt(Arr.count($.rows), 0)))

  return {
    schema: Table,
    decode: (input: unknown) => Schema.decodeUnknownSync(Table)(input),
  }
}

const Task = Schema.Struct({ id: Schema.String, done: Schema.Boolean })
const tasks = table(Task)
const parsed = tasks.decode({ rows: [{ id: '1', done: false }] })
// parsed: { readonly rows: readonly { readonly id: string; readonly done: boolean }[] }
```

## When `Schema.Top` alone is enough

You only need `SchemaOf` when the helper calls a synchronous decoder or encoder (`Schema.decodeUnknownSync`, `Schema.decodeSync`). If your helper only constructs schemas, attaches `Expr.refine`, reads rules (`Expr.rulesOf`), or inspects fields (`Inspect.fieldSpecs`, `Inspect.toJsonSchema`), `S extends Schema.Top` is enough.

If you already have a `Schema.Top` helper and do not want to widen its constraint, you can also accept a caller-provided decoder function `(input: unknown) => S['Type']` instead of calling `Schema.decodeUnknownSync` inside the helper.
