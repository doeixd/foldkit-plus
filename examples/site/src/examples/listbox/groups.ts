import { Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Bundles, Listbox, ListboxSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const fruits = ['Apple', 'Banana', 'Cherry', 'Durian'] as const
const Fruit = Listbox.one(fruits)

const App = Bundle.compose({ fruit: Schema.Option(Schema.Literals(fruits)) }).pipe(
  Bundle.withChild('box', Bundles.Listbox, {
    args: { id: 'fruit-groups' },
    onOut: out => model => ({ model: { ...model, fruit: Fruit.picked(model.fruit, out) } }),
  }),
)

// Rows next to each other with one group name stand under its heading.
export default example({
  title: 'Groups',
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
        groupBy: fruit => (fruit === 'Apple' || fruit === 'Banana' ? 'Every day' : 'In season'),
        heading: group => h.span([], [group]),
        placeholder: 'Pick a fruit',
        style,
        mixins: Listbox.fluid,
      },
      h,
    ),
})
