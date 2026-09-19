import { Schema } from 'effect'
import { expectTypeOf } from 'vitest'
import { Entity, Relation, type EntityRef } from '../src/index.js'
import { Blog } from './blogFixture.js'

const { Post, Author } = Blog

// Every key names a field it fits: no mapping to write.
const Rename = Entity.input(Post, Schema.Struct({ id: Schema.String, title: Schema.String }))
expectTypeOf(Rename.members.title).toEqualTypeOf<typeof Post.fields.title>()

// A partial update: optional keys still map themselves.
Entity.input(Post, Schema.Struct({ id: Schema.String, title: Schema.optional(Schema.String) }))

// A relation arrives as ids, under whatever key the operation chose.
const Create = Entity.input(
  Post,
  Schema.Struct({
    title: Schema.String,
    authorId: Schema.String,
    editor: Schema.NullOr(Schema.String),
    commentIds: Schema.Array(Schema.String),
  }),
  {
    authorId: Relation.input(Post.relations.author),
    editor: Relation.input(Post.relations.editor),
    commentIds: Relation.input(Post.relations.comments),
  },
)
expectTypeOf(Create.members.authorId.relation).toEqualTypeOf<typeof Post.relations.author>()
expectTypeOf(Create.members.title._tag).toEqualTypeOf<'Field'>()

// A key under another name, and a key about the operation itself.
const Publish = Entity.input(
  Post,
  Schema.Struct({ id: Schema.String, live: Schema.Boolean, reason: Schema.String }),
  { live: Post.fields.published, reason: Entity.unmapped },
)
expectTypeOf(Publish.members.live.key).toEqualTypeOf<'published'>()
expectTypeOf(Publish.members.reason._tag).toEqualTypeOf<'Unmapped'>()

const input = Schema.Struct({ id: Schema.String, authorId: Schema.String })
// @ts-expect-error authorId names no field, so it needs a mapping
Entity.input(Post, input)
// @ts-expect-error authorId names no field, so it needs a mapping
Entity.input(Post, input, {})
// @ts-expect-error a many relation takes a list of ids, not one
Entity.input(Post, input, { authorId: Relation.input(Post.relations.comments) })
// @ts-expect-error the field's value is a boolean, the input's a string
Entity.input(Post, input, { authorId: Post.fields.published })
// @ts-expect-error a derived member is read-only
Entity.input(Post, input, { authorId: Post.derived.commentCount })
Entity.input(Post, input, {
  authorId: Relation.input(Post.relations.author),
  // @ts-expect-error "slug" is not a key of the input
  slug: Entity.unmapped,
})
// `null` clears a key, whether or not the member admits it: that is the input schema's rule.
Entity.input(
  Post,
  Schema.Struct({ title: Schema.NullOr(Schema.String), authorId: Schema.NullOr(Schema.String) }),
  { authorId: Relation.input(Post.relations.author) },
)
// @ts-expect-error `published` names a field, but a string does not fit it
Entity.input(Post, Schema.Struct({ published: Schema.String }))

// @ts-expect-error `name` is a field of Author, not of Post
Entity.input(Post, input, { authorId: Author.fields.name })
Entity.input(Post, Schema.Struct({ ids: Schema.Array(Schema.String) }), {
  // @ts-expect-error `posts` is a relation of Author, not of Post
  ids: Relation.input(Author.relations.posts),
})

// What `Create` needs loaded, and what a loaded value gives back.
const Needed = Entity.selectFor(Create)
expectTypeOf<typeof Needed.schema.Type>().toEqualTypeOf<{
  readonly title: string
  readonly author: EntityRef<'Author'>
  readonly editor: EntityRef<'Author'> | null
  readonly comments: ReadonlyArray<EntityRef<'Comment'>>
}>()
expectTypeOf(Entity.valuesFor(Create, {})).toEqualTypeOf<
  Partial<{
    readonly title: string
    readonly authorId: string
    readonly editor: string | null
    readonly commentIds: ReadonlyArray<string>
  }>
>()
// `Publish` writes `published` under the key `live`; `reason` writes nothing.
expectTypeOf(Entity.selectFor(Publish).members).toEqualTypeOf<{
  readonly id: true
  readonly published: true
}>()

{
  const NewAuthor = Entity.input(Blog.Author, Schema.Struct({ name: Schema.String }))
  const NewComment = Entity.input(Blog.Comment, Schema.Struct({ body: Schema.String }))
  const Create = Entity.input(
    Blog.Post,
    Schema.Struct({ author: NewAuthor.schema, comments: Schema.Array(NewComment.schema) }),
    {
      author: Relation.nested(Blog.Post.relations.author, NewAuthor),
      comments: Relation.nested(Blog.Post.relations.comments, NewComment),
    },
  )
  const loaded = Entity.selectFor(Create)
  expectTypeOf<typeof loaded.schema.Type>().toEqualTypeOf<{
    readonly author: { readonly name: string }
    readonly comments: ReadonlyArray<{ readonly body: string }>
  }>()

  Entity.input(Blog.Post, Schema.Struct({ author: NewAuthor.schema }), {
    // @ts-expect-error an input of Comment nested in a relation to Author
    author: Relation.nested(Blog.Post.relations.author, NewComment),
  })
  Entity.input(Blog.Post, Schema.Struct({ comments: NewComment.schema }), {
    // @ts-expect-error a many relation takes a list of the nested input's values
    comments: Relation.nested(Blog.Post.relations.comments, NewComment),
  })
}
