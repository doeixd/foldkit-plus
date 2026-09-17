/**
 * Extending a bundle without forking it, and pipeable Links.
 */
import { Effect, Option, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import { describe, expect, it } from 'vitest'
import { Bundle, Link } from '../src/index.js'

const ToggleModel = Schema.Struct({ on: Schema.Boolean, flips: Schema.Number })
type ToggleModel = typeof ToggleModel.Type
const ToggleMessage = defineMessageUnion({ Flipped: {}, Tick: {} })
type ToggleMessage = typeof ToggleMessage.Type

const Toggle = Bundle.make('Toggle', {
  Model: ToggleModel,
  Message: ToggleMessage,
  init: () => ({ model: { on: false, flips: 0 } }),
  update: model => ({ model: { ...model, on: !model.on } }),
})

describe('bundle combinators', () => {
  it('compose in a pipe, typed from the bundle', () => {
    const Counted = Toggle.pipe(
      Bundle.rename('CountedToggle'),
      Bundle.mapUpdate(update => (model, message, args) => {
        const result = update(model, message, args)
        return { ...result, model: { ...result.model, flips: result.model.flips + 1 } }
      }),
      Bundle.withHelpers({ reset: (model: ToggleModel) => ({ model: { ...model, on: false } }) }),
      Bundle.withSubscriptions(() =>
        Subscription.make<ToggleModel, ToggleMessage>()(() => ({
          ticks: Subscription.persistent(Stream.make(ToggleMessage.Tick())),
        })),
      ),
    )
    expect(Counted.name).toBe('CountedToggle')
    expect(
      Counted.update({ on: false, flips: 0 }, ToggleMessage.Flipped(), undefined).model,
    ).toEqual({
      on: true,
      flips: 1,
    })
    expect(Counted.helpers!.reset({ on: true, flips: 3 }).model.on).toBe(false)
    expect(Object.keys(Counted.subscriptions!(undefined))).toEqual(['ticks'])
    // The original is unchanged.
    expect(Toggle.name).toBe('Toggle')
    expect(
      Toggle.update({ on: false, flips: 0 }, ToggleMessage.Flipped(), undefined).model.flips,
    ).toBe(0)
  })

  it('runs mapUpdate layers outer then inner', () => {
    const order: Array<string> = []
    const layered = Toggle.pipe(
      Bundle.mapUpdate(update => (model, message, args) => {
        order.push('inner')
        return update(model, message, args)
      }),
      Bundle.mapUpdate(update => (model, message, args) => {
        order.push('outer')
        return update(model, message, args)
      }),
    )
    layered.update({ on: false, flips: 0 }, ToggleMessage.Flipped(), undefined)
    expect(order).toEqual(['outer', 'inner'])
  })

  it('mapInit can add a Command', () => {
    const Loud = Toggle.pipe(
      Bundle.mapInit(init => args => ({
        ...init(args),
        commands: [{ name: 'Hello', effect: Effect.succeed(ToggleMessage.Tick()) }],
      })),
    )
    expect(Loud.init(undefined).commands).toHaveLength(1)
  })
})

describe('pipeable links', () => {
  const GotToggleMessage = Link.wrapper('GotToggleMessage', ToggleMessage)
  const Model = Schema.Struct({ toggle: ToggleModel, open: Schema.Boolean, ready: Schema.Boolean })
  type Model = typeof Model.Type

  it('adds gates with Link.when; all gates must hold', () => {
    const link = Link.field<Model>()('toggle', GotToggleMessage, {
      when: model => model.ready,
    }).pipe(Link.when((model: Model) => model.open))
    const gate = Option.getOrThrow(link.when)
    const toggle = { on: false, flips: 0 }
    expect(gate({ toggle, open: true, ready: true })).toBe(true)
    expect(gate({ toggle, open: false, ready: true })).toBe(false)
    expect(gate({ toggle, open: true, ready: false })).toBe(false)
  })

  it('continues into a nested child with Link.andThen', () => {
    const Inner = Schema.Struct({ toggle: ToggleModel })
    const GotInnerMessage = Link.wrapper('GotInnerMessage', GotToggleMessage.Schema)
    const Outer = Schema.Struct({ inner: Inner })
    const link = Link.field<typeof Outer.Type>()('inner', GotInnerMessage).pipe(
      Link.andThen(Link.field<typeof Inner.Type>()('toggle', GotToggleMessage)),
    )
    expect(link.path).toEqual(['inner', 'toggle'])
    expect(link.messages).toEqual(['GotInnerMessage', 'GotToggleMessage'])
  })
})
