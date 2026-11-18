import { Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Bundles, Combobox, ComboboxSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const cities = ['Kyiv', 'Lagos', 'Lima', 'Oslo', 'Osaka', 'Quito', 'Seoul', 'Zurich'] as const
const City = Combobox.one(cities)

// The city is the application's own field. The Combobox holds what is typed
// and highlighted, and reports a choice, which `City.picked` folds.
const App = Bundle.compose({ city: Schema.Option(Schema.Literals(cities)) }).pipe(
  Bundle.withChild('box', Bundles.Combobox, {
    args: { id: 'city', animated: true },
    onOut: out => model => ({ model: { ...model, city: City.picked(model.city, out) } }),
  }),
)

export default example({
  title: 'Basic',
  slots: ComboboxSlots,
  recipe: Recipes.Combobox,
  state: App.placements.runtime({ Model: App.Model, initial: { city: Option.none() } }),
  view: ({ style, model, onMessage, h }) =>
    Combobox.view(
      {
        model: model.box,
        onMessage: message => onMessage(App.Message.GotBoxMessage({ message })),
        label: 'City',
        choice: City,
        value: model.city,
        filter: Combobox.contains,
        placeholder: 'Find a city',
        style,
        mixins: Combobox.fluid,
      },
      h,
    ),
})
