import { Bundles, CascadeSelect, CascadeSelectSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { Places } from '../../snippets/places.js'

// One level at a time with a way back: a phone's width holds one column.
// Columns that would not fit the window drill in on their own as well.
export default example({
  title: 'One level at a time',
  slots: CascadeSelectSlots,
  recipe: Recipes.CascadeSelect,
  state: Bundles.CascadeSelect.with({ id: 'city-drill', config: Places }),
  view: ({ style, model, onMessage, h }) =>
    CascadeSelect.view(
      { model, config: Places, onMessage, label: 'City', layout: 'drill', style },
      h,
    ),
})
