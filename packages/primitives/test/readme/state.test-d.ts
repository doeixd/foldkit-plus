import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { SelectionSet } from '../../src/state/index.js'

const Picked = Bundle.declare(SelectionSet, 'picked')
const Model = Schema.Struct({ ...Picked.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Picked.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const placements = Page.assemble(Page.at(Picked))

const config = placements.complete({
  init: () => placements.initial({}),
  update: placements.update(model => ({ model })),
  view: (model: Model, h: HtmlBuilder<Message>) =>
    h.div([], [String(model.picked.selected.length)]),
  subscriptions: placements.subscriptions(),
})

void config
