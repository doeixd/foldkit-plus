/**
 * `onMessage`: the parent observes a placement's Messages after the child has
 * handled them, and the parent's own update never sees the wrapper.
 */
import { Effect, Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { describe, expect, it } from 'vitest'
import { Bundle, Link } from '../src/index.js'
import { Counter, CounterMessage, CounterModel, type LimitReached } from './fixture.js'

const { resources: _resources, at: _at, each: _each, ...parts } = Counter
const Plain = Bundle.make({ ...parts, name: 'Plain' })

const GotCounter = Link.wrapper('GotCounterMessage', CounterMessage)
const GotItem = Link.keyedWrapper('GotItemMessage', CounterMessage)

const Model = Schema.Struct({
  counter: CounterModel,
  items: Schema.Record(Schema.String, CounterModel),
  log: Schema.Array(Schema.String),
})
type Model = typeof Model.Type
const Message = defineMessageUnion({
  ...GotCounter.cases,
  ...GotItem.cases,
  Noted: { text: Schema.String },
})
type Message = typeof Message.Type

const note =
  (text: string): Update.Step<Model, Message> =>
  model => ({ model: { ...model, log: [...model.log, text] } })

const initial: Model = { counter: { count: 0, running: false }, items: {}, log: [] }
const args = { limit: 1, start: 0 }

const counter = Plain.at(Link.field<Model>()('counter', GotCounter), {
  args,
  onOut: (out: LimitReached) => note(`out ${out.count}`),
  onMessage: message => model => ({
    model: { ...model, log: [...model.log, `saw ${message._tag} at ${model.counter.count}`] },
    commands: [{ name: 'Note', effect: Effect.succeed(Message.Noted({ text: message._tag })) }],
  }),
})

const items = Plain.each(Link.collection<Model>()('items', GotItem), {
  args,
  onOut: Bundle.ignore,
  onMessage: (message, key) => note(`${key} ${message._tag}`),
})

describe('onMessage', () => {
  it('runs after the child has handled the Message and after its onOut', () => {
    const result = Option.getOrThrow(
      counter.update(initial, GotCounter.make(CounterMessage.Incremented())),
    )
    expect(result.model.counter.count).toBe(1)
    expect(result.model.log).toEqual(['out 1', 'saw Incremented at 1'])
    expect(result.commands?.map(command => command.name)).toEqual(['Note'])
  })

  it('does not run for a helper or for another Message', () => {
    expect(counter.helpers.reset(5)(initial).model.log).toEqual([])
    expect(counter.update(initial, Message.Noted({ text: 'x' }))).toEqual(Option.none())
  })

  it('receives the key of a collection item', () => {
    const withItem = items.add('a')(initial).model
    const result = Option.getOrThrow(
      items.update(withItem, GotItem.make('a', CounterMessage.Started())),
    )
    expect(result.model.items['a']?.running).toBe(true)
    expect(result.model.log).toEqual(['a Started'])
  })
})

describe('assembly.update with onMessage', () => {
  const assembly = Bundle.assemble<Model, Message>()([counter, items])
  const seen: Array<string> = []
  const update = assembly.update((model, message) => {
    seen.push(message._tag)
    return { model }
  })

  it('folds the wrapper through the placement and gives own only its own Messages', () => {
    seen.length = 0
    const result = update(initial, GotCounter.make(CounterMessage.Incremented()))
    expect(result.model.log).toEqual(['out 1', 'saw Incremented at 1'])
    update(result.model, Message.Noted({ text: 'x' }))
    expect(seen).toEqual(['Noted'])
  })
})
