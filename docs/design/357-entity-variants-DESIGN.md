# Variants of an Entity (#357)

Status: designed (2026-10-30). Phase 1, the core in `foldkit-entity`, is
being built; phases 2 to 5 are planned below.

## The problem

`Entity.define` takes one `Schema.Struct`, so a fact that is one of several
shapes is flattened. The domain search's result is `Available` with a price,
a renewal price, a term and a premium flag, or `Unconfirmed` with none of them
(`examples/foldkit/domains/src/shared/domain.ts`, a `defineTaggedUnion`). The
port plan (`foldkit-domains-PLAN.md`, gap 8) declares it as a `status` field
plus four nullable fields, and a pure `toDomain` rebuilds the union for the
view. Every reader re-derives the case from which fields are null. Nothing
says that an `Available` row has a price, or that an `Unconfirmed` one has
none, so a write breaking that is stored.

## The model

```text
          declared                     stored (one row per id)                read
Available { name, price, … }  ─┐    { _tag, name, price | null, … }   ─►  Domain.variants
Unconfirmed { name }          ─┴─►  + invariant per case:                 (Effect's TaggedUnion:
                                      _tag = 'Available' → price ≠ null      match, guards, cases)
                                      _tag = 'Unconfirmed' → price = null
```

A variant Entity has two views of one row:

- **The stored row** is `entity.fields` and `entity.schema`, a plain Struct:
  `_tag` (`Schema.Literals` of the case names), every field all cases share
  as declared, and every other field nullable, since a row of another case
  holds null there. This is what every interpreter already reads.
- **The row** is `entity.variants`, Effect's `Schema.TaggedUnion` of the
  cases, with its own `match`, `guards`, `cases` and `isAnyOf`.
  `Entity.variantsOf(entity)` adds the codec between the two: a stored row,
  encoded, decodes to its case, and a case encodes back with null for the
  others' fields.

The Entity owns the rule that joins the views: each case with fields of its
own gets an invariant (`variant_Available`), so the reference judge, a form
(`Entity.judgeInput`) and a database (a CHECK) all refuse a row that is one
case with another's fields.

**An interpreter that does not know variants sees the stored row and keeps
working.** That is the migration story: nothing breaks when an Entity gains
variants, and each interpreter reads the union when it is ready.

## Declaration

```ts
const Domain = Entity.defineVariants('Domain', {
  Available: { ...DomainName.fields, ...DomainQuote.fields },
  Unconfirmed: DomainName.fields,
})
```

- The argument is what `Schema.TaggedUnion` and Foldkit's `defineTaggedUnion`
  take, each case's fields by tag, so an application's existing union moves
  over by spreading the same field sets.
