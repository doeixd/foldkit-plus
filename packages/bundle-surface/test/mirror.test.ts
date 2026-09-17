/**
 * Mirroring a placement needs no bundle API: the placement's fields are in the
 * application's ref tree, and a key per placement keeps two placements of one
 * bundle apart in the URL.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Link } from 'foldkit-bundle'
import { Mirror } from 'foldkit-mirror'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'

const SearchModel = Schema.Struct({ query: Schema.String })
const SearchMessage = defineMessageUnion({ Typed: { query: Schema.String } })
const GotSearchMessage = Link.wrapper('GotSearchMessage', SearchMessage)
const GotFilterMessage = Link.wrapper('GotFilterMessage', SearchMessage)

const Model = Schema.Struct({ search: SearchModel, filter: SearchModel })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...GotSearchMessage.cases, ...GotFilterMessage.cases })
const initial: Model = { search: { query: '' }, filter: { query: '' } }
const App = Surface.application({ Model, Message, initial, update: model => ({ model }) })

// One mirror per placement, each field under a key prefixed with the placement's path.
const SearchUrl = Mirror.url(App, {
  name: 'search',
  fields: [App.fields.search.query],
  keys: { query: { key: 'search.q' } },
})
const FilterUrl = Mirror.url(App, {
  name: 'filter',
  fields: [App.fields.filter.query],
  keys: { query: { key: 'filter.q' } },
})

describe('mirroring placements', () => {
  it('writes two placements of one bundle under separate URL keys', () => {
    const model: Model = { search: { query: 'apollo' }, filter: { query: 'open' } }
    expect(SearchUrl.encode(model)).toEqual({ 'search.q': 'apollo' })
    expect(FilterUrl.encode(model)).toEqual({ 'filter.q': 'open' })
  })

  it('reads each placement’s key back into its own slice', () => {
    const url = '/?search.q=apollo&filter.q=open'
    expect(FilterUrl.reduce(SearchUrl.reduce(initial, url), url)).toEqual({
      search: { query: 'apollo' },
      filter: { query: 'open' },
    })
  })
})
