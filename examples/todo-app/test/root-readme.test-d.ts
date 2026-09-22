import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { evo } from 'foldkit/struct'
import { Surface } from 'foldkit-surface'

const Model = Schema.Struct({ count: Schema.Number, internalNote: Schema.String })
const Message = defineMessageUnion({ Incremented: {} })
const initial: typeof Model.Type = { count: 0, internalNote: 'Only the app reads this' }
const update = (model: typeof Model.Type, _message: typeof Message.Type) => ({
  model: evo(model, { count: count => count + 1 }),
})
const App = Surface.application({ Model, Message, initial, update })

const Counter = App.surface('Counter', {
  model: ({ model }) => ({ count: model.count }),
  messages: [Message.Incremented],
})

Surface.read(Counter, initial) // { count: 0 }
const next = update(initial, Message.Incremented()).model
Surface.read(Counter, next) // { count: 1 }
