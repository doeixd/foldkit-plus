# Entity invariants

**Status:** Built, 2026-10-25, for
[#183](https://github.com/doeixd/foldkit-plus/issues/183), in the phases of §6,
with these differences from the sketch: the Drizzle writer reads its invariants
from the binding (`bind` keeps them), since a binding does not keep its Entity;
an invariant the database cannot compile is refused when the writer is made; a
form judges invariants on submit only, through `Entity.judgeInput`; and
`invariantChecks` gives a `constraint` clause for both dialects, SQLite's to
write in its `create table`. The guide is
[Declared writes](../declared-writes.md#what-every-row-holds-an-invariant).

## 0. The problem in one row

An inventory row holds `quantity = 10, reserved = 5`. An update setting
`quantity = 3` passes every check that exists today: the input decodes (3 is a
non-negative integer), the guard's rules hold, and no `when` refuses it. The row
it leaves, `quantity = 3, reserved = 5`, is invalid. No part of the stack judges
the row that results, only the input and the row before.

An **invariant** is a predicate every stored row of an Entity must hold, judged
over the whole proposed row: what is stored, with what the write sets and adds.

## 1. What it is not

| | Judges | Over | Refused as |
| --- | --- | --- | --- |
| Schema | a value | the input | a decode error |
| Guard rule | who may | the principal and the row | `Forbidden` |
| `when` (#182) | whether this write applies now | the row before | `Unmet` |
| **Invariant** | whether the row is valid | the row after | `Invalid` |
| Transition (#184) | whether this change is allowed | before and after | (later) |

An invariant reads no principal and no input key: it is a fact about stored
rows, true for every writer. A rule that depends on who asks stays a guard. A
rule that relates before and after is #184's.

## 2. Declaration

The issue names the cycle: an Entity starts from a Schema, and an `Expr` over
fields needs the Entity. So an invariant is attached after, as Guard attaches
its rules, through Entity's metadata:

```ts
const Inventory = InventoryFields.pipe(
  Entity.invariant('reservedWithinQuantity', fields =>
    Expr.lte(fields.reserved, Expr.field(fields.quantity)),
  {
    message: 'Reserved stock cannot exceed the quantity',
    path: ['reserved'],
  }),
)
```

- **One declaration.** It lives on the Entity (a `foldkit-entity/invariants`
  metadata key, merged by concatenation, so attaching twice adds rather than
  replaces), and every interpreter reads it from there. Nothing restates it as
  a Schema check or as SQL.
- **`fields` is the Entity's own.** A predicate over another Entity is refused
  where it is declared, as a `when` is.
- **Row-local only.** It reads fields of the row. A predicate reading an
  `Input` or naming a relation's other side is refused at declaration:
  uniqueness, foreign keys and aggregates need the database to coordinate,
  which a predicate cannot express.
- **`id`, `message`, `path`.** The id is stable (forms and logs key on it); the
  message is shown to someone the rules let write; the path names the field(s)
  a form puts the error beside, defaulting to every field the predicate reads.

## 3. Meaning: strictly true, over the stored form

- **Strictly true.** A row holds an invariant only when it evaluates to TRUE.
  SQL's UNKNOWN (a comparison with a null) fails it, as in a `WHERE`. A rule
  meant to allow a null says so: `Expr.or(Expr.isNull(f), …)`. The reference
  evaluator already returns `'unknown'`; it fails. A `CHECK` constraint, which
  accepts UNKNOWN, is compiled as `CHECK ((…) IS TRUE)`.
- **Over the stored (encoded) row.** The representation SQL compares is the one
  the evaluator and every interpreter judge, so a transforming field
  (`NumberFromString`) means one thing everywhere. The Schema check encodes the
  decoded value before judging it.
- **Missing is not null.** Judging a row with a field the invariant reads absent
  (a partial projection, a form draft without it) answers **undecided**, never
  valid. Only the server, which holds the whole row, decides.

## 4. Where it is enforced

### Declared writes (#182's path)

The Drizzle writer compiles each invariant of its binding's Entity over the
proposed row into the statement it already runs:

```text
update … set quantity = ?, stock = stock + ?, revision = revision + 1
       where id = ? and revision = ? and <when>
         and <invariant, with quantity := ?, stock := stock + ?>
```

Each field the write sets is replaced by its new value (a parameter encoded by
the column), each increment by `column + amount`, and every other field stays
its column. The proposed row is therefore exactly the row the statement writes,
over the version it writes, with no extra read and no window: the atomicity of
#182 carries over unchanged. Server presets are values the write sets, so they
are in it. A field set by a database default or trigger is not known to the
writer; an invariant reading one is judged over the column's value before the
update (for an update) and refused at definition for an insert, below.

An **insert** has no row to read: its proposed row is its values. The writer
judges each invariant over them with the reference evaluator before inserting.
An invariant reading a field the insert does not set is refused at definition
(`RemoteServer.write`), since a default the writer cannot see would decide it.

A miss is classified as today, with one step added. In order: gone; a stale
revision (`Conflict`); the precondition over the current row (`Unmet`); then
the invariants over the current row with the write applied (`Invalid`, naming
the first that fails). The current row is read after the miss, so a row that
moved in between can satisfy everything there; that case is decided again once,
as the guard's pin is, then fails with "changed while it was written".

The writer's invariants come from **its binding's Entity**, the server's own
declaration. A client's `Write` over an Entity without them is enforced all the
same.

### Guarded writers

The guard is unchanged: authorization stays its own category, and an invariant
is never one of its alternatives, so neither grants the other. The order is the
guard's (`Forbidden`, `Conflict`), then the writer's (`Unmet`, `Invalid`), so
`Invalid` reaches only someone the rules let write the row.

An invariant over a member hidden from the caller still guards the data; it is
enforced. Its refusal then names no rule and no path ("the row would be
invalid"), since naming it would say what the hidden member holds. One bit
remains, the refusal itself; any integrity check leaks that.

### Database constraints

`invariantChecks(binding)` emits `alter table … add constraint <id> check ((…)
is true)` for each invariant the dialect can compile, and refuses (throws, by
name) one it cannot. A constraint holds against handlers and raw SQL, which the
writer's `WHERE` does not reach. Migrating a table whose rows already break a
rule is the application's: Postgres's `not valid` then `validate constraint` is
named in the docs; SQLite cannot add a constraint to a table at all, so there
the helper emits the clause for a `create table` and says so.

A violation the database raises (a handler's write against a constraint) is
the handler's failure, not classified.

### Schema and forms

`Entity.check(entity)` is an Effect Schema check over a value of the Entity's
row type, built from the same invariants. It encodes the value, evaluates each
invariant, and reports each failure at its `path` with its `message`; an
undecided invariant (a field absent) reports nothing. A form over an
`Entity.input` that covers every field an invariant reads applies that
invariant; one that covers some does not judge it, and its draft is never
called valid on that account. The server remains authoritative.

## 5. Typed outcome

`Refusal.invalid` is a new refusal, `{ _tag: 'Invalid', rule: Option<string>,
path: ReadonlyArray<string> }`. `Mutation.write` adds it to the refusal type of
a write over an Entity with invariants, as it adds `Unmet` for a write with a
`when`. The client cannot see the server's binding, so the type is read from
the Entity the `Write` is declared over; a server enforcing invariants the
client's Entity lacks may refuse with `Invalid` outside the type, which
`Data.refusal` decodes as no refusal, the failure still `Failed`. The docs say
to declare the domain once and share it, which avoids that.

## 6. Phases

1. **Declaration and reference evaluation.** `Entity.invariant`, `Entity.invariants`,
   the checks at declaration, `Entity.judge(entity, row)` giving
   `Valid | Invalid(failures) | Undecided(fields)`, and `Entity.check`.
2. **Declared writes.** The writer's compiled invariants, the insert's
   evaluation, the classification step, `RemoteServer.invalid`, `Refusal.invalid`
   and its typing, the guard's non-disclosure. Tests on SQLite, Postgres and D1;
   the reference evaluator and SQL compared over nulls and edge values.
3. **Forms.** An `Entity.input` that covers an invariant applies it; a partial
   one does not.
4. **Constraints.** `invariantChecks`, with a migration note per dialect.
5. **Docs and the example.** An inventory invariant and a cross-field
   comparison, with failures, in `examples/writes`.

## 7. Questions, with proposals

- **Name.** `Entity.invariant`, matching the issue's word and keeping "rule"
  for Guard. Proposal: yes.
- **Does an invariant constrain reads?** No: a stored row that already breaks
  one is shown as it is. A write that repairs it is judged on the row it
  leaves, so repair is always possible (#184's requirement).
- **Deletes.** Not judged: a deleted row leaves no row.
- **Sync.** A journal applying edits to a table does not go through the writer;
  only a constraint enforces an invariant there. Documented, not solved here.
