/**
 * Integration wiring in an assembly: routing beside placements, claimed tags,
 * startup Commands, URL handling, and merged Subscriptions and resources.
 */
import { Effect, Option, Schema, Stream } from 'effect'
import * as ManagedResource from 'foldkit/managedResource'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import * as Url from 'foldkit/url'
import { describe, expect, it } from 'vitest'
import { Bundle, type Wiring } from '../src/index.js'
import { Counter, CounterMessage } from './fixture.js'

const { resources: _socket, at: _at, each: _each, with: _with, pipe: _pipe, ...plainSpec } = Counter
const Plain = Bundle.make({ ...plainSpec, name: 'Plain' })

const Box = Bundle.declare(Plain, 'box')
const Model = Schema.Struct({ ...Box.fields, filter: Schema.String, restored: Schema.Boolean })
type Model = typeof Model.Type
const Message = defineMessageUnion({
  ...Box.cases,
  FilterRestored: { filter: Schema.String },
  UrlChanged: { href: Schema.String },
  Clicked: {},
})
type Message = typeof Message.Type

const Page = Bundle.parent({ Model, Message })
const box = Page.at(Box, { args: { limit: 9, start: 1 }, onOut: Bundle.ignore })

const filterFrom = (href: string) => new URL(href, 'http://app').searchParams.get('filter') ?? 'all'

// A mirror-like integration: routes its own Messages, restores at startup, reads the URL.
const filters: Wiring<Model, Message> & {
  readonly init: NonNullable<Wiring<Model, Message>['init']>
  readonly onUrl: NonNullable<Wiring<Model, Message>['onUrl']>
} = {
  key: 'mirror:filters',
  handles: ['FilterRestored', 'UrlChanged'],
  route: (model, message) =>
    message._tag === 'FilterRestored'
      ? Option.some({ model: { ...model, filter: message.filter, restored: true } })
      : message._tag === 'UrlChanged'
        ? Option.some({ model: { ...model, filter: filterFrom(message.href) } })
        : Option.none(),
  init: model => ({
    model,
    commands: [
      { name: 'Restore', effect: Effect.succeed(Message.FilterRestored({ filter: 'done' })) },
    ],
  }),
  onUrl: (model, url) => ({ ...model, filter: filterFrom(Url.toString(url)) }),
  subscriptions: Subscription.make<Model, Message>()(() => ({
    'mirror:filters.write': Subscription.persistent(Stream.empty),
  })),
}

const assembly = Page.assemble(box, filters)
const initialModel: Model = { box: { count: 0, running: false }, filter: 'all', restored: false }

describe('wiring in an assembly', () => {
  it('routes placement Messages to the placement and wiring Messages to the wiring', () => {
    const update = assembly.update(model => ({ model }))
    expect(
      update(initialModel, Box.wrapper.make(CounterMessage.Incremented())).model.box.count,
    ).toBe(1)
    expect(update(initialModel, Message.FilterRestored({ filter: 'active' })).model).toEqual({
      ...initialModel,
      filter: 'active',
      restored: true,
    })
    expect(assembly.route(initialModel, Message.Clicked())).toEqual(Option.none())
  })

  it('runs wiring inits after placements in initial', () => {
    const initial = assembly.initial({ filter: 'all', restored: false })
    expect(initial.model.box).toEqual({ count: 1, running: false })
    const messages = Effect.runSync(
      Effect.all((initial.commands ?? []).map(command => command.effect)),
    )
    expect(messages).toEqual([
      Box.wrapper.make(CounterMessage.Started()),
      Message.FilterRestored({ filter: 'done' }),
    ])
  })

  it('applies every onUrl at startup and turns a URL change into the URL Message', () => {
    const url = assembly.url(next => Message.UrlChanged({ href: Url.toString(next) }))
    const start = Option.getOrThrow(Url.fromString('http://app/?filter=active'))
    expect(url.init(initialModel, start).filter).toBe('active')
    expect(url.onUrlChange(start)).toEqual(Message.UrlChanged({ href: Url.toString(start) }))
  })

  it('merges wiring Subscriptions beside placement ones', () => {
    expect(Object.keys(assembly.subscriptions())).toEqual([
      'Plain@box/ticks',
      'mirror:filters.write',
    ])
  })
})

describe('wiring startup checks', () => {
  it('refuses two items handling one tag, naming both', () => {
    const other: Wiring<Model, Message> = { key: 'remote:board', handles: ['FilterRestored'] }
    expect(() => Page.assemble(filters, other)).toThrow(
      /mirror:filters and remote:board both handle "FilterRestored"/,
    )
  })

  it('allows a tag the claimants declare shared', () => {
    const first: Wiring<Model, Message> = {
      key: 'mirror:a',
      handles: ['FilterRestored'],
      shared: ['FilterRestored'],
    }
    const second: Wiring<Model, Message> = {
      key: 'mirror:b',
      handles: ['FilterRestored'],
      shared: ['FilterRestored'],
    }
    expect(Page.assemble(first, second).placements).toHaveLength(2)
  })

  it('refuses two wirings using one Managed Resource tag', () => {
    const tag = ManagedResource.tag<string>()('shared-socket')
    const withSocket = (key: string): Wiring<Model, Message> => ({
      key,
      handles: [],
      resources: ManagedResource.make<Model, Message>()(entry => ({
        socket: entry(Schema.Option(Schema.String), {
          resource: tag,
          modelToMaybeRequirements: () => Option.none(),
          acquire: url => Effect.succeed(url),
          release: () => Effect.void,
          onAcquired: () => Message.Clicked(),
          onReleased: () => Message.Clicked(),
          onAcquireError: () => Message.Clicked(),
        }),
      })),
    })
    expect(() => Page.assemble(withSocket('remote:a'), withSocket('remote:b'))).toThrow(
      /remote:a and remote:b both use the Managed Resource "shared-socket"/,
    )
  })
})
