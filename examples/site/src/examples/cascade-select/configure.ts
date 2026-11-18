import { Bundles, CascadeSelect, CascadeSelectSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { Places } from '../../snippets/places.js'

// Stated once, at module scope: what every cascade of the application says
// and how it lays out, and a named preset over it.
const AppCascade = CascadeSelect.configure({
  base: { clear: true, separator: ' › ', words: { placeholder: 'Choose', clear: 'Reset' } },
  presets: { drilled: { layout: 'drill', levels: ['Country', 'Region', 'City'] } },
})

export default example({
  title: 'Configure once',
  slots: CascadeSelectSlots,
  recipe: Recipes.CascadeSelect,
  state: Bundles.CascadeSelect.with({ id: 'city-configured', config: Places, value: ['sg'] }),
  view: ({ style, model, onMessage, h }) =>
    AppCascade.view(
      { model, config: Places, onMessage, label: 'City', preset: 'drilled', style },
      h,
    ),
})
