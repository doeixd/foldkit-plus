import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Bundles, Listbox, ListboxSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const toppings = ['Basil', 'Capers', 'Mushrooms', 'Olives', 'Peppers'] as const
const Toppings = Listbox.many(toppings)

// A choice of several: `many` flips the row reported, the list stays open as
// rows are chosen, and `multiple: true` tells the Bundle to keep it so.
const App = Bundle.compose({ toppings: Schema.Array(Schema.Literals(toppings)) }).pipe(
  Bundle.withChild('box', Bundles.Listbox, {
    args: { id: 'toppings', multiple: true },
    onOut: out => model => ({
      model: { ...model, toppings: Toppings.picked(model.toppings, out) },
    }),
  }),
)

export default example({
  title: 'Several',
  slots: ListboxSlots,
  recipe: Recipes.Listbox,
  state: App.placements.runtime({ Model: App.Model, initial: { toppings: ['Basil', 'Olives'] } }),
  view: ({ style, model, onMessage, h }) =>
    Listbox.view(
      {
        model: model.box,
        onMessage: message => onMessage(App.Message.GotBoxMessage({ message })),
        label: 'Toppings',
        choice: Toppings,
        value: model.toppings,
        placeholder: 'Pick toppings',
        style,
        mixins: Listbox.fluid,
      },
      h,
    ),
})
