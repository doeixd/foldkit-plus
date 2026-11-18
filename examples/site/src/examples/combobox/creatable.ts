import { Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { modifyFields } from 'foldkit/struct'
import { Bundles, Combobox, ComboboxSlots, ChoiceChange, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const cities = ['Kyiv', 'Lagos', 'Lima', 'Oslo', 'Osaka', 'Quito', 'Seoul', 'Zurich']

// With no match, the typed words are the one row, offered as a new city. The
// cities the reader made are the application's field beside the choice, and
// the choice is read over both lists.
const App = Bundle.compose({
  city: Schema.Option(Schema.String),
  created: Schema.Array(Schema.String),
}).pipe(
  Bundle.withChild('box', Bundles.Combobox, {
    args: { id: 'creatable-city' },
    onOut: out => model => {
      const created = ChoiceChange.match(out, {
        Selected: ({ value }) =>
          [...cities, ...model.created].includes(value) ? model.created : [...model.created, value],
        ClearedSelection: () => model.created,
        Typed: () => model.created,
      })
      return {
        model: modifyFields(model, {
          created: () => created,
          city: city => Combobox.one([...cities, ...created]).picked(city, out),
        }),
      }
    },
  }),
)

export default example({
  title: 'Creatable',
  slots: ComboboxSlots,
  recipe: Recipes.Combobox,
  state: App.placements.runtime({
    Model: App.Model,
    initial: { city: Option.none(), created: [] },
  }),
  view: ({ style, model, onMessage, h }) => {
    const known = [...cities, ...model.created]
    const typed = model.box.inputValue.trim()
    const matches = known.filter(city => city.toLowerCase().includes(typed.toLowerCase()))
    return Combobox.view(
      {
        model: model.box,
        onMessage: message => onMessage(App.Message.GotBoxMessage({ message })),
        label: 'City',
        choice: Combobox.one(known),
        value: model.city,
        items: matches.length === 0 && typed !== '' ? [typed] : matches,
        option: city => ({ label: known.includes(city) ? city : `Create “${city}”` }),
        placeholder: 'Find or add a city',
        style,
        mixins: Combobox.fluid,
      },
      h,
    )
  },
})
