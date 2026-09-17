/**
 * One bundle placed twice in one parent, plus an optional and a nested
 * placement: routing, init, OutMessages, helpers, Subscriptions, resources.
 */
import { Effect, Option, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { describe, expect, it } from 'vitest'
import { Link } from '../src/index.js'
import {
  Counter,
  CounterMessage,
  CounterModel,
  type CounterArgs,
  type LimitReached,
} from './fixture.js'

const GotLeft = Link.wrapper('GotLeftMessage', CounterMessage)
const GotRight = Link.wrapper('GotRightMessage', CounterMessage)
const GotMaybe = Link.wrapper('GotMaybeMessage', CounterMessage)

const Model = Schema.Struct({
  left: CounterModel,
  right: CounterModel,
  maybe: Schema.Option(CounterModel),
  enabled: Schema.Boolean,
  reached: Schema.Array(Schema.String),
})
type Model = typeof Model.Type

const Message = defineMessageUnion({
  Noop: {},
  ...GotLeft.cases,
  ...GotRight.cases,
  ...GotMaybe.cases,
})
type Message = typeof Message.Type

const counter = { count: 0, running: false }
const initial: Model = {
  left: counter,
  right: counter,
  maybe: Option.none(),
  enabled: true,
  reached: [],
}

const args: CounterArgs = { limit: 2, start: 0 }
const recordLimit =
  (side: string) =>
  (out: LimitReached): Update.Step<Model, Message> =>
  model => ({ model: { ...model, reached: [...model.reached, `${side}:${out.count}`] } })

const Left = Counter.at(Link.field<Model>()('left', GotLeft, { when: model => model.enabled }), {
  args,
  onOut: recordLimit('left'),
})
const Right = Counter.at(Link.field<Model>()('right', GotRight), {
  args: { limit: 5, start: 10 },
  onOut: recordLimit('right'),
})
const Maybe = Counter.at(Link.optional<Model>()('maybe', GotMaybe), {
  args,
  onOut: recordLimit('maybe'),
})

const run = <A>(stream: Stream.Stream<A>) => Effect.runSync(Stream.runCollect(stream))
const messagesOf = (result: Update.Return<Model, Message>) =>
  Effect.runSync(Effect.all((result.commands ?? []).map(command => command.effect)))

describe('Link.wrapper', () => {
  it('round-trips a child Message through its parent variant and ignores other variants', () => {
    const wrapped = GotLeft.make(CounterMessage.Incremented())
    expect(wrapped).toEqual({ _tag: 'GotLeftMessage', message: { _tag: 'Incremented' } })
    expect(GotLeft.fromParentMessage(wrapped)).toEqual(Option.some(CounterMessage.Incremented()))
    expect(GotLeft.fromParentMessage(GotRight.make(CounterMessage.Incremented()))).toEqual(
      Option.none(),
    )
    expect(GotLeft.fromParentMessage(Message.Noop())).toEqual(Option.none())
  })

  it('contributes a variant the parent Schema decodes', () => {
    const decoded = Schema.decodeUnknownSync(Message)({
      _tag: 'GotRightMessage',
      message: { _tag: 'Started' },
    })
    expect(decoded).toEqual(GotRight.make(CounterMessage.Started()))
    expect(() =>
      Schema.decodeUnknownSync(Message)({ _tag: 'GotRightMessage', message: { _tag: 'Nope' } }),
    ).toThrow()
  })
})

describe('update', () => {
  it('routes each Message to its own placement only', () => {
    const result = Option.getOrThrow(
      Left.update(initial, GotLeft.make(CounterMessage.Incremented())),
    )
    expect(result.model.left.count).toBe(1)
    expect(result.model.right).toBe(initial.right)
    expect(Right.update(initial, GotLeft.make(CounterMessage.Incremented()))).toEqual(Option.none())
    expect(Left.update(initial, Message.Noop())).toEqual(Option.none())
  })

  it('passes each placement its own args and folds the OutMessage into the parent', () => {
    const once = Option.getOrThrow(Left.update(initial, GotLeft.make(CounterMessage.Incremented())))
    expect(once.model.reached).toEqual([])
    const twice = Option.getOrThrow(
      Left.update(once.model, GotLeft.make(CounterMessage.Incremented())),
    )
    expect(twice.model.reached).toEqual(['left:2'])
    const right = Option.getOrThrow(
      Right.update(twice.model, GotRight.make(CounterMessage.Incremented())),
    )
    expect(right.model.right.count).toBe(1)
    expect(right.model.reached).toEqual(['left:2'])
  })

  it('leaves the parent unchanged for a Message to an absent optional child', () => {
    const result = Option.getOrThrow(
      Maybe.update(initial, GotMaybe.make(CounterMessage.Incremented())),
    )
    expect(result.model).toBe(initial)
  })
})

describe('init', () => {
  it('writes the initial child Model from args and lifts the init Commands', () => {
    const result = Right.init(initial)
    expect(result.model.right).toEqual({ count: 10, running: false })
    expect(messagesOf(result)).toEqual([GotRight.make(CounterMessage.Started())])
  })

  it('mounts an optional child', () => {
    expect(Maybe.init(initial).model.maybe).toEqual(Option.some({ count: 0, running: false }))
  })
})

describe('helpers', () => {
  it('lifts an entry point to a parent Step', () => {
    const result = Left.helpers.reset(7)(initial)
    expect(result.model.left.count).toBe(7)
    expect(result.model.right).toBe(initial.right)
  })
})

describe('subscriptions', () => {
  const running: Model = {
    ...initial,
    left: { count: 0, running: true },
    right: { count: 0, running: true },
  }

  it('prefixes keys with the placement so two placements of one bundle do not collide', () => {
    expect(Object.keys(Left.subscriptions)).toEqual(['Counter@left/ticks'])
    expect(Object.keys(Right.subscriptions)).toEqual(['Counter@right/ticks'])
  })

  it('reads the child and wraps its Messages', () => {
    const entry = Left.subscriptions['Counter@left/ticks']!
    const dependencies = entry.modelToDependencies(running)
    expect(dependencies).toEqual({ maybeDependencies: Option.some({ running: true }) })
    expect(run(entry.dependenciesToStream(dependencies, () => dependencies))).toEqual([
      GotLeft.make(CounterMessage.Incremented()),
    ])
  })

  it('closes the gate while the link’s `when` is false or the child is absent', () => {
    const left = Left.subscriptions['Counter@left/ticks']!
    expect(left.modelToDependencies({ ...running, enabled: false })).toEqual({
      maybeDependencies: Option.none(),
    })
    const maybe = Maybe.subscriptions['Counter@maybe/ticks']!
    expect(maybe.modelToDependencies(initial)).toEqual({ maybeDependencies: Option.none() })
    expect(
      run(maybe.dependenciesToStream(maybe.modelToDependencies(initial), () => undefined)),
    ).toEqual([])
  })
})

describe('resources', () => {
  it('requires the resource only while the child is present, gated, and asks for it', () => {
    const socket = Left.resources['Counter@left/socket']!
    expect(socket.modelToMaybeRequirements(initial)).toEqual(Option.none())
    const running: Model = { ...initial, left: { count: 0, running: true } }
    expect(socket.modelToMaybeRequirements(running)).toEqual(Option.some('ws://counter/2'))
    expect(socket.modelToMaybeRequirements({ ...running, enabled: false })).toEqual(Option.none())
    expect(socket.onAcquired('ws://x')).toEqual(
      GotLeft.make(CounterMessage.Opened({ url: 'ws://x' })),
    )
    expect(socket.onReleased()).toEqual(GotLeft.make(CounterMessage.Closed()))
  })
})

describe('Link.compose', () => {
  const Inner = Schema.Struct({ counter: CounterModel })
  const GotCounter = Link.wrapper('GotCounterMessage', CounterMessage)
  const GotInner = Link.wrapper('GotInnerMessage', GotCounter.Schema)
  const Outer = Schema.Struct({ inner: Schema.Option(Inner) })
  type Outer = typeof Outer.Type

  const outerLink = Link.optional<Outer>()('inner', GotInner)
  const innerLink = Link.field<typeof Inner.Type>()('counter', GotCounter)

  it('reads and writes through both lenses and wraps Messages twice', () => {
    const Nested = Counter.at(Link.compose(outerLink, innerLink), {
      args,
      onOut: () => model => ({ model }),
    })
    expect(Nested.key).toBe('Counter@inner.counter')
    expect(Nested.link.messages).toEqual(['GotInnerMessage', 'GotCounterMessage'])
    expect(Left.link.messages).toEqual(['GotLeftMessage'])
    const present: Outer = { inner: Option.some({ counter }) }
    const message = GotInner.make(GotCounter.make(CounterMessage.Incremented()))
    const result = Option.getOrThrow(Nested.update(present, message))
    expect(result.model.inner).toEqual(Option.some({ counter: { count: 1, running: false } }))
    const absent: Outer = { inner: Option.none() }
    expect(Nested.init(absent).model).toBe(absent)
  })
})
