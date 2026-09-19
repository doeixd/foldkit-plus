import { Schema } from 'effect'
import { expectTypeOf } from 'vitest'
import { Entity, Relation, type EntityRef, type IdOf } from '../src/index.js'

const AuthorId = Schema.String.pipe(Schema.brand('AuthorId'))
type AuthorId = typeof AuthorId.Type
const PostId = Schema.String.pipe(Schema.brand('PostId'))
type PostId = typeof PostId.Type

const Author = Entity.define('Author', Schema.Struct({ id: AuthorId, name: Schema.String }))
const Post = Entity.define('Post', Schema.Struct({ id: PostId, title: Schema.String }))
// Keyed by a number: its refs still travel as text.
const Tag = Entity.define('Tag', Schema.Struct({ id: Schema.Number, name: Schema.String }))
const Blog = Entity.relate(
  { Author, Post, Tag },
  {
    Post: {
      author: Relation.one(Author),
      editor: Relation.one(Author, { optional: true }),
      tags: Relation.many(Tag),
    },
    Author: { posts: Relation.many(Post) },
  },
)

expectTypeOf<IdOf<typeof Blog.Author>>().toEqualTypeOf<AuthorId>()
expectTypeOf<IdOf<typeof Blog.Tag>>().toEqualTypeOf<string>()

// A ref carries the id type of what it points at.
const Refs = Entity.select(Blog.Post, { author: true, editor: true, tags: true })
expectTypeOf<typeof Refs.schema.Type>().toEqualTypeOf<{
  readonly author: EntityRef<'Author', AuthorId>
  readonly editor: EntityRef<'Author', AuthorId> | null
  readonly tags: ReadonlyArray<EntityRef<'Tag'>>
}>()

// A relation's input is the target's id, not any text.
Entity.input(Blog.Post, Schema.Struct({ authorId: AuthorId, editorId: Schema.NullOr(AuthorId) }), {
  authorId: Relation.input(Blog.Post.relations.author),
  editorId: Relation.input(Blog.Post.relations.editor),
})
Entity.input(Blog.Post, Schema.Struct({ authorId: Schema.String }), {
  // @ts-expect-error any text is not an AuthorId
  authorId: Relation.input(Blog.Post.relations.author),
})
Entity.input(Blog.Post, Schema.Struct({ authorId: PostId }), {
  // @ts-expect-error a PostId is not an AuthorId
  authorId: Relation.input(Blog.Post.relations.author),
})
Entity.input(Blog.Author, Schema.Struct({ postIds: Schema.Array(PostId) }), {
  postIds: Relation.input(Blog.Author.relations.posts),
})
// An Entity keyed by a number takes its ids as text.
Entity.input(Blog.Post, Schema.Struct({ tagIds: Schema.Array(Schema.String) }), {
  tagIds: Relation.input(Blog.Post.relations.tags),
})
