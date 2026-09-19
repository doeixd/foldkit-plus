// The README's snippets, compiled. Keep the two in step.
import { Schema } from 'effect'
import { Metadata } from 'foldkit-metadata'
import { expectTypeOf } from 'vitest'
import { Derived, Entity, Relation, type EntityRef, type IdOf } from '../src/index.js'

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

const AuthorOption = Entity.select(Blog.Author, { id: true, name: true })

const PostRow = Entity.select(Blog.Post, {
  title: true,
  commentCount: true,
  author: AuthorOption,
  editor: AuthorOption,
  comments: true,
})
expectTypeOf<typeof PostRow.schema.Type>().toEqualTypeOf<{
  readonly title: string
  readonly commentCount: number
  readonly author: { readonly id: string; readonly name: string }
  readonly editor: { readonly id: string; readonly name: string } | null
  readonly comments: ReadonlyArray<EntityRef<'Comment'>>
}>()

const CreatePostInput = Schema.Struct({
  title: Schema.String,
  authorId: Schema.String,
  notify: Schema.Boolean,
})

const CreatePost = Entity.input(Blog.Post, CreatePostInput, {
  authorId: Relation.input(Blog.Post.relations.author),
  notify: Entity.unmapped,
})

void CreatePost.members.title // Blog.Post.fields.title: it names a field, so it maps itself
void CreatePost.members.authorId.relation.target() // Blog.Author: what a picker chooses from
void CreatePost.members.notify // Entity.unmapped: about the operation, not the Post
expectTypeOf(CreatePost.members.title).toEqualTypeOf<typeof Blog.Post.fields.title>()
expectTypeOf(CreatePost.members.authorId.relation.target()).toEqualTypeOf<typeof Blog.Author>()

const PostForEdit = Entity.selectFor(CreatePost)
// a Selection of `title` and `author`, the members the input writes; `author` as a ref

void Entity.valuesFor(CreatePost, { title: 'Hello', author: { entity: 'Author', id: 'a1' } })
// { title: 'Hello', authorId: 'a1' }
expectTypeOf<typeof PostForEdit.schema.Type>().toEqualTypeOf<{
  readonly title: string
  readonly author: EntityRef<'Author'>
}>()

{
  const CommentBody = Entity.select(Blog.Comment, { body: true })

  const PostWithComments = Entity.select(Blog.Post, {
    title: true,
    comments: Entity.page(CommentBody, { first: 10 }),
  })
  // { title: string, comments: { items: { body: string }[], hasNext: boolean, hasPrevious: boolean } }
  void PostWithComments
}

{
  const NewAuthor = Entity.input(Blog.Author, Schema.Struct({ name: Schema.String }))

  const CreatePost = Entity.input(
    Blog.Post,
    Schema.Struct({ title: Schema.String, author: NewAuthor.schema }),
    { author: Relation.nested(Blog.Post.relations.author, NewAuthor) },
  )
  void CreatePost
}

{
  const AuthorId = Schema.String.pipe(Schema.brand('AuthorId'))
  const PostId = Schema.String.pipe(Schema.brand('PostId'))

  const Writer = Entity.define('Author', Schema.Struct({ id: AuthorId, name: Schema.String }))
  const Article = Entity.define('Post', Schema.Struct({ id: PostId, title: Schema.String }))
  const Press = Entity.relate({ Writer, Article }, { Article: { author: Relation.one(Writer) } })

  type WriterId = IdOf<typeof Press.Writer> // AuthorId

  const ByLine = Entity.select(Press.Article, { author: true })
  // { author: EntityRef<'Author', AuthorId> }

  Entity.input(Press.Article, Schema.Struct({ authorId: AuthorId }), {
    authorId: Relation.input(Press.Article.relations.author), // a PostId, or any text, is a type error
  })
  expectTypeOf<WriterId>().toEqualTypeOf<typeof AuthorId.Type>()
  expectTypeOf<typeof ByLine.schema.Type>().toEqualTypeOf<{
    readonly author: EntityRef<'Author', typeof AuthorId.Type>
  }>()
}
