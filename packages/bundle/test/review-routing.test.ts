/**
 * Regressions from a second review: a nested placement listed after its outer
 * one, an array collection written under a key its item's id does not match,
 * a tag shared by only one of its claimants, a nested child's init under an
 * absent outer child, a lazy bundle whose load failed once, and a composed
 * field named like an `Object.prototype` member.
 */
import { Effect, Exit, Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { describe, expect, it } from 'vitest'
import { Bundle, Link, type Wiring } from '../src/index.js'
import { Counter, CounterMessage, CounterModel } from './fixture.js'

const { resources: _socket, at: _at, each: _each, with: _with, pipe: _pipe, ...plainSpec } = Counter
const Plain = Bundle.make({ ...plainSpec, name: 'Plain' })
const args = { limit: 9, start: 3 }
const counter = { count: 0, running: false }

describe('a placement inside another', () => {
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
    init: () => ({ model: { inner: counter, label: '' } }),
    update: model => ({ model }),
  })
  const panelLink = Link.field<Model>()('panel', GotPanel)
  const panel = PanelBundle.at(panelLink)
  const inner = Plain.at(panelLink.pipe(Link.andThen(Link.field<Panel>()('inner', GotInner))), {
    args,
    onOut: Bundle.ignore,
  })
  const increment = GotPanel.make(GotInner.make(CounterMessage.Incremented()))

  it.each([
    ['outer first', [panel, inner] as const],
    ['nested first', [inner, panel] as const],
  ])('routes the nested child its Messages whatever the order: %s', (_name, items) => {
    const placements = Bundle.assemble<Model, Message>()(items)
    const model: Model = { panel: { inner: counter, label: '' } }
    expect(placements.update()(model, increment).model.panel.inner.count).toBe(1)
  })
})

describe('an array collection keyed by id', () => {
  const Row = Schema.Struct({ id: Schema.String, count: Schema.Number, running: Schema.Boolean })
  type Row = typeof Row.Type
  const RowBundle = Bundle.make('Row', {
    Model: Row,
    Message: CounterMessage,
    init: () => ({ model: { id: '', count: 0, running: false } }),
    update: model => ({ model: { ...model, count: model.count + 1 } }),
  })
  const GotRow = Link.keyedWrapper('GotRowMessage', CounterMessage)
  type Model = { readonly rows: ReadonlyArray<Row> }
  const rows = RowBundle.each(Link.collectionById<Model>()('rows', GotRow, { id: row => row.id }))

  it('refuses an item written under a key its id does not match, naming both', () => {
    expect(() => rows.add('a')({ rows: [] })).toThrow(
      /the item written under "a" has the id ""; give `add` a prepare that sets it/,
    )
    const added = rows.add('a', row => ({ ...row, id: 'a' }))({ rows: [] }).model
    expect(rows.link.get(added, 'a')).toEqual(Option.some({ id: 'a', count: 0, running: false }))
  })
})

describe('a tag several claimants handle', () => {
  const GotA = Link.wrapper('GotAMessage', CounterMessage)
  type Model = { readonly a: typeof CounterModel.Type }
  const Message = defineMessageUnion({ ...GotA.cases, Pinged: {} })
  type Message = typeof Message.Type
  const wiring = (key: string, shared: boolean): Wiring<Model, Message> => ({
    key,
    handles: ['Pinged'],
    ...(shared ? { shared: ['Pinged'] } : {}),
    route: () => Option.none(),
  })

  it('is refused unless every claimant declares it shared', () => {
    expect(() =>
      Bundle.assemble<Model, Message>()([wiring('one', true), wiring('two', false)]),
    ).toThrow(/one and two both handle "Pinged"/)
    expect(() =>
      Bundle.assemble<Model, Message>()([wiring('one', true), wiring('two', true)]),
    ).not.toThrow()
  })

  it('is refused between a placement and a wiring, which cannot share', () => {
    const placed = Plain.at(Link.field<Model>()('a', GotA), { args, onOut: Bundle.ignore })
    const claiming: Wiring<Model, Message> = {
      key: 'claimer',
      handles: ['GotAMessage'],
      shared: ['GotAMessage'],
      route: () => Option.none(),
    }
    expect(() => Bundle.assemble<Model, Message>()([placed, claiming])).toThrow(
      /Plain@a and claimer both handle "GotAMessage"/,
    )
  })
})

describe('a nested child under an absent outer child', () => {
  const GotInner = Link.wrapper('GotInnerMessage', CounterMessage)
  const GotPanel = Link.wrapper('GotPanelMessage', Schema.Union([GotInner.Schema]))
  const Panel = Schema.Struct({ inner: CounterModel })
  type Panel = typeof Panel.Type
  type Model = { readonly panel: Option.Option<Panel> }

  it('runs no init Command when there is nowhere to write it', () => {
    const inner = Counter.at(
      Link.optional<Model>()('panel', GotPanel).pipe(
        Link.andThen(Link.field<Panel>()('inner', GotInner)),
      ),
      { args, onOut: Bundle.ignore },
    )
    const result = inner.init({ panel: Option.none() })
    expect(result.model).toEqual({ panel: Option.none() })
    expect(result.commands ?? []).toHaveLength(0)
  })
})

describe('Bundle.lazy after a failed load', () => {
  const ClickerModel = Schema.Struct({ count: Schema.Number })
  const ClickerMessage = defineMessageUnion({ Clicked: {} })
  const body = {
    update: (model: typeof ClickerModel.Type) => ({ model: { count: model.count + 1 } }),
  }

  it('loads again, so a Message after a failed attempt still arrives', async () => {
    let attempts = 0
    const Clicker = Bundle.lazy(
      {
        name: 'Clicker',
        Model: ClickerModel,
        Message: ClickerMessage,
        init: () => ({ model: { count: 0 } }),
      },
      () => (attempts++ === 0 ? Promise.reject(new Error('offline')) : Promise.resolve(body)),
    )
    await expect(Clicker.load()).rejects.toThrow('offline')
    const [command] =
      Clicker.update({ count: 0 }, ClickerMessage.Clicked(), undefined).commands ?? []
    if (command === undefined) throw new Error('no Command')
    const exit = await Effect.runPromiseExit(command.effect)
    expect(Exit.isSuccess(exit)).toBe(true)
    expect(attempts).toBe(2)
  })
})

describe('Bundle.compose with a field named like an Object member', () => {
  it('takes it', () => {
    const Page = Bundle.compose({}).pipe(
      Bundle.withChild('constructor', Plain, { args, onOut: Bundle.ignore }),
    )
    expect(Object.keys(Page.Model.fields)).toEqual(['constructor'])
  })
})
