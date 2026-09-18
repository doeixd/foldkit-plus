// The README's snippets, compiled. Keep the two in step.
import { Schema } from 'effect'
import { Metadata } from 'foldkit-metadata'
import { expectTypeOf } from 'vitest'
import { Derived, Entity, Relation } from '../src/index.js'

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

expectTypeOf(Post.fields.title.schema).toEqualTypeOf<Schema.String>()
expectTypeOf(Post.relations.author.target()).toEqualTypeOf<typeof Author>()
expectTypeOf(Post.relations.editor.optional).toEqualTypeOf<true>()
expectTypeOf(Post.derived.commentCount.schema).toEqualTypeOf<Schema.Number>()

const PostFields = Entity.define('Post', Schema.Struct({ id: Schema.String }))
const Comment = Entity.define('Comment', Schema.Struct({ id: Schema.String })).pipe(
  Entity.relations({ post: Relation.one(() => PostFields) }),
)
const CyclicPost = PostFields.pipe(Entity.relations({ comments: Relation.many(() => Comment) }))
expectTypeOf(Entity.same(Comment.relations.post.target(), CyclicPost)).toEqualTypeOf<boolean>()

const Labels = Metadata.key<string>('my-admin/labels', {
  merge: labels => [...new Set(labels)],
  summarize: label => label,
})
const CmsPost = Post.pipe(
  Entity.annotate(Labels.of('Post')),
  Entity.annotateMembers({ title: Labels.of('Title'), author: Labels.of('Byline') }),
)
expectTypeOf(Labels.get(CmsPost.fields.title.metadata)).toEqualTypeOf<ReadonlyArray<string>>()
