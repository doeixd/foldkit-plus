// Exported values need every type they mention to be nameable from outside the
// package (TS4023). Compiling this file with declarations on is the check.
import { Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { Form } from 'foldkit-form'
import { Mutation } from 'foldkit-remote'
import { Cms } from '../src/index.js'

const Input = Schema.Struct({ title: Schema.String })
export const Post = Entity.define(
  'Post',
  Schema.Struct({ id: Schema.String, title: Schema.String }),
).pipe(Cms.roles({ label: 'title' }))
export const Posts = Cms.content('posts', {
  entity: Post,
  form: Form.make('PostForm', Entity.input(Post, Input)),
  publish: {
    create: Mutation.make('Create', { Input, Output: { id: Schema.String } }),
    update: Mutation.make('Update', { Input: { ...Input.fields, id: Schema.String }, Output: {} }),
  },
  words: { one: 'Post', many: 'Posts' },
})
export const Entities = Cms.Entities
export const Operations = Cms.Operations
