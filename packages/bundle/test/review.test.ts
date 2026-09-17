/**
 * Regressions found in review: nested placements in initial, shared wrappers,
 * the parent's own resource tags, presets of presets, and resources reaching a
 * collection through a loosely typed bundle.
 */
import { Effect, Option, Schema } from 'effect'
import * as ManagedResource from 'foldkit/managedResource'
import { defineMessageUnion } from 'foldkit/message'
import { describe, expect, it } from 'vitest'
import { Bundle, Link } from '../src/index.js'
import { Counter, CounterMessage, CounterModel, Socket } from './fixture.js'

const { resources: _socket, at: _at, each: _each, with: _with, pipe: _pipe, ...plainSpec } = Counter
const Plain = Bundle.make({ ...plainSpec, name: 'Plain' })
const args = { limit: 9, start: 3 }
const counter = { count: 0, running: false }

describe('initial with nested placements', () => {
  const GotInner = Link.wrapper('GotInnerMessage', CounterMessage)
  const GotSettings = Link.wrapper('GotSettingsMessage', GotInner.Schema)
  const GotOuter = Link.wrapper('GotOuterMessage', CounterMessage)
  const Settings = Schema.Struct({ inner: CounterModel, label: Schema.String })
  type Settings = typeof Settings.Type
  const Model = Schema.Struct({ settings: Settings, outer: CounterModel })
  type Model = typeof Model.Type
  const Message = defineMessageUnion({ ...GotSettings.cases, ...GotOuter.cases })
  type Message = typeof Message.Type

  const inner = Plain.at(
    Link.field<Model>()('settings', GotSettings).pipe(
      Link.andThen(Link.field<Settings>()('inner', GotInner)),
    ),
    { args, onOut: Bundle.ignore },
  )
  const outer = Plain.at(Link.field<Model>()('outer', GotOuter), { args, onOut: Bundle.ignore })

  it('initialises a nested placement inside the parent field rest gives', () => {
    // The nested placement is listed first; init still runs it after shallower ones.
    const placements = Bundle.assemble<Model, Message>()([inner, outer])
    const result = placements.initial({ settings: { inner: counter, label: 'x' } })
    expect(result.model).toEqual({
      settings: { inner: { count: 3, running: false }, label: 'x' },
      outer: { count: 3, running: false },
    })
    expect(result.commands).toHaveLength(2)
  })
})

describe('init order with a placement inside another', () => {
  const GotInner = Link.wrapper('GotInnerMessage', CounterMessage)
  const GotPanel = Link.wrapper('GotPanelMessage', Schema.Union([GotInner.Schema]))
  const Panel = Schema.Struct({ inner: CounterModel, label: Schema.String })
  type Panel = typeof Panel.Type
  const Model = Schema.Struct({ panel: Panel })
  type Model = typeof Model.Type
  const Message = defineMessageUnion({ ...GotPanel.cases })
  type Message = typeof Message.Type

  const PanelBundle = Bundle.make('Panel', {
    Model: Panel,
    Message: Schema.Union([GotInner.Schema]),
    init: () => ({ model: { inner: { count: 99, running: false }, label: 'default' } }),
    update: model => ({ model }),
  })
  const panelLink = Link.field<Model>()('panel', GotPanel)
  const panel = PanelBundle.at(panelLink)
  const inner = Plain.at(panelLink.pipe(Link.andThen(Link.field<Panel>()('inner', GotInner))), {
    args,
    onOut: Bundle.ignore,
  })

  it('runs the outer init before the nested one, whatever the list order', () => {
    const placements = Bundle.assemble<Model, Message>()([inner, panel])
    const result = placements.init({ panel: { inner: counter, label: '' } })
    expect(result.model.panel).toEqual({ inner: { count: 3, running: false }, label: 'default' })
  })
})

describe('Bundle.assemble refuses silent collisions', () => {
  const GotShared = Link.wrapper('GotSharedMessage', CounterMessage)
  const Model = Schema.Struct({ a: CounterModel, b: CounterModel })
  type Model = typeof Model.Type
  const Message = defineMessageUnion({ ...GotShared.cases })
  type Message = typeof Message.Type

  it('refuses two placements with the same wrapper, naming both', () => {
    const A = Plain.at(Link.field<Model>()('a', GotShared), { args, onOut: Bundle.ignore })
    const B = Plain.at(Link.field<Model>()('b', GotShared), { args, onOut: Bundle.ignore })
    expect(() => Bundle.assemble<Model, Message>()([A, B])).toThrow(
      /Plain@a and Plain@b both handle "GotSharedMessage"/,
    )
  })

  it('refuses a parent resource that shares a placement’s tag', () => {
    const GotA = Link.wrapper('GotAMessage', CounterMessage)
    const WithSocket = Schema.Struct({ a: CounterModel })
    type WithSocket = typeof WithSocket.Type
    const SocketMessage = defineMessageUnion({ ...GotA.cases, Noop: {} })
    type SocketMessage = typeof SocketMessage.Type
    const placed = Counter.at(Link.field<WithSocket>()('a', GotA), { args, onOut: Bundle.ignore })
    const placements = Bundle.assemble<WithSocket, SocketMessage>()([placed])
    const own = ManagedResource.make<WithSocket, SocketMessage>()(entry => ({
      socket: entry(Schema.Option(Schema.String), {
        resource: Socket,
        modelToMaybeRequirements: () => Option.none(),
        acquire: url => Effect.succeed(url),
        release: () => Effect.void,
        onAcquired: () => SocketMessage.Noop(),
        onReleased: () => SocketMessage.Noop(),
        onAcquireError: () => SocketMessage.Noop(),
      }),
    }))
    expect(() => placements.resources(own)).toThrow(
      /Counter@a and the parent's own resources both use the Managed Resource "counter-socket"/,
    )
  })
})

describe('args', () => {
  const Limited = Bundle.make('Limited', {
    Model: CounterModel,
    Message: CounterMessage,
    args: Schema.Struct({ limit: Schema.Number }),
    init: () => ({ model: counter }),
    update: model => ({ model }),
  })

  it('keeps a preset’s args when the preset is preset again', () => {
    const once = Limited.with({ limit: 2 })
    expect(once.preset).toBe('{"limit":2}')
    expect(once.with(undefined).preset).toBe('{"limit":2}')
  })
})

describe('collections and resources', () => {
  it('refuses a bundle with resources even when the types were bypassed', () => {
    const GotRow = Link.keyedWrapper('GotRowMessage', CounterMessage)
    const Model = Schema.Struct({ rows: Schema.Record(Schema.String, CounterModel) })
    // As a scope or declaration would call it, with the resource check bypassed.
    const looseEach = Counter.each as unknown as (...input: ReadonlyArray<unknown>) => unknown
    expect(() => looseEach(Link.collection<typeof Model.Type>()('rows', GotRow), { args })).toThrow(
      /Counter has Managed Resources, which a collection cannot place/,
    )
  })
})
