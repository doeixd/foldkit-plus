/**
 * `Bundle.make(name, spec)` infers exactly what `Bundle.make({ name, ... })`
 * does, and a name given twice is an error.
 */
import * as Tabs from '@foldkit/ui/tabs'
import { Effect, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { expectTypeOf } from 'vitest'
import { Bundle } from '../src/index.js'

const Model = Schema.Struct({ count: Schema.Number })
const Message = defineMessageUnion({ Incremented: {}, Reset: { to: Schema.Number } })
const Done = Schema.TaggedStruct('Done', { count: Schema.Number })

const spec = {
  Model,
  Message,
  init: ({ start }: { readonly start: number }) => ({
    model: { count: start },
    commands: [{ name: 'Hello', effect: Effect.succeed(Message.Incremented()) }],
  }),
  helpers: {
    set: (model: { readonly count: number }, count: number) => ({ model: { ...model, count } }),
  },
}

const NameFirst = Bundle.make('Counter', {
  ...spec,
  update: (model, message, { start }) =>
    message._tag === 'Reset'
      ? { model: { count: message.to + start }, outMessage: Done.make({ count: message.to }) }
      : { model: { count: model.count + 1 } },
})
const InSpec = Bundle.make({
  name: 'Counter',
  ...spec,
  update: (model, message, { start }) =>
    message._tag === 'Reset'
      ? { model: { count: message.to + start }, outMessage: Done.make({ count: message.to }) }
      : { model: { count: model.count + 1 } },
})

expectTypeOf(NameFirst).toEqualTypeOf(InSpec)
expectTypeOf(NameFirst.name).toEqualTypeOf<'Counter'>()

// @ts-expect-error: the name is given once
Bundle.make('Counter', { ...spec, name: 'Other', update: model => ({ model }) })

const PartsFirst = Bundle.fromParts('SectionTabs', {
  Model: Tabs.Model,
  Message: Tabs.Message,
  init: (config: Tabs.InitConfig) => Tabs.init(config),
  parts: Tabs.create<'a' | 'b'>(),
})
const PartsInConfig = Bundle.fromParts({
  name: 'SectionTabs',
  Model: Tabs.Model,
  Message: Tabs.Message,
  init: (config: Tabs.InitConfig) => Tabs.init(config),
  parts: Tabs.create<'a' | 'b'>(),
})
expectTypeOf(PartsFirst).toEqualTypeOf(PartsInConfig)
