/**
 * `Bundle.follow`: what an address asks of a child with no Model yet, once
 * it has one. While a pending ask waits and its owner is ready, the ask goes
 * through the owner's own Messages and is let go; otherwise the result
 * passes through untouched, pending kept.
 */
import { Effect, Option, Schema } from 'effect'
import * as Command from 'foldkit/command'
import { Submodel } from 'foldkit'
import { defineMessageUnion } from 'foldkit/message'
import { describe, expect, it } from 'vitest'
import { Bundle, Link, follow } from '../src/index.js'

const ChildModel = Schema.Struct({
  status: Schema.Literals(['Loading', 'Ready']),
  text: Schema.String,
})
type ChildModel = typeof ChildModel.Type
const ChildMessage = defineMessageUnion({
  Loaded: {},
  SetText: { text: Schema.String },
  Ping: {},
  Ponged: {},
})
type ChildMessage = typeof ChildMessage.Type

const PingChild = Command.define('PingChild', {
  args: {},
  messages: [ChildMessage.Ponged],
  execute: () => Effect.succeed(ChildMessage.Ponged()),
})

const ChildBundle = Bundle.make('Child', {
  Model: ChildModel,
  Message: ChildMessage,
  init: () => ({ model: { status: 'Loading' as const, text: '' } }),
  update: (model, message) =>
    ChildMessage.match(message, {
      Loaded: () => ({ model: { ...model, status: 'Ready' as const } }),
      SetText: ({ text }) => ({ model: { ...model, text } }),
      Ping: () => ({ model, commands: [PingChild({})] }),
      Ponged: () => ({ model }),
    }),
  view: Submodel.defineView<ChildModel, ChildMessage>(() => null as never),
})

const Model = Schema.Struct({
  child: ChildModel,
  pending: Schema.Option(Schema.Struct({ text: Schema.String })),
})
type Model = typeof Model.Type
const Message = defineMessageUnion({
  GotChild: { message: ChildMessage },
  Noted: {},
})
type Message = typeof Message.Type

const placed = ChildBundle.at(Link.field<Model>()('child', Link.wrapper(Message.GotChild)))

type Ask = { readonly text: string }
const followAsks = follow(placed, {
  pending: model => model.pending as Option.Option<Ask>,
  release: model => ({ ...model, pending: Option.none() }),
  ready: child => child.status === 'Ready',
  toMessages: ask => [ChildMessage.SetText({ text: ask.text })],
})

const loading: Model = {
  child: { status: 'Loading', text: '' },
  pending: Option.some({ text: 'hi' }),
}
const ready: Model = {
  child: { status: 'Ready', text: '' },
  pending: Option.some({ text: 'hi' }),
}

const returns = (model: Model): Parameters<typeof followAsks>[0] => ({ model })

describe('Bundle.follow', () => {
  it('passes a result with no pending ask through untouched', () => {
    const result = returns({ ...ready, pending: Option.none() })
    expect(followAsks(result)).toBe(result)
  })

  it('holds the ask while the child is loading, pending kept', () => {
    const result = returns(loading)
    expect(followAsks(result)).toBe(result)
    expect(followAsks(result).model.pending).toStrictEqual(Option.some({ text: 'hi' }))
  })

  it('sends the ask through the owner’s Messages and lets it go once ready', () => {
    const followed = followAsks(returns(ready))
    expect(followed.model.child.text).toBe('hi')
    expect(followed.model.pending).toStrictEqual(Option.none())
    expect(followed.commands ?? []).toHaveLength(0)
  })

  it('merges the owner’s Commands after the result’s own, in order', () => {
    const asking = follow(placed, {
      pending: model => model.pending as Option.Option<Ask>,
      release: model => ({ ...model, pending: Option.none() }),
      ready: () => true,
      toMessages: ask => [ChildMessage.SetText({ text: ask.text }), ChildMessage.Ping()],
    })
    // A result already carrying one of the child's own Commands.
    const base = Option.getOrThrow(
      placed.update(ready, Message.GotChild({ message: ChildMessage.Ping() })),
    )
    expect(base.commands).toHaveLength(1)
    const followed = asking(base)
    expect(followed.model.child.text).toBe('hi')
    expect(followed.model.pending).toStrictEqual(Option.none())
    expect(followed.commands).toHaveLength(2)
  })

  it('lets go of an ask that translates to nothing', () => {
    const silent = follow(placed, {
      pending: model => model.pending as Option.Option<Ask>,
      release: model => ({ ...model, pending: Option.none() }),
      ready: () => true,
      toMessages: () => [],
    })
    const followed = silent(returns(ready))
    expect(followed.model.pending).toStrictEqual(Option.none())
    expect(followed.model.child.text).toBe('')
  })

  it('holds the ask while the child is absent', () => {
    const MaybeModel = Schema.Struct({
      maybe: Schema.Option(ChildModel),
      pending: Schema.Option(Schema.Struct({ text: Schema.String })),
    })
    type MaybeModel = typeof MaybeModel.Type
    const MaybeMessage = defineMessageUnion({
      GotMaybe: { message: ChildMessage },
      Noted: {},
    })
    type MaybeMessage = typeof MaybeMessage.Type
    const maybePlaced = ChildBundle.at(
      Link.optional<MaybeModel>()('maybe', Link.wrapper(MaybeMessage.GotMaybe)),
    )
    const followMaybe = follow(maybePlaced, {
      pending: model => model.pending as Option.Option<Ask>,
      release: model => ({ ...model, pending: Option.none() }),
      ready: () => true,
      toMessages: ask => [ChildMessage.SetText({ text: ask.text })],
    })
    const model: MaybeModel = { maybe: Option.none(), pending: Option.some({ text: 'hi' }) }
    const result: Parameters<typeof followMaybe>[0] = { model }
    expect(followMaybe(result)).toBe(result)
  })
})
