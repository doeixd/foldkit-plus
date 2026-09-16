/**
 * A placement against the same child wired by hand with Foldkit's lifts: one
 * Message script gives the same Models, Commands, and Subscription
 * dependencies.
 */
import { Effect, Option, Schema } from 'effect'
import * as Command from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import * as Update from 'foldkit/update'
import { describe, expect, it } from 'vitest'
import { Bundle, Link } from '../src/index.js'
import { Counter, CounterMessage, CounterModel, type LimitReached } from './fixture.js'

const GotCounter = Link.wrapper('GotCounterMessage', CounterMessage)
const Model = Schema.Struct({ counter: CounterModel, reached: Schema.Number })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Reset: {}, ...GotCounter.cases })
type Message = typeof Message.Type

const args = { limit: 2, start: 0 }
const onOut =
  (out: LimitReached): Update.Step<Model, Message> =>
  model => ({ model: { ...model, reached: out.count } })

// By hand: the wiring a placement replaces.
const byHand = {
  fold: Update.foldChild({
    update: (child: CounterModel, message: CounterMessage) => Counter.update(child, message, args),
    read: (model: Model) => Option.some(model.counter),
    write: (model: Model, counter: CounterModel) => ({ ...model, counter }),
    toParentMessage: (message: CounterMessage): Message => GotCounter.make(message),
    foldOutMessage: onOut,
  }),
  init: (model: Model): Update.Return<Model, Message> => {
    const initial = Counter.init(args)
    return {
      model: { ...model, counter: initial.model },
      commands: Command.mapMessages(initial.commands, GotCounter.make),
    }
  },
  subscriptions: Subscription.lift(Counter.subscriptions!(args))({
    toChildModel: (model: Model) => model.counter,
    toParentMessage: (message: CounterMessage): Message => GotCounter.make(message),
  }),
}

const placed = Counter.at(Link.field<Model>()('counter', GotCounter), { args, onOut })
const assembly = Bundle.assemble<Model, Message>()([placed])

const byHandUpdate = (model: Model, message: Message): Update.Return<Model, Message> =>
  message._tag === 'GotCounterMessage' ? byHand.fold(model, message.message) : { model }
const placedUpdate = (model: Model, message: Message): Update.Return<Model, Message> =>
  Option.getOrElse(assembly.update(model, message), () => ({ model }))

const commandMessages = (result: Update.Return<Model, Message>) =>
  Effect.runSync(Effect.all((result.commands ?? []).map(command => command.effect)))

const script: ReadonlyArray<Message> = [
  GotCounter.make(CounterMessage.Started()),
  GotCounter.make(CounterMessage.Incremented()),
  Message.Reset(),
  GotCounter.make(CounterMessage.Incremented()),
  GotCounter.make(CounterMessage.Stopped()),
  GotCounter.make(CounterMessage.Incremented()),
]

const trace = (
  init: (model: Model) => Update.Return<Model, Message>,
  update: (model: Model, message: Message) => Update.Return<Model, Message>,
  dependencies: (model: Model) => unknown,
) => {
  const start = init({ counter: { count: 99, running: true }, reached: 0 })
  const steps = [
    {
      model: start.model,
      messages: commandMessages(start),
      dependencies: dependencies(start.model),
    },
  ]
  let model = start.model
  for (const message of script) {
    const result = update(model, message)
    model = result.model
    steps.push({ model, messages: commandMessages(result), dependencies: dependencies(model) })
  }
  return steps
}

describe('parity with hand-wired lifts', () => {
  it('matches Models, Command Messages, and Subscription dependencies step by step', () => {
    const expected = trace(byHand.init, byHandUpdate, model =>
      byHand.subscriptions.ticks!.modelToDependencies(model),
    )
    const actual = trace(assembly.init, placedUpdate, model =>
      Option.getOrThrow(
        placed.subscriptions['Counter@counter/ticks']!.modelToDependencies(model).maybeDependencies,
      ),
    )
    expect(actual).toEqual(expected)
    expect(expected.at(-1)!.model).toEqual({ counter: { count: 3, running: false }, reached: 2 })
  })
})
