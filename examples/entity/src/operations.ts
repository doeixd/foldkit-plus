/**
 * The operations the client may ask of the server. The input is the domain's
 * `EditPostInput`, the same value the form is built from, so the form's
 * submitted value is this mutation's input by construction.
 */
import { Schema } from 'effect'
import { Entity, Expr, Order, Write } from 'foldkit-entity'
import { Sort } from 'foldkit-crud'
import { Mutation, Query } from 'foldkit-remote'
import { Blog, EditPostInput, PostId, WritePostInput } from './domain.js'

/**
 * A declared write: the post's fields, and the `editor` relation the `editorId`
 * key points. The page shows it before the server answers, and the server
 * writes it with no handler of its own.
 */
export const EditPostMutation = Mutation.write(
  'EditPost',
  Write.update(Entity.input(Blog.Post, EditPostInput, { editorId: 'editor' }), { id: 'id' }),
)

/** The orders the post list offers, by name; the query's body says what each one means. */
export const PostSort = Sort.make(['title'])

/**
 * Posts, searched and sorted. Which rows and in what order is the query's input,
 * so a list has no filter or sort state of its own: another input is another
 * connection, paged on its own cursors. The body is the filter and the order,
 * which the server compiles and the client reads, so a rename moves a post in
 * a list sorted by title with no request. Every author is what lists them for
 * a relation picker.
 */
export const PostsQuery = Query.define(
  'Posts',
  { search: Schema.String, sort: PostSort.Schema },
  ({ input }) =>
    Query.from(Blog.Post).pipe(
      Query.where(Expr.contains(Blog.Post.fields.title, input.search)),
      Query.orderBy(Order.chosen(input.sort, { title: Blog.Post.fields.title })),
    ),
)
/**
 * Authors whose name holds what the editor picker's search box holds, by id.
 * Authors are found, not all listed; a body, so a new author joins the list
 * the client already holds with no request.
 */
export const AuthorsQuery = Query.define('Authors', { search: Schema.String }, ({ input }) =>
  Query.from(Blog.Author).pipe(
    Query.where(Expr.contains(Blog.Author.fields.name, input.search)),
    Query.orderBy(Order.asc(Blog.Author.fields.id)),
  ),
)

/** A post and its new author in one operation. What a nested write does is the handler's. */
export const WritePostMutation = Mutation.make('WritePost', {
  Input: WritePostInput,
  Output: { id: PostId },
})

export const DeletePostMutation = Mutation.make('DeletePost', {
  Input: { id: PostId },
  Output: {},
})
