/**
 * What a placement infers, and where a wiring mistake is reported.
 */
import { Effect, Option, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as ManagedResource from 'foldkit/managedResource'
import { defineMessageUnion } from 'foldkit/message'
import { ManagedResource as SceneResource } from 'foldkit/scene'
import * as Submodel from 'foldkit/submodel'
import type * as Update from 'foldkit/update'
import { expectTypeOf } from 'vitest'
import { Bundle, Link, type Wrapped } from '../src/index.js'
import {
  Counter,
  CounterMessage,
  CounterModel,
  type CounterArgs,
  type LimitReached,
} from './fixture.js'

const GotCounter = Link.wrapper('GotCounterMessage', CounterMessage)
const Model = Schema.Struct({ counter: CounterModel, title: Schema.String })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Renamed: { title: Schema.String }, ...GotCounter.cases })
type Message = typeof Message.Type

const link = Link.field<Model>()('counter', GotCounter)

// The bundle infers its args and OutMessage from `init` and `update`.
expectTypeOf(Counter.init).parameter(0).toEqualTypeOf<CounterArgs>()
expectTypeOf(Counter.update).returns.toEqualTypeOf<
  Update.ReturnWithOutMessage<CounterModel, CounterMessage, LimitReached, never>
>()

// Args are required, and so is `onOut` when the bundle has an OutMessage.
// @ts-expect-error: config with args and onOut is required
Counter.at(link)
// @ts-expect-error: `onOut` is required, so the OutMessage cannot be dropped by omission
Counter.at(link, { args: { limit: 3, start: 0 } })
// @ts-expect-error: `args` must match the bundle's init
Counter.at(link, { args: { limit: 'x', start: 0 }, onOut: () => model => ({ model }) })

const placed = Counter.at(link, {
  args: { limit: 3, start: 0 },
  onOut: (outMessage, { liftCommand }) => {
    expectTypeOf(outMessage).toEqualTypeOf<LimitReached>()
    expectTypeOf(liftCommand).parameter(0).toExtend<{ readonly name: string }>()
    return (model: Model): Update.Return<Model, Message> => ({ model: { ...model, title: 'done' } })
  },
})

// The placement's update and init are in parent terms.
expectTypeOf(placed.update).returns.toEqualTypeOf<
  Option.Option<Update.Return<Model, Message, never>>
>()
expectTypeOf(placed.init).toEqualTypeOf<Update.Step<Model, Message, never>>()

// Helpers keep their input types and lose the child Model parameter.
expectTypeOf(placed.helpers.reset).toEqualTypeOf<
  (to: number) => Update.Step<Model, Message, never>
>()
// @ts-expect-error: helpers take the declared input
placed.helpers.reset('7')

// A view in a parent whose Message union includes the wrapper variant is fine.
declare const h: HtmlBuilder<Message>
placed.view({ counter: { count: 0, running: false }, title: '' }, h)

// A parent Message union missing the variant is reported at the view call.
const Unwired = defineMessageUnion({ Renamed: { title: Schema.String } })
declare const unwired: HtmlBuilder<typeof Unwired.Type>
// @ts-expect-error: the parent Message does not include GotCounterMessage
placed.view({ counter: { count: 0, running: false }, title: '' }, unwired)

// A link to a child of another type is rejected at `at`.
const Other = Schema.Struct({ counter: Schema.String })
const otherLink = Link.field<typeof Other.Type>()('counter', GotCounter)
// @ts-expect-error: the link reads a string, not a counter Model
Counter.at(otherLink, { args: { limit: 1, start: 0 }, onOut: () => model => ({ model }) })

