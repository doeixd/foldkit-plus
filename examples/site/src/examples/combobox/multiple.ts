import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Bundles, Combobox, ComboboxSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const cities = ['Kyiv', 'Lagos', 'Lima', 'Oslo', 'Osaka', 'Quito', 'Seoul', 'Zurich'] as const
const Cities = Combobox.many(cities)

// Several: the value is a list, each chosen city a chip in the field, and
// the list stays open as cities are chosen. `multiple` must agree with the choice.
const App = Bundle.compose({ stops: Schema.Array(Schema.Literals(cities)) }).pipe(
  Bundle.withChild('box', Bundles.Combobox, {
    args: { id: 'stops', multiple: true, animated: true },
    onOut: out => model => ({ model: { ...model, stops: Cities.picked(model.stops, out) } }),
  }),
)

export default example({
  title: 'Several, as chips',
  slots: ComboboxSlots,
  recipe: Recipes.Combobox,
  state: App.placements.runtime({ Model: App.Model, initial: { stops: ['Lima', 'Seoul'] } }),
  view: ({ style, model, onMessage, h }) =>
    Combobox.view(
      {
        model: model.box,
        onMessage: message => onMessage(App.Message.GotBoxMessage({ message })),
        label: 'Stops',
        choice: Cities,
        value: model.stops,
        filter: Combobox.contains,
        chips: true,
        placeholder: 'Add a stop',
        name: 'stops',
        style,
      },
      h,
    ),
})
