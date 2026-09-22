# Entity, Form, and Crud: DX plan

Status: items 1–9 resolved; items 10–13 open, found by probing the query IR's
inference rather than by building with it. Friction found while building `foldkit-entity`, `foldkit-form`,
`foldkit-mixins-form`, `foldkit-crud`, and `foldkit-mixins-crud` and wiring them
into [`examples/entity`](../../examples/entity). Each item names what prompted
it, so it can be judged rather than taken on faith. Items are marked as they are
resolved. The design these packages came from is
[entity-DESIGN.md](./entity-DESIGN.md).

## 1. One primitive for controls and for displays (resolved)

**Friction.** `Control` was a closed union of eight kinds and `Display` of six.
An application needs a date picker, rich text, or a money field on its first
day, and the only way in was to pretend the key was `Text` and draw it by hand.

**Decision.** There is no distinction between built-in and custom. A control is
one primitive: a `kind` (a name), the `draft` it holds while edited, and
whatever data its kind needs. `Input.text()` and `Input.toggle()` are values of
that primitive, made by the same constructor an application uses for `'date'`.
The built-ins are a collection, not a special case.

The same holds on the drawing side. `foldkit-mixins-form` draws a control by
looking its kind up in a set of renderers. The renderers it ships are the
default set; an application adds to it, or replaces an entry, the same way the
defaults were added. `Display` and `foldkit-mixins-crud` follow the same shape.

## 2. Address a nested form with types (resolved)

**Friction.** Editing a nested row meant
`Message.Nested({ key, row, message })` with `key` a string and `message`
`unknown`. The tests needed a `_tag === 'Nested'` narrowing and `as never` to
reach the child form's Messages.

**Plan.** `form.nested.author` is the child form, typed. `form.row('author', id)`
gives the child's Message constructors already wrapped for that row.

## 3. A nested form is a form you can pass (resolved)

**Friction.** The parent built the child form itself and took its configuration
through a `nested: { author: { inputs, checks } }` bag that recursed.

**Plan.** `nested: { author: AuthorForm }` takes a form made with `Form.make`.
One author form serves alone and nested. The options bag goes.

## 4. Placing an editor takes eight steps (resolved: `Crud.actives`)

**Friction.** `Bundle.declare`, spread fields, spread cases, `.at`, `Page.at`
with `onOut`, wrap `update` in `after`, add `active`, and for a searching picker
add `chosen` and a second `active`. Missing one leaves an editor that never
loads and says nothing.

**Plan.** `Crud.actives(...)` collects every requirement of the pieces given, so
none is forgotten. The explicit pieces stay; this is what most pages call.

## 5. Sorting is written three times (resolved: `Sort`, `sortTerms`)

**Friction.** The example wrote `'title' | 'title-desc'` toggling in the Model,
in the view's `sort` input, and in the server's `orderBy`.

**Plan.** `Sort.make(['title', 'created'])` in `foldkit-crud`: the schema of the
state, `toggle`, and the map a drawn table takes. `foldkit-remote-drizzle` turns
the same state into order terms from a map of columns the server chose.

## 6. Two places typed ids stop short (resolved)

- `Data.get(selection, id)` takes any string, so an `AuthorId` reads a Post.
  **Plan.** For an Entity Selection, `id` is `IdOf` its Entity.
- `Crud.remover` needs `input: (id: PostId) => ({ id })` written out.
  **Plan.** `id: 'id'` names the input key; the type and the function follow.

## 7. Inputs repeat the Entity (resolved)

- `title: Blog.Post.fields.title.schema` for every reused field.
  **Plan.** `Entity.fields(Post, 'id', 'title')`, spread into the struct.
- `authorId: Relation.input(Post.relations.author)`.
  **Plan.** `authorId: 'author'` names the member. Nothing is inferred from the
  input key's own name, so it stays explicit; the long form stays too.

## 8. A form's options do not pipe (resolved)

**Friction.** Entities pipe (`derived`, `annotate`); `Form.make` takes one bag,
so a library cannot hand over a partly configured form.

**Plan.** Pipe steps that return a new form: `Form.inputs`, `Form.checks`,
`Form.messages`, `Form.nested`. The bag stays as the short form.

## 9. Smaller

