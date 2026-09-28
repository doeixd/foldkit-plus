/**
 * A Link folded into `Update.foldChildInit`, for a component that is not a
 * Bundle: the child's Model lands in its field, and its init Commands arrive
 * wrapped in the parent variant.
 */
import { Effect, Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as Update from 'foldkit/update'
import { describe, expect, it } from 'vitest'
import { Link } from '../src/index.js'
import { Counter, CounterMessage, CounterModel } from './fixture.js'

const Model = Schema.Struct({
  left: CounterModel,
  maybe: Schema.Option(CounterModel),
  enabled: Schema.Boolean,
})
type Model = typeof Model.Type

const Message = defineMessageUnion({
  Noop: {},
  GotLeftMessage: { message: CounterMessage },
  GotMaybeMessage: { message: CounterMessage },
})
type Message = typeof Message.Type

const GotLeft = Link.wrapper(Message.GotLeftMessage)
const GotMaybe = Link.wrapper(Message.GotMaybeMessage)
const left = Link.field<Model>()('left', GotLeft)
const maybe = Link.optional<Model>()('maybe', GotMaybe)

const messagesOf = (result: Update.Return<Model, Message>) =>
  Effect.runSync(Effect.all((result.commands ?? []).map(command => command.effect)))

describe('Link.foldInit', () => {
  it('writes the child Model into its field and lifts the init Commands wrapped', () => {
    const result = Update.foldChildInit(
      Counter.init({ limit: 2, start: 10 }),
      Link.foldInit(left, { maybe: Option.none(), enabled: true }),
    )
    expect(result.model.left).toEqual({ count: 10, running: false })
    expect(result.model.enabled).toBe(true)
    expect(messagesOf(result)).toEqual([
      Message.GotLeftMessage({ message: CounterMessage.Started() }),
    ])
  })

  it('mounts an optional child as Some', () => {
    const result = Update.foldChildInit(
      Counter.init({ limit: 2, start: 0 }),
      Link.foldInit(maybe, {
        left: { count: 0, running: false },
        enabled: false,
      }),
    )
    expect(result.model.maybe).toEqual(Option.some({ count: 0, running: false }))
    expect(result.model.left).toEqual({ count: 0, running: false })
  })

  it('does not take the rest it was given, even for a write that mutates', () => {
    const mutating = Link.make({
      read: (parent: Model) => Option.some(parent.left),
      write: (parent: Model, child: CounterModel) => {
        // A `Link.make` write is allowed no such thing; the fold must not
        // hand it the caller's own rest.
        ;(parent as { -readonly [K in keyof Model]: Model[K] }).left = child
        return parent
      },
      wrapper: GotLeft,
      path: ['left'],
    })
    const rest = { maybe: Option.none() as Option.Option<CounterModel>, enabled: true }
    const result = Update.foldChildInit(
      Counter.init({ limit: 2, start: 10 }),
      Link.foldInit(mutating, rest),
    )
    expect(rest).toEqual({ maybe: Option.none(), enabled: true })
    expect(result.model.left).toEqual({ count: 10, running: false })
  })
})
