import { Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { modifyFields } from 'foldkit/struct'
import { Bundles, ChoiceChange, Listbox, ListboxSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const fruits = ['Apple', 'Banana', 'Cherry', 'Durian'] as const
const Fruit = Listbox.one(fruits)

// The value is the application's, so the clear button sends the
// application's own Message, and the application empties its field through
// the same `Choice` that folds a pick.
const App = Bundle.compose({ fruit: Schema.Option(Schema.Literals(fruits)) }).pipe(
  Bundle.withMessages({ Cleared: {} }),
  Bundle.withChild('box', Bundles.Listbox, {
    args: { id: 'fruit-clear' },
    onOut: out => model => ({ model: { ...model, fruit: Fruit.picked(model.fruit, out) } }),
  }),
)

export default example({
  title: 'A clear button',
  slots: ListboxSlots,
  recipe: Recipes.Listbox,
  state: App.placements.runtime({
    Model: App.Model,
    initial: { fruit: Option.some('Cherry') },
    update: App.placements.update(model => ({
      model: modifyFields(model, {
        fruit: fruit => Fruit.picked(fruit, ChoiceChange.ClearedSelection()),
      }),
    })),
  }),
  view: ({ style, model, onMessage, h }) =>
    Listbox.view(
      {
        model: model.box,
        onMessage: message => onMessage(App.Message.GotBoxMessage({ message })),
        label: 'Fruit',
        choice: Fruit,
        value: model.fruit,
        placeholder: 'Pick a fruit',
        clear: { onClear: onMessage(App.Message.Cleared()) },
        words: { clear: 'Clear the fruit' },
        style,
        mixins: Listbox.fluid,
      },
      h,
    ),
})
