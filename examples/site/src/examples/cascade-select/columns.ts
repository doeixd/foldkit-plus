import { Bundles, CascadeSelect, CascadeSelectSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { Places } from '../../snippets/places.js'

// A city chosen through its country and region: a column per level, the
// arrows within and between them. The chosen path of ids is the widget's own
// value, held in its state (`model.value`); `Places` is given to the state
// and to the view alike.
export default example({
  title: 'Columns',
  slots: CascadeSelectSlots,
  recipe: Recipes.CascadeSelect,
  state: Bundles.CascadeSelect.with({ id: 'city', config: Places }),
  view: ({ style, model, onMessage, h }) =>
    CascadeSelect.view(
      {
        model,
        config: Places,
        onMessage,
        label: 'City',
        placeholder: 'Choose a city',
        levels: ['Country', 'Region', 'City'],
        clear: true,
        style,
      },
      h,
    ),
})
