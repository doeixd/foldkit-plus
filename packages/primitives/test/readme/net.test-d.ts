import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { Online } from '../../src/net/index.js'

const Net = Bundle.declare(Online, 'net')
const Model = Schema.Struct({ ...Net.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Net.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const placements = Page.assemble(Page.at(Net))

const config = placements.complete({
  init: () => placements.initial({}),
  update: placements.update(model => ({ model })),
  view: (model: Model, h: HtmlBuilder<Message>) => h.div([], [String(model.net.online)]),
  subscriptions: placements.subscriptions(),
})

void config
