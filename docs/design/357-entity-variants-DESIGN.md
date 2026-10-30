# Variants of an Entity (#357)

Status: built (2026-10-30), all five phases: the core and Selections in
`foldkit-entity`, `variantCases` on SQLite, Postgres and in memory, Remote's
reads, the form and Crud editor, and guards.

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

## Selections (phase 2, built)

A Selection of a variant Entity that selects `_tag` has a tagged union for
its schema (`Schema.TaggedUnion`, so `Quote.schema.match`): each case holds
the selected fields it has, typed as the case holds them (never null), and
every selected relation and derived member. Without `_tag` it is the stored
row's Struct, and selecting a field only some cases have is refused, at the
type (`SelectionSpec`) and in `Entity.select`, since nothing would say which
case a row is. `Selected<typeof Quote>` is the union.

A case's Struct reads a stored row as it is: the other cases' columns are keys
it does not declare, which decoding passes over, and a null in one of its own
is refused. It does not refuse a value in another case's column; the
`variant_<Case>` CHECK keeps such a row out of storage, and
`variantsOf(entity).stored` refuses it where a whole row is decoded.

## Predictions and laws

A client predicts and filters held rows by evaluating predicates over stored
rows (`Held`, `Judge`, `evaluateEach`); `Expr.is` is `eq` and `and`, so those
need nothing. `Entity.judge` refuses a row breaking a case's shape, and so
does a write's prediction where it judges invariants. `Law.check` is about
operators and is untouched. A `Derived.make`'s `predict` reads the stored
row; it can decode it with `variantsOf(…).stored` when it wants the case.

## Remote's store (phase 3, built)

The store holds rows normalized per field, keyed `entity:id`
(`remote/src/store.ts`), and a read assembles the selected fields into an
object decoded by the Remote Selection's schema. `Selection.from` used to
rebuild a flat Struct from the members, each as Remote reads it (a relation as
a ref), so a variant Selection read `{ _tag: 'Unconfirmed', price: null }`
where its type said the case has no `price`. It now builds the schema with
`Entity.selectionSchema(entity, schemas)`, the function `Entity.select` uses,
handed Remote's member schemas: one rule for both, and a variant Selection
with `_tag` reads each row as its case. A pending write over the stored row
needs nothing: an optimistic row is judged by the invariants.

`variantCases` runs in `remote-server/test/conformance.test.ts`, the
in-memory interpreter, beside the Drizzle compiler's run.

## Form and Crud (phase 4, built)

A form writes through an `Entity.input`, whose schema is a Struct, and so is
the operation's input; a union is not one. A form over a variant Entity is
therefore a form over a Struct input that names `_tag` and declares each field
only some cases have as `Schema.optionalKey`:

- `_tag`'s key is the case picker, a choice of the case names like any key of
  literals. `form.chosen(model)` is the case it names as it stands.
- A key of some cases is asked only in them: `form.shows(model, key)` tells a
  view whether to draw it, and a submit validates and sends only the keys of
  the chosen case. In its case the key is required as the case holds it (its
  plan is made from the schema inside the optional key). A draft typed under
  another case stays and is not sent.
- A key of some cases the input does not declare optional is refused by
  `Form.make`: a row of another case could never leave it out.
- The value stays the input's Struct type, with the chosen case's keys:
  honest for the operation, which takes that input as it is. A typed union of
  the value was rejected: the operation could not take it, and every caller
  would narrow twice.

Crud's editor loads `Entity.selectFor(form.input, { also: locks.select })`,
a Selection of a variant Entity with `_tag` read as its case (phase 3), so a
row fills only its case's keys. `selectFor`'s `also` replaced the cast
through `unknown` phase 2 left in Crud: its Selection is typed as the input's,
and what it reads has the lock members besides.

## Guards (phase 5, built)

A rule per case is a row guard over `Expr.is`
(`guard.row(Domain, p => Expr.is(Domain, 'Available', ({ price }) =>
Expr.lte(price, p.budget)))`). It is false on another case's rows and reads
`_tag` and the case's fields as stored columns, so it compiles to SQL and
judges in memory as any rule does (`guard/test/variants.test.ts`). Guards
read field schemas by key (`guard/src/sync.ts`, `server.ts`), which the stored
fields serve; nothing in `foldkit-guard` changed.

The domains port plan declares its `Domain` with `Entity.defineVariants`
(`foldkit-domains-PLAN.md`, gap 8 closed).

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

1. **Core in `foldkit-entity`** (built): `Entity.defineVariants`,
   `VariantEntity`, `Entity.variantsOf` (union, cases, stored codec), the
   `variant_<Case>` invariants, `Expr.is` over the Entity and through a `one`
   relation, a conformance set (`variantCases`) run by the reference
   evaluator, README and skill reference.
2. **Selections and SQL** (built): a union Selection when `_tag` is selected,
   and refusal of a case field without it; `variantCases` and the CHECKs
   `derive` writes, on SQLite and Postgres
   (`remote-drizzle/test/variants.test.ts`), with no change to the adapter.
3. **Remote's store** (built) reads a variant Selection as its union, and the
   in-memory interpreter runs `variantCases`.
4. **Form and Crud** (built): a form over a variant input with `_tag` as the
   case picker; Crud's editor loads each row as its case.
5. **Guards** (built): a documented, tested per-case rule; the domains port
   plan's `Domain` on `Entity.defineVariants`.
