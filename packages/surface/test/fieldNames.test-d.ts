/**
 * A ref's string keys are fields; its members are its focus (#331).
 * Type-checked but not executed.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { ModelRef, Projection, Surface } from '../src/index.js'

const App = Surface.application({
  Model: Schema.Struct({
    carousel: Schema.Struct({ index: Schema.Number, get: Schema.String }),
    byId: Schema.Record(Schema.String, Schema.Number),
    items: Schema.Array(Schema.Number),
  }),
  Message: defineMessageUnion({ Ping: {} }),
})
type Model = typeof App.Model.Type
declare const model: Model

const index: number = ModelRef.focus(App.model.carousel.index).get(model)
const get: string = ModelRef.focus(App.model.carousel.get).get(model)
ModelRef.focus(App.model.byId).at('a')
ModelRef.focus(App.model.items).index(0)

// @ts-expect-error a member is not read off the ref, whose keys are fields
App.model.items.get(model)
// @ts-expect-error a field named `get` is a ref, not a reader
App.model.carousel.get(model)
// @ts-expect-error `at` is only on a record's focus
ModelRef.focus(App.model.items).at('a')
// @ts-expect-error `index` is only on an array's focus
ModelRef.focus(App.model.byId).index(0)
// @ts-expect-error a Projection is not a ref
ModelRef.focus(Projection.struct({ items: App.model.items }))

void index
void get
