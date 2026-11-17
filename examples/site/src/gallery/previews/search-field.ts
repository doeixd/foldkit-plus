import type { NamedStyle } from 'foldkit-mixins'
import { Recipes, SearchFieldSlots } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Fields from '../fields.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'
import { fields } from '../previewShared.js'
import type { Live } from '../showcase.js'

const searchBasic = <Message>(style: NamedStyle<typeof SearchFieldSlots>, live: Live<Message>) =>
  Snippet.searchField(
    style,
    live.widgets.fields.search,
    {
      onInput: value => fields(live, Fields.Message.TypedSearch({ value })),
      onClear: fields(live, Fields.Message.ClearedSearch()),
    },
    live.h,
  )

const searchRoutes = <Message>(style: NamedStyle<typeof SearchFieldSlots>, live: Live<Message>) =>
  Snippet.searchFieldRoutes(
    style,
    live.widgets.fields.keyed,
    {
      onInput: value => fields(live, Fields.Message.TypedKeyed({ value })),
      onClear: fields(live, Fields.Message.ClearedKeyed()),
      onMove: by => fields(live, Fields.Message.MovedKeyed({ by })),
    },
    live.h,
  )

export const showcase = fromRecipe(
  about('search-field'),
  SearchFieldSlots,
  Recipes.SearchField,
  searchBasic,
  undefined,
  [
    { name: 'basic', title: 'Basic', draw: searchBasic },
    { name: 'routes', title: 'Keys of your own', draw: searchRoutes },
    {
      name: 'states',
      title: 'Invalid and disabled',
      draw: (style, live) =>
        Snippet.searchFieldStates(
          style,
          {
            onInput: value => fields(live, Fields.Message.TypedSearch({ value })),
            onClear: fields(live, Fields.Message.ClearedSearch()),
          },
          live.h,
        ),
    },
  ],
)
