# Computed assignments on a declared write: increments

**Status:** Proposed and built, 2026-10-24. #182 §2 (expression assignments),
the dependency analysis of §4 a declared write needs on the server, and §5
(retry semantics) for the one computed assignment built. After
[write-precondition-DESIGN.md](./write-precondition-DESIGN.md).
**Target:** `foldkit-entity` (`Write`), `foldkit-remote-server`
(`EntityWriter`, `RemoteServer.write`), `foldkit-remote-drizzle` (`writer`),
`foldkit-guard` (`GuardServer.writer`).

## 0. What is missing

A declared write sets a field to a value the input carries. "Add the quantity
to the stock" cannot be said: a client that reads the stock and sends the sum
loses a concurrent change, and one that sends the sum twice (a retry) adds
twice. §2 asks for computed assignments; §5 forbids shipping one without a
retry contract.

## 1. The decision: one assignment, and it is an increment

```text
Write.update(input, { id: 'id', expect: 'revision', increment: { stock: 'quantity' } })
  -> update item set stock = stock + ?, revision = revision + 1
      where id = ? and revision = ?
```

- `increment` maps a field of the Entity to an input key holding the amount.
  The amount may be negative; there is no separate decrement.
- Only an increment, of the field by itself. General arithmetic, copying one
  field into another and constants are not built: no use case asks for them,
  each needs reference semantics and adapter support (§2), and a right-hand
  side reading another field can read a member the writer may not see. An
  increment reads only the field it writes, whose Update rule already governs
  it, and whose new value the answer reads back under its Read rule.
- Checked where it is declared: the field is the Entity's, stored as a number
  (its encoded schema is a number, as a revision's must be), not the id, not
  the expected revision, and not set by another key; the amount's key is
  unmapped (it is about the operation, not a member) and its encoded schema is
  a number. An insert or a delete takes none.

## 2. Retry: an increment must expect a revision

**Amended**, 2026-10-25, by [write-improvement-PLAN.md](./write-improvement-PLAN.md)
phase 3: an increment over a writer with a ledger needs no `expect`; the ledger
answers its retry. Without a ledger, what follows still holds.

A write with an `increment` must name `expect`; it is refused where declared
without one. The guarantee is then optimistic concurrency, not deduplication:

| Case | Answer |
| --- | --- |
| First attempt lands | the row, the field moved by the amount, the revision on by one |
| Retry after its answer was lost | `Conflict`: the row is a revision on; never applied twice |
| Another write landed first | `Conflict` |

The lost answer is reported as a conflict, which is ambiguous: the first attempt
may have landed. The client re-reads the row and decides, as it would after any
conflict. Remote's lost-answer recognition (a row one revision on holding what
the write set, answered as written) is switched off for a write with an
increment: a row one revision on could be another client's increment, and
answering it as ours would lose ours silently. So is the precondition's (a row
holding every value the write sets): the increment's value cannot be held in
advance.

Deduplication by request id (recording the operation in the statement that
writes) would let a retry answer as written. It needs a table each application
migrates, and is left for a write the conflict does not serve.

## 3. Where it is computed

- **The writer**, in the statement that writes: `EntityWriter.update` is handed
  `increments` (each field's amount, encoded) beside `values`, and a writer
  says it computes them (`increments: true`), as `preconditions` says it checks
  a `when`; `RemoteServer.write` refuses a write with an increment over a
  writer without it.
- **The guard**, for its after-state check, adds each amount to the row it read
  (the reference semantics: the stored number plus the encoded amount). The
  revision pin and the required `expect` mean the row it computed over is the
  row the writer writes. Each incremented field needs its member's Update rule,
  as a set field does.
- **The client** does not compute it. `Write.bind` returns increments apart from
  values, and the optimistic patch shows the values only, so the field shows
  its old value until the server's answer. The cached row may be stale, and a
  sum computed over it would be shown as if it were the server's.

## 4. Dependency analysis

`Write.writes(write)` includes the incremented fields, so a query reading one is
known to be changed by the write. `Write.reads(write)` is new: the fields the
write reads from the row it writes, those its `when` reads, each incremented
field, and the expected revision, for an interpreter planning what to read and
a startup check deciding what the write can disclose.

## 5. Semantics settled

- Numbers only, as stored: an integer column adds as an integer, a real one as
  a real; a value past the column's range fails as the database fails it.
- A stored `null` never matches: the field's encoded schema is a plain number,
  so a nullable field is refused where the write is declared.
- An amount is a plain number in the input: an `Option` or a nullable amount
  is not stored as a number, and is refused where the write is declared, as is
  `Schema.optional` (which allows `undefined`). A `Schema.optionalKey` amount
  the input leaves out adds nothing.
- An integer field takes an integer amount (added 2026-10-26). A field whose
  stored form carries `Schema.isInt`, alone or in a group such as `isInt32`, is
  refused where the write is declared unless its amount does too. Without this,
  a fractional amount split the databases: Postgres refused `2 + 0.5` into an
  `integer` column, and SQLite stored `2.5` in it (expr-operations-DESIGN §17,
  probe 5). The Entity reads its schemas; the column is the writer's: the
  Drizzle `writer` refuses, through `EntityWriter.refuses` where
  `RemoteServer.write` registers the write, an amount not held to an integer for
  a column that holds integers (Drizzle's `number int…` and `number uint…`
  data types), even under a field declared `Schema.Number`. Each increment
  records whether its amount is an integer (`WriteIncrement.integer`), decided
  once where the write is declared.
- `keys` narrows increments as it narrows values: an increment of a key the
  author did not name is not applied.
- An increment of a real number expects a revision (added 2026-10-26, by
  expr-operations-DESIGN §9.3). Under a ledger two increments that expect none
  land in either order, which is one result only where adding associates:
  integers do, floating-point reals do not (`(x + a) + b` and `(x + b) + a` can
  round apart). `RemoteServer.write` refuses one of a field not stored as an
  integer without `expect`, unless its writer pins the row it read (`pins`, a
  guarded writer with a `revision`), where concurrent writes cannot interleave.
  This breaks a ledgered real-number increment that relied on the ledger alone.
- `Write.apply` is the one computation of the row an increment leaves (added
  2026-10-26, expr-operations-DESIGN §9.1): a null under an amount stays null,
  as SQL's `null + 1` does. Guard summed it as `Number(null) + amount`, the
  amount itself, and now judges the null the database writes.

## 6. Tests that must be able to fail

- Over SQLite and Postgres: an increment lands in the statement, moves the
  revision, and answers the new value; a retry with the same revision is a
  `Conflict` and the field moved once; a negative amount decrements.
- Declaration: no `expect`, a field not stored as a number, a nullable field,
  the id, a field also set, an amount key mapped to a member or not a number,
  an insert or a delete: each refused.
- Through a guard: the after-state rule sees the incremented value (a rule
  `stock >= 0` refuses a decrement past zero); the incremented field needs its
  Update rule. The guard reads the field only through the rules that read it:
  a rule that does not read it does not judge the sum.
- The optimistic patch leaves the incremented field out.
- `Write.reads` lists the `when`'s fields, the incremented field and the
  revision; `Write.writes` lists the incremented field.
- A writer without `increments` is refused where the write is served.
