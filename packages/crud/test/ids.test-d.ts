import { Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { Form, Input } from 'foldkit-form'
import { Mutation } from 'foldkit-remote'
import { expectTypeOf } from 'vitest'
import { Crud } from '../src/index.js'

const PostId = Schema.String.pipe(Schema.brand('PostId'))
type PostId = typeof PostId.Type
const Post = Entity.define('Post', Schema.Struct({ id: PostId, title: Schema.String }))

const EditInput = Schema.Struct({ id: PostId, title: Schema.String })
const Editor = Crud.editor('Editor', {
  form: Form.make('Edit', Entity.input(Post, EditInput), { inputs: { id: Input.hidden() } }),
  mutation: Mutation.make('Edit', { Input: EditInput, Output: {} }),
})

// An editor opens the id of its own Entity.
expectTypeOf(Editor.bundle.helpers!.open).parameter(1).toEqualTypeOf<PostId>()

const Remover = Crud.remover('Remover', {
  mutation: Mutation.make('Delete', { Input: { id: PostId }, Output: {} }),
  input: (id: PostId) => ({ id }),
})
// A remover is asked about the id its `input` names.
expectTypeOf(Remover.bundle.helpers!.ask).parameter(1).toEqualTypeOf<PostId>()

Crud.remover('Untyped', {
  mutation: Mutation.make('DeleteAny', { Input: { id: Schema.String }, Output: {} }),
  input: id => {
    expectTypeOf(id).toEqualTypeOf<string>()
    return { id }
  },
})
