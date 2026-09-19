/**
 * The operations the client may ask of the server. The input is the domain's
 * `EditPostInput`, the same value the form is built from, so the form's
 * submitted value is this mutation's input by construction.
 */
import { Schema } from 'effect'
import { Mutation } from 'foldkit-remote'
import { EditPostInput } from './domain.js'

export const EditPostMutation = Mutation.make('EditPost', {
  Input: EditPostInput,
  Output: { id: Schema.String },
})
