import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Bundles, Combobox, ComboboxSlots, Recipes, type Choice } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// A rule of the application's own, written against the public `Choice`
// interface: the shipped `many`, with a fourth pick refused.
const upToThree = <Item extends string>(
  items: ReadonlyArray<Item>,
): Choice<Item, ReadonlyArray<Item>> => {
  const many = Combobox.many(items)
  return {
    ...many,
    picked: (value, change) => {
      const next = many.picked(value, change)
      return next.length > 3 ? value : next
    },
  }
}

const cities = ['Kyiv', 'Lagos', 'Lima', 'Oslo', 'Osaka', 'Quito', 'Seoul', 'Zurich'] as const
const Stops = upToThree(cities)

const App = Bundle.compose({ stops: Schema.Array(Schema.Literals(cities)) }).pipe(
  Bundle.withChild('box', Bundles.Combobox, {
    args: { id: 'three-stops', multiple: true },
    onOut: out => model => ({ model: { ...model, stops: Stops.picked(model.stops, out) } }),
  }),
)

export default example({
  title: 'A choice of your own: at most three',
  slots: ComboboxSlots,
  recipe: Recipes.Combobox,
  state: App.placements.runtime({ Model: App.Model, initial: { stops: ['Kyiv', 'Oslo'] } }),
  view: ({ style, model, onMessage, h }) =>
    Combobox.view(
      {
        model: model.box,
        onMessage: message => onMessage(App.Message.GotBoxMessage({ message })),
        label: 'Stops, up to three',
        choice: Stops,
        value: model.stops,
        filter: Combobox.contains,
        chips: true,
        style,
      },
      h,
    ),
})
