/**
 * The examples from this package's README, type-checked so the documentation
 * cannot drift from the API.
 */
import { Option, Schema, Stream } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import { Bundle, Link } from '../src/index.js'
import { Counter, CounterMessage, CounterModel } from './fixture.js'

declare const matchMediaChanges: (query: string) => Stream.Stream<boolean>

// --- Sixty seconds: define once ---

const MediaQueryModel = Schema.Struct({ matches: Schema.Boolean })
type MediaQueryModel = typeof MediaQueryModel.Type
const MediaQueryMessage = defineMessageUnion({ Changed: { matches: Schema.Boolean } })
type MediaQueryMessage = typeof MediaQueryMessage.Type

export const MediaQuery = Bundle.make('MediaQuery', {
  Model: MediaQueryModel,
  Message: MediaQueryMessage,
  init: (_: { readonly query: string }) => ({ model: { matches: false } }),
  update: (_model, message) => ({ model: { matches: message.matches } }),
  subscriptions: ({ query }) =>
    Subscription.make<MediaQueryModel, MediaQueryMessage>()(() => ({
      changes: Subscription.persistent(
        Stream.map(matchMediaChanges(query), matches => MediaQueryMessage.Changed({ matches })),
      ),
    })),
})

// --- Place it, twice ---

const GotDarkMessage = Link.wrapper('GotDarkMessage', MediaQueryMessage)
const GotNarrowMessage = Link.wrapper('GotNarrowMessage', MediaQueryMessage)

const Model = Schema.Struct({ dark: MediaQueryModel, narrow: MediaQueryModel })
type Model = typeof Model.Type

const Message = defineMessageUnion({
  ClickedHelp: {},
  ...GotDarkMessage.cases,
  ...GotNarrowMessage.cases,
})
type Message = typeof Message.Type

const Dark = MediaQuery.at(Link.field<Model>()('dark', GotDarkMessage), {
  args: { query: '(prefers-color-scheme: dark)' },
})
const Narrow = MediaQuery.at(Link.field<Model>()('narrow', GotNarrowMessage), {
  args: { query: '(max-width: 40rem)' },
})

const placements = Bundle.assemble<Model, Message>()([Dark, Narrow])

// --- Wire the assembly once ---

const empty = { matches: false }
const init = () => placements.init({ dark: empty, narrow: empty })

const update = placements.update()

const view = (model: Model, h: HtmlBuilder<Message>) =>
  h.main([], [model.dark.matches ? 'dark' : 'light', model.narrow.matches ? ' · narrow' : ''])

export const config = placements.complete({
  init,
  update,
  view,
  subscriptions: placements.subscriptions(),
})

// --- Args, OutMessages, and helpers ---

const GotLeftMessage = Link.wrapper('GotLeftMessage', CounterMessage)
const CounterParent = Schema.Struct({ left: CounterModel, reached: Schema.Number })
type CounterParent = typeof CounterParent.Type

const Left = Counter.at(Link.field<CounterParent>()('left', GotLeftMessage), {
  args: { limit: 2, start: 0 },
  onOut: outMessage => model => ({ model: { ...model, reached: outMessage.count } }),
})

export const reset = Left.helpers.reset(7)

// --- Many of one: collections ---

const RowModel = Schema.Struct({ id: Schema.String, count: Schema.Number })
const RowMessage = defineMessageUnion({ Clicked: {} })

const Row = Bundle.make('Row', {
  Model: RowModel,
  Message: RowMessage,
  init: () => ({ model: { id: '', count: 0 } }),
  update: model => ({ model: { ...model, count: model.count + 1 } }),
})

const GotRowMessage = Link.keyedWrapper('GotRowMessage', RowMessage)
const RowsModel = Schema.Struct({ rows: Schema.Record(Schema.String, RowModel) })
type RowsModel = typeof RowsModel.Type

const Rows = Row.each(Link.collection<RowsModel>()('rows', GotRowMessage))

export const addRow = Rows.add('b', row => ({ ...row, id: 'b' }))
export const removeRow = Rows.remove('b')

// --- Shorter: one declaration per placement ---

const DarkDeclared = Bundle.declare(MediaQuery, 'dark') // wrapper GotDarkMessage

const DeclaredModel = Schema.Struct({ ...DarkDeclared.fields, title: Schema.String })
type DeclaredModel = typeof DeclaredModel.Type
export const DeclaredMessage = defineMessageUnion({ ...DarkDeclared.cases, ClickedHelp: {} })

export const DarkPlaced = DarkDeclared.at<DeclaredModel>()({
  args: { query: '(prefers-color-scheme: dark)' },
})
export const RowsDeclared = Bundle.declareEach(Row, 'rows')
