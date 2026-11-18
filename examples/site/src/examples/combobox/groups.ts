import { Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Bundles, Combobox, ComboboxSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { label } from '../../snippets/layout.js'

// Rows of one group are adjacent in the list; `option` gives each row more
// than its name, and `heading` draws a group's.
const places = {
  Lagos: 'Africa',
  Lima: 'Americas',
  Quito: 'Americas',
  Oslo: 'Europe',
  Zurich: 'Europe',
}
const cities = ['Lagos', 'Lima', 'Quito', 'Oslo', 'Zurich'] as const
const City = Combobox.one(cities)

const App = Bundle.compose({ city: Schema.Option(Schema.Literals(cities)) }).pipe(
  Bundle.withChild('box', Bundles.Combobox, {
    args: { id: 'grouped-city' },
    onOut: out => model => ({ model: { ...model, city: City.picked(model.city, out) } }),
  }),
)

export default example({
  title: 'Groups',
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
        groupBy: city => places[city],
        heading: group => label(h, [group]),
        option: city => ({ label: city, description: places[city] }),
        placeholder: 'Find a city',
        style,
      },
      h,
    ),
})
