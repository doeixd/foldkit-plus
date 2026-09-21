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

## Example

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

type WriterId = IdOf<typeof Press.Writer> // AuthorId

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

PostRow.schema.Type
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
  present value has to fit: a key may be optional (a partial update) or admit
  `null` (clearing it), which is the input schema's rule to make.
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

## Saying something about a row: `Expr`

An Entity says what a domain has. An `Expr` says something about one row of it,
as a value:

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
than a row that never matches.

**An input is a placeholder, not a value.** A query's body is built once, so
`Expr.input('title', …)` stands for whatever the query is given when it runs —
there is nothing there yet to branch on. An `InputExpr` is an object, so a
`condition ? a : b` over one is always truthy and decides itself once, forever.
A query that depends on what it was passed says so with a comparison over the
placeholder instead of a branch around it.

`dependenciesOf(...)` says which fields and inputs an expression reads and which
operations it uses, so a planner knows what it needs and an interpreter can
refuse a query it cannot run.

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
is ASCII-only, since that is what `lower` does in SQLite without ICU.

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
opened, nothing read.

**Two `where`s conjoin and two `orderBy`s append.** Neither replaces what came
before, so piping a fragment can only ever narrow a query, never silently undo
part of it. An earlier ordering term stays the more significant one, which is
what makes a later `Query.orderBy(Order.asc(id))` a tie-breaker. To drop what a
fragment added, say so: `Query.unfiltered` and `Query.unordered` are the only
ways back.

The list of predicates **is** the conjunction — which is why no `Expr.and`
exists. A query wanting three conditions writes three `where`s. An `and`
operator is only needed for a conjunction nested inside something else, and no
query here has one yet.

A query reads one Entity, so a predicate or ordering term naming a different
one is refused where it is piped: an interpreter would otherwise be asked for a
column of a table it was never told to read. Entities are compared by identity,
so two declared with the same name are two Entities here as everywhere else.

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
| `Entity.input(entity, struct, mapping?)` | Experimental. Which member each key of an operation's input writes. |
| `Relation.nested(relation, input)` | In an input mapping: the key holds the target itself, written through `input`. |
| `Entity.selectFor(input)` | The Selection of the members an input writes: what an edit screen loads. |
| `Entity.valuesFor(input, value)` | The input values that reproduce a loaded value: fields as they are, refs as ids. |
| `Entity.derived({ key: Derived.make(schema) })` | Pipe step adding readable, externally supplied members. |
| `Entity.annotate(metadata)` | Pipe step attaching metadata to the Entity. |
| `Entity.annotateMembers({ key: metadata })` | Pipe step attaching metadata to members by key. |
| `Entity.same(a, b)` | Whether two descriptors are versions of one Entity. |
| `Entity.is(value)` | Whether a value is an Entity descriptor. |
| `Expr.eq(left, right)` | Two values are the same; a field or a plain value on either side is coerced, and a predicate may stand where a boolean is wanted. |
| `Expr.isNull(field)` / `Expr.isNotNull(field)` | Whether a value is absent; one node, with the answer absence gives flipped. |
| `Expr.contains(field, search)` | Whether text contains text. Containing the empty string is everything, but a null contains nothing. |
| `Expr.field(field)` | One field of one Entity, as a scalar. |
| `Expr.input(key, schema)` | A value the query is given when it runs, as a placeholder. |
| `Expr.literal(value)` | A constant. Comparisons coerce one, so this is rarely written. |
| `Order.asc(expr)` / `Order.desc(expr)` | One term of an ordering, over a field or a scalar. |
| `dependenciesOf(...nodes)` | The distinct fields, inputs, and operations those expressions use. |
| `Query.from(entity)` | Every row of an Entity: the query each step narrows. |
| `Query.where(...predicates)` | Pipe step keeping the rows those hold for; conjoins with what is there. |
| `Query.orderBy(...terms)` | Pipe step reading in that order; appends after existing terms. |
| `Query.unfiltered(query)` / `Query.unordered(query)` | The query with its predicates, or its ordering, dropped. |
| `Query.dependencies(query)` | What the whole query reads: every predicate and ordering term. |
| `Query.is(value)` | Whether a value is a `Query`. |

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
