/**
 * The operations the client may ask of the server. The input is the domain's
 * `EditPostInput`, the same value the form is built from, so the form's
 * submitted value is this mutation's input by construction.
 */
import { Schema } from 'effect'
import { Mutation, Query } from 'foldkit-remote'
import { Blog, EditPostInput } from './domain.js'

export const EditPostMutation = Mutation.make('EditPost', {
  Input: EditPostInput,
  Output: { id: Schema.String },
})

/** Every post; and every author, which is what lists them for a relation picker. */
export const PostsQuery = Query.make('Posts', { Input: {}, Result: Query.connection(Blog.Post) })
export const AuthorsQuery = Query.make('Authors', {
  Input: {},
  Result: Query.connection(Blog.Author),
})
