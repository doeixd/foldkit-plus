import { Schema } from 'effect'
import { Metadata } from 'foldkit-metadata'
import { expectTypeOf } from 'vitest'
import { Derived, Entity, Relation } from '../src/index.js'

const Author = Entity.define('Author', Schema.Struct({ id: Schema.String, name: Schema.String }))

const Comment = Entity.define('Comment', Schema.Struct({ id: Schema.String }))
const PostFields = Entity.define(
  'Post',
  Schema.Struct({ id: Schema.String, title: Schema.String, published: Schema.Boolean }),
).pipe(Entity.derived({ commentCount: Derived.make(Schema.Number) }))

const Blog = Entity.relate(
  { Author, Post: PostFields, Comment },
  {
    Post: {
      author: Relation.one(Author),
      editor: Relation.one(Author, { optional: true }),
      comments: Relation.many(Comment),
    },
    Comment: { post: Relation.one(PostFields) },
  },
)
const { Post } = Blog

expectTypeOf(Post.name).toEqualTypeOf<'Post'>()
expectTypeOf<keyof typeof Post.fields>().toEqualTypeOf<'id' | 'title' | 'published'>()
expectTypeOf(Post.fields.title.key).toEqualTypeOf<'title'>()
expectTypeOf(Post.fields.published.schema).toEqualTypeOf<Schema.Boolean>()
expectTypeOf<typeof Post.schema.Type>().toEqualTypeOf<{
  readonly id: string
  readonly title: string
  readonly published: boolean
}>()

expectTypeOf(Post.relations.author.target()).toEqualTypeOf<typeof Blog.Author>()
expectTypeOf<keyof typeof Blog.Author.relations>().toEqualTypeOf<never>()
expectTypeOf(Post.relations.author.cardinality).toEqualTypeOf<'one'>()
expectTypeOf(Post.relations.author.optional).toEqualTypeOf<false>()
expectTypeOf(Post.relations.editor.optional).toEqualTypeOf<true>()
expectTypeOf(Post.relations.comments.cardinality).toEqualTypeOf<'many'>()
// Around the cycle and back, with every relation still visible.
const roundTrip = Post.relations.comments.target().relations.post.target()
expectTypeOf(roundTrip.name).toEqualTypeOf<'Post'>()
expectTypeOf(roundTrip.relations.comments.cardinality).toEqualTypeOf<'many'>()
expectTypeOf(roundTrip.derived.commentCount.schema).toEqualTypeOf<Schema.Number>()
expectTypeOf(Post.derived.commentCount.schema).toEqualTypeOf<Schema.Number>()
expectTypeOf<keyof typeof Post.members>().toEqualTypeOf<
  'id' | 'title' | 'published' | 'author' | 'editor' | 'comments' | 'commentCount'
>()

const Tags = Metadata.key<string>('tags', { merge: values => values, summarize: tag => tag })
const Annotated = Post.pipe(
  Entity.annotate(Tags.of('cms')),
  Entity.annotateMembers({ title: Tags.of('heading'), author: Tags.of('byline') }),
)
expectTypeOf(Annotated).toEqualTypeOf<typeof Post>()

Entity.relate(
  { Author, Post: PostFields },
  // @ts-expect-error "title" is already a field of Post
  { Post: { title: Relation.one(Author) } },
)
Entity.relate(
  { Author, Post: PostFields },
  // @ts-expect-error "commentCount" is already a derived member of Post
  { Post: { commentCount: Relation.one(Author) } },
)
// @ts-expect-error Comment is not one of the entities being related
Entity.relate({ Author }, { Comment: { author: Relation.one(Author) } })
// @ts-expect-error "name" is already a field
Author.pipe(Entity.derived({ name: Derived.make(Schema.String) }))
// @ts-expect-error a relation targets an Entity
Relation.one(Schema.String)
// @ts-expect-error "subtitle" is not a member
Post.pipe(Entity.annotateMembers({ subtitle: Tags.of('x') }))
// @ts-expect-error an entry must be the key's declared type
Post.pipe(Entity.annotate(Tags.of(1)))
