# foldkit-entity

A domain entity declared once as a typed value: its intrinsic fields, its
relations to other entities, and the derived values consumers may read. Other
packages interpret that declaration; this one only describes.

> **Status:** declaration and selection. `foldkit-remote`
> [registers Entities and reads Selections as they are](../remote/README.md#entities-declared-with-foldkit-entity).
> `foldkit-remote-drizzle` binds a related set to tables with
> [`bind`](../remote-drizzle/README.md#binding-a-foldkit-entity-domain), and
> [`foldkit-form`](../form/README.md) builds a form from `Entity.input`, and
> [`foldkit-crud`](../crud/README.md) joins one to a Remote operation.

For the whole path in one runnable trace, domain to client to SQL, see
[`examples/entity`](../../examples/entity).

## What it owns

`foldkit-entity` owns **domain structure**: which members an entity has, what
kind each is, and which entity a relation points to.

It does not own:

- **Validation.** `entity.schema` is an ordinary Effect `Schema.Struct` and
  stays the only validity rule.
- **Storage or fetching.** A relation says "one Author", not "a foreign key" or
  "a join table". How a derived value is computed is the interpreter's business.
- **Operations.** An Entity implies no create, update, or delete.
- **Application state.** Nothing here touches a Model or dispatches a Message.

## Mental model

```text
Entity
 ├── fields      intrinsic values: the properties of entity.schema
 ├── relations   navigation edges: one / many of another Entity (Entity.relate)
 ├── derived     readable values an interpreter supplies
 └── members     all three under one namespace; keys never collide

interpreter ──(foldkit-metadata)──► Entity / member        attaches what it needs
interpreter ◄── reads fields, relations, derived, metadata
```

Each pipe step, and `Entity.relate`, returns a new frozen descriptor with the
**same identity**. Two descriptors are the same entity when `Entity.same(a, b)`,
not when `a === b`.

## Install

```sh
pnpm add effect foldkit-entity
```

## Sixty seconds: describe one read

```ts
import { Schema } from 'effect'
import { Entity, type Selected } from 'foldkit-entity'

const Task = Entity.define('Task', Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  done: Schema.Boolean,
}))
const TaskTitle = Entity.select(Task, { id: true, title: true })
type TaskTitle = Selected<typeof TaskTitle> // the value it reads
const value: TaskTitle = { id: 't1', title: 'Read the guide' }
```

`Task` describes the domain. `TaskTitle` describes one consumer's result shape;
it does not query a database or allocate a cache. Its schema validates that
shape when an interpreter produces data. A selection does not include `done`
unless you select it.

Next, hand the Entity to Remote for client reads or bind it to Drizzle tables
on the server. Declare operation input separately when adding a form: selecting
readable fields does not grant permission to write them.

## Relations and derived values

```ts
import { Schema } from 'effect'
import { Derived, Entity, Relation } from 'foldkit-entity'

const Author = Entity.define('Author', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Comment = Entity.define('Comment', Schema.Struct({ id: Schema.String, body: Schema.String }))
const Post = Entity.define(
  'Post',
  Schema.Struct({ id: Schema.String, title: Schema.String, published: Schema.Boolean }),
).pipe(Entity.derived({ commentCount: Derived.make(Schema.Number) }))

const Blog = Entity.relate(
  { Author, Post, Comment },
  {
    Post: {
      author: Relation.one(Author),
      editor: Relation.one(Author, { optional: true }),
      comments: Relation.many(Comment),
    },
    Comment: { post: Relation.one(Post) },
  },
)

Blog.Post.schema // Schema.Struct of id, title, published: relations are not in it
Blog.Post.fields.title.schema // Schema.String
Blog.Post.relations.editor.optional // true
Blog.Post.derived.commentCount.schema // Schema.Number
Blog.Post.relations.comments.target() // Blog.Comment
Blog.Post.relations.comments.target().relations.post.target() // Blog.Post, fully typed
Object.keys(Blog.Post.members) // id, title, published, commentCount, author, editor, comments
```

- `Entity.define` generates one `Field` per schema property and creates the
  identity. Calling it twice with the same name makes two different entities.
- `Derived.make` states a readable value's schema and nothing about how it is
  produced. `Entity.derived` is a pipe step because it concerns one entity.
- `Entity.relate` takes the entities and every relation between them, and
  returns the same entities with `relations` filled in. Use the returned ones
  (`Blog.Post`); the `Post` you passed in still has no relations.
- `Relation.one` / `Relation.many` state what the owner sees. `Post.author: one`
  and `Author.posts: many` together are the familiar one-to-many; neither side
  names it.
- `target()` returns the related entity, so relations can be followed from
  there, around a cycle too.

`Entity.relate` throws, and the types reject, a relation key that is already a
member, an owner that is not in the first argument, and a target that is not
in the first argument.

### Why relations are declared in one step

Entities point at each other: a Post has Comments and a Comment has a Post. If
each entity declared its own relations, `Post` would be typed in terms of
`Comment` and `Comment` in terms of `Post`, and TypeScript cannot infer two
constants that way. Declaring the relations over entities that already exist
avoids the cycle, and lets `relate` check every target up front.

## Ids of their own

An Entity is identified by its `id` field, and the id keeps the type you give
it. Brand it, and a ref to an Author can no longer stand in for a Post's:

```ts
const AuthorId = Schema.String.pipe(Schema.brand('AuthorId'))
const PostId = Schema.String.pipe(Schema.brand('PostId'))

const Writer = Entity.define('Author', Schema.Struct({ id: AuthorId, name: Schema.String }))
const Article = Entity.define('Post', Schema.Struct({ id: PostId, title: Schema.String }))
const Press = Entity.relate({ Writer, Article }, { Article: { author: Relation.one(Writer) } })

type WriterId = import('foldkit-entity').IdOf<typeof Press.Writer> // AuthorId

const ByLine = Entity.select(Press.Article, { author: true })
// { author: EntityRef<'Author', AuthorId> }

Entity.input(Press.Article, Schema.Struct({ authorId: AuthorId }), {
  authorId: Relation.input(Press.Article.relations.author), // a PostId, or any text, is a type error
})
```

- `IdOf<E>` is the type of the `id` field; `EntityRef<Name, Id>` carries it, and
  `Relation.input` takes it (`Id | null` for an optional `one`, a list for a
  `many`).
- A ref's schema is the id's own, so a pattern or a check on the id holds for
  every ref to it.
- **An id is text.** A ref travels and is stored as text, so an Entity whose `id`
  is a number (or has no `id` field) has refs with a plain `string` id: the
  number as text.
- A Selection carries its Entity's id type, so `foldkit-remote`'s
  `Data.get(PostPage, id)` takes a `PostId` and refuses an `AuthorId`, or plain
  text.
- Nothing here is new API to opt into. An Entity with `id: Schema.String` types
  exactly as before.

## Selecting a view

A Selection names the members a consumer wants and carries the schema of the
value that results. It does not fetch that value; whoever produces it (a server
adapter, a test, a form) decodes against `selection.schema`.

```ts
const AuthorOption = Entity.select(Blog.Author, { id: true, name: true })

const PostRow = Entity.select(Blog.Post, {
  title: true,
  commentCount: true,
  author: AuthorOption,
  editor: AuthorOption,
  comments: true,
})

type PostRow = Selected<typeof PostRow>
// {
//   title: string
//   commentCount: number
//   author: { id: string; name: string }
//   editor: { id: string; name: string } | null
//   comments: ReadonlyArray<{ entity: 'Comment'; id: string }>
// }
```

| Member | Select with | Yields |
| --- | --- | --- |
| Field, Derived | `true` | the member's own schema, checks included |
| Relation | `true` | an `EntityRef`: `{ entity, id }` |
| Relation | a Selection of its target | that Selection's value |
| `many` Relation | `Entity.page(selection, window)` | a page of that Selection's values: `{ items, hasNext, hasPrevious }` |

A `many` relation yields an array, and an optional `one` is nullable. A
Selection is an ordinary value, so `AuthorOption` above is declared once and
reused. Nesting is always explicit, which is what keeps a cycle finite.

### A page of a relation

A post may have ten thousand comments. `Entity.page` reads a `many` relation a
page at a time:

```ts
const CommentBody = Entity.select(Blog.Comment, { body: true })

const PostWithComments = Entity.select(Blog.Post, {
  title: true,
  comments: Entity.page(CommentBody, { first: 10 }),
})
// { title: string, comments: { items: { body: string }[], hasNext: boolean, hasPrevious: boolean } }
```

The window is `first` or `last`, with `after` or `before` a cursor. A page is a
view's shape, as neutral as "`many` means an array", so it is declared here.
What a cursor is and how the rows are ordered belong to whoever fetches: the
cursor is an opaque string an earlier answer handed out. Reading on is another
Selection with another window.

An unknown member, a nested Selection on a field, a page of a `one` relation,
and a Selection of the wrong
Entity are type errors, and `Entity.select` throws for untyped callers.

## Reading an operation's input

> Experimental: the smallest mapping that several operation shapes and
> [`foldkit-form`](../form/README.md) needed.

An Entity does not decide what may be written; an operation does (a Remote
mutation, an RPC, a form). `Entity.input` takes that operation's input schema
and says what each key means in terms of the Entity, so a consumer can find the
field's metadata for a label, or the relation's target for a picker.

```ts
const CreatePostInput = Schema.Struct({
  title: Schema.String,
  authorId: Schema.String,
  notify: Schema.Boolean,
})

const CreatePost = Entity.input(Blog.Post, CreatePostInput, {
  authorId: Relation.input(Blog.Post.relations.author),
  notify: Entity.unmapped,
})

CreatePost.members.title // Blog.Post.fields.title: it names a field, so it maps itself
CreatePost.members.authorId.relation.target() // Blog.Author: what a picker chooses from
CreatePost.members.notify // Entity.unmapped: about the operation, not the Post
```

- A key that names a field, with a value that fits it, maps itself. Only the
  present value has to fit: a key may be optional (a partial update), admit
  `null` (clearing it), or hold an `Option` (an id absent for something new),
  which is the input schema's rule to make.
  A declared write (`Write.update`, `Write.insert`) writes what an `Option`
  holds and nothing for one holding nothing or a key left out; its id may not
  be absent, since it names the row it writes.
- Every other key needs an entry: a Field under another name, a relation's ids
  with `Relation.input(relation)`, or `Entity.unmapped`. Nothing is inferred
  from a name like `authorId`.
- An entry may name the member by its key: `{ headline: 'title', authorId: 'author' }`
  is the `title` Field and `Relation.input` of `author`. It is the same reading,
  checked the same way; a name that is no field or relation is a type error.
- `Entity.fields(Post, 'id', 'title')` is those fields' schemas, to spread into
  the input's struct, so the input keeps the field's rules without repeating
  `Post.fields.title.schema` per key.
- `Relation.input` expects one id for a `one`, `id | null` for an optional
  `one`, and an array of ids for a `many`.
- A derived member cannot be written, and a member of another Entity cannot be
  mapped. Both are type errors and throw.

### An input that holds the target itself

A post created together with a new author carries the author, not an id.
`Relation.nested` maps the key to the relation and to an input of its target:

```ts
const NewAuthor = Entity.input(Blog.Author, Schema.Struct({ name: Schema.String }))

const CreatePost = Entity.input(
  Blog.Post,
  Schema.Struct({ title: Schema.String, author: NewAuthor.schema }),
  { author: Relation.nested(Blog.Post.relations.author, NewAuthor) },
)
```

A `one` holds the nested input's value, a `many` a list of them; the nested
input must be of the relation's target, and both are checked by type and at
runtime. `Entity.selectFor` then loads what the nested input writes of the
target, and `Entity.valuesFor` turns the loaded target back into nested values.
What a nested write *does* (insert, update, replace the list) is the
operation's handler to decide.

### Showing what is there

An edit screen has to load the current values and turn them into input values.
Both follow from the reading, so neither is written by hand:

```ts
const PostForEdit = Entity.selectFor(CreatePost)
// a Selection of `title` and `author`, the members the input writes; `author` as a ref

Entity.valuesFor(CreatePost, { title: 'Hello', author: { entity: 'Author', id: 'a1' } })
// { title: 'Hello', authorId: 'a1' }
```

`selectFor` selects every member the input writes, by the member's key, with
each relation as refs. `valuesFor` reads such a value back under the input's
keys: a field as it is, a relation as the id or ids of what it holds. A relation
read without its ids (a nested Selection that left `id` out) fills nothing. An
unmapped key appears in neither, since the Entity knows nothing about it.

The schema is an ordinary `Schema.Struct`, so declare it once and give the same
value to the operation, for example `Mutation.make('CreatePost', { Input:
CreatePostInput, … })` in `foldkit-remote`.

### Declaring what an input writes

An input says what each key *is*; a `Write` says what an operation *does* with
them: `Write.update` one row, named by a key, setting every other key mapped to
a field; `Write.insert` a row under an id the client chose; or `Write.delete`
one, which sets nothing.

```ts
const EditPost = Entity.input(Blog.Post, EditPostInput)
const Edit = Write.update(EditPost, { id: 'id' })

Write.writes(Edit) // the fields any invocation may change
Write.bind(Edit, { id: 'p1', title: 'Compilers' })
// { entity: 'Post', id: 'p1', values: { title: 'Compilers' } }, as the store holds it
```

It is declared data, like a query body: nothing is written by building one, and
an Entity having a field grants no one the right to set it. `bind` encodes each
value through its field's schema, so the patch is in the store's shape, and
takes the keys to write when an author changed only some. `expect` names a key
holding the revision the row was read at, for an interpreter to write only a row
still at it. An unmapped key is not written. A key mapped to a `one` relation
points the row elsewhere: `bind` gives it as a ref in `links` (none for an
optional relation set to nothing), and each interpreter carries it its own way,
a ref key in a store, a foreign key in a table. A `many` relation or a nested
key is refused where the write is declared.

An update or a delete may also say when it makes sense: `when` is what the row
must hold for it to land, written as a query body is: `() =>
Expr.eq(Post.fields.title, 'Draft')`, or with the input, `({ input }) =>
Expr.eq(Post.fields.title, input.from)`. It reads the row as it is before the write and the input,
never who is asking (that is a guard's), and only its own Entity: a field of
another is a type error, and refused where the write is declared. It is held as
a query body (`write.when`), so an interpreter checks it in the statement that
writes, and a row it does not hold of is refused as unmet. A write declared with
one is a `ConditionedWrite`, which is how `Mutation.write` knows it may be
refused so.

An update may move a number field by an amount the input holds, rather than set
it: `increment: { stock: 'quantity' }` adds the input's `quantity` (an unmapped
key, a number; negative takes away) to the stored `stock`, in the statement that
writes, so no concurrent change is lost. A retry must not add twice, so either it
expects a revision (a retry of a write that landed is then a conflict), or its
writer keeps a ledger, which answers the retry from its record and lets two
concurrent increments both land. `RemoteServer.write` refuses one with neither,
and one of a real number with no revision even under a ledger: floating-point
addition does not associate, so two concurrent sums could land as two results.
The field must be stored as a number, and may not be the id, the revision, or
set by another key. `Write.bind` gives the amounts apart from the values (`increments`), so a
client can add them to the value it holds as it reads it (Remote does), never
fixing a sum over a row that may since have moved. `Write.reads(write)` is what a write
reads from its row: what its `when` reads, each field it increments, what its
assignments read, and the revision. How a declaration, its guard, its writer and
the client fit together is the [declared writes guide](../../docs/declared-writes.md).

An update may also compute a field from the row before it and the input:
`compute: { label: ({ row, input }) => concat(input.prefix, row.name) }`, with an
operator such as the `concat` [below](#operators-each-interpreter-implements). It
reads neither the row after the write nor another Entity, so assignments never
depend on each other, and is refused where it is declared for a field another
key writes or a value of a kind the field does not store. A defined operator in
it is expanded there, so `Write.bind` carries it as data (`assignments`, each a
`Computation`: fields by key, values encoded, operators by name), which a writer
compiles into the statement and a client predicts by its own table. A
computation does not repeat without effect, so a retry of one is held to it as
an increment's is; without a revision it lands under a ledger only by an
operator whose commutativity and associativity are tested (`Conformance.laws`)
for each implementation the writer runs.

`Write.apply(row, bound, { operators })` is the row a bound write leaves over
the row before it: values set, amounts added (a null stays null, as in SQL),
assignments computed. It is the one computation of that row: a guard judges
it, a writer explains a miss by it, a client predicts it. `unknown` names each
field it could not work out (one the row lacks, or an operator the table lacks),
which keeps what the row holds.

## What every row and change must hold: invariants

A Schema judges a value, and a write's `when` the row before it. Neither judges
the row a write leaves: with `quantity = 10, reserved = 5`, an update setting
`quantity = 3` decodes, and leaves a row that holds more reserved than there is.
An **invariant** is what every stored row must hold, read over the row after a
write (`after`):

```ts
import { Schema } from 'effect'
import { Entity, Expr } from 'foldkit-entity'

const InventoryFields = Entity.define(
  'Inventory',
  Schema.Struct({ id: Schema.String, quantity: Schema.Number, reserved: Schema.Number }),
)
const Inventory = InventoryFields.pipe(
  Entity.invariant(
    'reservedWithinQuantity',
    ({ after }) => Expr.lte(after.reserved, after.quantity),
    { message: 'Reserved stock cannot exceed the quantity', path: ['reserved'] },
  ),
)

Entity.judge(Inventory, { after: { id: 'i1', quantity: 3, reserved: 5 } })
// { _tag: 'Invalid', failures: [{ id: 'reservedWithinQuantity', … }] }
```

One that reads the row before too (`before`) relates the two, each of which may
be valid on its own: an order that shipped stays shipped.

```ts
const OrderFields = Entity.define(
  'Order',
  Schema.Struct({ id: Schema.String, status: Schema.Literals(['placed', 'shipped']) }),
)
const Order = OrderFields.pipe(
  Entity.invariant(
    'shippedStaysShipped',
    ({ before, after }) =>
      Expr.or(Expr.not(Expr.eq(before.status, 'shipped')), Expr.eq(after.status, 'shipped')),
    { message: 'A shipped order stays shipped', path: ['status'] },
  ),
)

const shipped = { id: 'o1', status: 'shipped' }
Entity.judge(Order, { before: shipped, after: { ...shipped, status: 'placed' } })
// { _tag: 'Invalid', failures: [{ id: 'shippedStaysShipped', … }] }
```

What an invariant reads decides when it is judged; nothing else is declared:

```text
reads after only   -> state invariant:      every create and update; a CHECK constraint
reads before too   -> transition invariant: every update, the only write with a row before
```

`Entity.readsBefore(invariant)` says which one is.

`Entity.invariant` returns the step that attaches it, carrying its `id`. Hoist
it to export it, naming the Entity's type (what it reads is checked against
it), and match a refusal against it rather than spelling the id again:

```ts
export const reservedWithinQuantity = Entity.invariant<typeof InventoryFields>(
  'reservedWithinQuantity',
  ({ after }) => Expr.lte(after.reserved, after.quantity),
  { message: 'Reserved stock cannot exceed the quantity', path: ['reserved'] },
)
export const Inventory = InventoryFields.pipe(reservedWithinQuantity)

// Where a write's refusal is read (foldkit-remote):
Refusal.isInvalidBy(refusal, reservedWithinQuantity)
```

- `before` is each field as the row before holds it (`Expr.field`), and `after`
  each as the row after holds it (`Expr.next`), both typed as the field.
- It is declared once, on the Entity's metadata, and attaching more adds to it;
  the Entity stays the same (`Entity.same`). Its interpreters read it from there.
- It reads stored rows only: one over another Entity, or reading an input, is
  refused where it is declared, as is an id declared twice or a `path` naming no
  field. So is one reading nothing of `after`: which rows a write may start from
  is its `when`. Who may write is a guard's; whether a write applies now is its `when`'s.
- `Entity.judge(entity, { after, before? })` judges rows as the store holds them
  (encoded) and is pure. Without `before` (a create) it skips transition
  invariants. A row holds one only when it is true: a null fails it, as SQL's
  unknown drops a row from a `WHERE`. A row without a field it reads is
  `Undecided`, never `Valid`.
- `Entity.check(entity)` is the state invariants as a Schema check over the row
  type (`entity.schema.check(Entity.check(entity))`): it encodes the value, and
  reports each failure at its `path` with its `message`.

Text compares only under a declared collation, here too: a date stored as text
needs `{ collation: Collation.binary }` on its comparison. An interpreter that
judges stored rows alone refuses `after`'s nodes as the operation `next`;
`Expr.substituteNext` reads the ones a write sets as their values.

## Attaching metadata

An interpreter declares a [`foldkit-metadata`](../metadata/README.md) key and
attaches entries to the entity or to members. Entity core never reads them.

```ts
import { Metadata } from 'foldkit-metadata'

const Labels = Metadata.key<string>('my-admin/labels', {
  merge: labels => [...new Set(labels)],
  summarize: label => label,
})

const CmsPost = Blog.Post.pipe(
  Entity.annotate(Labels.of('Post')),
  Entity.annotateMembers({ title: Labels.of('Title'), author: Labels.of('Byline') }),
)

Labels.get(CmsPost.fields.title.metadata) // ['Title']
Entity.same(CmsPost, Blog.Post) // true: the metadata changed, the entity did not
```

Annotating again combines with what is there, using the key's own `merge`.

### A schema's own words

A label or a help text written on a schema (`annotate({ title, description })`)
is read with `Words.of(schema)`, which gives each as an `Option`. Under Effect 4 a
schema with checks resolves to its **last check's** annotations, which say what
the check expects and carry no title, so
`Schema.String.annotate({ title: 'Name' }).check(Schema.isMinLength(1))` resolved
directly has no title. `Words.of` falls back to the schema's own annotations. A
form's labels, Crud's columns and the page Builder's inspector read words
through it.

```ts
import { Schema } from 'effect'
import { Words } from 'foldkit-entity'

Words.of(Schema.String.annotate({ title: 'Name' }).check(Schema.isMinLength(1))).title
// Option.some('Name')
```

## Saying something about a row: `Expr`

An Entity says what a domain has. An `Expr` says something about one row of it,
as a value:

> **Why query semantics live in this package.** They describe and interpret
> nothing, which is the line this package already draws: an `Expr` says which
> rows and fetches none of them, and the interpreters that *fetch* live
> elsewhere — `foldkit-remote-drizzle` compiles a body to SQL against a
> database.
>
> `evaluate` is here rather than there because it is the **reference
> semantics** of the IR: what the operator definitions mean, operationally, over
> rows already in hand. A specification's reference implementation belongs with
> the specification, and it reaches nothing — no database, no transport, no
> Remote concept. The rule that keeps it honest is that **it may depend on the
> IR and nothing else**; the moment it wants one of those it has moved to the
> wrong place. Nothing that imports only
> `Entity` pays for them: they are ordinary consts in a `sideEffects: false`
> package, so a bundler drops them, and a package like `foldkit-form` imports
> only types from here in any case.

```ts
import { Expr, Order } from 'foldkit-entity'

const byTitle = Expr.eq(Blog.Post.fields.title, Expr.input('title', Schema.String))
const published = Expr.eq(Blog.Post.fields.published, true)
const newest = [Order.desc(Blog.Post.fields.title), Order.asc(Blog.Post.fields.id)]
```

Building one performs no work: it reads nothing, names no database, and runs no
query. An interpreter compiles it — `foldkit-remote-drizzle` to SQL, an
in-memory evaluator to a predicate over rows — which is what lets one query mean
the same thing in more than one place.

A comparison coerces what it is given, so the common forms read as they mean: a
field becomes a reference, a plain value becomes a literal, and an `Expr` is
already one. What it will not do is compare a field to the wrong kind of value —
`Expr.eq(Blog.Post.fields.title, 42)` is an error where it is written, rather
than a row that never matches. The value's type comes from the left, so `eq` takes
the field on the left; `Expr.eq('Hello', Blog.Post.fields.title)` is refused with
that sentence. The comparisons (`lt`, `gte`, …) also take a field second,
wrapped in `Expr.field(…)`.

**An input is a placeholder, not a value.** A query's body is built once, so
`Expr.input('title', …)` stands for whatever the query is given when it runs —
there is nothing there yet to branch on. An `InputExpr` is an object, so a
`condition ? a : b` over one is always truthy and decides itself once, forever.
A query that depends on what it was passed says so with a comparison over the
placeholder instead of a branch around it.

`dependenciesOf(...)` says which fields and inputs an expression reads and which
operations it uses, so a planner knows what it needs and an interpreter can
refuse a query it cannot run. Each field names its `owner`, the Entity's
identity, as well as the Entity's name, so two Entities defined with the same
name are two entries.

Every node is frozen as it is built, so a query is the value it was when
`Query.where` checked it: nothing can swap a field or a literal in afterwards.

A node can be shared (`Expr.eq(n, n)`), and the analysis visits each one once.
An interpreter does not: `evaluate` reads a predicate as a tree on every row,
and the SQL compiler writes a shared operand out wherever it appears. So
`Query.where` refuses predicates that expand past `maxQueryNodes` (1,000)
nodes, counting a shared node on each path that reaches it.
A node may be shared, `Expr.eq(n, n)`, and every walk over one visits each
node once, so a deeply shared predicate costs its size, not its paths.

### Asking a question that depends on an input, without branching on it

Since an input is a placeholder, a query cannot choose between two shapes based
on what it was given. It does not need to: a question that looks like a branch
is usually a comparison waiting to be written.

```ts
// A list that shows archived entries or unarchived ones, as the reader asks:
Expr.eq(Expr.isNotNull(Entry.fields.archivedAt), input.archived)

// A search box that filters when something is typed and not when nothing is:
Expr.contains(Entry.fields.label, input.search)
```

The first is "is-archived equals what you asked for". The second relies on
everything containing the empty string. Both are one static body, and both ask
exactly what `archived ? … : …` and `search === '' ? … : …` asked.

`isNull` and `isNotNull` are the same node with the answer absence gives
flipped, so nothing has to negate a predicate to get the other.

**`contains` is case-insensitive**, which is what a search means — and which
has to be said, not left to the interpreter: SQLite's `like` ignores case and
Postgres's does not, so a body that left it open would mean two things. Folding
is ASCII-only, since that is what `lower` does in SQLite without ICU: `É` does
not match `é`, though each matches itself. Text holding a NUL character is
refused by every interpreter here, in `contains`, `eq` and `in` alike, since
Postgres text cannot hold one and SQLite compares only up to it.

**`in` asks whether a value is one of a list**, written out or given as an
input: `Expr.in(Todo.fields.projectId, input.projectIds)`. Each element is
compared as `eq` compares, and it reads as SQL's `in`: a null value is
unknown, so is no match against a list holding a null, and an empty list
matches no row (on Postgres too, which refuses `in ()`; the compiler says
`false` instead).

**It searches text, and the operand is constrained to text.** `contains` over a
number would compile to `lower(rank) like …`, which SQLite coerces into an
answer and Postgres rejects at runtime — so a non-text operand is a compile
error where it is written rather than a surprise where it runs. Nullable text is
allowed, because it is a real case with a real meaning:

**Over a column that can be null it is not the same as no filter.** A null
contains nothing, not even the empty string, so its rows drop out. The column
the CMS searches is declared not-null, which is what makes an empty search
exactly everything there.

### Which rows: `Query`

A `Query` is an Entity to read, the predicates every row must hold, and the
order to read them in — composed with `pipe`, one immutable value per step:

```ts
const published = Query.where(Expr.eq(Blog.Post.fields.published, true))
const newest = Query.orderBy(Order.desc(Blog.Post.fields.title))

const recent = Query.from(Blog.Post).pipe(published, newest)
const oneOf = Query.from(Blog.Post).pipe(published, Query.where(byTitle))
```

`published` and `newest` are fragments: written once, piped into any query over
the same Entity. Composing performs no work — no table is named, no connection
opened, nothing read. A fragment over another Entity is refused where it is
piped: a predicate's type names the Entities its fields belong to, so
`Query.from(Blog.Post).pipe(Query.where(Expr.eq(Blog.Comment.fields.body, 'x')))`
reads `a predicate reads Comment, but the query is from Post`, and an ordering
term over another Entity is refused by `Query.orderBy` the same way. The same check
runs again when the query is built, for what a type cannot see: a predicate
typed plainly as `Predicate`, or two Entities that share a name.

**Two `where`s conjoin and two `orderBy`s append.** Neither replaces what came
before, so piping a fragment can only ever narrow a query, never silently undo
part of it. An earlier ordering term stays the more significant one, which is
what makes a later `Query.orderBy(Order.asc(id))` a tie-breaker. Neither ever replaces what a fragment added.

**A sort the reader picks is part of the body too.** `Order.chosen` maps each
name the input's sort can hold to a field, so the server and the client read one
declaration of what `title` means, and the client can tell which edits may move
a row:

```ts
const PostSort = Schema.NullOr(
  Schema.Struct({ by: Schema.Literals(['title', 'id']), direction: Schema.Literals(['asc', 'desc']) }),
)
const sorted = (sort: InputExpr<typeof PostSort.Type>) =>
  Query.from(Blog.Post).pipe(
    Query.orderBy(Order.chosen(sort, { title: Blog.Post.fields.title, id: Blog.Post.fields.id })),
  )
```

Every name the sort can hold needs a field, or it does not compile. A `null`
sort chooses none, and the terms after it decide. `Query.orderFor(query, input)`
is the fixed terms for one input, which is what every interpreter sorts by.

**Every order is total.** `orderFor` ends it on the Entity's id, ascending,
unless the terms already read the id, so rows with equal keys come out in one
order on every interpreter rather than each breaking ties its own way.

**How text orders is declared, or left to the server.** Left unsaid, SQLite
compares bytes, Postgres follows the database's locale and a JavaScript sort
follows UTF-16 code units. A field declares its collation, and every
interpreter that can honour it orders the same; one that cannot refuses:

```ts
const Tagged = Entity.define('Tagged', Schema.Struct({ id: Schema.String, name: Schema.String })).pipe(
  Entity.annotateMembers({ name: Collation.of(Collation.asciiFold) }),
)
const byName = Query.from(Tagged).pipe(Query.orderBy(Order.asc(Tagged.fields.name)))
Query.placement(byName, {}) // { _tag: 'Placeable' }
```

- `Collation.binary` is code point order: SQLite `BINARY`, Postgres
  `COLLATE "C"`. An id is `binary` unless it says otherwise.
- `Collation.asciiFold` folds ASCII letters, then compares by code point:
  SQLite `NOCASE`, Postgres `lower(x COLLATE "C")`.
- `Collation.locale('en-US')` is the backend's own, ordered on the server and
  never by a client.

A term overrides its field's: `Order.asc(field, { collation })`.
`Query.placement(query, input, { operators })` says whether a client can order the rows exactly
as the server does: every term over a number or a boolean (a row may lack it), over text with a
portable collation, or a call whose primitive operators the client's table runs. A body with no
order, text with none declared, a locale, or an operator the table lacks is `NotPlaceable`, with
the reason.
`foldkit-crud`'s `Sort.make(['title', 'id']).Schema` is such a sort.

The list of predicates **is** the conjunction: a query wanting three
conditions writes three `where`s. `Expr.and` is for a conjunction inside
something else, and `Expr.or` and `Expr.not` are the other two connectives:

```ts
// A search over two fields: a product whose description or UPC holds the text.
Expr.or(
  Expr.contains(Product.fields.description, input.search),
  Expr.contains(Product.fields.upc, input.search),
)

// A filter that applies only when its input is given (`input.status` may be null).
Expr.whenGiven(input.status, status => Expr.eq(Product.fields.status, status))
```

They mean what SQL's do, three-valued: a comparison of a null is unknown, a row
is kept only when its predicate is true, `or` takes true over unknown and `and`
takes false over it, and **`not` of an unknown is unknown**. So
`Expr.not(Expr.eq(field, 'draft'))` leaves out a row whose `field` is null;
"everything but drafts", nulls included, is
`Expr.or(Expr.isNull(field), Expr.not(Expr.eq(field, 'draft')))`. `and` and
`or` need an operand (an empty one would match every row, or none), a nested
one of the same kind is flattened into its parent, and one operand is that
operand. An interpreter that runs per request decides an operand that reads no
field before it writes anything: `whenGiven` compiles to `true`, which filters
nothing, when its input is null, and to the predicate alone when it is given.

**Comparisons** order two values: `Expr.lt`, `lte`, `gt` and `gte`.

```ts
Expr.lt(Product.fields.cents, 1000)
// A range of dates, stored as ISO strings, which order by time under binary:
Expr.and(
  Expr.gte(Shipment.fields.shippedAt, input.from, { collation: Collation.binary }),
  Expr.lt(Shipment.fields.shippedAt, input.until, { collation: Collation.binary }),
)
```

Numbers compare as numbers, and nothing compares across kinds or for a value
stored as neither a number nor text. Text orders by a collation, and backends disagree
about the default one (SQLite's `BINARY`, the Postgres database's locale,
JavaScript's UTF-16 units), so text is compared only under `Collation.binary`
or `Collation.asciiFold`, declared on the field or passed, and only against a
field: anything else is refused where the comparison is written. A value is
compared in its encoded form, which is why a date stored as an ISO string is
text here. A null on either side is unknown, as in SQL. There is no `between`;
it is the `and` above.

A query reads one Entity, so a predicate or ordering term naming a different
one is refused where it is piped: an interpreter would otherwise be asked for a
column of a table it was never told to read. Entities are compared by identity,
so two declared with the same name are two Entities here as everywhere else.

### Saying what an interpreter can run

An `Expr` is only portable if the thing running it says what it runs.
`Query.unsupported(query, supported)` names the operations a query needs that
an interpreter does not have:

```ts
const missing = Query.unsupported(body, ['eq', 'isNull', 'isNotNull'])
if (missing.length > 0) throw new Error(`cannot run ${missing.join(', ')}`)
```

The refusal belongs to the interpreter, not here: one that compiles at
registration and one that runs a body directly fail at different moments. What
matters is that it refuses rather than skipping the operation — an interpreter
that quietly drops a `contains` it cannot compile answers a different question
in full confidence, and every test it does support still passes.

### Naming a question: operators

A predicate an application asks in many places (in a public query, a
visitor's Read rule, an invariant) can be given a name. `Expr.operator`
declares one by what a call of it means:

```ts
import { Schema } from 'effect'
import { Entity, Expr, Query } from 'foldkit-entity'

const Story = Entity.define(
  'Story',
  Schema.Struct({ id: Schema.String, publishedAt: Schema.NullOr(Schema.String) }),
)

const published = Expr.operator('acme.published', {
  input: [Schema.Unknown],
  output: Schema.Boolean,
  definedAs: publishedAt => Expr.isNotNull(publishedAt),
})

const PublicStories = Query.from(Story).pipe(Query.where(published(Story.fields.publishedAt)))
Query.show(PublicStories)
// FROM Story
// WHERE acme.published(Story.publishedAt)
```

- **It computes nothing of its own.** `definedAs` builds an expression from a
  call's arguments, once per call, and every interpreter runs that expression
  (`Expr.expanded` writes a predicate's calls out), so the operator needs no
  SQL, no evaluator, and no support list. The SQL a body compiles to is the SQL
  of the body written out by hand.
- **What it adds is a name.** `Query.show` prints the call, and
  `Query.dependencies(body).operators` lists each operator a body uses.
- **It reads only its arguments.** A `definedAs` that closes over a field or an
  input, instead of taking it, is refused when called: nothing asking what the
  call reads (Guard's checks, Remote's matching) would see it.
- **Arguments are checked by their stored form**, at compile time and when
  called: a field, scalar or plain value of the input's stored type, or a
  predicate where it takes a boolean. A boolean `output` makes a call a
  predicate, usable in `and`, `or`, `not`, a guard or an invariant with no cast;
  any other makes it a scalar of that type.
- **Ids are namespaced** (`acme.published`), and `foldkit.` is reserved.
  `version` (default 1) changes when what it means does; a call prints it after
  the first (`acme.published@2(…)`).

`foldkit-cms` declares one over its `published` role: `Cms.published(entity)`.

### Operators each interpreter implements

Without `definedAs`, an operator is **primitive**: it means what each
interpreter's implementation does, and every implementation is held to the
same statement of it. The kernel ships one, `Text.startsWith`; an application
declares its own and implements it, here for the in-memory interpreter:

```ts
import { Schema } from 'effect'
import { Collation, Entity, Expr, Operators, Query, Text, evaluate } from 'foldkit-entity'

const Product = Entity.define(
  'Product',
  Schema.Struct({ id: Schema.String, upc: Schema.String, label: Schema.String }),
).pipe(Entity.annotateMembers({ upc: Collation.of(Collation.binary) }))
const search = Expr.input('search', Schema.String)

// The UPC declares `binary`, so it compares exactly; the label declares nothing,
// so this call is given a collation.
const ByCode = Query.from(Product).pipe(Query.where(Text.startsWith(Product.fields.upc, search)))
Text.startsWith(Product.fields.label, search, { collation: Collation.asciiFold })

const joined = Expr.operator('acme.joined', {
  input: [Schema.String, Schema.String],
  output: Schema.String,
  collation: 'operands',
})
const operators = Operators.merge(
  Operators.kernel,
  Operators.memory(Operators.implement(joined, (left, right) => `${left}${right}`)),
)
evaluate(ByCode, { search: '012' }, [{ id: 'p1', upc: '0123', label: 'Bolt' }], { operators })
// [{ id: 'p1', upc: '0123', label: 'Bolt' }]
```

`startsWith` compares under its text's collation (`binary` exactly, `asciiFold`
folding ASCII letters on both sides), is unknown when either side is null, and
holds for the empty prefix; text with no collation, or a backend's locale, is
refused where it is written.

- **A table is a value.** `Operators.memory` refuses one operator implemented
  twice, or two under one name; `merge` refuses an overlap, and `override`
  replaces on purpose. `Operators.checked(table)` checks each answer against
  the operator's output schema, for tests. Nothing registers globally:
  `evaluate`, `decided`, `truthOver`, `Entity.judge`, `Entity.judgeInput` and
  `Entity.check(entity, { operators })` each take the table, `Operators.kernel`
  by default.
- **Null is strict by default.** A null argument gives null (unknown for a
  predicate) and the implementation never sees one. `nulls: 'handled'`
  operators are implemented with `Operators.implementHandlingNulls` and answer
  for null themselves; a predicate answers `null` for unknown.
- **Text has a collation or no comparison.** `collation: 'operands'` makes a
  text result carry the collation its text arguments share, so
  `Expr.lt(joined(a, b), x)` compares under it; `'required'` (as
  `startsWith`) refuses text with none. A call may be given one:
  `op(a, b, { collation })`.
- **A call orders when its result does.** `Order.asc(joined(Product.fields.upc, '!'))`
  orders by the call's text under the collation it carries, and a call giving a
  number orders as one; anything else, text with no collation included, is
  refused where the term or `Order.chosen` alternative is written. `evaluate`
  runs it per row by its table, and `compareRows(terms, a, b, query, { input,
  operators })` compares two rows the same way.
- **What a table lacks is refused by name.** `Query.unsupported(body,
  supported, operators)` and `Expr.unsupported(nodes, { operations,
  operators })` name each operation and operator missing; `evaluate` refuses
  such a body. An invariant calling an operator its judge's table lacks is
  `Undecided` with that operator in `operators`, which a form passes and a
  server refuses to start without.
- **NUL is refused** in any text argument, and an implementation that throws
  is reported as a `QueryEvaluateError` naming its operator.

### Laws, and holding an implementation to them

An operator may declare the equations every implementation of it keeps. A law
describes: nothing rewrites a body by one. `Conformance.laws` tests an
implementation against them, and what it finds is evidence its table records.

```ts
import { Schema } from 'effect'
import { Expr, Law, Operators } from 'foldkit-entity'
import { Conformance } from 'foldkit-entity/conformance'

const concat = Expr.operator('acme.concat', {
  input: [Schema.String, Schema.String],
  output: Schema.String,
  collation: 'operands',
  laws: [Law.associative, Law.identity(''), Law.preservesCollation],
})
const table = Operators.memory(Operators.implement(concat, (left, right) => `${left}${right}`))

const verdict = Conformance.laws(concat, table) // { _tag: 'Holds', evidence: [...] }
const recorded =
  verdict._tag === 'Holds' ? Operators.withEvidence(table, verdict.evidence) : table
Operators.describeTable(recorded) // [{ operator: 'acme.concat', laws, evidence }]
```

- **A law is checked where it is declared.** `Law.commutative`, `associative`,
  `idempotent`, `identity(value, side?)`, `absorbing(value, side?)`,
  `inverse(other, identity)` and `distributes(over)` are laws of an operator of
  two arguments; `monotonic(direction, position)` names an argument it has, and
  `preservesCollation` needs `collation: 'operands'`. A witness that is not a
  value the argument's schema stores is refused.
- **Its domain** is every non-null value of the input schemas, narrowed with
  `Law.within(law, schema)` where a law holds of less (a square is increasing
  over the non-negative numbers only). Strict null makes both sides null, so no
  law needs a null case.
- **Testing is sampling, seeded.** Cases come from a fixed sample of each kind
  (the empty string, mixed case, non-ASCII and astral text; zero, negatives, a
  fraction), kept where the schemas decode them, up to `cases` (200) a law
  chosen by `seed` (0). The verdict is `Holds` with one `Tested` record a law,
  or the first `Counterexample` with both sides: declaring `concat` commutative
  finds `"a"` and `"A"`, which give `"aA"` and `"Aa"`.
- **Evidence is an implementation's.** `Operators.withEvidence` refuses a record
  of an operator the table lacks or a law it does not declare; `override` drops
  a replaced implementation's records, `merge` keeps both tables'.
  `Evidence.Proven` records a proof made elsewhere, never checked here.

`Conformance.operator(op, { implementations })` runs one set of calls through
every implementation given and reports where they disagree, a refusal included:
generated from each argument's samples, null where its schema admits one, and
text holding NUL, under `binary` and `asciiFold` where the operator compares
text. `Conformance.memory(table)` is the reference interpreter's runner; a
defined operator's expansion runs beside the others. `foldkit-remote-drizzle`
runs the kernel's operators and an application's through it on SQLite and
Postgres.

### One operator, from declaration to description

The `concat` above, as an application ships it: declared once, implemented for
each interpreter that runs it, held to itself, and described for whoever asks
what a server runs.

```ts
import { sql } from 'drizzle-orm'
import { Operators } from 'foldkit-entity'
import { Conformance } from 'foldkit-entity/conformance'
import { DrizzleOperators } from 'foldkit-remote-drizzle'

// In memory, as above; in SQL, for a binding (`bind(…, { operators: { memory, sql } })`).
const memory = Operators.memory(Operators.implement(concat, (left, right) => `${left}${right}`))
const sqlTable = DrizzleOperators.make(
  DrizzleOperators.implement(concat, ({ args: [left, right] }) => sql`(${left} || ${right})`),
)

// Its laws, against the memory implementation.
const held = Conformance.laws(concat, memory)

// The two implementations against each other: an SQL runner selects
// `compileCall(call, binding, name)` from a database (foldkit-remote-drizzle's
// test/operatorConformance.test.ts has one); here the memory one alone.
const report = await Conformance.operator(concat, {
  implementations: { memory: Conformance.memory(memory) },
})

// Its signature as JSON: name, version, each argument and the result as a JSON
// Schema of what is stored, its null and collation rules, its laws.
Operators.describe(concat)
```

`Operators.describe` gives an `OperatorDescription`, a Schema whose decoder
checks a description another server publishes; it says what an operator takes
and keeps, never a defined operator's body. `Operators.describeTable(table)`
lists each operator a table implements so, with its evidence, and
`Query.operators(body)` names each operator a body calls (a defined one and the
primitive ones it calls). A version is part of an operator's name: a table
holding `acme.slug` does not answer a body calling `acme.slug@2`, and the
refusal names both (`acme.slug@2 (this table has acme.slug)`), so a client and a
server on different deploys see which side is behind.

### Reading one back

`Query.show(query)` renders a body as text, one clause per line:

```ts
Query.show(body)
// FROM Post
// WHERE Post.slug = $slug
//   AND Post.published = true
// ORDER BY Post.updatedAt DESC
```

For a person — an explanation, a diagnostic, a test asserting on a whole
predicate at once — and never for an interpreter. It is close enough to SQL to
read at a glance and unlike it everywhere that matters: an input is `$slug`
rather than a bound parameter, `contains` is named rather than rendered as
somebody's `like`, and no dialect's escaping or collation is implied. What
actually ran is whatever that backend compiled, which is not this.
`Expr.show(node)` does the same for one expression.

A `Query` says which rows. It does not say which fields — that is a Selection —
and it does not say how many, whether absence is an error, or whether to watch
for changes: those belong to the consumer doing the reading, not to the
relation.

Only the operations a real query in this repository needs exist. The set grows
from queries, not from what a database could express.

## API

| Call | Meaning |
| --- | --- |
| `Entity.define(name, struct)` | A new Entity with a Field per property. |
| `Entity.relate(entities, { Owner: { key: Relation.one(Target) } })` | The entities with their relations declared; targets resolve to the returned entities. |
| `Entity.select(entity, { key: true or Selection })` | A Selection: what was selected (`members`) and the `schema` of the result. |
| `Entity.page(selection, { first, after } or { last, before })` | In a Selection, a `many` relation read as a page: `items`, `hasNext`, `hasPrevious`. |
| `Entity.fields(entity, ...keys)` | The schemas of those fields, by key, to spread into an input's struct. |
| `Write.update(input, { id, expect?, when?, increment? })` | A declared update of one row: every key the input maps to a field, but the id and the expected revision; `when`, what the row must hold for it to land; `increment`, the number fields it moves by an input amount. |
| `Write.reads(write)` | The fields a write reads from its row: its `when`'s, each it increments, its assignments', the revision. |
| `Write.update(input, { …, compute })` / `Computation` | A field computed from the row before the write and the input, carried as data. |
| `Write.apply(row, bound, { operators })` / `Write.boundReads(bound)` | The row a bound write leaves, and what of the row before it that needs. |
| `Write.writes(write)` / `Write.bind(write, value, keys?)` | The fields it may change; the row and values one input writes, encoded as the store holds them. |
| `Entity.input(entity, struct, mapping?)` | Experimental. Which member each key of an operation's input writes. |
| `Relation.nested(relation, input)` | In an input mapping: the key holds the target itself, written through `input`. |
| `Entity.selectFor(input)` | The Selection of the members an input writes: what an edit screen loads. |
| `Entity.valuesFor(input, value)` | The input values that reproduce a loaded value: fields as they are, refs as ids. |
| `Entity.derived({ key: Derived.make(schema) })` | Pipe step adding readable, externally supplied members. |
| `Entity.annotate(metadata)` | Pipe step attaching metadata to the Entity. |
| `Entity.annotateMembers({ key: metadata })` | Pipe step attaching metadata to members by key. |
| `Entity.same(a, b)` | Whether two descriptors are versions of one Entity. |
| `Selected<typeof selection>` | Type: the value a Selection reads (its `schema`'s `Type`). |
| `Words.of(schema)` | A schema's `title` and `description`, each an `Option`, including a title given before a check. |
| `Entity.is(value)` | Whether a value is an Entity descriptor. |
| `Expr.eq(left, right)` | Two values are the same: a field (or an expression) on the left, and the value on the right, which is typed from it; a predicate may stand where a boolean is wanted. A plain value on the left is a compile error that says so. |
| `Expr.isNull(field)` / `Expr.isNotNull(field)` | Whether a value is absent; one node, with the answer absence gives flipped. |
| `Expr.contains(field, search)` | Whether text contains text, over a text or nullable-text operand only. Containing the empty string is everything, but a null contains nothing. |
| `Expr.in(field, among)` | Whether a value is one of a list (written out, or an input), each compared as `eq` compares; SQL's `in`, an empty list matching nothing. |
| `Expr.and(a, b, …)` / `Expr.or(a, b, …)` | Every operand holds / at least one does, as SQL's three-valued `and` and `or`. At least one operand; a nested one of the same kind is flattened in. |
| `Expr.not(predicate)` | The predicate does not hold; an unknown stays unknown, so a null matches neither side. |
| `Expr.lt` / `lte` / `gt` / `gte(left, right, { collation? })` | One value orders before or after the other. Numbers as numbers; text only under `binary` or `asciiFold` (the field's declared collation, or the one given), and only against a field. |
| `Expr.whenGiven(input, given => predicate)` | A filter applying only when a nullable input is given: `or(isNull(input), predicate)`, the predicate seeing the input as never null. |
| `Expr.operator(id, { input, output, definedAs, version?, description? })` | An operator defined by what a call means; calling it builds a `Test` predicate (a boolean output) or a `Call` scalar, whose expansion every interpreter runs. |
| `Expr.unsupported(nodes, { operations, operators })` | What these expressions need that an interpreter lacks: operations, then primitive operators by name. |
| `Text.startsWith(text, prefix, { collation? })` | Whether text begins with a prefix, under its collation; the kernel's primitive operator. |
| `Operators.memory(...)` / `implement` / `implementHandlingNulls` / `merge` / `override` / `checked` / `kernel` | Tables of in-memory implementations of primitive operators, passed to `evaluate` and every judge. |
| `Law.associative` / `commutative` / `idempotent` / `identity` / `absorbing` / `inverse` / `distributes` / `monotonic` / `preservesCollation` / `within` / `describe` | Laws an operator declares (`Expr.operator(id, { laws })`), checked where declared, described as JSON. |
| `Operators.withEvidence(table, evidence)` / `describeTable(table)` / `Evidence.Proven` | What is known of a table's implementations' laws, and the table as JSON. |
| `Conformance.laws(op, table)` / `lawsBy(op, runner)` / `operator(op, { implementations })` / `memory(table)` (`foldkit-entity/conformance`) | Test an implementation's laws, in memory or through any runner; run one set of calls through several implementations. |
| `Operators.describe(op)` / `OperatorDescription` / `Query.operators(body)` | An operator's signature as JSON, the Schema it keeps, and the operators a body calls, by name. |
| `valueOfOperand(node, { operators })` | What an operand, a call of literals say, comes to over no row. |
| `Expr.expanded(predicate)` | The predicate with every call of a defined operator written out as what it means, deeply; what an interpreter compiles. |
| `Expr.field(field)` | One field of one Entity, as a scalar. |
| `Expr.input(key, schema)` | A value the query is given when it runs, as a placeholder. |
| `Expr.literal(value)` | A constant. Comparisons coerce one, so this is rarely written. |
| `Order.asc(expr, { nulls? })` / `Order.desc(expr, { nulls? })` | One term of an ordering, over a field or a scalar. Rows without a value go last ascending and first descending unless `nulls` says otherwise; every interpreter is told, since databases disagree when it is unsaid. |
| `Collation.binary` / `.asciiFold` / `.locale(name)` / `.of(collation)` | How a text field orders, as member metadata; see above. |
| `ReadFilter.of(members)` / `.members(metadata)` | Entity metadata: the members a server filters rows by under a rule the client does not run (an authorization rule; `foldkit-guard` attaches it). A client placing rows in a list fetches the list instead when one changes. Annotations add up. |
| `Query.placement(query, input, { operators })` | `Placeable`, or `NotPlaceable` with why: whether a client running `operators` can order as the server does. |
| `Order.chosen(sort, choices)` | The field or call an input's sort names (`{ by, direction }`, or `null` for none), among `choices`. |
| `dependenciesOf(...nodes)` | The distinct fields, inputs, and operations those expressions use. |
| `Query.from(entity)` | Every row of an Entity: the query each step narrows. |
| `Query.where(...predicates)` | Pipe step keeping the rows those hold for; conjoins with what is there. |
| `Query.orderBy(...terms)` | Pipe step reading in that order; appends after existing terms. |
| `Query.orderFor(query, input)` | The fixed terms it orders by for one input, each chosen order resolved, ending on the id. |
| `Query.dependencies(query)` | What the whole query reads, with its fields also split by role: `predicate` (can change which rows match) and `order` (can change where a row sits). |
| `Query.unsupported(query, supported)` | The operations it needs that an interpreter does not run. |
| `Query.show(query)` / `Expr.show(node)` | The query or expression as readable text, for a person and not for an interpreter. |

## Limits

- The identifier is the field named `id`; no other field can be declared as it,
  because Remote keys its store by `id`.
- A Selection has no filtering or ordering, and a page has no total; those
  belong to the interpreter that fetches.
- Relations reach only the entities of one `Entity.relate` call; relating the
  result again adds relations but earlier targets keep pointing at the earlier
  result.
- `target()` returns the entity as `relate` returned it. Metadata attached
  afterwards (`CmsPost` above) is on the new descriptor only, so annotate before
  relating when a target should carry it.
- No registry: nothing checks that two different entities share a name.
