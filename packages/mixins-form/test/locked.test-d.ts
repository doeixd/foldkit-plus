import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Form, Input } from 'foldkit-form'
import { SlotView } from 'foldkit-mixins'
import { defineMessageUnion } from 'foldkit/message'
import * as Submodel from 'foldkit/submodel'
import { FormView } from '../src/index.js'

// A key edited by a Bundle can be locked like a key that holds a draft (#312).
const PickerMessage = defineMessageUnion({ Chose: { name: Schema.String } })
const Picker = Bundle.make({
  name: 'Picker',
  Model: Schema.Struct({ name: Schema.String }),
  Message: PickerMessage,
  init: () => ({ model: { name: '' } }),
  update: (model: { readonly name: string }) => ({ model }),
  view: Submodel.defineView<{ readonly name: string }, typeof PickerMessage.Type>((model, h) =>
    h.span([], [model.name]),
  ),
})
const Post = Form.make(
  'Post',
  Form.input(Schema.Struct({ title: Schema.String, cover: Schema.String })),
  {
    inputs: {
      cover: Input.bundle('Picker', {
        bundle: Picker,
        value: model => model.name,
        fill: (model, name) => ({ ...model, name }),
      }),
    },
  },
)
const base = { model: Post.initial, errors: [], canSubmit: true }

FormView.define(Post)({ ...base, locked: ['title', 'cover'] }, SlotView.inertBuilder())
FormView.fields(Post).view({ ...base, locked: ['cover'] }, SlotView.inertBuilder())
// @ts-expect-error no key "covers"
FormView.define(Post)({ ...base, locked: ['covers'] }, SlotView.inertBuilder())
