import { Schema } from 'effect'
import { Metadata } from 'foldkit-metadata'
import { expectTypeOf } from 'vitest'
import { Derived, Entity, Relation } from '../src/index.js'

const Author = Entity.define('Author', Schema.Struct({ id: Schema.String, name: Schema.String }))

// Post and Comment point at each other. A thunk that returned the piped `Post`
// would make each type depend on itself, so the cycle closes on a bare definition.
const PostFields = Entity.define(
  'Post',
  Schema.Struct({ id: Schema.String, title: Schema.String, published: Schema.Boolean }),
)

const Comment = Entity.define('Comment', Schema.Struct({ id: Schema.String })).pipe(
  Entity.relations({ post: Relation.one(() => PostFields) }),
)

const Post = PostFields.pipe(
  Entity.relations({
    author: Relation.one(() => Author),
    editor: Relation.one(() => Author, { optional: true }),
    comments: Relation.many(() => Comment),
  }),
  Entity.derived({ commentCount: Derived.make(Schema.Number) }),
)

expectTypeOf(Post.name).toEqualTypeOf<'Post'>()
expectTypeOf<keyof typeof Post.fields>().toEqualTypeOf<'id' | 'title' | 'published'>()
expectTypeOf(Post.fields.title.key).toEqualTypeOf<'title'>()
expectTypeOf(Post.fields.published.schema).toEqualTypeOf<Schema.Boolean>()
expectTypeOf<typeof Post.schema.Type>().toEqualTypeOf<{
  readonly id: string
  readonly title: string
  readonly published: boolean
}>()

expectTypeOf(Post.relations.author.target()).toEqualTypeOf<typeof Author>()
expectTypeOf(Post.relations.author.cardinality).toEqualTypeOf<'one'>()
expectTypeOf(Post.relations.author.optional).toEqualTypeOf<false>()
expectTypeOf(Post.relations.editor.optional).toEqualTypeOf<true>()
expectTypeOf(Post.relations.comments.cardinality).toEqualTypeOf<'many'>()
expectTypeOf(Post.relations.comments.target().relations.post.target().name).toEqualTypeOf<'Post'>()
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

// @ts-expect-error "title" is already a field
Post.pipe(Entity.relations({ title: Relation.one(() => Author) }))
// @ts-expect-error "author" is already a relation
Post.pipe(Entity.derived({ author: Derived.make(Schema.String) }))
// @ts-expect-error a relation targets an Entity
Relation.one(() => Schema.String)
// @ts-expect-error "subtitle" is not a member
Post.pipe(Entity.annotateMembers({ subtitle: Tags.of('x') }))
// @ts-expect-error an entry must be the key's declared type
Post.pipe(Entity.annotate(Tags.of(1)))
