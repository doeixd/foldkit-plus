import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { Visibility } from '../../src/events/index.js'

const Tab = Bundle.declare(Visibility, 'tab')
const Model = Schema.Struct({ ...Tab.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Tab.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const placements = Page.assemble(Page.at(Tab))

const config = placements.complete({
  init: () => placements.initial({}),
  update: placements.update(model => ({ model })),
  view: (model: Model, h: HtmlBuilder<Message>) => h.div([], [String(model.tab.visible)]),
  subscriptions: placements.subscriptions(),
})

void config
