// The README's snippets, compiled. Keep the two in step.
import { Schema } from 'effect'
import { Metadata } from 'foldkit-metadata'
import { expectTypeOf } from 'vitest'
import { Derived, Entity, Relation } from '../src/index.js'

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

expectTypeOf(Blog.Post.fields.title.schema).toEqualTypeOf<Schema.String>()
expectTypeOf(Blog.Post.relations.editor.optional).toEqualTypeOf<true>()
expectTypeOf(Blog.Post.derived.commentCount.schema).toEqualTypeOf<Schema.Number>()
expectTypeOf(Blog.Post.relations.comments.target()).toEqualTypeOf<typeof Blog.Comment>()
expectTypeOf(Blog.Post.relations.comments.target().relations.post.target()).toEqualTypeOf<
  typeof Blog.Post
>()

const Labels = Metadata.key<string>('my-admin/labels', {
  merge: labels => [...new Set(labels)],
  summarize: label => label,
})
const CmsPost = Blog.Post.pipe(
  Entity.annotate(Labels.of('Post')),
  Entity.annotateMembers({ title: Labels.of('Title'), author: Labels.of('Byline') }),
)
expectTypeOf(Labels.get(CmsPost.fields.title.metadata)).toEqualTypeOf<ReadonlyArray<string>>()
expectTypeOf(Entity.same(CmsPost, Blog.Post)).toEqualTypeOf<boolean>()
