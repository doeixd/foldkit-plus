import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle, Link, follow } from '../src/index.js'

const ChildModel = Schema.Struct({ text: Schema.String })
type ChildModel = typeof ChildModel.Type
const ChildMessage = defineMessageUnion({ Told: { text: Schema.String } })
type ChildMessage = typeof ChildMessage.Type
const ChildBundle = Bundle.make('Child', {
  Model: ChildModel,
  Message: ChildMessage,
  init: () => ({ model: { text: '' } }),
  update: model => ({ model }),
})

const Model = Schema.Struct({
  child: ChildModel,
  pending: Schema.Option(Schema.Struct({ text: Schema.String })),
})
type Model = typeof Model.Type
const Message = defineMessageUnion({
  GotChild: { message: ChildMessage },
  Noted: {},
})
const placed = ChildBundle.at(Link.field<Model>()('child', Link.wrapper(Message.GotChild)))

// The ask, the child, and its Messages infer from the placement and the
// Model; a message of another union is refused.
export const followText = follow(placed, {
  pending: model => model.pending,
  release: model => ({ ...model, pending: Option.none() }),
  ready: () => true,
  toMessages: ask => [ChildMessage.Told({ text: ask.text })],
})

// The owner's Messages are the child's, not numbers.
export const followNumbers = follow(placed, {
  pending: model => model.pending,
  release: model => ({ ...model, pending: Option.none() }),
  ready: () => true,
  // @ts-expect-error: numbers are not child Messages
  toMessages: () => [42],
})
