import type { HtmlBuilder } from 'foldkit/html'
import { Bundle } from 'foldkit-bundle'
import { Geolocation } from '../../src/device/index.js'

const Page = Bundle.compose({}).pipe(Bundle.withChild('here', Geolocation))
type Model = typeof Page.Model.Type
type Message = typeof Page.Message.Type
const { placements } = Page

const config = placements.complete({
  init: () => placements.initial({}),
  update: placements.update(model => ({ model })),
  view: (model: Model, h: HtmlBuilder<Message>) => h.div([], [model.here.status]),
  subscriptions: placements.subscriptions(),
})
void config
