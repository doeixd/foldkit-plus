// The README's composed counter and greeting, compiled. Keep the two in step.
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

const Page = Bundle.compose({ greeting: Schema.String }).pipe(Bundle.withChild('clicks', Count))
type Model = typeof Page.Model.Type
type Message = typeof Page.Message.Type
const { placements } = Page

const config = placements.complete({
  init: () => placements.initial({ greeting: 'Hello' }),
  update: placements.update(model => ({ model })),
  subscriptions: placements.subscriptions(),
  view: (model: Model, h: HtmlBuilder<Message>) =>
    h.button(
      [h.OnClick(Page.Message.GotClicksMessage({ message: CountMessage.Incremented() }))],
      [`${model.greeting}: ${model.clicks.count}`],
    ),
})

void config

// A child with an OutMessage, and the parent's own Messages.
const Greeted = Schema.TaggedStruct('Greeted', { name: Schema.String })
const HelloForm = Bundle.make('HelloForm', {
  Model: Schema.Struct({ name: Schema.String }),
  Message: defineMessageUnion({ Submitted: {} }),
  init: () => ({ model: { name: '' } }),
  update: model => ({ model, outMessage: Greeted.make({ name: model.name }) }),
})

const App = Bundle.compose({ greeting: Schema.String }).pipe(
  Bundle.withMessages({ ClickedReset: {} }),
  Bundle.withChild('hello', HelloForm, {
    onOut: out => model => ({ model: { ...model, greeting: `Hello, ${out.name}!` } }),
  }),
)

void App.children.hello.view
