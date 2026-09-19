/**
 * The edit form. Built from the operation's input and the Entity it writes: the
 * input says what may be submitted, `Entity.input` says what each key means, and
 * `Form.make` works out a control for each.
 */
import { Entity } from 'foldkit-entity'
import { Form, Input } from 'foldkit-form'
import { Blog, EditPostInput } from './domain.js'
import { words } from './words.js'

// A relation has no schema to annotate, so its label is Entity metadata.
const Post = Blog.Post.pipe(Entity.annotateMembers({ editor: Form.label('Editor') }))

export const EditPostForm = Form.make(
  'EditPost',
  // `id`, `title` and `published` name fields, so they map themselves.
  // `editorId` does not, so it names its member: the ids of the `editor` relation.
  Entity.input(Post, EditPostInput, { editorId: 'editor' }),
  // The id says which post is edited. The form carries it; nobody types it.
  // Authors are too many to list, so the editor's picker searches: the form holds
  // what was typed, and the author list takes it as its query's input.
  { inputs: { id: Input.hidden(), editorId: Input.search() }, messages: words },
)
