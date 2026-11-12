# Laws: where a rule goes

Checked against `foldkit-entity` 0.17.0, `foldkit-guard` 0.11.0 and `foldkit-remote` 0.26.0.

A law is a rule about state, declared as data and held by the owner of that
state where it changes. It is not a package: the declarations live in
`foldkit-entity` and `foldkit-guard`, and each interpreter (the server's
writer, the client's pre-send check, a form, a `CHECK` constraint) reads the
same one. Pick the kind by what the rule reads:

| The rule reads | Declare with | Refused as |
| --- | --- | --- |
| One value | the field's Schema | a decode failure |
| The case a row is | `Entity.defineVariants` | a decode failure or `Invalid` |
| Other rows, counted or looked up | `Derived.count`, `Derived.exists` (computed, never stored) | nothing |
| The row after a write | `Entity.invariant` | `Invalid` |
| The row before and after | `Entity.invariant` reading `before` | `Invalid` |
| The row before, and the input | `Write.update(…, { when })` | `Unmet` |
| The principal and the row | `Guards.attach` | `Forbidden` |

A write lands only when authorization AND precondition AND invariants hold.
Invariants and preconditions are never guard alternatives: authority does not
excuse an invalid row. Use the cheapest kind that states the rule.

```ts
import { Schema } from 'effect'
import { Entity, Expr } from 'foldkit-entity'

const ProductFields = Entity.define(
  'Product',
  Schema.Struct({
    id: Schema.String,
    status: Schema.Literals(['draft', 'published']),
    stock: Schema.Number,
    reserved: Schema.Number,
  }),
)

const Product = ProductFields.pipe(
  Entity.invariant('reservedWithinStock', ({ after }) => Expr.lte(after.reserved, after.stock), {
    message: 'Reserved stock cannot exceed the stock',
    path: ['reserved'],
  }),
)

Entity.judge(Product, { after: { id: 'p1', status: 'draft', stock: 3, reserved: 5 } })
// { _tag: 'Invalid', failures: [{ id: 'reservedWithinStock', … }] }
```

- `Entity.invariant` declares and runs nothing; `Entity.judge` is pure and
  answers `Valid`, `Invalid` or `Undecided` (a field the rule reads is missing).
  A null fails an invariant.
- An invariant judges the row a write leaves, so a row that already breaks it
  stays until written, and a write lands only if the row it leaves holds. Adding
  an invariant refuses nothing already stored.
- A transition invariant (reads `before`) judges every update, no create or
  delete. A `CHECK` cannot see it.
- The client's `Data.mutate` refuses only what it can already decide over held
  rows; the server's answer is the truth.
- Invariants read stored rows only: not another Entity, an input or a
  principal. A rule across several rows is a handler's, and a rule about a
  row's past needs a stored field.

Not built yet: refinements, a document's `laws`, `Data.can`, `Laws.check`.

See also:
[the guide](https://github.com/doeixd/foldkit-plus/blob/main/docs/laws.md),
[Declared writes](https://github.com/doeixd/foldkit-plus/blob/main/docs/declared-writes.md),
[entity.md](entity.md), [guard.md](guard.md).
