/**
 * A counter bundle that uses every part: args, an init Command, an
 * OutMessage, a Subscription, a Managed Resource, a view, and a helper.
 */
import { Effect, Option, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as ManagedResource from 'foldkit/managedResource'
import * as Submodel from 'foldkit/submodel'
import * as Subscription from 'foldkit/subscription'
import { Bundle } from '../src/index.js'

export const CounterModel = Schema.Struct({ count: Schema.Number, running: Schema.Boolean })
export type CounterModel = typeof CounterModel.Type

export const CounterMessage = defineMessageUnion({
  Incremented: {},
  Started: {},
  Stopped: {},
  Opened: { url: Schema.String },
  Closed: {},
  Failed: {},
})
export type CounterMessage = typeof CounterMessage.Type

export const LimitReached = Schema.TaggedStruct('LimitReached', { count: Schema.Number })
export type LimitReached = typeof LimitReached.Type

export const Socket = ManagedResource.tag<string>()('counter-socket')

export interface CounterArgs {
  readonly limit: number
  readonly start: number
}

export const Counter = Bundle.make({
  name: 'Counter',
  Model: CounterModel,
  Message: CounterMessage,
  init: ({ start }: CounterArgs) => ({
    model: { count: start, running: false },
    commands: [{ name: 'Warm', effect: Effect.succeed(CounterMessage.Started()) }],
  }),
  update: (model, message, { limit }) => {
    switch (message._tag) {
      case 'Incremented': {
        const count = model.count + 1
        const next = { ...model, count }
        return count === limit
          ? { model: next, outMessage: LimitReached.make({ count }) }
          : { model: next }
      }
      case 'Started':
        return { model: { ...model, running: true } }
      case 'Stopped':
        return { model: { ...model, running: false } }
      case 'Opened':
      case 'Closed':
      case 'Failed':
        return { model }
    }
  },
  subscriptions: () =>
    Subscription.make<CounterModel, CounterMessage>()(entry => ({
      ticks: entry(
        { running: Schema.Boolean },
        {
          modelToDependencies: model => ({ running: model.running }),
          dependenciesToStream: ({ running }) =>
            running ? Stream.make(CounterMessage.Incremented()) : Stream.empty,
        },
      ),
    })),
  resources: ({ limit }) =>
    ManagedResource.make<CounterModel, CounterMessage>()(entry => ({
      socket: entry(Schema.Option(Schema.String), {
        resource: Socket,
        modelToMaybeRequirements: model =>
          model.running ? Option.some(`ws://counter/${limit}`) : Option.none(),
        acquire: url => Effect.succeed(url),
        release: () => Effect.void,
        onAcquired: url => CounterMessage.Opened({ url }),
        onReleased: () => CounterMessage.Closed(),
        onAcquireError: () => CounterMessage.Failed(),
      }),
    })),
  view: Submodel.defineView<CounterModel, CounterMessage>((model, h) =>
    h.button([h.Class('counter'), h.OnClick(CounterMessage.Incremented())], [String(model.count)]),
  ),
  helpers: {
    reset: (model: CounterModel, to: number) => ({ model: { ...model, count: to } }),
  },
})
