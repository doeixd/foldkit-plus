/**
 * `assembly.config`: the assembled runtime config from one call. The own
 * update routes after the placements, `initial` becomes `init`, the own
 * Subscriptions and Managed Resources merge with the items', and everything
 * else passes through untouched.
 */
import { Effect, Option, Schema, Stream } from 'effect'
import * as ManagedResource from 'foldkit/managedResource'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import { describe, expect, it } from 'vitest'
import { Bundle, Link, type Wiring } from '../src/index.js'
import { Counter, CounterMessage, CounterModel } from './fixture.js'

const GotCounter = Link.wrapper('GotCounterMessage', CounterMessage)
const Model = Schema.Struct({ counter: CounterModel })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Reset: {}, ...GotCounter.cases })
type Message = typeof Message.Type

const placed = Counter.at(Link.field<Model>()('counter', GotCounter), {
  args: { limit: 3, start: 0 },
  onOut: () => model => ({ model }),
})
const assembly = Bundle.assemble<Model, Message>()([placed])

const view = () => 'view' as const

describe('assembly.config', () => {
  it('derives init, update, subscriptions, and managedResources, passing the rest through', () => {
    const config = assembly.config({
      Model,
      container: null,
      view,
      extra: 42,
      initial: {},
      update: (model, message) =>
        message._tag === 'Reset'
          ? { model: { ...model, counter: { ...model.counter, count: 0 } } }
          : { model },
    })

    // Passthrough is untouched.
    expect(config.Model).toBe(Model)
    expect(config.container).toBeNull()
    expect(config.view).toBe(view)
    expect(config.extra).toBe(42)

    // `initial` rest becomes `init`: the placement starts from its args.
    const started = config.init()
    expect(started.model.counter).toEqual({ count: 0, running: false })
    expect(started.commands).toHaveLength(1)

    // Placement Messages route to the placement; own Messages to the own update.
    const clicked = config.update(started.model, GotCounter.make(CounterMessage.Incremented()))
    expect(clicked.model.counter.count).toBe(1)
    const reset = config.update(clicked.model, Message.Reset())
    expect(reset.model.counter.count).toBe(0)

    // The placement's Subscriptions and resources ride along.
    expect(Object.keys(config.subscriptions)).toEqual(Object.keys(assembly.subscriptions()))
    expect(Object.keys(config.subscriptions)).toEqual(['Counter@counter/ticks'])
    expect(Object.keys(config.managedResources)).toEqual(Object.keys(assembly.resources()))

    // The result already satisfies `complete`.
    expect(assembly.complete(config)).toBe(config)
  })

  it('merges the parent’s own Subscriptions and Managed Resources with the items’', () => {
    const ownResources = ManagedResource.make<Model, Message>()(entry => ({
      own: entry(Schema.Option(Schema.String), {
        resource: ManagedResource.tag<string>()('config-test-own'),
        modelToMaybeRequirements: () => Option.none(),
        acquire: value => Effect.succeed(value),
        release: () => Effect.void,
        onAcquired: () => Message.Reset(),
        onReleased: () => Message.Reset(),
        onAcquireError: () => Message.Reset(),
      }),
    }))
    const config = assembly.config({
      initial: {},
      subscriptions: Subscription.make<Model, Message>()(() => ({
        own: Subscription.persistent(Stream.make(Message.Reset())),
      })),
      managedResources: ownResources,
    })

    expect(Object.keys(config.subscriptions).sort()).toEqual(
      ['Counter@counter/ticks', 'own'].sort(),
    )
    expect(Object.keys(config.managedResources).sort()).toEqual(
      [...Object.keys(assembly.resources()), 'own'].sort(),
    )
  })

  it('routes placement Messages with no own update, leaving own Messages untouched', () => {
    const config = assembly.config({ initial: {} })

    const started = config.init()
    const clicked = config.update(started.model, GotCounter.make(CounterMessage.Incremented()))
    expect(clicked.model.counter.count).toBe(1)
    expect(config.update(started.model, Message.Reset()).model).toBe(started.model)
  })

  it('refuses a custom init or url instead of silently dropping it', () => {
    expect(() => assembly.config({ initial: {}, init: () => ({ model: {} }) } as never)).toThrow(
      /config owns init/,
    )
    expect(() => assembly.config({ initial: {}, url: () => Message.Reset() } as never)).toThrow(
      /config owns init and url/,
    )
  })

  it('refuses a URL-mirror assembly instead of silently unwiring its mirror', () => {
    const mirror: Wiring<Model, Message> = {
      key: 'mirror:test',
      handles: [],
      onUrl: model => model,
    }
    const urlAssembly = Bundle.assemble<Model, Message>()([mirror])
    const config = urlAssembly.config as unknown as (input: {
      readonly initial: Record<string, never>
    }) => unknown
    expect(() => config({ initial: {} })).toThrow(/does not derive url/)
  })
})
