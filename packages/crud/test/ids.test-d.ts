import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
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
expectTypeOf(Bundle.helpersOf(Editor.bundle).open).parameter(1).toEqualTypeOf<PostId>()

const Remover = Crud.remover('Remover', {
  mutation: Mutation.make('Delete', { Input: { id: PostId }, Output: {} }),
  input: (id: PostId) => ({ id }),
})
// A remover is asked about the id its `input` names.
expectTypeOf(Bundle.helpersOf(Remover.bundle).ask).parameter(1).toEqualTypeOf<PostId>()

Crud.remover('Untyped', {
  mutation: Mutation.make('DeleteAny', { Input: { id: Schema.String }, Output: {} }),
  input: id => {
    expectTypeOf(id).toEqualTypeOf<string>()
    return { id }
  },
})

// Named by its key, the id's type and the input both follow from the mutation.
const ByKey = Crud.remover('ByKey', {
  mutation: Mutation.make('DeleteByKey', { Input: { id: PostId }, Output: {} }),
  id: 'id',
})
expectTypeOf(Bundle.helpersOf(ByKey.bundle).ask).parameter(1).toEqualTypeOf<PostId>()

Crud.remover('Wrong', {
  mutation: Mutation.make('DeleteWrong', {
    Input: { id: PostId, reason: Schema.String },
    Output: {},
  }),
  // @ts-expect-error "slug" is not a key of the input
  id: 'slug',
})
