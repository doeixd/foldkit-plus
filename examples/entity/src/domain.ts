/**
 * The domain, declared once. This module imports neither Remote nor Drizzle:
 * the client and the server both interpret what it says.
 */
import { Schema } from 'effect'
import { Derived, Entity, Relation } from 'foldkit-entity'

/**
 * Ids of their own. A ref to an Author, the editor a form picks, and the id a
 * delete is asked about are each typed by these, so one cannot stand in for another.
 */
export const AuthorId = Schema.String.pipe(Schema.brand('AuthorId'))
export type AuthorId = typeof AuthorId.Type
export const PostId = Schema.String.pipe(Schema.brand('PostId'))
export type PostId = typeof PostId.Type

const Author = Entity.define('Author', Schema.Struct({ id: AuthorId, name: Schema.String }))

const Comment = Entity.define('Comment', Schema.Struct({ id: Schema.String, body: Schema.String }))

const Post = Entity.define(
  'Post',
  Schema.Struct({
    id: PostId,
    title: Schema.String.check(Schema.isMinLength(1)).annotate({ title: 'Title' }),
    published: Schema.Boolean.annotate({ title: 'Published' }),
  }),
).pipe(Entity.derived({ commentCount: Derived.make(Schema.Number) }))

export const Blog = Entity.relate(
  { Author, Post, Comment },
  {
    Author: { posts: Relation.many(Post) },
    Post: {
      author: Relation.one(Author),
      editor: Relation.one(Author, { optional: true }),
      comments: Relation.many(Comment),
    },
    Comment: { post: Relation.one(Post), author: Relation.one(Author) },
  },
)

/** Views of the graph. They name members and carry a schema; they fetch nothing. */
export const AuthorName = Entity.select(Blog.Author, { name: true })

export const PostPage = Entity.select(Blog.Post, {
  title: true,
  published: true,
  commentCount: true,
  author: AuthorName,
  editor: AuthorName,
  comments: Entity.select(Blog.Comment, { body: true, author: AuthorName }),
})

/**
 * A long relation read a page at a time. The shape of a page is the view's to
 * declare; what a cursor is, and the order, are the server's.
 */
export const LatestComment = Entity.select(Blog.Post, {
  title: true,
  comments: Entity.page(Entity.select(Blog.Comment, { body: true }), { first: 1 }),
})

/** A post and who wrote it: what a write of both hands back, so it reads with no fetch. */
export const PostByline = Entity.select(Blog.Post, { title: true, author: AuthorName })

/** A row of the post list, and an author as a picker offers one. */
export const PostRow = Entity.select(Blog.Post, { id: true, title: true, published: true })
export const AuthorChoice = Entity.select(Blog.Author, { id: true, name: true })

export const AuthorPage = Entity.select(Blog.Author, {
  name: true,
  posts: Entity.select(Blog.Post, { title: true, commentCount: true }),
})

/**
 * What editing a post may change. The operation decides that, not the Entity:
 * a post's id and comment count exist and are not editable here.
 */
export const EditPostInput = Schema.Struct({
  id: PostId,
  title: Blog.Post.fields.title.schema,
  published: Blog.Post.fields.published.schema,
  editorId: Schema.NullOr(AuthorId),
})

/**
 * Writing a post together with its author, who does not exist yet. The `author`
 * key holds the author itself, written through an input of its own, so a form
 * built from this nests a form.
 */
export const NewAuthor = Entity.input(
  Blog.Author,
  Schema.Struct({ name: Schema.String.check(Schema.isMinLength(1)).annotate({ title: 'Name' }) }),
)
export const WritePostInput = Schema.Struct({
  title: Blog.Post.fields.title.schema,
  author: NewAuthor.schema,
})
export const WritePost = Entity.input(Blog.Post, WritePostInput, {
  author: Relation.nested(Blog.Post.relations.author, NewAuthor),
})
