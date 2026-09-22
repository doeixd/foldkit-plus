import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { Tween } from '../../src/motion/index.js'

const Slide = Bundle.declare(Tween, 'slide')
const Model = Schema.Struct({ ...Slide.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Slide.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const placements = Page.assemble(Page.at(Slide, { args: { from: 0, to: 1, ms: 200 } }))

const config = placements.complete({
  init: () => placements.initial({}),
  update: placements.update(model => ({ model })),
  view: (model: Model, h: HtmlBuilder<Message>) => h.div([], [String(model.slide.value)]),
  subscriptions: placements.subscriptions(),
})

void config
