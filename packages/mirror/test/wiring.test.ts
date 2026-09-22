/**
 * A mirror's wiring does what an application wires by hand: route the URL
 * Message or its own MirrorRestored into `reduce`, read the URL at startup,
 * run `restore`, and bring its Subscriptions and contract.
 */
import { Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { defineMessageUnion } from 'foldkit/message'
import { Url, fromString } from 'foldkit/url'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Mirror } from '../src/index.js'

const Model = Schema.Struct({ filter: Schema.Literals(['all', 'active']), draft: Schema.String })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Mirror.messages, UrlChanged: { url: Url } })
const initial: Model = { filter: 'all', draft: '' }
const App = Surface.application({ Model, Message, initial, update: model => ({ model }) })

const Filters = Mirror.url(App, { name: 'filters', fields: [App.model.filter] })
const Prefs = Mirror.kv(App, { key: 'prefs', fields: [App.model.draft] })
const Other = Mirror.kv(App, { key: 'other', fields: [App.model.draft] })

const urlOf = (href: string) => Option.getOrThrow(fromString(href))

describe('Mirror.url(...).wiring', () => {
  const wiring = Filters.wiring('UrlChanged')

  it('routes the URL Message into reduce, as an application would by hand', () => {
    const url = urlOf('http://app/?filter=active')
    const routed = Option.getOrThrow(wiring.route!(initial, Message.UrlChanged({ url })))
    expect(routed.model).toEqual(Filters.reduce(initial, url))
    expect(routed.model.filter).toBe('active')
  })

  it('ignores a Message outside its URL variant', () => {
    const url = urlOf('http://app/?filter=active')
    expect(
      // @ts-expect-error: only its own URL variant is routable
      wiring.route!(initial, { _tag: 'Other', url }),
    ).toEqual(Option.none())
  })

  it('reads the URL at startup and declares the URL Message shared', () => {
    expect(wiring.onUrl(initial, urlOf('http://app/?filter=active')).filter).toBe('active')
    expect(wiring.handles).toEqual(['UrlChanged'])
    expect(wiring.shared).toEqual(['UrlChanged'])
  })

  it('brings its Subscriptions and contract', () => {
    expect(Object.keys(wiring.subscriptions!)).toEqual(Object.keys(Filters.subscriptions))
    expect(wiring.contract).toBe(Filters.contract)
    expect(wiring.key).toBe('mirror:filters')
  })
})

describe('Mirror.kv(...).wiring', () => {
  const wiring = Prefs.wiring()

  it('routes only its own MirrorRestored, leaving another mirror’s to it', () => {
    const own = { _tag: 'MirrorRestored' as const, name: 'prefs', keys: { draft: '"Call"' } }
    const others = { ...own, name: 'other' }
    expect(Option.getOrThrow(wiring.route!(initial, own)).model).toEqual(Prefs.reduce(initial, own))
    expect(wiring.route!(initial, others)).toEqual(Option.none())
    expect(Option.isSome(Other.wiring().route!(initial, others))).toBe(true)
  })

  it('runs restore at startup', () => {
    const started = wiring.init(initial)
    expect(started.model).toBe(initial)
    expect(started.commands).toEqual([Prefs.restore])
  })

  it('declares MirrorRestored shared and brings its Subscriptions and contract', () => {
    expect(wiring.handles).toEqual(['MirrorRestored'])
    expect(wiring.shared).toEqual(['MirrorRestored'])
    expect(Object.keys(wiring.subscriptions!)).toEqual(['prefs.mirror'])
    expect(wiring.contract).toBe(Prefs.contract)
  })
})

describe('MirrorRestored sharing in an assembly', () => {
  it('routes each mirror’s restore to its own wiring and runs both restores', () => {
    const Page = Bundle.parent({ Model, Message })
    const assembly = Page.assemble(Prefs.wiring(), Other.wiring())
    const own = { _tag: 'MirrorRestored' as const, name: 'prefs', keys: { draft: '"Call"' } }
    const others = { ...own, name: 'other' }
    expect(Option.getOrThrow(assembly.route(initial, own)).model).toEqual(
      Prefs.reduce(initial, own),
    )
    expect(Option.getOrThrow(assembly.route(initial, others)).model).toEqual(
      Other.reduce(initial, others),
    )
    expect(assembly.initial(initial).commands).toEqual([Prefs.restore, Other.restore])
  })
})
