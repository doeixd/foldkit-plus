/**
 * A form that nests a form. `WritePost`'s `author` key holds a new author, so the
 * form built from it holds a row of the author's own form: the same validation,
 * the same Messages, one level in.
 */
import { Form } from 'foldkit-form'
import { WritePost } from './domain.js'

export const WritePostForm = Form.make('WritePost', WritePost)
