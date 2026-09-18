# foldkit-entity

A domain entity declared once as a typed value: its intrinsic fields, its
relations to other entities, and the derived values consumers may read. Other
packages interpret that declaration; this one only describes.

> **Status:** the declaration layer. Selection, the Remote and Drizzle
> adapters, and forms are planned in
> [entity-DESIGN.md](../../docs/design/entity-DESIGN.md) and do not read an
> Entity yet. `foldkit-remote` still uses its own `Entity`.

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
 ├── relations   navigation edges: one / many of another Entity
 ├── derived     readable values an interpreter supplies
 └── members     all three under one namespace; keys never collide

interpreter ──(foldkit-metadata)──► Entity / member        attaches what it needs
interpreter ◄── reads fields, relations, derived, metadata
```

Each pipe step returns a new frozen descriptor with the **same identity**. Two
descriptors are the same entity when `Entity.same(a, b)`, not when `a === b`.

## Install

```sh
pnpm add effect foldkit-entity
```

## Example

```ts
import { Schema } from 'effect'
import { Derived, Entity, Relation } from 'foldkit-entity'

const Author = Entity.define('Author', Schema.Struct({ id: Schema.String, name: Schema.String }))

const Post = Entity.define(
  'Post',
  Schema.Struct({ id: Schema.String, title: Schema.String, published: Schema.Boolean }),
).pipe(
  Entity.relations({
    author: Relation.one(() => Author),
    editor: Relation.one(() => Author, { optional: true }),
  }),
  Entity.derived({ commentCount: Derived.make(Schema.Number) }),
)

Post.schema // Schema.Struct of id, title, published: relations are not in it
Post.fields.title.schema // Schema.String
Post.relations.author.target() // Author
Post.relations.editor.optional // true
Post.derived.commentCount.schema // Schema.Number
Object.keys(Post.members) // id, title, published, author, editor, commentCount
```

- `Entity.define` generates one `Field` per schema property and creates the
  identity. Calling it twice with the same name makes two different entities.
- `Relation.one` / `Relation.many` state what the owner sees. `Post.author: one`
  and `Author.posts: many` together are the familiar one-to-many; neither side
  names it.
- The target is a thunk, resolved only when you call `target()`, so entities in
  different modules can refer to each other. `target()` throws if the thunk
  yields something that is not an Entity.
- `Derived.make` states a readable value's schema and nothing about how it is
  produced.

Adding a key that is already a member is a type error at the pipe step and an
`Error` at definition time.

## Entities that point at each other

TypeScript cannot infer two constants whose types each contain the other, so
`Post` relating to `Comment` while `Comment` relates to the piped `Post` fails
with `'Post' implicitly has type 'any'`. Close the cycle on the bare definition:

```ts
const PostFields = Entity.define('Post', Schema.Struct({ id: Schema.String }))

const Comment = Entity.define('Comment', Schema.Struct({ id: Schema.String })).pipe(
  Entity.relations({ post: Relation.one(() => PostFields) }),
)

const Post = PostFields.pipe(Entity.relations({ comments: Relation.many(() => Comment) }))

Entity.same(Comment.relations.post.target(), Post) // true
```

`Comment.relations.post.target()` is typed as the bare definition, so the
relations of `Post` are not visible through it at the type level; identity
still matches.

## Attaching metadata

An interpreter declares a [`foldkit-metadata`](../metadata/README.md) key and
attaches entries to the entity or to members. Entity core never reads them.

```ts
import { Metadata } from 'foldkit-metadata'

const Labels = Metadata.key<string>('my-admin/labels', {
  merge: labels => [...new Set(labels)],
  summarize: label => label,
})

const CmsPost = Post.pipe(
  Entity.annotate(Labels.of('Post')),
  Entity.annotateMembers({ title: Labels.of('Title'), author: Labels.of('Byline') }),
)

Labels.get(CmsPost.fields.title.metadata) // ['Title']
Entity.same(CmsPost, Post) // true: the metadata changed, the entity did not
```

Annotating again combines with what is there, using the key's own `merge`.

## API

| Call | Meaning |
| --- | --- |
| `Entity.define(name, struct)` | A new Entity with a Field per property. |
| `Entity.relations({ key: Relation.one(...) or Relation.many(...) })` | Pipe step adding navigation edges. |
| `Entity.derived({ key: Derived.make(schema) })` | Pipe step adding readable, externally supplied members. |
| `Entity.annotate(metadata)` | Pipe step attaching metadata to the Entity. |
| `Entity.annotateMembers({ key: metadata })` | Pipe step attaching metadata to members by key. |
| `Entity.same(a, b)` | Whether two descriptors are versions of one Entity. |
| `Entity.is(value)` | Whether a value is an Entity descriptor. |

## Limits

- IDs are untyped; nothing marks which field is the identifier yet.
- A relation cannot be validated until its target is resolved, so a wrong
  target surfaces on the first `target()` call, not at definition.
- No registry: nothing checks that two different entities share a name.
