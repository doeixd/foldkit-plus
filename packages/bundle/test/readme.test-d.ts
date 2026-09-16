/**
 * The examples from this package's README, type-checked so the documentation
 * cannot drift from the API. Sections follow the README's headings.
 */
import * as Tabs from '@foldkit/ui/tabs'
import { Schema, Stream } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import type * as Update from 'foldkit/update'
import { Bundle, Link } from '../src/index.js'

declare const matchMediaChanges: (query: string) => Stream.Stream<boolean>

// --- Sixty seconds: define once ---

const MediaQueryModel = Schema.Struct({ matches: Schema.Boolean })
type MediaQueryModel = typeof MediaQueryModel.Type
const MediaQueryMessage = defineMessageUnion({ Changed: { matches: Schema.Boolean } })
type MediaQueryMessage = typeof MediaQueryMessage.Type

export const MediaQuery = Bundle.make('MediaQuery', {
  Model: MediaQueryModel,
  Message: MediaQueryMessage,
  args: Schema.Struct({ query: Schema.String }),
  init: () => ({ model: { matches: false } }),
  update: (_model, message) => ({ model: { matches: message.matches } }),
  subscriptions: ({ query }) =>
    Subscription.make<MediaQueryModel, MediaQueryMessage>()(() => ({
      changes: Subscription.persistent(
        Stream.map(matchMediaChanges(query), matches => MediaQueryMessage.Changed({ matches })),
      ),
    })),
})

// --- Sixty seconds: place it, twice ---

const Dark = Bundle.declare(MediaQuery, 'dark') // wrapper GotDarkMessage
const Narrow = Bundle.declare(MediaQuery, 'narrow') // wrapper GotNarrowMessage

const Model = Schema.Struct({ ...Dark.fields, ...Narrow.fields, helpOpen: Schema.Boolean })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Dark.cases, ...Narrow.cases, ClickedHelp: {} })
type Message = typeof Message.Type

const Page = Bundle.parent({ Model, Message })

const placements = Page.assemble(
  Page.at(Dark, { args: { query: '(prefers-color-scheme: dark)' } }),
  Page.at(Narrow, { args: { query: '(max-width: 40rem)' } }),
)

// --- Sixty seconds: wire it once ---

const ownUpdate = (model: Model, message: Message) =>
  message._tag === 'ClickedHelp' ? { model: { ...model, helpOpen: true } } : { model }

declare const view: (model: Model, h: HtmlBuilder<Message>) => Html

export const config = placements.complete({
  init: () => placements.initial({ helpOpen: false }),
  update: placements.update(ownUpdate),
  view,
  subscriptions: placements.subscriptions(),
})

// --- Args, OutMessages, and helpers ---

const CounterModel = Schema.Struct({ count: Schema.Number })
type CounterModel = typeof CounterModel.Type
const CounterMessage = defineMessageUnion({ Clicked: {} })
const LimitReached = Schema.TaggedStruct('LimitReached', { count: Schema.Number })

const Counter = Bundle.make('Counter', {
  Model: CounterModel,
  Message: CounterMessage,
  args: Schema.Struct({ limit: Schema.Number }),
  init: () => ({ model: { count: 0 } }),
  update: (model, _message, { limit }) => {
    const count = model.count + 1
    return count === limit
      ? { model: { count }, outMessage: LimitReached.make({ count }) }
      : { model: { count } }
  },
  helpers: {
    reset: (model: CounterModel, to: number) => ({ model: { ...model, count: to } }),
  },
})

const Clicks = Bundle.declare(Counter, 'clicks')
const CounterPage = Bundle.parent({
  Model: Schema.Struct({ ...Clicks.fields, reached: Schema.Number }),
  Message: defineMessageUnion({ ...Clicks.cases }),
})

const ClicksPlaced = CounterPage.at(Clicks, {
  args: { limit: 10 },
  onOut: outMessage => model => ({ model: { ...model, reached: outMessage.count } }),
})

export const reset = ClicksPlaced.helpers.reset(0) // an Update.Step of the parent

export const Quiet = CounterPage.at(Clicks, { args: { limit: 10 }, onOut: Bundle.ignore })

// --- Presets ---

export const PrefersDark = MediaQuery.with({ query: '(prefers-color-scheme: dark)' })
export const DarkPlaced = Page.place(PrefersDark, 'dark') // no args to give

