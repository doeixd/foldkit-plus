import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Entity } from 'foldkit-entity'
import { defineMessageUnion } from 'foldkit/message'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { Form } from '../src/index.js'

const Post = Entity.define(
  'Post',
  Schema.Struct({ id: Schema.String, title: Schema.String.check(Schema.isMinLength(1)) }),
)
const RenameInput = Schema.Struct({ id: Schema.String, title: Post.fields.title.schema })
const Rename = Form.make('Rename', Entity.input(Post, RenameInput))

// The form is a Submodel of the page: a Model field and a Message variant.
const Slot = Bundle.declare(Rename.bundle, 'rename')
const Model = Schema.Struct({
  ...Slot.fields,
  saved: Schema.Array(RenameInput),
})
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Slot.cases, Ping: {} })

const Page = Bundle.parent({ Model, Message })
const RenameForm = Page.at(Slot, {
  // What a submit means is the page's: here it records the value.
  onOut: submitted => model => {
    expectTypeOf(submitted.value).toEqualTypeOf<typeof RenameInput.Type>()
    return { model: { ...model, saved: [...model.saved, submitted.value] } }
  },
})
const placements = Page.assemble(RenameForm)
const update = placements.update((model: Model) => ({ model }))

const send = (model: Model, ...messages: ReadonlyArray<typeof Rename.Message.Type>): Model =>
  messages.reduce(
    (current, message) => update(current, Message.GotRenameMessage({ message })).model,
    model,
  )

describe('a form placed in a parent', () => {
  const initial = placements.initial({ saved: [] }).model

  it('starts as the form’s own initial Model under the parent’s field', () => {
    expect(initial.rename).toEqual(Rename.bundle.init(undefined).model)
  })

  it('routes edits to the form and hands a valid submit to the parent', () => {
    const edited = send(
      initial,
      Rename.Message.Changed({ key: 'id', value: 'p1' }),
      Rename.Message.Changed({ key: 'title', value: 'Hello' }),
    )
    expect(edited.rename.fields.title).toEqual({ _tag: 'Valid', value: 'Hello' })
    expect(edited.saved).toEqual([])

    expect(send(edited, Rename.Message.Submitted()).saved).toEqual([{ id: 'p1', title: 'Hello' }])
  })

  it('hands the parent nothing while the form is invalid', () => {
    const submitted = send(initial, Rename.Message.Submitted())
    expect(submitted.saved).toEqual([])
    expect(submitted.rename.fields.title._tag).toBe('Invalid')
  })
})
