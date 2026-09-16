/**
 * What a placement infers, and where a wiring mistake is reported.
 */
import { Option, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Submodel from 'foldkit/submodel'
import type * as Update from 'foldkit/update'
import { expectTypeOf } from 'vitest'
import { Bundle, Link } from '../src/index.js'
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
