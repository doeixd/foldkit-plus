/**
 * Timer takes its interval as args, so a placement gives them, and a
 * non-positive interval never reaches the tick stream.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { Timer, debounce } from '../src/time/index.js'

const Ticks = Bundle.declare(Timer, 'ticks')
const Model = Schema.Struct({ ...Ticks.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Ticks.cases })
const Page = Bundle.parent({ Model, Message })

// A placement gives the interval:
// @ts-expect-error: args is required
Page.at(Ticks)

const SearchInput = debounce({ name: 'SearchInput', value: Schema.String })
const Search = Bundle.declare(SearchInput, 'search')
const SearchModel = Schema.Struct({ ...Search.fields, fired: Schema.Array(Schema.String) })
type SearchModel = typeof SearchModel.Type
const SearchMessage = defineMessageUnion({ ...Search.cases })
const SearchPage = Bundle.parent({ Model: SearchModel, Message: SearchMessage })

// A bundle with an OutMessage must be placed with onOut:
// @ts-expect-error: onOut is required
SearchPage.at(Search, { args: { delayMs: 300 } })
