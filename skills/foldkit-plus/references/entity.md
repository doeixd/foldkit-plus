# foldkit-entity

A domain entity declared once as a typed value: intrinsic fields, relations to
other entities, and derived members. It **describes only**. It fetches, stores,
validates, and renders nothing, and it never touches a Model or a Message.

**Status: declaration layer.** No other package reads an Entity yet.
`foldkit-remote` still has its own `Entity`; do not pass one to the other.

## Ownership

| Fact | Owner |
| --- | --- |
| Which members an entity has, and what kind each is | `foldkit-entity` |
| Whether a value is valid | the Effect `Schema.Struct` in `entity.schema` |
| How a relation is stored, how a derived value is computed | the interpreter (none shipped yet) |
| Create / update / delete | not implied; an Entity has no operations |
| An interpreter's own facts about an entity or member | that interpreter, under its `foldkit-metadata` key |

## Mental model

```text
Entity
 ├── fields      the properties of entity.schema
 ├── relations   one / many of another Entity, as the owner sees it
 ├── derived     readable values an interpreter supplies
 └── members     all three; a key is only ever one kind
```

Every pipe step returns a new frozen descriptor with the same identity. Compare
with `Entity.same(a, b)`, never `===`.

## Minimal example

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

Post.schema                      // the Struct: id, title, published only
Post.fields.title.schema         // Schema.String
Post.relations.author.target()   // Author, resolved on call
Post.relations.editor.optional   // true
Post.derived.commentCount.schema // Schema.Number
```

## Common tasks

**Attach an interpreter's metadata** (package authors). Entity core never reads
it; annotating again combines through the key's own `merge`.

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
Labels.get(CmsPost.fields.title.metadata)   // ['Title']
Entity.same(CmsPost, Post)                  // true
```

**Two entities that point at each other.** Close the cycle on the bare
definition, or TypeScript reports `'Post' implicitly has type 'any'`:

```ts
const PostFields = Entity.define('Post', Schema.Struct({ id: Schema.String }))
const Comment = Entity.define('Comment', Schema.Struct({ id: Schema.String })).pipe(
  Entity.relations({ post: Relation.one(() => PostFields) }),
)
const Post = PostFields.pipe(Entity.relations({ comments: Relation.many(() => Comment) }))
```

## Gotchas

- Relations are **not** in `entity.schema`. Do not put `author` in the Struct.
- A key that is already a member is a type error at the pipe step and throws at
  definition time. `Entity.define` twice with one name makes two entities.
- A wrong relation target surfaces on the first `target()` call, not earlier.
- There is no "one-to-many" vocabulary: `Relation.one` on one side and
  `Relation.many` on the other is that relationship.
- IDs are untyped and no field is marked as the identifier yet.

## See also

- https://github.com/doeixd/foldkit-plus/blob/main/packages/entity/README.md
- https://github.com/doeixd/foldkit-plus/blob/main/packages/metadata/README.md
- https://github.com/doeixd/foldkit-plus/blob/main/docs/design/entity-DESIGN.md
