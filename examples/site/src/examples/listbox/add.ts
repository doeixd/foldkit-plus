import { Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Style } from 'foldkit-mixins'
import { Bundles, Listbox, ListboxSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { t } from '../../snippets/theme.js'

const fruits = ['Apple', 'Banana', 'Cherry', 'Durian'] as const
const Fruit = Listbox.one(fruits)

// The shipped recipe has no `rows` axis. `add` gives it one, and its sizes,
// triggers and checks still apply; a value an axis already has is refused.
const Divided = Recipes.Listbox.add({
  rows: {
    divided: {
      item: Style.self({ borderBlockEnd: `${t.border.thin} solid ${t.outline.default}` }),
    },
  },
})

const App = Bundle.compose({ fruit: Schema.Option(Schema.Literals(fruits)) }).pipe(
  Bundle.withChild('box', Bundles.Listbox, {
    args: { id: 'fruit-divided' },
    onOut: out => model => ({ model: { ...model, fruit: Fruit.picked(model.fruit, out) } }),
  }),
)

export default example({
  title: 'A look of your own',
  slots: ListboxSlots,
  recipe: Divided,
  pins: { rows: 'divided' },
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
      },
      h,
    ),
})
