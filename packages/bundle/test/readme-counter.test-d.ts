import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from '../src/index.js'

const CountModel = Schema.Struct({ count: Schema.Number })
const CountMessage = defineMessageUnion({ Incremented: {} })
const Count = Bundle.make('Count', {
  Model: CountModel,
  Message: CountMessage,
  init: () => ({ model: { count: 0 } }),
  update: model => ({ model: { count: model.count + 1 } }),
})

const Clicks = Bundle.declare(Count, 'clicks')
const Model = Schema.Struct({ ...Clicks.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Clicks.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const placements = Page.assemble(Page.at(Clicks))

const config = placements.complete({
  init: () => placements.initial({}),
  update: placements.update(model => ({ model })),
  subscriptions: placements.subscriptions(),
  view: (model: Model, h: HtmlBuilder<Message>) =>
    h.button(
      [h.OnClick(Message.GotClicksMessage({ message: CountMessage.Incremented() }))],
      [String(model.clicks.count)],
    ),
})

void config
