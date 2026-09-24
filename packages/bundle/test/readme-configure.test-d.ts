// The README's configure example, compiled. Keep the two in step.
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from '../src/index.js'

const Greeted = Schema.TaggedStruct('Greeted', { name: Schema.String })
const HelloForm = Bundle.make('HelloForm', {
  Model: Schema.Struct({ name: Schema.String }),
  Message: defineMessageUnion({ Submitted: {} }),
  init: () => ({ model: { name: '' } }),
  update: model => ({ model, outMessage: Greeted.make({ name: model.name }) }),
})

const Base = Bundle.compose({ greeting: Schema.String }).pipe(Bundle.withChild('hello', HelloForm))
// Made from the finished parent, as `Editor.at({ data, model: App.model.editor }).onOut` is.
const greet = (out: typeof Greeted.Type) => (model: typeof Base.Model.Type) => ({
  model: { ...model, greeting: `Hello, ${out.name}!` },
})
const Page = Base.pipe(Bundle.configure('hello', { onOut: greet }))

void Page.placements.initial({ greeting: '' })
