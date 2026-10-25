# Entity transitions

**Status:** Built, 2026-10-25, for
[#184](https://github.com/doeixd/foldkit-plus/issues/184), as §7 sets out; the
guide is [Declared writes](../declared-writes.md#what-every-change-holds-a-transition-invariant). Builds on
[entity invariants](./entity-invariant-DESIGN.md) (#183) and declared writes
(#182).

**Since:** transitions are no longer a declaration of their own. `Entity.invariant`
builds over `({ before, after })`, and one that reads `before` is a transition
invariant, judged on updates only; `Entity.transition`, `Entity.judgeChange` and
`Expr.substitute` are gone, and `Entity.judge` takes `{ after, before? }`. The
sections below describe the design as first built.

## 0. What is missing

An invariant judges the row a write leaves, alone. Some rules relate two rows:
"an order that shipped does not go back to draft". Both rows are valid on their
own; the change between them is not. Writing it as an invariant cannot say it,
and writing it as a guard rule makes validity a permission alternative, which
the issue rules out (`Write: [isOwner, isAdmin, validTransition]` would let an
admin skip it, and let a valid change authorize someone).

A **transition** is a predicate over the row before a write and the row after,
which every update must hold.

## 1. The four kinds, and who owns each

| Kind | Reads | Declared with | Refused as |
| --- | --- | --- | --- |
| Authorization | principal, row | `Guards.attach` | `Forbidden` |
| Precondition | row before, input | `Write.update(…, { when })` | `Unmet` |
| Transition | row before, row after | `Entity.transition` | `Invalid` |
| Invariant | row after | `Entity.invariant` | `Invalid` |

A write lands only when all four hold:

```text
authorization AND precondition AND transitions AND invariants
```

Authorization keeps its alternatives inside its own category. Transitions and
invariants are never alternatives of anything, so an administrator cannot skip
them and no row grants anyone anything. Transitions and invariants share one
refusal, `Invalid`, told apart by the rule's id: both say "the change would not
be valid", and a form shows both the same way.

## 2. Declaration

```ts
const Order = OrderFields.pipe(
  Entity.transition(
    'shippedStaysShipped',
    ({ before, after }) =>
      Expr.or(Expr.not(Expr.eq(before.status, 'shipped')), Expr.eq(after.status, 'shipped')),
    { message: 'A shipped order stays shipped', path: ['status'] },
  ),
)
```

- `before` is the Entity's fields; `after` is one placeholder per field, typed
  as the field, standing for its value in the row the write leaves.
- A transition reads no input key and no other Entity; refused where declared,
  as an invariant is. `path` defaults to the fields it reads, before or after.
- It is metadata on the Entity, beside its invariants, attached by `pipe`.

## 3. Lifecycle

A transition constrains **every update** of the Entity, declared or not by the
write. A create has no row before and a delete none after, so neither is
judged. A rule about what a new row holds is an invariant; whether a row may be
deleted is a guard's `Delete` rule. Naming the interactions a transition
applies to waits for a use case.

## 4. Meaning

As an invariant: strictly true (a null on either side fails it), over stored
(encoded) values, and undecided when a field it reads is missing. The
reference is `Entity.judgeChange(entity, before, after)`, the evaluator run with
`before` as the row and `after` as the input.

## 5. Enforcement in the Drizzle writer

Each transition is compiled into the update's `WHERE`, beside the invariants,
with each `after` placeholder rewritten:

- a field the write sets: its new value;
- a field it increments: its column moved by the amount (a compile target key
  of its own, so `before` of the same field stays the column);
- any other field: its column, since the write leaves it as it is.

Every `before` reference is the column. The statement therefore judges the
change it makes, at the version it makes it over. A miss is classified as
today, a failing transition after the precondition, beside the invariants:
judged in memory over the row read back and the row the write would leave.

Not compiled to a `CHECK` constraint: a constraint sees one row. A trigger could
see both; it waits for a use case.

## 6. Elsewhere

- **Guard:** forwards nothing new (the writer's `invariants` flag covers
  both); a transition reading a Read-ruled member is unnamed, as an invariant is.
- **Forms:** a form has no row before, so it judges no transition; the server's
  `Invalid` is shown by Crud beside the path, as for an invariant.
- **Repair:** an invalid row is still judged by its transitions. A transition
  that would forbid every repair is the application's mistake, which this
  cannot detect.

## 7. Phases

1. `Entity.transition`, `Entity.transitions`, `Entity.judgeChange`, the
   rewrite the writer needs, with tests and mutations.
2. The Drizzle writer and the miss classification; Guard's unnamed set.
3. Docs: the guide, the example (an order whose shipment cannot be undone).
