/**
 * A form that nests a form. `WritePost`'s `author` key holds a new author, so the
 * form built from it holds a row of the author's own form: the same validation,
 * the same Messages, one level in.
 */
import { Form } from 'foldkit-form'
import { NewAuthor, WritePost } from './domain.js'

/** The form that would edit an author alone. */
export const NewAuthorForm = Form.make('WritePost.author', NewAuthor)

/** A post's form nests it, so `author` is typed by it all the way down. */
export const WritePostForm = Form.make('WritePost', WritePost, {
  nested: { author: NewAuthorForm },
})
