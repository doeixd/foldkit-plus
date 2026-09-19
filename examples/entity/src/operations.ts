/**
 * The operations the client may ask of the server. The input is the domain's
 * `EditPostInput`, the same value the form is built from, so the form's
 * submitted value is this mutation's input by construction.
 */
import { Schema } from 'effect'
import { Mutation, Query } from 'foldkit-remote'
import { Blog, EditPostInput, PostId } from './domain.js'

export const EditPostMutation = Mutation.make('EditPost', {
  Input: EditPostInput,
  Output: { id: PostId },
})

/** The orders the post list offers. The server decides what each one means. */
export const PostSort = Schema.Literals(['oldest', 'title', 'title-desc'])
export type PostSort = typeof PostSort.Type

/**
 * Posts, searched and sorted. Which rows and in what order is the query's input,
 * so a list has no filter or sort state of its own: another input is another
 * connection, paged on its own cursors. Every author is what lists them for a
 * relation picker.
 */
export const PostsQuery = Query.make('Posts', {
  Input: { search: Schema.String, sort: PostSort },
  Result: Query.connection(Blog.Post),
})
export const AuthorsQuery = Query.make('Authors', {
  Input: {},
  Result: Query.connection(Blog.Author),
})

export const DeletePostMutation = Mutation.make('DeletePost', {
  Input: { id: PostId },
  Output: {},
})
