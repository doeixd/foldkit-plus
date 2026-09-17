/**
 * The sixty-second example from this package's README, type-checked.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { Module, Surface, type Contract } from 'foldkit-surface'
import { BundleSurface } from '../src/index.js'

const SearchModel = Schema.Struct({ query: Schema.String })
const SearchMessage = defineMessageUnion({ Typed: { query: Schema.String } })
const Search = Bundle.make('Search', {
  Model: SearchModel,
  Message: SearchMessage,
  init: () => ({ model: { query: '' } }),
  update: (_model, message) => ({ model: { query: message.query } }),
})
const Row = Search

const Searchbox = Bundle.declare(Search, 'search')
const Rows = Bundle.declareEach(Row, 'rows')

const Todo = Schema.String
const Model = Schema.Struct({ ...Searchbox.fields, ...Rows.fields, todos: Schema.Array(Todo) })
const Message = defineMessageUnion({ ...Searchbox.cases, ...Rows.cases })
declare const TodoSync: Contract

const App = Surface.application({ Model, Message })

const Page = BundleSurface.parent(App)
const placements = Page.assemble(Page.at(Searchbox), Page.each(Rows))

const AppModule = Page.module(placements, [TodoSync])
export const findings = Module.validate(AppModule) // []
