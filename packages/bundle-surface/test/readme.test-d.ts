import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { BundleSurface } from '../src/index.js'
import { Module, Surface } from 'foldkit-surface'

const Search = Bundle.make('Search', {
  Model: Schema.Struct({ query: Schema.String }),
  Message: defineMessageUnion({ Typed: { query: Schema.String } }),
  init: () => ({ model: { query: '' } }),
  update: (_model, message) => ({ model: { query: message.query } }),
})
const Searchbox = Bundle.declare(Search, 'search')
const Model = Schema.Struct({ ...Searchbox.fields })
const Message = defineMessageUnion({ ...Searchbox.cases })
const App = Surface.application({ Model, Message })
const Page = BundleSurface.parent(App)
const placements = Page.assemble(Page.at(Searchbox))

const AppModule = Page.module(placements, [])
Module.validate(AppModule) // []