// --- Many of one: collections ---

const RowModel = Schema.Struct({ id: Schema.String, count: Schema.Number })
const RowMessage = defineMessageUnion({ Clicked: {} })

const Row = Bundle.make('Row', {
  Model: RowModel,
  Message: RowMessage,
  init: () => ({ model: { id: '', count: 0 } }),
  update: model => ({ model: { ...model, count: model.count + 1 } }),
})

const RowsDeclared = Bundle.declareEach(Row, 'rows')
const RowsPage = Bundle.parent({
  Model: Schema.Struct({ ...RowsDeclared.fields }),
  Message: defineMessageUnion({ ...RowsDeclared.cases }),
})
const Rows = RowsPage.each(RowsDeclared)

export const addRow = Rows.add('b', row => ({ ...row, id: 'b' })) // init, then prepare
export const removeRow = Rows.remove('b')

// --- Many of one: typed keys and order ---

const RowId = Schema.String.pipe(Schema.brand('RowId'))
const OrderedRowModel = Schema.Struct({ id: RowId, count: Schema.Number })
const OrderedRow = Bundle.make('OrderedRow', {
  Model: OrderedRowModel,
  Message: RowMessage,
  init: () => ({ model: { id: RowId.make(''), count: 0 } }),
  update: model => ({ model: { ...model, count: model.count + 1 } }),
})
const GotOrderedRowMessage = Link.keyedWrapper('GotOrderedRowMessage', RowMessage, RowId)
const OrderedPage = Bundle.parent({
  Model: Schema.Struct({ rows: Schema.Array(OrderedRowModel) }),
  Message: defineMessageUnion({ ...GotOrderedRowMessage.cases }),
})

export const OrderedRows = OrderedRow.each(
  OrderedPage.link.collectionById('rows', GotOrderedRowMessage, { id: row => row.id }),
)
export const removeFirst = OrderedRows.remove(RowId.make('first')) // a RowId, not a string

// --- Components with separate parts ---

type Section = 'general' | 'billing'

const SectionTabs = Bundle.fromParts('SectionTabs', {
  Model: Tabs.Model,
  Message: Tabs.Message,
  init: (config: Tabs.InitConfig) => Tabs.init(config),
  parts: Tabs.create<Section>(),
})

const TabsDeclared = Bundle.declare(SectionTabs, 'tabs')
const TabsPage = Bundle.parent({
  Model: Schema.Struct({
    ...TabsDeclared.fields,
    section: Schema.Literals(['general', 'billing']),
  }),
  Message: defineMessageUnion({ ...TabsDeclared.cases }),
})
const TabsPlaced = TabsPage.at(TabsDeclared, {
  args: { id: 'sections' },
  onOut: selected => model => ({ model: { ...model, section: selected.value } }),
})
export const tabsKey = TabsPlaced.key

// --- Extending a bundle ---

export const LoggedCounter = Counter.pipe(
  Bundle.rename('LoggedCounter'),
  Bundle.mapUpdate(update => (model, message, args) => {
    console.log(message._tag)
    return update(model, message, args)
  }),
  Bundle.withHelpers({ clear: (model: CounterModel) => ({ model: { ...model, count: 0 } }) }),
)

// --- Gates and custom Links ---

export const Gated = Page.place(MediaQuery, 'narrow', {
  args: { query: '(max-width: 40rem)' },
  when: model => !model.helpOpen,
})

const GotSidebarMessage = Link.wrapper('GotSidebarMessage', MediaQueryMessage)
const SidebarPage = Bundle.parent({
  Model: Schema.Struct({ sidebar: MediaQueryModel, open: Schema.Boolean }),
  Message: defineMessageUnion({ ...GotSidebarMessage.cases }),
})
export const Sidebar = MediaQuery.at(
  SidebarPage.link
    .field('sidebar', GotSidebarMessage)
    .pipe(Link.when((model: typeof SidebarPage.Model.Type) => model.open)),
  { args: { query: '(min-width: 60rem)' } },
)

// --- Services ---

interface Clock {
  readonly now: () => number
}
declare const clockUpdate: (model: Model, message: Message) => Update.Return<Model, Message, Clock>
export const withClock = Page.withServices<Clock>()
  .assemble(Page.at(Dark, { args: { query: '(prefers-color-scheme: dark)' } }))
  .update(clockUpdate)
