/**
 * The examples from docs/bundle-vs-submodel.md, type-checked so the guide
 * cannot drift from the API. Sections follow the guide's headings.
 */
import { Option, Schema, Stream } from 'effect'
import * as Command from 'foldkit/command'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import * as Update from 'foldkit/update'
import { Bundle } from '../src/index.js'

declare const matchMediaChanges: (query: string) => Stream.Stream<boolean>

// --- By hand: a Submodel placed twice ---

{
  const MediaQueryModel = Schema.Struct({ matches: Schema.Boolean })
  type MediaQueryModel = typeof MediaQueryModel.Type
  const MediaQueryMessage = defineMessageUnion({ Changed: { matches: Schema.Boolean } })
  type MediaQueryMessage = typeof MediaQueryMessage.Type

  const initMediaQuery = (): Update.Return<MediaQueryModel, MediaQueryMessage> => ({
    model: { matches: false },
  })
  const updateMediaQuery = (
    _model: MediaQueryModel,
    message: MediaQueryMessage,
  ): Update.Return<MediaQueryModel, MediaQueryMessage> => ({ model: { matches: message.matches } })
  const mediaQuerySubscriptions = (query: string) =>
    Subscription.make<MediaQueryModel, MediaQueryMessage>()(() => ({
      changes: Subscription.persistentEntry(
        Stream.map(matchMediaChanges(query), matches => MediaQueryMessage.Changed({ matches })),
      ),
    }))

  const Model = Schema.Struct({
    dark: MediaQueryModel,
    narrow: MediaQueryModel,
    helpOpen: Schema.Boolean,
  })
  type Model = typeof Model.Type
  const Message = defineMessageUnion({
    GotDarkMessage: { message: MediaQueryMessage },
    GotNarrowMessage: { message: MediaQueryMessage },
    ClickedHelp: {},
  })
  type Message = typeof Message.Type

  // 1. init: each child's Model, and its Commands lifted
  const init = (): Update.Return<Model, Message> => {
    const dark = initMediaQuery()
    const narrow = initMediaQuery()
    return {
      model: { dark: dark.model, narrow: narrow.model, helpOpen: false },
      commands: [
        ...Command.mapMessages(dark.commands, message => Message.GotDarkMessage({ message })),
        ...Command.mapMessages(narrow.commands, message => Message.GotNarrowMessage({ message })),
      ],
    }
  }

  // 2. update: one fold per placement, and a route to each
  const foldDark = Update.foldChild({
    update: updateMediaQuery,
    read: (model: Model) => Option.some(model.dark),
    write: (model: Model, dark: MediaQueryModel) => ({ ...model, dark }),
    toParentMessage: (message: MediaQueryMessage): Message => Message.GotDarkMessage({ message }),
  })
  const foldNarrow = Update.foldChild({
    update: updateMediaQuery,
    read: (model: Model) => Option.some(model.narrow),
    write: (model: Model, narrow: MediaQueryModel) => ({ ...model, narrow }),
    toParentMessage: (message: MediaQueryMessage): Message => Message.GotNarrowMessage({ message }),
  })
  const update = (model: Model, message: Message) =>
    Message.match<Update.Return<Model, Message>>(message, {
      GotDarkMessage: ({ message }) => foldDark(model, message),
      GotNarrowMessage: ({ message }) => foldNarrow(model, message),
      ClickedHelp: () => ({ model: { ...model, helpOpen: !model.helpOpen } }),
    })

  // 3. subscriptions: one lift per placement, renamed so the keys do not collide
  const dark = Subscription.lift(mediaQuerySubscriptions('(prefers-color-scheme: dark)'))({
    read: (model: Model) => Option.some(model.dark),
    toParentMessage: (message: MediaQueryMessage): Message => Message.GotDarkMessage({ message }),
  })
  const narrow = Subscription.lift(mediaQuerySubscriptions('(max-width: 40rem)'))({
    read: (model: Model) => Option.some(model.narrow),
    toParentMessage: (message: MediaQueryMessage): Message => Message.GotNarrowMessage({ message }),
  })
  const subscriptions = { darkChanges: dark.changes, narrowChanges: narrow.changes }

  void init
  void update
  void subscriptions
}

// --- With a Bundle ---

{
  const MediaQueryModel = Schema.Struct({ matches: Schema.Boolean })
  type MediaQueryModel = typeof MediaQueryModel.Type
  const MediaQueryMessage = defineMessageUnion({ Changed: { matches: Schema.Boolean } })
  type MediaQueryMessage = typeof MediaQueryMessage.Type

  const MediaQuery = Bundle.make('MediaQuery', {
    Model: MediaQueryModel,
    Message: MediaQueryMessage,
    args: Schema.Struct({ query: Schema.String }),
    init: () => ({ model: { matches: false } }),
    update: (_model, message) => ({ model: { matches: message.matches } }),
    subscriptions: ({ query }) =>
      Subscription.make<MediaQueryModel, MediaQueryMessage>()(() => ({
        changes: Subscription.persistentEntry(
          Stream.map(matchMediaChanges(query), matches => MediaQueryMessage.Changed({ matches })),
        ),
      })),
  })

  const Page = Bundle.compose({ helpOpen: Schema.Boolean }).pipe(
    Bundle.withMessages({ ClickedHelp: {} }),
    Bundle.withChild('dark', MediaQuery, { args: { query: '(prefers-color-scheme: dark)' } }),
    Bundle.withChild('narrow', MediaQuery, { args: { query: '(max-width: 40rem)' } }),
  )
  type Model = typeof Page.Model.Type
  type Message = typeof Page.Message.Type
  const { placements } = Page

  const config = placements.complete({
    init: () => placements.initial({ helpOpen: false }),
    update: placements.update(model => ({ model: { ...model, helpOpen: !model.helpOpen } })),
    subscriptions: placements.subscriptions(),
    view: (model: Model, h: HtmlBuilder<Message>) =>
      h.button(
        [h.OnClick(Page.Message.ClickedHelp())],
        [model.dark.matches ? 'Help (dark)' : 'Help'],
      ),
  })

  void config
}