- **Three bags of words** (`FormMessages`, the form view's labels, `ViewWords`).
  **Resolved, not as planned.** The first attempt, one object holding functions,
  crashed a placed form: Foldkit admits no function nested in `h.submodel`'s view
  inputs. Words are now text with blanks (`'{label} is required'`), the three
  shapes share no key, and one object `satisfies` all of them.
- **A relation is stored whole or as one window**, never both, in Remote.
  **Resolved, by a smaller design than the one first recorded here.** The first
  reading found the collision everywhere a relation is addressed by its field
  name: the wire's one window per field, a batch's answers merged by name, cursor
  merging, live changes, staleness, persistence. That argued for a protocol and
  store redesign. The observation that made it small is that all of those work
  *per field name* already, so the page only needs a name of its own. A page of
  a whole list is read as `comments@first=10`: the client's store, planner and
  merging hold it as one more field, and the server reads the name apart, reads
  the relation with the window, and answers under the alias, in the same source
  read unless the list is being read too. A write to the list marks its pages
  stale. A field that is always a page (`Entity.refPage`) keeps its own name,
  since there is no list for it to collide with.
- **A picker that searches is a `select` under a search box**, not a combobox.
  Recorded, not planned: it is the accessible floor, and a combobox is a renderer
  an application can now add (item 1).

## 10. `Expr.eq` is not symmetric, and the error does not say so (open)

**Friction.** `Expr.eq(Post.fields.rank, 3)` compiles. `Expr.eq(3, Post.fields.rank)`
does not, and the message is:

~~~text
Argument of type 'number' is not assignable to parameter of type 'Operand<any>'.
~~~

which names neither the problem (the left side must be a field, a scalar or a
predicate) nor the fix (`Expr.literal(3)`, which does work on the left). The
asymmetry is a consequence of `ValueOf<L>` typing the right side from the left,
so it is not going away — but a reader hitting it has nothing to go on.

Comparison orientation has already cost this project once: the test for it was
vacuous because the field was never on the right, which mutation testing caught
and a reader would not have.

**Plan.** Keep the asymmetry; fix the signal. Widen the left parameter to accept
a plain value and fail it with a branded type whose name is the sentence —
`foldkit-entity: put the field on the left, or wrap the value in Expr.literal`
— which is the technique `Registered` already uses for an unregistered
descriptor. Document the orientation and `Expr.literal` in the README's `Expr`
section, since the workaround currently exists and is undiscoverable.

## 11. `Expr.contains` compiles over a field that holds no text (resolved)

**Friction.** `Expr.contains(Post.fields.rank, 'x')` typechecks. `contains` is
documented as a case-insensitive text search and compiles to
`lower(column) like lower(?) escape '\'`, so over a numeric column it is
nonsense that reaches the database: SQLite coerces and answers something,
Postgres raises at runtime.

`contains` is the one operator whose semantics this project had to write a whole
section about (§6.0), and it is the one with no constraint on what it may be
applied to.

**Resolved**, though not the way the plan said. Constraining "an operand whose
`ValueOf` is assignable to `string`" as a check *intersected onto the parameter*
— the `Invalid` idiom `foldkit-remote` uses for an unregistered descriptor —
does not work here, and **fails open**. That idiom compares an already-resolved
indexed access (`Q['name']`); this check is a conditional over the type being
inferred, so inference falls back to the constraint, whose `Expr<any>` branch
makes the check vacuously true. Every operand passed, including the number the
item is about.

The constraint had to go on the type parameter itself: `TextOperand`, being a
field whose schema is a `Codec<string | null, …>`, or an `Expr<string>` /
`Expr<string | null>`. A constraint cannot be defeated by inference falling back
to it.

Found by a type test being reported as an **unused** `@ts-expect-error`, which
is the only signal a fails-open type check gives — and the reason the type tests
were written before the implementation was believed.

`Expr.isNull`/`isNotNull` stay unconstrained, which is correct — absence is a
question about any field. A predicate operand is now refused twice over, for a
different reason each time: it is already an answer (runtime), and it holds a
boolean rather than text (compile time).

Worth checking the same way: nothing stops `Order.asc` over a field whose type
has no total order the backends agree on. That is the collation question rather
than a typing one, and belongs with it.

## 12. A predicate over the wrong Entity is a runtime error (open)

**Friction.** This compiles and throws when it runs:

~~~ts
Query.from(Post).pipe(Query.where(Expr.eq(Other.fields.tag, 'x')))
~~~

`Query.where` checks ownership by identity token and raises
`Query.where: a predicate reads Other.tag, but the query is from Post`. The
message is good. The timing is not: it is the kind of mistake a reader makes
while composing, and the compiler has enough to catch it — `Query<E>` knows its
Entity, and `FieldExpr` carries an `owner`.

It cannot catch it *today* because `FieldExpr<T>` is parameterised by the value
type alone; the owner is a value, not a type.

**Plan.** Carry the owner's name as a type parameter — `FieldExpr<T, Name>`,
defaulting to `string` so nothing existing breaks — and constrain `where` and
`orderBy` to predicates whose names match the query's. Keep the runtime check:
it is what catches two Entities that share a name, which no type can.

Sized honestly: this touches every `Expr` signature and is the largest of these
four. It is also the one that removes a whole class of error rather than
improving a message.

## 13. A body with no ordering fails at registration, not at compile time (open)

**Friction.** `Query.define('NoOrder', {}, () => Query.from(Post))` compiles, and
`foldkit-remote-drizzle` throws when the domain is registered:
`query "NoOrder" needs an orderBy, or a descriptor declared with Query.define
whose body has one`.

Registration is boot, so this fails fast and loudly — much better than per
request. But it is still a type-level fact discovered at runtime.

**Plan.** Lowest priority of the four, and possibly not worth it: expressing
"this query has at least one ordering term" means a `Query<E, Ordered>` type
parameter threaded through `from`, `where` and `orderBy`, which costs more
inference noise than the error costs. Recorded so the trade-off is visible
rather than re-derived.
