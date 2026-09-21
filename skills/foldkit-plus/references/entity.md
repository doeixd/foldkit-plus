# foldkit-entity

A domain entity declared once as a typed value: intrinsic fields, relations to
other entities, and derived members. It **describes only**. It fetches, stores,
validates, and renders nothing, and it never touches a Model or a Message.

**Status: declaration and selection.** `foldkit-remote` registers Entities and
reads Selections as they are (`Remote.make`, `Data.get`; see
[remote.md](remote.md)), and `foldkit-remote-drizzle` binds a related set to
tables with `bind`.

## Ownership

| Fact | Owner |
| --- | --- |
| Which members an entity has, and what kind each is | `foldkit-entity` |
| Whether a value is valid | the Effect `Schema.Struct` in `entity.schema` |
| How a relation is stored, how a derived value is computed | the interpreter (none shipped yet) |
| Create / update / delete | not implied; an Entity has no operations |
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
```

**Read an operation's input against an Entity** (experimental). The operation
decides what may be written; `Entity.input` says what each key means. A key that
names a field maps itself; the rest are mapped explicitly, never by a naming
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
// { fields: [{entity:'Post',key:'title'}, {entity:'Post',key:'id'}], inputs: ['title'], operations: ['eq'] }
```

Immutable data: building one reads nothing, names no database, runs no query.
An interpreter compiles it (`foldkit-remote-drizzle` to SQL, an in-memory
evaluator to a row predicate). `Expr.eq` coerces a field or a plain value on
either side; a field compared to the wrong type is an error where it is written.

`Expr.isNull` / `Expr.isNotNull` (one node, the answer to absence flipped) and
`Expr.contains` exist too. The operator set grows from real queries, not from
what SQL can express — there is still no `and` (a `Query` holds a list of
predicates, which *is* the conjunction) and no `or`.

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
Query.dependencies(recent)     // every predicate and ordering term at once
```

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
  at registration, `foldkit-remote-server` on `evaluate`.
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
- IDs are untyped and no field is marked as the identifier yet.
- An `Expr.input(...)` is a **placeholder**, not the value. A query body is
  built once, so `input.archived ? a : b` over one is always truthy and decides
  itself forever. Ask with a comparison over the placeholder, never a branch
  around it.

## See also

- https://github.com/doeixd/foldkit-plus/blob/main/packages/entity/README.md
- https://github.com/doeixd/foldkit-plus/tree/main/examples/entity
- https://github.com/doeixd/foldkit-plus/blob/main/packages/metadata/README.md
- https://github.com/doeixd/foldkit-plus/blob/main/docs/design/entity-DESIGN.md
