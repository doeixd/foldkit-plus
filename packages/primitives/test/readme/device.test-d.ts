import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { Geolocation } from '../../src/device/index.js'

const Here = Bundle.declare(Geolocation, 'here')
const Model = Schema.Struct({ ...Here.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Here.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const placements = Page.assemble(Page.at(Here))

const config = placements.complete({
  init: () => placements.initial({}),
  update: placements.update(model => ({ model })),
  view: (model: Model, h: HtmlBuilder<Message>) => h.div([], [String(model.here.status)]),
  subscriptions: placements.subscriptions(),
})

void config
