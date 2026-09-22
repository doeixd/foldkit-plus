import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { Timer } from '../../src/time/index.js'

const Ticks = Bundle.declare(Timer, 'ticks')
const Model = Schema.Struct({ ...Ticks.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Ticks.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const placements = Page.assemble(Page.at(Ticks, { args: { intervalMs: 1000 } }))

const config = placements.complete({
  init: () => placements.initial({}),
  update: placements.update(model => ({ model })),
  view: (model: Model, h: HtmlBuilder<Message>) => h.div([], [String(model.ticks.count)]),
  subscriptions: placements.subscriptions(),
})

void config
