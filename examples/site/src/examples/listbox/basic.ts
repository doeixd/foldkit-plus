import { Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Bundles, Listbox, ListboxSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const fruits = ['Apple', 'Banana', 'Cherry', 'Durian'] as const
const Fruit = Listbox.one(fruits)

// The fruit is the application's own field. The Listbox holds whether it is
// open and the row the keys are on, and reports a choice, which `Fruit.picked`
// folds into the field.
const App = Bundle.compose({ fruit: Schema.Option(Schema.Literals(fruits)) }).pipe(
  Bundle.withChild('box', Bundles.Listbox, {
    args: { id: 'fruit' },
    onOut: out => model => ({ model: { ...model, fruit: Fruit.picked(model.fruit, out) } }),
  }),
)

export default example({
  title: 'Basic',
  slots: ListboxSlots,
  recipe: Recipes.Listbox,
  state: App.placements.runtime({ Model: App.Model, initial: { fruit: Option.none() } }),
  view: ({ style, model, onMessage, h }) =>
    Listbox.view(
      {
        model: model.box,
        onMessage: message => onMessage(App.Message.GotBoxMessage({ message })),
        label: 'Fruit',
        choice: Fruit,
        value: model.fruit,
        placeholder: 'Pick a fruit',
        style,
        mixins: Listbox.fluid,
      },
      h,
    ),
})
