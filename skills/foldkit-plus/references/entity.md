# foldkit-entity

A domain entity declared once as a typed value: intrinsic fields, relations to
other entities, and derived members. It **describes only**. It fetches, stores,
validates, and renders nothing, and it never touches a Model or a Message.

**Status: declaration, selection, declared writes and invariants.** `foldkit-remote`
registers Entities and reads Selections as they are (`Remote.make`, `Data.get`; see
[remote.md](remote.md)), and `foldkit-remote-drizzle` binds a related set to
tables with `bind` and lands declared writes with `writer`.

## Ownership

| Fact | Owner |
| --- | --- |
| Which members an entity has, and what kind each is | `foldkit-entity` |
| Whether a value is valid | the Effect `Schema.Struct` in `entity.schema` |
| How a relation is stored, how a derived value is computed | the interpreter (`foldkit-remote-drizzle`'s `bind`) |
| What a write sets and asks of its row (`Write`: `when`, `expect`, `increment`) | `foldkit-entity` declares it as data; the server's writer lands it |
| What every stored row, and every change of one, must hold (`Entity.invariant`) | `foldkit-entity` declares it; the writer enforces it where it commits |
| Who may write | `foldkit-guard`, never an invariant |
| An interpreter's own facts about an entity or member | that interpreter, under its `foldkit-metadata` key |
| What a query says about one row (`Expr`, `Order`) | `foldkit-entity` declares it; an interpreter compiles it |

## Mental model

```text
Entity
 ├── fields      the properties of entity.schema
 ├── relations   one / many of another Entity, as the owner sees it (Entity.relate)
 ├── derived     readable values an interpreter supplies
 └── members     all three; a key is only ever one kind
```

Every pipe step, and `Entity.relate`, returns a new frozen descriptor with the
same identity. Compare with `Entity.same(a, b)`, never `===`.

## Minimal example

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

Blog.Post.schema                           // the Struct: id, title, published only
Blog.Post.fields.title.schema              // Schema.String
Blog.Post.relations.editor.optional        // true
Blog.Post.relations.comments.target()      // Blog.Comment; follow its relations from there
Blog.Post.derived.commentCount.schema      // Schema.Number
```

Use the entities `Entity.relate` returns (`Blog.Post`). The `Post` passed in
still has no relations.

## Common tasks

**Select a view.** A Selection carries the schema of the result; it fetches
nothing. `true` on a relation yields an `EntityRef` (`{ entity, id }`); a
Selection of the target yields that Selection's value. `many` is an array, an
optional `one` is nullable.

```ts
const AuthorOption = Entity.select(Blog.Author, { id: true, name: true })

const PostRow = Entity.select(Blog.Post, {
  title: true,
  commentCount: true,
  author: AuthorOption,
  editor: AuthorOption,
  comments: true,
})

PostRow.schema   // Struct: title, commentCount, author {id,name}, editor {..} | null, comments EntityRef[]
PostRow.members  // what was selected, for an interpreter to walk
type Row = Selected<typeof PostRow> // the value it reads (import type { Selected } from 'foldkit-entity')
```

**Read an operation's input against an Entity** (experimental). The operation
decides what may be written; `Entity.input` says what each key means. A key that
names a field maps itself (only its present value has to fit: optional, `null`
or an `Option` key does too); the rest are mapped explicitly, never by a naming
convention.

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

**Read a long relation a page at a time.** `many` only; the value is
`{ items, hasNext, hasPrevious }`, and the cursor is the interpreter's.

```ts
const CommentBody = Entity.select(Blog.Comment, { body: true })

const PostWithComments = Entity.select(Blog.Post, {
  title: true,
  comments: Entity.page(CommentBody, { first: 10 }),
})
// { title: string, comments: { items: { body: string }[], hasNext: boolean, hasPrevious: boolean } }
```

**Less to write in an input:** `Schema.Struct({ ...Entity.fields(Post, 'id', 'title'), editorId: ... })`
reuses the fields' schemas, and a mapping may name a member by key:
`Entity.input(Post, Input, { editorId: 'editor' })` is `Relation.input(Post.relations.editor)`.

**What an input writes:** `Write.update(input, { id: 'id' })`, `Write.insert(input, { id })` and
`Write.delete(input, { id })` declare a write as data. In an update, every key mapped to a field is set,
a `one` relation key is pointed (bound to a ref in `links`), and an unmapped key is not written; a `many`
or nested key is refused. `Write.writes(write)` is what it may change, `Write.reads(write)` what it
reads from its row, and `Write.bind(write, value, keys?)` the row and its encoded new values, for an
optimistic patch or a server to write. See "Declared writes and invariants" below for what a write may
ask of its row.

**An input that embeds the target** (a post with a new author): map the key with
`Relation.nested`. `selectFor` and `valuesFor` follow it.

```ts
const NewAuthor = Entity.input(Blog.Author, Schema.Struct({ name: Schema.String }))

const CreatePost = Entity.input(
  Blog.Post,
  Schema.Struct({ title: Schema.String, author: NewAuthor.schema }),
  { author: Relation.nested(Blog.Post.relations.author, NewAuthor) },
)
```

**Load and prefill an edit.** Both follow from the reading: `Entity.selectFor(input)`
is the Selection of the members the input writes (relations as refs), and
`Entity.valuesFor(input, value)` turns a value read through it into input values
(a relation as its id or ids). An unmapped key appears in neither.

```ts
const PostForEdit = Entity.selectFor(CreatePost)
// a Selection of `title` and `author`, the members the input writes; `author` as a ref

Entity.valuesFor(CreatePost, { title: 'Hello', author: { entity: 'Author', id: 'a1' } })
// { title: 'Hello', authorId: 'a1' }
```

**Attach an interpreter's metadata** (package authors). Entity core never reads
it; annotating again combines through the key's own `merge`.

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
Labels.get(CmsPost.fields.title.metadata)   // ['Title']
Entity.same(CmsPost, Blog.Post)             // true
```

## Declared writes and invariants

Four questions about a write, four owners. Keep each in its own place:

| Question | Declared with | Refused as |
| --- | --- | --- |
| Is the value well formed? | the input's Schema | a decode failure |
| Who may write this row? | a guard (`foldkit-guard`, [guard.md](guard.md)) | `Forbidden` |
| Does this write apply to the row as it is now? | the write's `when` (and `expect`) | `Unmet` (`Conflict`) |
| What must every stored row, and every change of one, hold, whoever writes it? | `Entity.invariant` | `Invalid` |

```ts
import { Schema } from 'effect'
import { Entity, Expr, Write } from 'foldkit-entity'

const ProductFields = Entity.define(
  'Product',
  Schema.Struct({
    id: Schema.String,
    status: Schema.Literals(['draft', 'published']),
    stock: Schema.Number,
    reserved: Schema.Number,
    revision: Schema.Number,
  }),
)

// A state invariant: reads only `after`, the row a write leaves.
export const reservedWithinStock = Entity.invariant<typeof ProductFields>(
  'reservedWithinStock',
  ({ after }) => Expr.lte(after.reserved, after.stock),
  { message: 'Reserved stock cannot exceed the stock', path: ['reserved'] },
)
// A transition invariant: reads `before` too, so it judges updates only.
export const publishedStaysPublished = Entity.invariant<typeof ProductFields>(
  'publishedStaysPublished',
  ({ before, after }) =>
    Expr.or(Expr.not(Expr.eq(before.status, 'published')), Expr.eq(after.status, 'published')),
  { message: 'A published product does not go back to draft', path: ['status'] },
)
export const Product = ProductFields.pipe(reservedWithinStock, publishedStaysPublished)

// Applies only to a draft, checked where it commits.
const Publish = Write.update(
  Entity.input(Product, Schema.Struct({ id: Schema.String, status: Schema.Literal('published') })),
  { id: 'id', when: () => Expr.eq(Product.fields.status, 'draft') },
)
// Adds to the stored stock where it commits; `expect` makes a retry a conflict, not a second add.
const Restock = Write.update(
  Entity.input(
    Product,
    Schema.Struct({ id: Schema.String, revision: Schema.Number, quantity: Schema.Int }),
    { quantity: Entity.unmapped },
  ),
  { id: 'id', expect: 'revision', increment: { stock: 'quantity' } },
)
```

- **`when`** reads the row before the write (and the input), over its own Entity only; it is compiled
  into the write's own `WHERE`, so it holds of the row the statement changes. Only a write with one has
  `Unmet` in its `Refusal` type.
- **`expect: 'revision'`** lands only on that revision and moves it on: a second write from one read is a
  `Conflict`. **`increment: { stock: 'quantity' }`** adds an unmapped number input where it commits; a
  field declared `Schema.Int` needs a `Schema.Int` amount, or the write is refused where declared, and so
  does an `integer` column under any field, or the Drizzle `writer` refuses it at registration. A
  retry must not add twice: give it `expect`, or serve it through a writer with a ledger (a retry is
  answered from its record, so concurrent increments both land; of an integer only, since adding reals
  does not associate). Remote predicts the sum over the value it holds.
- **`compute: { label: ({ row, input }) => concat(input.prefix, row.name) }`** sets a field from the row
  before the write and the input, never the row after or another Entity; refused for a field another key
  writes or a kind it does not store. `Write.bind` carries it as data (`assignments`, `Computation`s:
  operators by name), compiled by the writer and predicted by Remote with its table. Without `expect` it
  lands only under a ledger, and there only where the writer pins the row it read (a guarded writer with a
  `revision`) or by `op(field, amount)` whose commutativity and associativity are tested over every value
  for each implementation (`Conformance.laws`/`lawsBy`, `withEvidence`).
  `Write.apply(row, bound, { operators })` is the row a write leaves (a null under an amount stays null),
  which guards judge, writers explain misses by, and clients predict.
- **An invariant's lifecycle is what it reads.** `after` only: a state invariant, judged on every create
  and update, and a `CHECK` constraint (`invariantChecks`). `before` too: a transition invariant, judged
  on updates only. `Entity.readsBefore(invariant)` tells which. One reading nothing of `after` is refused
  where it is declared: which rows a write may start from is its `when`.
- **Strictly true.** A null fails one, as SQL's unknown drops a row from a `WHERE`; write
  `Expr.or(Expr.isNull(after.x), …)` to allow it. Text compares only under a declared collation.
- **Judged everywhere it can be.** `Entity.judge(entity, { after, before? })` is the pure reference
  (`Valid`, `Invalid` with the failures, or `Undecided` when a row lacks a field one reads);
  `Entity.check(entity)` the state invariants as a Schema check; a form judges them on submit; the Drizzle
  writer judges them in the statement that writes, and refuses a breaking write as `Refusal.invalid`.
- **Not a rule.** No guard alternative excuses an invariant, and a valid row grants no one anything.
- **A handle, not a string.** `Entity.invariant` returns the pipe step, carrying its `id`. Export it and
  match a refusal with `Refusal.isInvalidBy(refusal, reservedWithinStock)` (`foldkit-remote`) rather than
  spelling the id again. Hoisted, it needs the Entity's type (`Entity.invariant<typeof ProductFields>`);
  inline in `.pipe(…)` it infers it.

How the declaration, its guard, its writer and the client fit together:
[declared writes guide](https://github.com/doeixd/foldkit-plus/blob/main/docs/declared-writes.md).

## Typed ids

Brand the `id` field and it flows: `IdOf<typeof Blog.Post>`, `EntityRef<'Post', PostId>`
from a relation selected with `true`, and `Relation.input` accepting only the
target's id type; `Data.get(selection, id)` in `foldkit-remote` takes it too. Ids are text; a numeric `id` gives refs a plain `string` id. An
Entity with `id: Schema.String` is unchanged.

```ts
const AuthorId = Schema.String.pipe(Schema.brand('AuthorId'))
const PostId = Schema.String.pipe(Schema.brand('PostId'))

const Writer = Entity.define('Author', Schema.Struct({ id: AuthorId, name: Schema.String }))
const Article = Entity.define('Post', Schema.Struct({ id: PostId, title: Schema.String }))
const Press = Entity.relate({ Writer, Article }, { Article: { author: Relation.one(Writer) } })

type WriterId = IdOf<typeof Press.Writer> // AuthorId

const ByLine = Entity.select(Press.Article, { author: true })
// { author: EntityRef<'Author', AuthorId> }

Entity.input(Press.Article, Schema.Struct({ authorId: AuthorId }), {
  authorId: Relation.input(Press.Article.relations.author), // a PostId, or any text, is a type error
})
```

## Saying something about a row: `Expr`

```ts
import { Expr, Order, dependenciesOf } from 'foldkit-entity'

const byTitle = Expr.eq(Blog.Post.fields.title, Expr.input('title', Schema.String))
const published = Expr.eq(Blog.Post.fields.published, true)   // literal coerced
const newest = [Order.desc(Blog.Post.fields.title), Order.asc(Blog.Post.fields.id)]

dependenciesOf(byTitle, ...newest)
// { fields: [{entity:'Post',key:'title',owner}, {entity:'Post',key:'id',owner}], inputs: ['title'], operations: ['eq'] }
// owner is the Entity's identity: two Entities that share a name are two entries
```

Immutable data, frozen as it is built: building one reads nothing, names no
database, runs no query, and nothing can change it after `Query.where` checked it.
An interpreter compiles it (`foldkit-remote-drizzle` to SQL, an in-memory
evaluator to a row predicate). `Expr.eq` takes the field on the left and the
value on the right, typed from it (a comparison takes a field second as
`Expr.field(Post.fields.x)`; in an invariant `before.x` and `after.x` are
expressions already and go second as they are, `Expr.eq(after.authorId,
before.authorId)`); a field compared to the wrong type is an error where it is written.
`Query.where` refuses, at compile time, a predicate over another Entity than the
query's (its type names the Entities its fields belong to). It also refuses predicates that expand past `maxQueryNodes` (1,000) nodes,
counting a shared node (`Expr.eq(n, n)`) on every path, since interpreters read
a predicate as a tree.

`Expr.isNull` / `Expr.isNotNull` (one node, the answer to absence flipped),
`Expr.contains` and `Expr.in(field, list | input)` (SQL's `in`; an empty list
matches nothing) exist too, and the connectives `Expr.and`, `Expr.or` and
`Expr.not`, three-valued as SQL's: `not` of an unknown (a null compared) stays
unknown, so a null matches neither a comparison nor its `not`. A `Query`'s list
of predicates is already the conjunction; `and` is for one inside an `or`.
`Expr.whenGiven(input.status, status => Expr.eq(fields.status, status))` is a
filter that applies only when a nullable input is given. The operator set grows
from real queries, not from what SQL can express. `Expr.lt` / `lte` / `gt` /
`gte(left, right, { collation? })` compare numbers, and text only under
`Collation.binary` or `asciiFold` (declared on the field or passed) and against
a field, since backends order text by different defaults; a date stored as an
ISO string is text, compared under `binary`.

**Naming a question.** `Expr.operator('acme.published', { input: [Schema.Unknown],
output: Schema.Boolean, definedAs: at => Expr.isNotNull(at) })` declares an operator
by what a call means; `published(Story.fields.publishedAt)` is then a predicate
(a boolean output) or a scalar, printed by name, listed in
`Query.dependencies(body).operators`, and run by every interpreter as its expansion
(`Expr.expanded`), so it needs no SQL of its own. `definedAs` may read only its
arguments. `foldkit-cms`'s `Cms.published(entity)` is one, over the `published` role.
Without `definedAs` an operator is **primitive**: each interpreter implements it.
In memory, `Operators.memory(Operators.implement(op, (a, b, { collation }) => …))`
is a table passed to `evaluate(body, input, rows, { operators })`, `Entity.judge`,
`judgeInput` and `Entity.check(entity, { operators })`; `Operators.kernel` is the
default and holds `Text.startsWith(text, prefix, { collation? })`. A strict operator
(the default) never sees a null; `nulls: 'handled'` with
`Operators.implementHandlingNulls` does. `collation: 'operands'` makes a text result
carry its operands' collation; `'required'` refuses text with none. A body calling an
operator a table lacks is refused by name (`Query.unsupported(body, supported,
operators)`, `Expr.unsupported(nodes, { operations, operators })`); an invariant is
then `Undecided` with `operators`, which a form passes.

**Laws.** `Expr.operator(id, { …, laws: [Law.associative, Law.identity('')] })`
declares equations every implementation keeps (`commutative`, `idempotent`,
`absorbing`, `inverse`, `distributes`, `monotonic`, `preservesCollation`;
`Law.within(law, schema)` narrows one), checked where declared; they rewrite
nothing. `Conformance.laws(op, table)` (`foldkit-entity/conformance`) samples
each, seeded, and answers `Holds` with `Tested` evidence or a `Counterexample`;
`Operators.withEvidence(table, evidence)` records it, only for the implementation it was tested on (`Operators.testedOn`; an SQL table takes only `Conformance.lawsBy`'s records, `Operators.testedByRunner`), and `describeTable(table)`
lists each operator as `describe` does (its `name`, …), with its evidence. `Conformance.operator(op, {
implementations })` runs generated calls through several runners
(`Conformance.memory(table)`, an SQL one over `compileCall`) and reports where they
disagree. `Operators.describe(op)` is an operator's signature as JSON (`OperatorDescription`,
a Schema: name, version, each argument and the result as a JSON Schema of the stored side,
null and collation rules, laws, `defined`; never a body); `Query.operators(body)` names the
operators a body calls. A version is part of the name: a table holding `acme.slug` refuses
a call to `acme.slug@2`, naming both, from the versions every `OperatorTable` lists
(`versions(id)`, beside `has`) and `missingName(operator, table)`; a SQL table
(`DrizzleOperators`) lists them too.

**Asking about an input without branching on it.** An input is a placeholder, so
a query cannot pick a shape from a value. It does not need to:

```ts
Expr.eq(Expr.isNotNull(Entry.fields.archivedAt), input.archived)  // archived ? … : …
Expr.contains(Entry.fields.label, input.search)                   // search === '' ? … : …
```

`contains` is **case-insensitive** (ASCII folding) — stated rather than left to
the backend, since SQLite's `like` ignores case and Postgres's does not. Over a
**nullable** column it is not the same as no filter: a null contains nothing,
not even the empty string, so its rows drop out.

### Which rows: `Query`

```ts
const onlyPublished = Query.where(published)          // a reusable fragment
const newest = Query.orderBy(Order.desc(Blog.Post.fields.title))

const recent = Query.from(Blog.Post).pipe(onlyPublished, newest)
Query.dependencies(recent)     // every field it reads, also split into `predicate` and `order`
```

- **A sort the reader picks belongs in the body:** `Query.orderBy(Order.chosen(input.sort,
  { title: Post.fields.title }))`, where `input.sort` is `{ by, direction } | null`
  (Crud's `Sort.make(...).Schema`). Every name needs a field or a call, or it does not compile;
  `null` chooses none. `Query.orderFor(query, input)` resolves it for one input and
  ends every order on the id, so ties break the same way on every interpreter.
- **A server's own read rule is declared, not run:** `Entity.annotate(ReadFilter.of(['ownerId']))`
  names what it filters rows by (`foldkit-guard`'s `attach` does it); Remote fetches a list
  rather than placing a row whose such member changed.
- **Text orders by a declared collation, or by the server:** `Entity.annotateMembers({ name:
  Collation.of(Collation.asciiFold) })`; `binary` (code point; ids default to it), `asciiFold`
  (ASCII folded), `locale(name)` (server only). `Query.placement(query, input, { operators })`
  is `Placeable` when every term is a number, boolean, portably collated text, or a call
  whose primitive operators the client's table runs.
- **A call orders when its result does:** `Order.asc(distance(Post.fields.rank, input.target))`
  takes a number, or text under `binary`/`asciiFold` (the call's, by `collation: 'operands'`,
  or the term's own); anything else is refused where written, `Order.chosen` alternatives
  included. `evaluate` runs it per row by its table; `compareRows(terms, a, b, query, { input,
  operators })` compares two rows so.
- **Nulls are placed by the term:** last ascending, first descending, or
  `Order.asc(field, { nulls: 'first' })`. Every interpreter is told (Drizzle
  compiles `NULLS FIRST/LAST`), so SQLite and Postgres agree and page alike.
- **Two `where`s conjoin; two `orderBy`s append.** Neither replaces, so piping a
  fragment only ever narrows a query. There is no reset combinator: nothing has
  needed one.
- The list of predicates **is** the conjunction, which is why there is no
  `Expr.and`: three conditions are three `where`s. An `and` is only needed for a
  conjunction nested inside something else.
- A `Query` says which rows. Which fields is a Selection; how many, whether
  absence is an error, and whether to watch for changes belong to the consumer.
- A predicate or ordering term over a **different Entity** than `Query.from` is
  refused where it is piped (by identity, so same-named Entities still differ).
- `Query.unsupported(query, supported)` names the operations an interpreter does
  not run, so it can **refuse** rather than skip one — skipping answers a
  different question and still passes every case it does support. Both shipped
  interpreters declare a `supported` list and check it: `foldkit-remote-drizzle`
  at registration, and `evaluate` on every run.
- **`evaluate(body, input, rows)` is here**, not in a server package: it is the
  IR's *reference semantics* — what §6.0.1 means over rows already in hand — and
  it may depend on the IR and nothing else. `foldkit-remote-server` re-exports
  it. The conformance suite that checks an interpreter against it is
  `foldkit-entity/conformance`, a subpath so the fixtures stay out of the main
  bundle: `cases` each name the ids a body matches, and `refusals` are bodies
  every interpreter must refuse rather than answer (text holding NUL).
  `evaluateEach(body, input, rows)` judges each row alone: a row holding such
  text goes in `refused` and the others are answered (Remote's `matching` skips
  it); an input holding one still refuses the run.
- `Expr.contains` searches for a **value or an input**, never a field or call (SQL
  would have to escape one as a pattern), and takes a **text or nullable-text** operand only, checked by the
  type parameter: over a number it would compile to `lower(rank) like …`, which
  SQLite coerces and Postgres rejects. The check is a constraint rather than an
  `Invalid` brand intersected onto the parameter — a conditional over the type
  being inferred falls back to the constraint and passes everything, which is
  how the original version failed open.
- `Query.show(query)` and `Expr.show(node)` render a body as readable text
  (`FROM Post` / `WHERE Post.slug = $slug` / `ORDER BY ...`), for a person and
  never for an interpreter: an input is `$slug` rather than a bound parameter,
  `contains` is named rather than rendered as somebody's `like`, and no
  dialect's escaping or collation is implied.
- **An application using Remote imports `Query` from `foldkit-remote`**, not
  from here: that one is this namespace plus `define`, `make` and the window
  steps. `Query` from `foldkit-entity` has `from`/`where`/`orderBy` and no
  `define`, which is only what a package composing queries without Remote needs.

## Gotchas

- Relations are **not** in `entity.schema`. Do not put `author` in the Struct.
- Relations are declared once, for all entities, in `Entity.relate`; there is no
  per-entity relations step, because entities that point at each other cannot
  each be typed in terms of the other.
- A key that is already a member, an owner or a target missing from the
  `relate` call: each is a type error and throws at definition time.
- `Entity.define` twice with one name makes two entities.
- `target()` returns the entity as `relate` returned it; metadata annotated
  afterwards is not on it. Annotate before relating when a target should carry it.
- Nested selections are Selection values (`Entity.select(...)`), never inline
  objects, and never `[Selection]` for a `many` relation.
- There is no "one-to-many" vocabulary: `Relation.one` on one side and
  `Relation.many` on the other is that relationship.
- The identifier is the field named `id`, text; brand it to type refs and inputs (Typed ids).
- An invariant is not a check in `update`: one only `update` enforces is a UI rule, which
  a second device, an agent, a handler or raw SQL passes. Declare it on the Entity, and
  migrate `invariantChecks(binding)` so the database holds it too.
- Inside `Entity.invariant`, read the row after through `after`. A bare `Product.fields.stock`
  reads the row before, and one reading nothing of `after` is refused where it is declared.
- An increment with neither `expect` nor a ledger recording its operation (a ledgered
  writer, and the operation id `Data.mutate` sends) is refused by the server: its retry
  would add twice.
- `Entity.judge(entity, { after })` without `before` skips transition invariants: pass the
  row before for an update.
- A schema's label and help text are `Words.of(schema)` (`title`, `description`, each an
  `Option`). Never `Schema.resolveAnnotations(schema)?.title`: under Effect 4 a checked
  schema resolves to its last check's annotations, so a title given before a check is lost.
- An `Expr.input(...)` is a **placeholder**, not the value. A query body is
  built once, so `input.archived ? a : b` over one is always truthy and decides
  itself forever. Ask with a comparison over the placeholder, never a branch
  around it.

## See also

- https://github.com/doeixd/foldkit-plus/blob/main/packages/entity/README.md
- https://github.com/doeixd/foldkit-plus/blob/main/docs/operators.md (operators end to end)
- https://github.com/doeixd/foldkit-plus/tree/main/examples/entity
- https://github.com/doeixd/foldkit-plus/blob/main/packages/metadata/README.md
- https://github.com/doeixd/foldkit-plus/blob/main/docs/design/entity-DESIGN.md
