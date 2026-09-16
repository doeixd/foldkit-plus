/**
 * The sixty-second example from this package's README, type-checked.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle, Link } from 'foldkit-bundle'
import { Module, Surface, type Contract } from 'foldkit-surface'
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
const Row = Search

const GotSearchMessage = Link.wrapper('GotSearchMessage', SearchMessage)
const GotRowMessage = Link.keyedWrapper('GotRowMessage', SearchMessage)
const Model = Schema.Struct({
  search: SearchModel,
  rows: Schema.Record(Schema.String, SearchModel),
  todos: Schema.Array(Schema.String),
})
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...GotSearchMessage.cases, ...GotRowMessage.cases })
type Message = typeof Message.Type
const initial: Model = { search: { query: '' }, rows: {}, todos: [] }
const update = (model: Model) => ({ model })
declare const TodoSync: Contract

const App = Surface.application({ Model, Message, initial, update })

// A Link from the application's own field ref.
const SearchPlaced = Search.at(BundleSurface.link(App.model.search, GotSearchMessage))
const Rows = Row.each(Link.collection<Model>()('rows', GotRowMessage))
const placements = Bundle.assemble<Model, Message>()([SearchPlaced, Rows])

const AppModule = BundleSurface.module(App, placements, [TodoSync])
export const findings = Module.validate(AppModule) // []
