/**
 * The three wiring mistakes, each reported by `assembly.complete` at the
 * property that is wrong.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import { Bundle, Link } from '../src/index.js'
import { Counter, CounterMessage, CounterModel } from './fixture.js'

const GotCounter = Link.wrapper('GotCounterMessage', CounterMessage)
const Model = Schema.Struct({ counter: CounterModel })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Reset: {}, ...GotCounter.cases })
type Message = typeof Message.Type

const placed = Counter.at(Link.field<Model>()('counter', GotCounter), {
  args: { limit: 3, start: 0 },
  onOut: () => model => ({ model }),
})
const assembly = Bundle.assemble<Model, Message>()([placed])

const update = (model: Model, message: Message) =>
  Option.getOrElse(assembly.update(model, message), () => ({ model }))

// Wired: accepted, and returned unchanged.
const config = assembly.complete({
  update,
  subscriptions: assembly.subscriptions(),
  managedResources: assembly.resources(),
})
config.update satisfies typeof update

// Mistake 1: Subscriptions built without the assembly.
assembly.complete({
  update,
  // @ts-expect-error: subscriptions must come from assembly.subscriptions(own)
  subscriptions: Subscription.aggregate<Model, Message>()(),
  managedResources: assembly.resources(),
})

// Mistake 2: resources omitted while a placement has some.
// @ts-expect-error: managedResources must come from assembly.resources(own)
assembly.complete({ update, subscriptions: assembly.subscriptions() })

// Mistake 3: an update whose Message union lacks the wrapper variant.
const Narrow = defineMessageUnion({ Reset: {} })
assembly.complete({
  // @ts-expect-error: update does not accept every placement's Messages
  update: (model: Model, _message: typeof Narrow.Type) => ({ model }),
  subscriptions: assembly.subscriptions(),
  managedResources: assembly.resources(),
})

// A placement of another parent is rejected by the assembly itself.
const Other = Schema.Struct({ counter: CounterModel, extra: Schema.String })
const foreign = Counter.at(Link.field<typeof Other.Type>()('counter', GotCounter), {
  args: { limit: 3, start: 0 },
  onOut: () => model => ({ model }),
})
// @ts-expect-error: the placement's parent is not this Model
Bundle.assemble<Model, Message>()([foreign])

// A collection joins the same list, and resources are not demanded for it.
const GotRow = Link.keyedWrapper('GotRowMessage', CounterMessage)
const RowsModel = Schema.Struct({ rows: Schema.Record(Schema.String, CounterModel) })
type RowsModel = typeof RowsModel.Type
const RowsMessage = defineMessageUnion({ ...GotRow.cases })
type RowsMessage = typeof RowsMessage.Type
const { resources: _socket, at: _at, each: _each, ...plainSpec } = Counter
const rows = Bundle.make({ ...plainSpec, name: 'Plain' }).each(
  Link.collection<RowsModel>()('rows', GotRow),
  { args: { limit: 1, start: 0 }, onOut: () => model => ({ model }) },
)
const rowsAssembly = Bundle.assemble<RowsModel, RowsMessage>()([rows])
rowsAssembly.complete({
  update: (model: RowsModel, message: RowsMessage) =>
    Option.getOrElse(rowsAssembly.update(model, message), () => ({ model })),
  subscriptions: rowsAssembly.subscriptions(),
})
