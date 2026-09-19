/**
 * The edit form. Built from the operation's input and the Entity it writes: the
 * input says what may be submitted, `Entity.input` says what each key means, and
 * `Form.make` works out a control for each.
 */
import { Entity, Relation } from 'foldkit-entity'
import { Form, Input } from 'foldkit-form'
import { Blog, EditPostInput } from './domain.js'

// A relation has no schema to annotate, so its label is Entity metadata.
const Post = Blog.Post.pipe(Entity.annotateMembers({ editor: Form.label('Editor') }))

export const EditPostForm = Form.make(
  'EditPost',
  // `id`, `title` and `published` name fields, so they map themselves.
  Entity.input(Post, EditPostInput, { editorId: Relation.input(Post.relations.editor) }),
  // The id says which post is edited. The form carries it; nobody types it.
  { inputs: { id: Input.hidden() } },
)
