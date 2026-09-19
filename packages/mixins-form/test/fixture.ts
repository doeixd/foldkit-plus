import { Schema } from 'effect'
import { Entity, Relation } from 'foldkit-entity'
import { Form, Input } from 'foldkit-form'

const Author = Entity.define('Author', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Tag = Entity.define('Tag', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Post = Entity.define(
  'Post',
  Schema.Struct({
    id: Schema.String,
    title: Schema.String.check(Schema.isMinLength(1)).annotate({
      title: 'Title',
      description: 'Shown in the feed',
    }),
    body: Schema.String,
    status: Schema.Literals(['draft', 'live']),
    rating: Schema.Number,
    featured: Schema.Boolean,
  }),
)
const Blog = Entity.relate(
  { Author, Tag, Post },
  { Post: { editor: Relation.one(Author, { optional: true }), tags: Relation.many(Tag) } },
)
const Cms = Blog.Post.pipe(
  Entity.annotateMembers({
    body: Input.of(Input.multiline()),
    editor: Form.label('Editor'),
    tags: Form.label('Tags'),
  }),
)

export const EditInput = Schema.Struct({
  id: Schema.String,
  title: Cms.fields.title.schema,
  body: Schema.optional(Schema.String),
  status: Schema.Literals(['draft', 'live']),
  rating: Schema.NullOr(Schema.Number),
  featured: Schema.Boolean,
  editorId: Schema.NullOr(Schema.String),
  tagIds: Schema.Array(Schema.String),
})

export const Edit = Form.make(
  'Edit',
  Entity.input(Cms, EditInput, {
    editorId: Relation.input(Cms.relations.editor),
    tagIds: Relation.input(Cms.relations.tags),
  }),
  { inputs: { id: Input.hidden() } },
)

export const options = {
  editorId: [
    { value: 'a1', label: 'Ada' },
    { value: 'a2', label: 'Grace' },
  ],
  tagIds: [
    { value: 't1', label: 'TypeScript' },
    { value: 't2', label: 'Databases' },
  ],
}
