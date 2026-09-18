# foldkit-entity

A domain entity declared once as a typed value: its intrinsic fields, its
relations to other entities, and the derived values consumers may read. Other
packages interpret that declaration; this one only describes.

> **Status:** declaration and selection. `foldkit-remote` reads both through
> [`Entity.from` and `Selection.from`](../remote/README.md#entities-declared-with-foldkit-entity).
> `foldkit-remote-drizzle` binds a related set to tables with
> [`bind`](../remote-drizzle/README.md#binding-a-foldkit-entity-domain). Forms
> and admin are planned in [entity-DESIGN.md](../../docs/design/entity-DESIGN.md).

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

A `many` relation yields an array, and an optional `one` is nullable. A
Selection is an ordinary value, so `AuthorOption` above is declared once and
reused. Nesting is always explicit, which is what keeps a cycle finite.

An unknown member, a nested Selection on a field, and a Selection of the wrong
Entity are type errors, and `Entity.select` throws for untyped callers.

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
| `Entity.derived({ key: Derived.make(schema) })` | Pipe step adding readable, externally supplied members. |
| `Entity.annotate(metadata)` | Pipe step attaching metadata to the Entity. |
| `Entity.annotateMembers({ key: metadata })` | Pipe step attaching metadata to members by key. |
| `Entity.same(a, b)` | Whether two descriptors are versions of one Entity. |
| `Entity.is(value)` | Whether a value is an Entity descriptor. |

## Limits

- IDs are untyped; nothing marks which field is the identifier yet, and an
  `EntityRef` id is a `string`.
- A Selection has no pagination, filtering, or ordering; those belong to the
  interpreter that fetches.
- Relations reach only the entities of one `Entity.relate` call; relating the
  result again adds relations but earlier targets keep pointing at the earlier
  result.
- `target()` returns the entity as `relate` returned it. Metadata attached
  afterwards (`CmsPost` above) is on the new descriptor only, so annotate before
  relating when a target should carry it.
- No registry: nothing checks that two different entities share a name.
