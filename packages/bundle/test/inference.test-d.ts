/**
 * A bundle's Model and Message come from its Schemas alone, and its services
 * from every part that runs Commands (#334, #335), with no explicit generics.
 */
import * as Tabs from '@foldkit/ui/tabs'
import { Context, Effect, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { expectTypeOf } from 'vitest'
import { Bundle } from '../src/index.js'

type Parts<B> = Bundle.BundleParts<B>

const Model = Schema.Struct({
  status: Schema.Literals(['idle', 'busy']),
  heights: Schema.Record(Schema.String, Schema.Number),
  keys: Schema.Array(Schema.String),
})
type Model = typeof Model.Type
const Message = defineMessageUnion({ Measured: { key: Schema.String } })
type Message = typeof Message.Type

class Clock extends Context.Service<Clock, { readonly now: Effect.Effect<number> }>()('Clock') {}
class Rng extends Context.Service<Rng, { readonly next: Effect.Effect<number> }>()('Rng') {}

const needsClock = Effect.gen(function* () {
  yield* Clock
  return Message.Measured({ key: 'clock' })
})
const needsRng = Effect.gen(function* () {
  yield* Rng
  return Message.Measured({ key: 'rng' })
})

// #334: empty containers and literal fields in `init` take the Schema's types.
const Inline = Bundle.make('Inline', {
  Model,
  Message,
  init: () => ({ model: { status: 'idle', heights: {}, keys: [] } }),
  update: model => ({ model }),
})
expectTypeOf<Parts<typeof Inline>['Model']>().toEqualTypeOf<Model>()
expectTypeOf<Parts<typeof Inline>['Message']>().toEqualTypeOf<Message>()
expectTypeOf<Parts<typeof Inline>['R']>().toEqualTypeOf<never>()

// The same spec built apart from the call: nothing gives `init` a literal
// there, so only the empty containers can be left to the Schema.
const hoisted = {
  Model,
  Message,
  init: () => ({ model: { status: 'busy' as const, heights: {}, keys: [] } }),
  update: (model: Model) => ({ model }),
}
const Hoisted = Bundle.make('Hoisted', hoisted)
expectTypeOf<Parts<typeof Hoisted>['Model']>().toEqualTypeOf<Model>()

Bundle.make('Wrong', {
  Model,
  Message,
  // @ts-expect-error: 'gone' is no status the Schema allows
  init: () => ({ model: { status: 'gone', heights: {}, keys: [] } }),
  update: model => ({ model }),
})

Bundle.make('Missing', {
  Model,
  Message,
  // @ts-expect-error: `keys` is missing from the Model
  init: () => ({ model: { status: 'idle', heights: {} } }),
  update: model => ({ model }),
})

Bundle.make('WrongUpdate', {
  Model,
  Message,
  init: () => ({ model: { status: 'idle', heights: {}, keys: [] } }),
  // @ts-expect-error: a height is a number
  update: model => ({ model: { ...model, heights: { a: 'tall' } } }),
})

// A part whose declared Model is wider than the Schema's is refused, not
// taken as the Model.
type WideModel = {
  readonly status: string
  readonly heights: {}
  readonly keys: ReadonlyArray<string>
}
const wideUpdate = (model: WideModel): Update.Return<WideModel, Message> => ({ model })
Bundle.make('WideUpdate', {
  Model,
  Message,
  init: () => ({ model: { status: 'idle', heights: {}, keys: [] } }),
  // @ts-expect-error: `status` is any string, wider than the Schema's
  update: wideUpdate,
})
Bundle.make('WideInit', {
  Model,
  Message,
  init: (): Update.Return<WideModel, Message> => ({
    // @ts-expect-error: `status` is any string, wider than the Schema's
    model: { status: 'idle', heights: {}, keys: [] },
  }),
  update: model => ({ model }),
})

Bundle.fromParts('WideParts', {
  Model,
  Message,
  init: () => ({ status: 'idle', heights: {}, keys: [] }),
  // @ts-expect-error: `status` is any string, wider than the Schema's
  parts: { update: wideUpdate },
})

Bundle.make('WrongCommand', {
  Model,
  Message,
  init: () => ({
    model: { status: 'idle', heights: {}, keys: [] },
    // @ts-expect-error: a Command yields one of the bundle's Messages
    commands: [{ name: 'Other', effect: Effect.succeed({ _tag: 'Other' as const }) }],
  }),
  update: model => ({ model }),
})

// #335: `init`, `update` and each helper may need services of their own.
const Services = Bundle.make('Services', {
  Model,
  Message,
  init: () => ({
    model: { status: 'idle', heights: {}, keys: [] },
    commands: [{ name: 'Start', effect: needsClock }],
  }),
  update: model => ({ model, commands: [{ name: 'Roll', effect: needsRng }] }),
})
expectTypeOf<Parts<typeof Services>['R']>().toEqualTypeOf<Clock | Rng>()

const tick = (model: Model) => ({ model, commands: [{ name: 'Tick', effect: needsClock }] })
const HelperNeeds = Bundle.make('HelperNeeds', {
  Model,
  Message,
  init: () => ({ model: { status: 'idle', heights: {}, keys: [] } }),
  update: model => ({ model }),
  helpers: {
    tick,
    roll: (model: Model) => ({ model, commands: [{ name: 'Roll', effect: needsRng }] }),
    reset: (model: Model) => ({ model: { ...model, heights: {} } }),
  },
})
expectTypeOf<Parts<typeof HelperNeeds>['R']>().toEqualTypeOf<Clock | Rng>()

// A bundle's services are not lost: one needing `Clock` is not one needing nothing.
// @ts-expect-error: the helper's `Clock` is part of the bundle's services
expectTypeOf<Parts<typeof HelperNeeds>['R']>().toEqualTypeOf<Rng>()

Bundle.make('WrongHelper', {
  Model,
  Message,
  init: () => ({ model: { status: 'idle', heights: {}, keys: [] } }),
  update: model => ({ model }),
  helpers: {
    // @ts-expect-error: a helper returns the bundle's Model
    clear: (model: Model) => ({ model: { ...model, keys: 'none' } }),
  },
})

// `withHelpers` adds its helpers' services.
const Extended = Inline.pipe(Bundle.withHelpers({ tick }))
expectTypeOf<Parts<typeof Extended>['R']>().toEqualTypeOf<Clock>()

// `fromParts` takes its Model from the Schema too, and its services from its helpers.
const SectionTabs = Bundle.fromParts('SectionTabs', {
  Model: Tabs.Model,
  Message: Tabs.Message,
  init: (config: Tabs.InitConfig) => Tabs.init(config),
  parts: Tabs.create<'a' | 'b'>(),
  helpers: {
    tick: (model: Tabs.Model) => ({
      model,
      commands: [
        {
          name: 'Tick',
          effect: Effect.gen(function* () {
            yield* Clock
            return Tabs.Message.FocusedTab({ index: 0 })
          }),
        },
      ],
    }),
  },
})
expectTypeOf<Parts<typeof SectionTabs>['Model']>().toEqualTypeOf<Tabs.Model>()
expectTypeOf<Parts<typeof SectionTabs>['R']>().toEqualTypeOf<Clock>()

// `lazy`: the declaration's `init` and the loaded `update` each bring their own.
const Lazy = Bundle.lazy(
  {
    name: 'Lazy',
    Model,
    Message,
    init: () => ({
      model: { status: 'idle', heights: {}, keys: [] },
      commands: [{ name: 'Start', effect: needsClock }],
    }),
  },
  async () => ({
    update: (model: Model): Update.ReturnWithOutMessage<Model, Message, never, Rng> => ({
      model,
      commands: [{ name: 'Roll', effect: needsRng }],
    }),
  }),
)
expectTypeOf<Parts<typeof Lazy>['Model']>().toEqualTypeOf<Model>()
expectTypeOf<Parts<typeof Lazy>['R']>().toEqualTypeOf<Clock | Rng>()