// A bundle without args or OutMessage places with no config at all.
const Toggle = Bundle.make({
  name: 'Toggle',
  Model: Schema.Struct({ on: Schema.Boolean }),
  Message: defineMessageUnion({ Toggled: {} }),
  init: () => ({ model: { on: false } }),
  update: model => ({ model: { on: !model.on } }),
  view: Submodel.defineView<{ readonly on: boolean }, { readonly _tag: 'Toggled' }>((model, h) =>
    h.button([h.OnClick({ _tag: 'Toggled' })], [model.on ? 'on' : 'off']),
  ),
})
const GotToggle = Link.wrapper('GotToggleMessage', Toggle.Message)
const ToggleParent = Schema.Struct({ toggle: Toggle.Model })
const toggle = Toggle.at(Link.field<typeof ToggleParent.Type>()('toggle', GotToggle))
expectTypeOf(toggle.init).returns.toExtend<{ readonly model: typeof ToggleParent.Type }>()

// --- Collections ---

const GotItem = Link.keyedWrapper('GotItemMessage', CounterMessage)
const ToggleItems = Schema.Struct({ items: Schema.Record(Schema.String, Toggle.Model) })
const GotToggleItem = Link.keyedWrapper('GotToggleItemMessage', Toggle.Message)
const toggles = Toggle.each(Link.collection<typeof ToggleItems.Type>()('items', GotToggleItem))
expectTypeOf(toggles.add).toEqualTypeOf<
  (
    key: string,
    prepare?: (model: { readonly on: boolean }) => { readonly on: boolean },
  ) => Update.Step<typeof ToggleItems.Type, typeof GotToggleItem.Schema.Type, never>
>()

// A bundle with Managed Resources cannot be placed per key: items would share one resource tag.
const CounterItems = Schema.Struct({ items: Schema.Record(Schema.String, CounterModel) })
expectTypeOf(Counter.each).toExtend<{ readonly invalid: string }>()
// @ts-expect-error: Bundle.each does not support Managed Resources yet
Counter.each(Link.collection<typeof CounterItems.Type>()('items', GotItem), {})

// A collection link must point at a record field.
// @ts-expect-error: `title` is not a record of items
Link.collection<Model>()('title', GotItem)

// --- Bundle.declare ---

const DeclaredCounter = Bundle.declare(Counter, 'counter')
expectTypeOf(DeclaredCounter.wrapper.tag).toEqualTypeOf<'GotCounterMessage'>()
const declaredPlacement = DeclaredCounter.at<Model>()({
  args: { limit: 1, start: 0 },
  onOut: () => model => ({ model }),
})
// Its Messages are exactly the declared wrapper variant.
expectTypeOf(declaredPlacement.init).toEqualTypeOf<
  Update.Step<Model, Wrapped<'GotCounterMessage', CounterMessage>, never>
>()
// @ts-expect-error: `title` holds a string, not the bundle's Model
Bundle.declare(Counter, 'title').at<Model>()
// @ts-expect-error: args and onOut are still required
DeclaredCounter.at<Model>()()

// --- A placed resource keeps its onAcquired's parameters ---

// Counter's onAcquired reads the acquired value, so a scene must give one.
const counterSocket = placed.resources['Counter@counter/socket']!
SceneResource.acquire(counterSocket, 'ws://counter/3')
// @ts-expect-error: this onAcquired reads the acquired value
SceneResource.acquire(counterSocket)

