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
| `many` Relation | `Entity.page(selection, window)` | a `Page` of that Selection's values |

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

## API

| Call | Meaning |
| --- | --- |
| `Entity.define(name, struct)` | A new Entity with a Field per property. |
| `Entity.relate(entities, { Owner: { key: Relation.one(Target) } })` | The entities with their relations declared; targets resolve to the returned entities. |
| `Entity.select(entity, { key: true or Selection })` | A Selection: what was selected (`members`) and the `schema` of the result. |
| `Entity.page(selection, { first, after } or { last, before })` | In a Selection, a `many` relation read as a `Page`: `items`, `hasNext`, `hasPrevious`. |
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
