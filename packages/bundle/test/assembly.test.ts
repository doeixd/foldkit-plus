/**
 * The one list of placements: routing, init order, merged records, and the
 * startup errors for placements that would silently collide.
 */
import { Effect, Option, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as ManagedResource from 'foldkit/managedResource'
import * as Subscription from 'foldkit/subscription'
import { describe, expect, it } from 'vitest'
import { Bundle, Link } from '../src/index.js'
import { Counter, CounterMessage, CounterModel } from './fixture.js'

const GotA = Link.wrapper('GotAMessage', CounterMessage)
const GotB = Link.wrapper('GotBMessage', CounterMessage)
const Model = Schema.Struct({ a: CounterModel, b: CounterModel, ticks: Schema.Number })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Ticked: {}, ...GotA.cases, ...GotB.cases })
type Message = typeof Message.Type

const counter = { count: 0, running: false }
const initial: Model = { a: counter, b: counter, ticks: 0 }
const onOut = () => (model: Model) => ({ model })

// Counter uses the `Socket` resource tag, so placing it twice needs a resourceless variant.
const { resources: _socket, at: _at, each: _each, ...withoutResources } = Counter
const Plain = Bundle.make({ ...withoutResources, name: 'Plain' })
const A = Counter.at(Link.field<Model>()('a', GotA), { args: { limit: 9, start: 1 }, onOut })
const B = Plain.at(Link.field<Model>()('b', GotB), { args: { limit: 9, start: 2 }, onOut })

const assembly = Bundle.assemble<Model, Message>()([A, B])

describe('Bundle.assemble', () => {
  it('routes placement Messages and leaves the parent’s own Messages to the parent', () => {
    const routed = Option.getOrThrow(
      assembly.route(initial, GotB.make(CounterMessage.Incremented())),
    )
    expect(routed.model.b.count).toBe(1)
    expect(routed.model.a).toBe(initial.a)
    expect(assembly.route(initial, Message.Ticked())).toEqual(Option.none())
  })

  it('update(own) sends placement Messages to the placement and only the rest to own', () => {
    const seen: Array<string> = []
    const update = assembly.update((model, message) => {
      seen.push(message._tag)
      return message._tag === 'Ticked' ? { model: { ...model, ticks: model.ticks + 1 } } : { model }
    })
    expect(update(initial, GotA.make(CounterMessage.Incremented())).model.a.count).toBe(1)
    expect(update(initial, Message.Ticked()).model.ticks).toBe(1)
    expect(seen).toEqual(['Ticked'])
    expect(assembly.update()(initial, Message.Ticked()).model).toBe(initial)
  })

  it('Bundle.ignore drops an OutMessage deliberately', () => {
    const Quiet = Counter.at(Link.field<Model>()('a', GotA), {
      args: { limit: 1, start: 0 },
      onOut: Bundle.ignore,
    })
    const result = Option.getOrThrow(Quiet.update(initial, GotA.make(CounterMessage.Incremented())))
    expect(result.model).toEqual({ ...initial, a: { count: 1, running: false } })
  })

  it('runs every init in list order and keeps each placement’s Commands', () => {
    const result = assembly.init(initial)
    expect(result.model).toEqual({
      a: { count: 1, running: false },
      b: { count: 2, running: false },
      ticks: 0,
    })
    const messages = Effect.runSync(
      Effect.all((result.commands ?? []).map(command => command.effect)),
    )
    expect(messages).toEqual([
      GotA.make(CounterMessage.Started()),
      GotB.make(CounterMessage.Started()),
    ])
  })

  it('merges Subscriptions and resources with the parent’s own and hides the brand from the runtime', () => {
    const own = Subscription.make<Model, Message>()(entry => ({
      clock: entry(
        {},
        { modelToDependencies: () => ({}), dependenciesToStream: () => Stream.empty },
      ),
    }))
    const subscriptions = assembly.subscriptions(own)
    expect(Object.keys(subscriptions)).toEqual(['Counter@a/ticks', 'Plain@b/ticks', 'clock'])
    expect(Object.keys(assembly.resources())).toEqual(['Counter@a/socket'])
  })

  it('refuses two placements that share a resource tag, naming both', () => {
    const Second = Counter.at(Link.field<Model>()('b', GotB), {
      args: { limit: 1, start: 0 },
      onOut,
    })
    expect(() => Bundle.assemble<Model, Message>()([A, Second])).toThrow(
      /Counter@a and Counter@b both use the Managed Resource "counter-socket"/,
    )
  })

  it('refuses two placements with the same key', () => {
    const Again = Plain.at(Link.field<Model>()('b', GotB), { args: { limit: 1, start: 0 }, onOut })
    expect(() => Bundle.assemble<Model, Message>()([B, Again])).toThrow(/share the key "Plain@b"/)
  })

  it('throws when the parent’s own record reuses a placement key', () => {
    const clash = ManagedResource.make<Model, Message>()(entry => ({
      'Counter@a/socket': entry(Schema.Option(Schema.String), {
        resource: ManagedResource.tag<string>()('other'),
        modelToMaybeRequirements: () => Option.none(),
        acquire: url => Effect.succeed(url),
        release: () => Effect.void,
        onAcquired: () => Message.Ticked(),
        onReleased: () => Message.Ticked(),
        onAcquireError: () => Message.Ticked(),
      }),
    }))
    expect(() => assembly.resources(clash)).toThrow(/duplicate key "Counter@a\/socket"/)
  })
})