const PingSocket = ManagedResource.tag<WebSocket>()('ping-socket')
const PingMessage = defineMessageUnion({ Connected: {}, Closed: {}, Failed: {} })
const Ping = Bundle.make('Ping', {
  Model: Schema.Struct({ on: Schema.Boolean }),
  Message: PingMessage,
  init: () => ({ model: { on: true } }),
  update: model => ({ model }),
  resources: () =>
    ManagedResource.make<{ readonly on: boolean }, typeof PingMessage.Type>()(entry => ({
      socket: entry(Schema.Option(Schema.Null), {
        resource: PingSocket,
        modelToMaybeRequirements: model => (model.on ? Option.some(null) : Option.none()),
        acquire: () => Effect.sync(() => new WebSocket('ws://ping')),
        release: socket => Effect.sync(() => socket.close()),
        onAcquired: () => PingMessage.Connected(),
        onReleased: () => PingMessage.Closed(),
        onAcquireError: () => PingMessage.Failed(),
      }),
    })),
})
const PingParent = Bundle.parent({
  Model: Schema.Struct({ ...Bundle.declare(Ping, 'ping').fields }),
  Message: defineMessageUnion({ ...Bundle.declare(Ping, 'ping').cases }),
})
const pingSocket = PingParent.place(Ping, 'ping').resources['Ping@ping/socket']!
// This onAcquired reads nothing, so a scene acquires without a stand-in socket.
SceneResource.acquire(pingSocket)
// @ts-expect-error: and refuses one
SceneResource.acquire(pingSocket, new WebSocket('ws://ping'))

// --- initial: which fields a Link's placement writes ---

const Titled = Schema.Struct({
  counter: CounterModel,
  maybe: Schema.Option(CounterModel),
  title: Schema.String,
})
type Titled = typeof Titled.Type
const GotMaybe = Link.wrapper('GotMaybeMessage', CounterMessage)
const TitledMessage = defineMessageUnion({
  Renamed: { title: Schema.String },
  ...GotCounter.cases,
  ...GotMaybe.cases,
})
type TitledMessage = typeof TitledMessage.Type
const config = { args: { limit: 1, start: 0 }, onOut: Bundle.ignore }

// A field Link names its field, so `initial` refuses it and requires the rest.
const byField = Bundle.assemble<Titled, TitledMessage>()([
  Counter.at(Link.field<Titled>()('counter', GotCounter), config),
])
byField.initial({ maybe: Option.none(), title: '' })
// @ts-expect-error: `title` is the parent's own
byField.initial({ maybe: Option.none() })
// @ts-expect-error: `counter` is written by its placement's init
byField.initial({ maybe: Option.none(), title: '', counter: { count: 0, running: false } })

// A custom Link with a one-segment path names that field, as `initial` reads it.
const byMake = Bundle.assemble<Titled, TitledMessage>()([
  Counter.at(
    Link.make({
      read: (parent: Titled) => Option.some(parent.counter),
      write: (parent: Titled, counter: CounterModel) => ({ ...parent, counter }),
      wrapper: GotCounter,
      path: ['counter'],
    }),
    config,
  ),
])
byMake.initial({ maybe: Option.none(), title: '' })
// @ts-expect-error: `title` is still required through a custom Link
byMake.initial({ maybe: Option.none() })

// An Option field may be given, to start the child absent, or left to its init.
const byOptional = Bundle.assemble<Titled, TitledMessage>()([
  Counter.at(Link.field<Titled>()('counter', GotCounter), config),
  Counter.at(Link.optional<Titled>()('maybe', GotMaybe), config),
])
byOptional.initial({ title: '' })
byOptional.initial({ title: '', maybe: Option.none() })
// @ts-expect-error: `title` is required
byOptional.initial({})

// A path the types cannot read leaves every field optional.
declare const somePath: ReadonlyArray<string>
const byUnknown = Bundle.assemble<Titled, TitledMessage>()([
  Counter.at(
    Link.make({
      read: (parent: Titled) => Option.some(parent.counter),
      write: (parent: Titled, counter: CounterModel) => ({ ...parent, counter }),
      wrapper: GotCounter,
      path: somePath,
    }),
    config,
  ),
])
byUnknown.initial({})

// --- onMessage, and what the parent's own update sees ---

const observed = Counter.at(Link.field<Titled>()('counter', GotCounter), {
  ...config,
  onMessage: message => {
    expectTypeOf(message).toEqualTypeOf<CounterMessage>()
    return model => ({ model: { ...model, title: message._tag } })
  },
})
Counter.at(Link.field<Titled>()('counter', GotCounter), {
  ...config,
  // @ts-expect-error: onMessage receives the child's Message
  onMessage: (message: string) => model => ({ model }),
})

