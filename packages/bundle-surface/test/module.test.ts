/**
 * Placements as Module contracts: a wired application validates clean, and
 * each ownership mistake is reported by the existing Module rules.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle, Link } from 'foldkit-bundle'
import { Module, Surface, type Contract } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { BundleSurface } from '../src/index.js'

const SearchModel = Schema.Struct({ query: Schema.String })
const SearchMessage = defineMessageUnion({ Typed: { query: Schema.String } })
const Search = Bundle.make({
  name: 'Search',
  Model: SearchModel,
  Message: SearchMessage,
  init: () => ({ model: { query: '' } }),
  update: (_model, message) => ({ model: { query: message.query } }),
})

const GotSearchMessage = Link.wrapper('GotSearchMessage', SearchMessage)
const GotFilterMessage = Link.wrapper('GotFilterMessage', SearchMessage)
const GotRowMessage = Link.keyedWrapper('GotRowMessage', SearchMessage)
const GotRowsMessage = Link.keyedWrapper('GotRowsMessage', SearchMessage)

const Model = Schema.Struct({
  search: SearchModel,
  filter: SearchModel,
  rows: Schema.Record(Schema.String, SearchModel),
  todos: Schema.Array(Schema.String),
})
type Model = typeof Model.Type
const Message = defineMessageUnion({
  ...GotSearchMessage.cases,
  ...GotFilterMessage.cases,
  ...GotRowMessage.cases,
  ...GotRowsMessage.cases,
})
type Message = typeof Message.Type

const initial: Model = { search: { query: '' }, filter: { query: '' }, rows: {}, todos: [] }
const App = Surface.application({ Model, Message, initial, update: model => ({ model }) })

const SearchPlaced = Search.at(BundleSurface.link(App.model.search, GotSearchMessage))
const Rows = Search.each(Link.collection<Model>()('rows', GotRowMessage))
const assembly = Bundle.assemble<Model, Message>()([SearchPlaced, Rows])

const syncOf = (path: string): Contract => ({
  kind: 'sync',
  name: 'Todos',
  owner: App.owner,
  owns: [[path]],
  observes: [],
  messages: [],
  metadata: [],
})
const rules = (module: Module<any, any, any>) =>
  Module.validate(module).map(finding => finding.rule)

describe('BundleSurface.module', () => {
  it('validates a wired application with no findings and records who owns each path', () => {
    const module = BundleSurface.module(App, assembly, [syncOf('todos')])
    expect(Module.validate(module)).toEqual([])
    expect(Module.manifest(module).ownership).toEqual([
      { path: ['search'], owner: { kind: 'bundle', name: 'Search@search' } },
      { path: ['filter'], owner: undefined },
      { path: ['rows'], owner: { kind: 'bundle', name: 'Search@rows[]' } },
      { path: ['todos'], owner: { kind: 'sync', name: 'Todos' } },
    ])
  })

  it('names the placement’s Messages in its contract', () => {
    expect(BundleSurface.contract(App, Rows)).toMatchObject({
      kind: 'bundle',
      owns: [['rows']],
      messages: ['GotRowMessage'],
    })
  })

  it('reports a placement and a Sync contract that own the same path', () => {
    expect(rules(BundleSurface.module(App, assembly, [syncOf('rows')]))).toEqual([
      'ownership-overlap',
    ])
  })

  it('reports two placements on one path', () => {
    const Again = Search.at(Link.field<Model>()('search', GotFilterMessage), { key: 'SearchAgain' })
    const both = Bundle.assemble<Model, Message>()([SearchPlaced, Again])
    expect(rules(BundleSurface.module(App, both))).toEqual(['ownership-overlap'])
  })

  it('reports a placement through another application’s ref', () => {
    const OtherApp = Surface.application({ Model, Message, initial, update: model => ({ model }) })
    const Foreign = Search.at(BundleSurface.link(OtherApp.model.search, GotSearchMessage))
    const foreign = Bundle.assemble<Model, Message>()([Foreign])
    expect(rules(BundleSurface.module(App, foreign))).toEqual(['foreign-contract'])
  })

  it('reports a wrapper the application’s Message does not declare', () => {
    const GotStrayMessage = Link.wrapper('GotStrayMessage', SearchMessage)
    const Stray = Search.at(Link.field<Model>()('filter', GotStrayMessage))
    expect(rules(Module.make(App, [BundleSurface.contract(App, Stray)]))).toEqual([
      'unknown-message',
    ])
  })
})

describe('BundleSurface.parent', () => {
  it('places from the application’s Schemas and validates with its module', () => {
    const Page = BundleSurface.parent(App)
    const placed = Page.at(Bundle.declare(Search, 'search'))
    const filter = Page.place(Search, 'filter')
    const rows = Page.placeEach(Search, 'rows')
    const pageAssembly = Page.assemble(placed, filter, rows)
    const module = Page.module(pageAssembly, [syncOf('todos')])
    expect(Module.validate(module)).toEqual([])
    expect(Module.manifest(module).ownership.map(row => row.owner?.name)).toEqual([
      'Search@search',
      'Search@filter',
      'Search@rows[]',
      'Todos',
    ])
  })
})
