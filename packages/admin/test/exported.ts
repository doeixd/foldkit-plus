// Values an application module would export, so declaration emit must be able to
// name their types.
import { Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { Form } from 'foldkit-form'
import { Mutation, Query } from 'foldkit-remote'
import { Admin } from '../src/index.js'

const Post = Entity.define('Post', Schema.Struct({ id: Schema.String, title: Schema.String }))
const Input = Schema.Struct({ id: Schema.String, title: Schema.String })
const EditPost = Form.make('EditPost', Entity.input(Post, Input))

export const Editor = Admin.editor('PostEditor', {
  form: EditPost,
  mutation: Mutation.make('EditPost', { Input, Output: {} }),
})
export const Posts = Admin.list('Posts', {
  query: Query.make('Posts', { Input: {}, Result: Query.connection(Post) }),
  selection: Entity.select(Post, { id: true, title: true }),
})
