/**
 * The examples from docs/bundle-vs-submodel.md, type-checked so the guide
 * cannot drift from the API. Sections follow the guide's headings.
 */
import { Option, Schema, Stream } from 'effect'
import * as Command from 'foldkit/command'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Submodel from 'foldkit/submodel'
import * as Subscription from 'foldkit/subscription'
import * as Update from 'foldkit/update'
import { Bundle } from '../src/index.js'

// --- The child: one Submodel ---

const TimerModel = Schema.Struct({ seconds: Schema.Number, running: Schema.Boolean })
type TimerModel = typeof TimerModel.Type
const TimerMessage = defineMessageUnion({ ClickedToggle: {}, Ticked: {} })
type TimerMessage = typeof TimerMessage.Type

const init = (): Update.Return<TimerModel, TimerMessage> => ({
  model: { seconds: 0, running: false },
})

const update = (model: TimerModel, message: TimerMessage) =>
  TimerMessage.match<Update.Return<TimerModel, TimerMessage>>(message, {
    ClickedToggle: () => ({ model: { ...model, running: !model.running } }),
    Ticked: () => ({ model: { ...model, seconds: model.seconds + 1 } }),
  })

const subscriptions = Subscription.make<TimerModel, TimerMessage>()(entry => ({
  ticks: entry(
    { running: Schema.Boolean },
    {
      modelToDependencies: model => ({ running: model.running }),
      dependenciesToStream: ({ running }) =>
        running ? Stream.map(Stream.tick('1 second'), () => TimerMessage.Ticked()) : Stream.empty,
    },
  ),
}))

const view = Submodel.defineView<TimerModel, TimerMessage>((model, h) =>
  h.button(
    [h.OnClick(TimerMessage.ClickedToggle())],
    [`${model.seconds}s ${model.running ? 'Pause' : 'Start'}`],
  ),
)

// --- By hand: the Submodel placed twice ---

{
  const Model = Schema.Struct({ work: TimerModel, rest: TimerModel })
  type Model = typeof Model.Type
  const Message = defineMessageUnion({
    GotWorkMessage: { message: TimerMessage },
    GotRestMessage: { message: TimerMessage },
  })
  type Message = typeof Message.Type

  // 1. init: each child's Model, and its Commands lifted
  const parentInit = (): Update.Return<Model, Message> => {
    const work = init()
    const rest = init()
    return {
      model: { work: work.model, rest: rest.model },
      commands: [
        ...Command.mapMessages(work.commands, message => Message.GotWorkMessage({ message })),
        ...Command.mapMessages(rest.commands, message => Message.GotRestMessage({ message })),
      ],
    }
  }

  // 2. update: one fold per placement, and a route to each
  const foldWork = Update.foldChild({
    update,
    read: (model: Model) => Option.some(model.work),
    write: (model: Model, work: TimerModel) => ({ ...model, work }),
    toParentMessage: (message: TimerMessage): Message => Message.GotWorkMessage({ message }),
  })
  const foldRest = Update.foldChild({
    update,
    read: (model: Model) => Option.some(model.rest),
    write: (model: Model, rest: TimerModel) => ({ ...model, rest }),
    toParentMessage: (message: TimerMessage): Message => Message.GotRestMessage({ message }),
  })
  const parentUpdate = (model: Model, message: Message) =>
    Message.match<Update.Return<Model, Message>>(message, {
      GotWorkMessage: ({ message }) => foldWork(model, message),
      GotRestMessage: ({ message }) => foldRest(model, message),
    })

  // 3. subscriptions: one lift per placement, renamed so the keys do not collide
  const work = Subscription.lift(subscriptions)({
    read: (model: Model) => Option.some(model.work),
    toParentMessage: (message: TimerMessage): Message => Message.GotWorkMessage({ message }),
  })
  const rest = Subscription.lift(subscriptions)({
    read: (model: Model) => Option.some(model.rest),
    toParentMessage: (message: TimerMessage): Message => Message.GotRestMessage({ message }),
  })
  const parentSubscriptions = { workTicks: work.ticks, restTicks: rest.ticks }

  // 4. view: one h.submodel per placement
  const parentView = (model: Model, h: HtmlBuilder<Message>) =>
    h.div(
      [],
      [
        h.submodel({
          slotId: 'work',
          model: model.work,
          view,
          toParentMessage: message => Message.GotWorkMessage({ message }),
        }),
        h.submodel({
          slotId: 'rest',
          model: model.rest,
          view,
          toParentMessage: message => Message.GotRestMessage({ message }),
        }),
      ],
    )

  void parentInit
  void parentUpdate
  void parentSubscriptions
  void parentView
}

// --- With a Bundle ---

{
  const Timer = Bundle.make('Timer', {
    Model: TimerModel,
    Message: TimerMessage,
    init,
    update,
    subscriptions: () => subscriptions,
    view,
  })

  const Page = Bundle.compose({}).pipe(
    Bundle.withChild('work', Timer),
    Bundle.withChild('rest', Timer),
  )
  type Model = typeof Page.Model.Type
  type Message = typeof Page.Message.Type
  const { children, placements } = Page

  const config = placements.complete({
    init: () => placements.initial({}),
    update: placements.update(),
    subscriptions: placements.subscriptions(),
    view: (model: Model, h: HtmlBuilder<Message>) =>
      h.div([], [children.work.view(model, h), children.rest.view(model, h)]),
  })

  void config
}
