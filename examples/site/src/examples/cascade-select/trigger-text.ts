import { Bundles, CascadeSelect, CascadeSelectSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { Places } from '../../snippets/places.js'

// `triggerText` says what the trigger shows for the labels of the chosen
// path: here a long path is collapsed to its two ends.
export default example({
  title: 'A long path, collapsed',
  slots: CascadeSelectSlots,
  recipe: Recipes.CascadeSelect,
  state: Bundles.CascadeSelect.with({
    id: 'city-collapsed',
    config: Places,
    value: ['ca', 'on', 'tor'],
  }),
  view: ({ style, model, onMessage, h }) =>
    CascadeSelect.view(
      {
        model,
        config: Places,
        onMessage,
        label: 'City',
        triggerText: labels =>
          labels.length > 2 ? `${labels[0]} / … / ${labels.at(-1)}` : labels.join(' / '),
        style,
      },
      h,
    ),
})
