# entity: name a state of an Entity as a refinement (a predicate over its row), and declare a write as going from one to another

**What is missing.** An Entity's states have no names. `examples/writes`' `Product` is a draft, published or archived product, and each write says so again in its own words:

```ts
// Publish (examples/writes/src/domain.ts)
{ id: 'id', when: () => Expr.eq(Product.fields.status, 'draft') }
```

- The state a write starts from is a `when` written per write.
- The state it ends in is implied by a literal in its input (`status: Schema.Literal('published')`).
- The comment on `Publish` says an archived product is not published. That fact lives on one write's `when`, not on the Entity.

So which states exist and which writes join them is known only by reading every write. The closest thing in the tree is a named operator: `cms.published` is an `Expr.operator` "so a query, a guard and an invariant that ask it name the same question" (`packages/cms/src/index.ts:319-326`). It names the question. It does not name the rows.

**Proposal (sketch: a shape to review, not an API).**

```ts
const Draft = Entity.refine(Product, 'Draft', { status: 'draft' })
const Published = Entity.refine(Product, 'Published', { status: 'published' })
const Archived = Entity.refine(Product, 'Archived', { status: 'archived' })

// The general form: any predicate over the row.
const InStock = Entity.refine(Product, 'InStock', ({ row }) => Expr.gt(row.stock, row.reserved))

const Publish = Mutation.write(
  'Publish',
  Write.update(Entity.input(Draft, PublishInput), { id: 'id', becomes: Published }),
)
```

A refinement is a descriptor of the same Entity (same identity, table, rules and invariants) with a named predicate.

| Read by | What it does with it |
| --- | --- |
| `Query.from(Draft)` | `Product`, with the predicate in the `where` |
| A guard rule | The predicate, by name |
| A write whose input is over `Draft` | The predicate joins its `when`: refused as `Unmet` from any other state |
| `becomes: Published` | The row the write leaves is judged against the target, as an invariant is judged over `after` |
| The `can` hint | Membership in the write's source |
| Types | The literal form narrows the field (`status: 'draft'`). The predicate form narrows nothing |

**What it is not.**

- **Not a guard.** A guard says who may. This says which rows.
- **Not an invariant.** Nothing is refused to keep a row in a refinement. A draft that is published stops being a draft. A rule that holds only of drafts is an invariant on `Product` that reads the predicate.
- **Not a variant.** `Entity.defineVariants` stores a `_tag` and gives each case its own fields. A refinement stores nothing and changes no field. Whether the literal form over an enum field and a variant are one thing is out of scope here.

**Membership is three-valued**, as `Entity.judge` is: a row missing a field the predicate reads is undecided, never a member.

**Open questions.**

1. **Is `becomes` enforced, or only checked?** Enumeration (the check issue) decides enums and literals and nothing else. I would enforce it where it commits, compiled over the row the write leaves as an invariant is, and refuse it as `Invalid` naming the target.
2. **A predicate that reads another row.** "A bachelor is a man no marriage names" reads other rows. A query and a guard rule can reach them; a `when` cannot read another Entity. So such a refinement can be queried and used in a rule, and is refused where declared as a write's source or target, unless `when` learns to read a derived member.
3. **A write with no `becomes`.** Does it stay as today (any state), or must it name the whole Entity as its target?
4. **Does the literal form need its own name**, or is it the predicate form over `Expr.eq` with the narrowing inferred?

**Consumers.** `examples/writes` (three states, restated in `when`s), `foldkit-cms` (its published state), and the `can` hint and the check, which both read the source and target.

**Depends on.** The descriptor issue: a refinement is another descriptor of its Entity, and must judge the invariants the full one holds.

**Done when.**

- `examples/writes` declares its three states once. `Publish` has no `when` of its own and is refused as `Unmet` from published and archived.
- A write whose patch cannot leave a row in its target is refused, at definition where enumeration decides it and where it commits otherwise.
- `Query.from(Draft)` returns drafts on SQLite, Postgres and the memory backend.
- A row missing `status` is undecided for all three.
- Type tests: the literal form narrows, the predicate form does not, and an input over `Draft` cannot set a field `Product` lacks.
- Mutation specs: dropping the source predicate from `when`, and judging `becomes` over the row before, each turn a named test red.

**References.** `packages/entity/src/expr.ts:1717-1731` (`Expr.operator`'s `definedAs`), `packages/cms/src/index.ts:319-326`, `packages/entity/src/variants.ts`, `packages/entity/src/descriptor.ts:117-135`, `examples/writes/src/domain.ts`.
