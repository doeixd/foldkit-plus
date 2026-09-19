/**
 * The domain, declared once. This module imports neither Remote nor Drizzle:
 * the client and the server both interpret what it says.
 */
import { Schema } from 'effect'
import { Derived, Entity, Relation } from 'foldkit-entity'

const Author = Entity.define('Author', Schema.Struct({ id: Schema.String, name: Schema.String }))

const Comment = Entity.define('Comment', Schema.Struct({ id: Schema.String, body: Schema.String }))

const Post = Entity.define(
  'Post',
  Schema.Struct({
    id: Schema.String,
    title: Schema.String.check(Schema.isMinLength(1)).annotate({ title: 'Title' }),
    published: Schema.Boolean,
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
  id: Schema.String,
  title: Blog.Post.fields.title.schema,
  published: Schema.Boolean.annotate({ title: 'Published' }),
  editorId: Schema.NullOr(Schema.String),
})
