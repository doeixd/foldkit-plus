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

## See also

- https://github.com/doeixd/foldkit-plus/blob/main/packages/entity/README.md
- https://github.com/doeixd/foldkit-plus/tree/main/examples/entity
- https://github.com/doeixd/foldkit-plus/blob/main/packages/metadata/README.md
- https://github.com/doeixd/foldkit-plus/blob/main/docs/design/entity-DESIGN.md