- **The tag is `_tag`.** It is Effect's and Foldkit's discriminant, so the row
  is a `TaggedUnion` with no adapter, and `match` is the one Foldkit's
  guidance asks for. A table with another column name maps it in its binding
  (`bind`'s `fields`), as any column is mapped.
- **A key in several cases is one stored field.** Shared is decided by
  presence in every case, not by name: a key in some cases is a nullable
  stored field those cases require. One column holds one type, so the key is
  declared with one schema object, spread into each case; two different
  schemas are refused (a type error when their types differ, a definition
  error when only the objects do).
- Refused where declared: fewer than two cases (one shape is `Entity.define`),
  a case declaring `_tag`, an optional key (a stored row holds every field).
- A separate constructor, not an overload of `define`: the variants are fixed
  when the identity is made, so no descriptor of the Entity lacks them
  (`332-entity-versions-DESIGN.md`: members belong to the identity; a pipe
  step adding variants after `relate` would leave `target()` returning a
  descriptor without them).
- The result is a `VariantEntity`, an `Entity` with `variants`. `relate`,
  `derived` and `sets` keep it one (`Related` and `WithDerived` match it
  first), so relations, counts and context sets work as on any Entity.

## Types

| | Shared field (every case) | Case field |
| --- | --- | --- |
| `entity.fields[k].schema` | as declared | `NullOr(declared)`, or as declared when its encoded side holds null already (`OptionFromNullOr`) |
| `Expr` over `entity.fields[k]` | as declared | nullable: a comparison over it is unknown on rows of other cases |
| `Expr.is(E, tag, f => …)`'s `f[k]` | as declared | as declared, never null |
| row (`entity.variants.Type`) | in every case | in its cases only |

The decoded row is `typeof Domain.variants.Type`, a union; the stored,
encoded row is `typeof Domain.schema.Encoded`. `StoredFields<Cases>` computes
the stored fields at the type level the way `declareVariants` does at run
time: shared keys are `keyof Cases[keyof Cases]` (the keys a union of records
shares), and a case field is `NullOr` unless `null extends` its `Encoded`.

## Storage

One table: a `_tag` column, a column per shared field, and a nullable column
per case field. Nothing new is needed in `foldkit-remote-drizzle`:

- `bind` derives columns from `entity.fields` (`remote-drizzle/src/bind.ts`
  369-378), and a `NullOr` field on a nullable column passes `checkColumn`
  (bind.ts 212-224).
- `_tag`'s `Literals` becomes a one-of CHECK through `fieldRules`
  (`checks.ts` 403-415).
- Each `variant_<Case>` invariant reads only `after`, so it is a state
  invariant and `derive` writes it as a CHECK, `<table>_variant_<Case>`
  (checks.ts 504-519), which `bind` then requires of the table (bind.ts 379).

Rejected: a table per case (a join to read one row, and an id unique across
tables that no constraint holds), and a JSON column per case (no CHECK, no
index, no `Expr` over a case field).

## Expr narrowing

```ts
Expr.is(Domain, 'Unconfirmed')
Expr.is(Domain, 'Available', ({ price }) => Expr.lt(price, 20))
Expr.is(Order.relations.domain, 'Available', ({ price }) => Expr.lt(price, 20))
```

`Expr.is` builds `_tag = tag`, and with a callback `and(_tag = tag, …)`. The
callback is given the case's fields typed as the case holds them, the
`Expr.whenGiven` pattern: inside it, every row the predicate decides is of
that case, so the non-null type is true. Because `_tag` is never null, a row
of another case makes the `and` false, not unknown, so `Expr.not(Expr.is(…))`
holds there: "not an Available under 20" includes every Unconfirmed. Over the
stored field instead, `Expr.not(Expr.lt(Domain.fields.price, 20))` drops
Unconfirmed rows (unknown), as SQL does.

Through a `one` relation the same callback is given a path to each field
(`Expr.path(relation, field)`), so per-case paths need no new node: a null
link reads null, and the test is unknown, as every path is.

No new IR node, so every interpreter runs it today: the evaluator, the
Drizzle compiler, `Held`'s client-side judging, guards, invariants. The
callback's fields are copies of the descriptor's stored fields with the
case's schema, so annotated metadata (a collation) carries over. Used outside
the callback, a case field is the stored column again; nothing checks that,
and `isNull` over it would then answer for other cases' nulls.

Several cases at once are `Expr.in(Domain.fields._tag, ['A', 'B'])`.

## Selections (phase 2)

Today `Entity.select(Domain, { _tag: true, price: true })` is the stored row's
shape (price nullable), and that is what phase 1 leaves. Phase 2: a Selection
of a variant Entity that selects `_tag` has a union schema, each case holding
the selected shared members, the selected members of its own, and every
selected relation and derived member; selecting a case field without `_tag`
is refused, at the type and at definition. The codec is the stored-row codec
restricted to the selected keys (`variantsOf(entity).stored` built over a
subset). `Selected<typeof Quote>` is then a union to `match` on.

## Predictions and laws

A client predicts and filters held rows by evaluating predicates over stored
rows (`Held`, `Judge`, `evaluateEach`); `Expr.is` is `eq` and `and`, so those
need nothing. `Entity.judge` refuses a row breaking a case's shape, and so
does a write's prediction where it judges invariants. `Law.check` is about
operators and is untouched. A `Derived.make`'s `predict` reads the stored
row; it can decode it with `variantsOf(…).stored` when it wants the case.

## Remote's store (phase 3)

The store holds rows normalized per field, keyed `entity:id`
(`remote/src/store.ts` 16-44), and a read assembles the selected fields into
an object decoded by a flat Struct Remote rebuilds from `selection.members`
(`remote/src/selection.ts` 190-236, decoded at `index.ts` 1399-1416). With a
variant Entity it works today and yields the stored shape. Phase 3 decodes a
read through the Selection's union (phase 2) instead of the rebuilt Struct,
so `Data.get(Quote, id)` holds the case. A pending write over the stored row
needs nothing: an optimistic row is judged by the invariants. Needs
`packages/remote`.

## Form and Crud (phase 4)

A form writes through an `Entity.input`, and an input per case works today:
`Entity.input(Domain, Schema.Struct(Domain.variants.cases.Available.fields))`
maps each key to its stored field (`_tag`'s literal fits the stored
`Literals`), and `judgeInput` reports the case's invariant. Phase 4 adds a
form over the union: a case picker drawn from `_tag`, the chosen case's
controls, and a submit that encodes through the case. Crud's list columns come
from `selection.members` (`crud/src/index.ts` 226-252), so a list shows the
stored row now and the union after phase 2; its editor is the phase 4 form.

## Guards (phase 5)

A guard rule is a predicate, so `Expr.is` works in one today
(`guard.row(Domain, …, Expr.is(Domain, 'Available'))`). Guards read field
schemas by key (`guard/src/sync.ts` 66-69, `server.ts` 207-210, 362-371),
which the stored fields serve. Phase 5 only documents it and adds a test of a
per-case read rule; a member Read rule per case (hide `price` from a reader
only on Available rows) is a predicate rule over `Expr.is` already.

## Existing Entities

None changes. `Entity.define` is untouched; `VariantEntity` extends `Entity`,
and `AnyEntity` accepts one. `Related` and `WithDerived` gained a first branch
for `VariantEntity` and fall through to the old one. No member is reserved:
`_tag` exists only on variant Entities.

## Out of scope

- A case changing to another case (an Unconfirmed becoming Available) is an
  update of `_tag` and the fields; whether a transition is allowed is a
  transition invariant the application declares, as for any field.
- Nested variants (a case that is itself a union) and a union field inside a
  plain Entity (a JSON column). The first is a case with a tag of its own; the
  second is a field schema, not an Entity's shape.
- A key in two cases with different types (one column per type).
- Inheritance between Entities (a Domain that is also a Product).

## Phases

1. **Core in `foldkit-entity`**: `Entity.defineVariants`,
   `VariantEntity`, `Entity.variantsOf` (union, cases, stored codec), the
   `variant_<Case>` invariants, `Expr.is` over the Entity and through a `one`
   relation, a conformance set (`variantCases`) run by the reference
   evaluator, README and skill reference.
2. **Selections**: a union Selection when `_tag` is selected, and refusal of a
   case field without it; run `variantCases` in
   `remote-drizzle/test/conformance.test.ts` over SQLite and Postgres, with
   the CHECKs `derive` writes.
3. **Remote's store** reads a variant Selection as its union
   (`packages/remote`).
4. **Form and Crud**: a form over the union with a case picker; Crud's editor
   and list through it.
5. **Guards**: a documented, tested per-case rule; port the domains example's
   `Domain` onto `Entity.defineVariants` (gap 8 of the port plan).
