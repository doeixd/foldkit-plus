import type { HtmlBuilder } from 'foldkit/html'
import { Bundle } from 'foldkit-bundle'
import { Tween, TweenMessage } from '../../src/motion/index.js'

const Page = Bundle.compose({}).pipe(
  Bundle.withChild('slide', Tween, { args: { from: 0, to: 1, ms: 200 } }),
)
type Model = typeof Page.Model.Type
type Message = typeof Page.Message.Type
const { placements } = Page

const config = placements.complete({
  init: () => placements.initial({}),
  update: placements.update(model => ({ model })),
  view: (model: Model, h: HtmlBuilder<Message>) =>
    h.div(
      [
        h.Style({ opacity: String(model.slide.value) }),
        h.OnClick(Page.Message.GotSlideMessage({ message: TweenMessage.Started() })),
      ],
      ['Fade in'],
    ),
  subscriptions: placements.subscriptions(),
})
void config
