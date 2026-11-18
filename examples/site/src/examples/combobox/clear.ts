import { Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Bundles, Combobox, ComboboxSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const cities = ['Kyiv', 'Lagos', 'Lima', 'Oslo', 'Osaka', 'Quito', 'Seoul', 'Zurich'] as const
const City = Combobox.one(cities)

// `nullable` lets an emptied field clear the value, and `text` is what the
// field shows for the city chosen before the page drew.
const App = Bundle.compose({ city: Schema.Option(Schema.Literals(cities)) }).pipe(
  Bundle.withChild('box', Bundles.Combobox, {
    args: { id: 'clearable-city', nullable: true, text: 'Oslo' },
    onOut: out => model => ({ model: { ...model, city: City.picked(model.city, out) } }),
  }),
)

export default example({
  title: 'A clear button',
  slots: ComboboxSlots,
  recipe: Recipes.Combobox,
  state: App.placements.runtime({ Model: App.Model, initial: { city: Option.some('Oslo') } }),
  view: ({ style, model, onMessage, h }) =>
    Combobox.view(
      {
        model: model.box,
        onMessage: message => onMessage(App.Message.GotBoxMessage({ message })),
        label: 'City',
        choice: City,
        value: model.city,
        filter: Combobox.contains,
        clear: true,
        words: { clear: 'Clear the city' },
        style,
      },
      h,
    ),
})