const observing = Bundle.assemble<Titled, TitledMessage>()([
  observed,
  Counter.at(Link.optional<Titled>()('maybe', GotMaybe), config),
])
observing.update((model, message) => {
  // Every placement's wrapper is routed to it, so own sees only its own Messages.
  expectTypeOf(message).toEqualTypeOf<Extract<TitledMessage, { readonly _tag: 'Renamed' }>>()
  // @ts-expect-error: no wrapper reaches the parent's own update
  if (message._tag === 'GotCounterMessage') return { model }
  return { model: { ...model, title: message.title } }
})
// An own update over the whole union still fits.
declare const wholeUpdate: (
  model: Titled,
  message: TitledMessage,
) => Update.Return<Titled, TitledMessage>
observing.update(wholeUpdate)

// A composition's own update sees no wrapper either, and a configured
// onMessage's services reach the placement.
const Composed = Bundle.compose({ note: Schema.String }).pipe(
  Bundle.withMessages({ Cleared: {} }),
  Bundle.withChild('toggle', Toggle, {
    onMessage: () => model => ({ model: { ...model, note: 'toggled' } }),
  }),
)
type ComposedMessage = typeof Composed.Message.Type
Composed.placements.update((model, message) => {
  expectTypeOf(message).toEqualTypeOf<Extract<ComposedMessage, { readonly _tag: 'Cleared' }>>()
  return { model }
})

interface Clock {
  readonly now: number
}
const Unconfigured = Bundle.compose({ note: Schema.String }).pipe(
  Bundle.withChild('toggle', Toggle),
)
declare const clockStep: Update.Step<
  typeof Unconfigured.Model.Type,
  typeof Unconfigured.Message.Type,
  Clock
>
const Clocked = Unconfigured.pipe(Bundle.configure('toggle', { onMessage: () => clockStep }))
type StepRequirements<S> = S extends Update.Step<any, any, infer R> ? R : never
expectTypeOf<StepRequirements<typeof Clocked.children.toggle.init>>().toEqualTypeOf<Clock>()

// --- Link.child ---

const PageModel = Schema.Struct({ count: Schema.Number })
type PageModel = typeof PageModel.Type
const PageMessage = defineMessageUnion({ Incremented: {} })
type PageMessage = typeof PageMessage.Type
const GotPage = Link.wrapper('GotPageMessage', PageMessage)
const Paged = Schema.Struct({ page: PageModel })
type Paged = typeof Paged.Type
const PagedMessage = defineMessageUnion({ ...GotPage.cases })
type PagedMessage = typeof PagedMessage.Type

const pageUpdate = (
  model: PageModel,
  message: PageMessage,
): Update.Return<PageModel, PageMessage> =>
  message._tag === 'Incremented' ? { model: { ...model, count: model.count + 1 } } : { model }

const page = Link.child(
  Link.field<Paged>()('page', GotPage),
  pageUpdate,
  (model, h) => h.button([h.OnClick(PageMessage.Incremented())], [String(model.count)]),
  'page',
)

// The fold takes the child's Message and returns the parent's update shape.
expectTypeOf(page.update).parameter(1).toEqualTypeOf<PageMessage>()
expectTypeOf(page.update).returns.toEqualTypeOf<
  Update.Return<Paged, Wrapped<'GotPageMessage', PageMessage>, never>
>()

// A view in a parent whose Message union includes the wrapper variant is fine.
declare const pagedH: HtmlBuilder<PagedMessage>
page.view({ page: { count: 0 } }, pagedH)

// A parent Message union missing the variant is reported at the view call.
const PageLess = defineMessageUnion({ Renamed: { title: Schema.String } })
declare const pagelessH: HtmlBuilder<typeof PageLess.Type>
// @ts-expect-error: the parent Message does not include GotPageMessage
page.view({ page: { count: 0 } }, pagelessH)
