import { Bundles, CascadeSelect, CascadeSelectSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { Places } from '../../snippets/places.js'

// The fixed text is `words`, with `{label}` filled where a word names a row:
// one object says it in another language. The levels' names, the placeholder
// and the separator are data of the use.
export default example({
  title: 'In German',
  slots: CascadeSelectSlots,
  recipe: Recipes.CascadeSelect,
  state: Bundles.CascadeSelect.with({ id: 'stadt', config: Places, value: ['ca', 'on', 'tor'] }),
  view: ({ style, model, onMessage, h }) =>
    CascadeSelect.view(
      {
        model,
        config: Places,
        onMessage,
        label: 'Stadt',
        levels: ['Land', 'Region', 'Stadt'],
        separator: ' › ',
        layout: 'drill',
        clear: true,
        words: { placeholder: 'Stadt wählen', clear: 'Auswahl löschen', back: 'Zurück zu {label}' },
        style,
      },
      h,
    ),
})
