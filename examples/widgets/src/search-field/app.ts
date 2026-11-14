/**
 * The same search field placed twice. The parent owns each value; a child
 * sends Messages through its placement and its update changes only its slice.
 * Both placements use the same view, recipe and key routes.
 */
import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { defineMessageUnion } from 'foldkit/message'
import * as Submodel from 'foldkit/submodel'
import { SearchMessage, SearchModel, searchUpdate } from './child.js'
import { SearchView } from './view.js'

export const Search = Bundle.make('Search', {
  Model: SearchModel,
  Message: SearchMessage,
  args: Schema.Struct({ id: Schema.String }),
  init: ({ id }) => ({ model: { id, value: '', resultsOpen: false } }),
  update: searchUpdate,
  view: Submodel.defineView<SearchModel, SearchMessage>(SearchView),
})

export const First = Bundle.declare(Search, 'first')
export const Second = Bundle.declare(Search, 'second')
export const Model = Schema.Struct({ ...First.fields, ...Second.fields })
export type Model = typeof Model.Type
export const Message = defineMessageUnion({ ...First.cases, ...Second.cases })
export type Message = typeof Message.Type

const Parent = Bundle.parent({ Model, Message })
export const first = Parent.at(First, { args: { id: 'first' } })
export const second = Parent.at(Second, { args: { id: 'second' } })
const placements = Parent.assemble(first, second)
export const initial: Model = placements.initial({}).model
export const update = placements.update()
