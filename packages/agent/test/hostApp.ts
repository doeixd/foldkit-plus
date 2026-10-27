/**
 * A small runnable application for the hosts: a Command that needs a
 * resource, a Subscription that follows the Model, and a Message that throws.
 */
import { Context, Effect, Layer, Schema, Stream } from 'effect'
import * as Command from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import type * as Update from 'foldkit/update'

export const Model = Schema.Struct({
  count: Schema.Number,
  saved: Schema.Array(Schema.String),
  ticking: Schema.Boolean,
  ticks: Schema.Number,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  Incremented: {},
  Noted: {},
  RequestedSave: { title: Schema.String },
  Saved: { title: Schema.String },
  ToggledTicking: {},
  Ticked: {},
  Exploded: {},
  RequestedInterruptible: {},
  RequestedDefect: {},
})
export type Message = typeof Message.Type

/** The resource the save Command needs: a server would give a database. */
export class Store extends Context.Service<
  Store,
  { readonly save: (title: string) => Effect.Effect<string> }
>()('test/Store') {}

export const initial: Model = { count: 0, saved: [], ticking: false, ticks: 0 }

const Save = Command.define('Save', {
  args: { title: Schema.String },
  messages: [Message.Saved],
  execute: ({ title }) =>
    Effect.gen(function* () {
      const store = yield* Store
      return Message.Saved({ title: yield* store.save(title) })
    }),
})

const Waits = Command.define('Waits', {
  messages: [Message.Noted],
  interrupt: true,
  execute: Effect.succeed(Message.Noted()),
})

const Dies = Command.define('Dies', {
  messages: [Message.Noted],
  execute: Effect.die(new Error('the Command died')),
})

export const update = (model: Model, message: Message): Update.Return<Model, Message, Store> =>
  Message.match(message, {
    Incremented: () => ({ model: { ...model, count: model.count + 1 } }),
    Noted: () => ({ model }),
    RequestedSave: ({ title }) => ({ model, commands: [Save({ title })] }),
    Saved: ({ title }) => ({ model: { ...model, saved: [...model.saved, title] } }),
    ToggledTicking: () => ({ model: { ...model, ticking: !model.ticking } }),
    Ticked: () => ({ model: { ...model, ticks: model.ticks + 1 } }),
    Exploded: () => {
      throw new Error('update exploded')
    },
    RequestedInterruptible: () => ({ model, commands: [Waits()] }),
    RequestedDefect: () => ({ model, commands: [Dies()] }),
  })

/**
 * Ticks three times whenever ticking starts. `starts` records the dependencies
 * of every start, so a restart the dependencies did not call for shows.
 */
export const tickerOf = (starts: Array<boolean> = []) =>
  Subscription.make<Model, Message, Store>()(entry => ({
    ticker: entry(
      { ticking: Schema.Boolean },
      {
        modelToDependencies: model => ({ ticking: model.ticking }),
        dependenciesToStream: ({ ticking }) => {
          starts.push(ticking)
          return ticking
            ? Stream.make(Message.Ticked(), Message.Ticked(), Message.Ticked())
            : Stream.empty
        },
      },
    ),
  }))

export const subscriptions = tickerOf()

/** A Store that records what it built and released, so a test can count both. */
export const recordingStore = () => {
  const events: Array<string> = []
  const layer = Layer.effect(
    Store,
    Effect.acquireRelease(
      Effect.sync(() => {
        events.push('built')
        return { save: (title: string) => Effect.succeed(title.toUpperCase()) }
      }),
      () => Effect.sync(() => events.push('released')),
    ),
  )
  return { events, layer }
}
