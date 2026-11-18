import { Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Bundles, Listbox, ListboxSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { stack } from '../../snippets/layout.js'

const fruits = ['Apple', 'Banana', 'Cherry', 'Durian'] as const
const Fruit = Listbox.one(fruits)

const apple: Option.Option<(typeof fruits)[number]> = Option.some('Apple')

// Each Listbox is placed once: its own open state and its own row.
const App = Bundle.compose({ fruit: Schema.Option(Schema.Literals(fruits)) }).pipe(
  Bundle.withChild('invalid', Bundles.Listbox, {
    args: { id: 'fruit-invalid' },
    onOut: out => model => ({ model: { ...model, fruit: Fruit.picked(model.fruit, out) } }),
  }),
  Bundle.withChild('off', Bundles.Listbox, { args: { id: 'fruit-off' }, onOut: Bundle.ignore }),
  Bundle.withChild('sold', Bundles.Listbox, { args: { id: 'fruit-sold' }, onOut: Bundle.ignore }),
)

export default example({
  title: 'Invalid, disabled, and a row that cannot be chosen',
  slots: ListboxSlots,
  recipe: Recipes.Listbox,
  state: App.placements.runtime({ Model: App.Model, initial: { fruit: Option.none() } }),
  view: ({ style, model, onMessage, h }) =>
    stack(h, [
      Listbox.view(
        {
          model: model.invalid,
          onMessage: message => onMessage(App.Message.GotInvalidMessage({ message })),
          label: 'Fruit',
          choice: Fruit,
          value: model.fruit,
          placeholder: 'Pick a fruit: required',
          invalid: Option.isNone(model.fruit),
          style,
        },
        h,
      ),
      Listbox.view(
        {
          model: model.off,
          onMessage: message => onMessage(App.Message.GotOffMessage({ message })),
          label: 'Fruit',
          choice: Fruit,
          value: apple,
          disabled: true,
          style,
        },
        h,
      ),
      Listbox.view(
        {
          model: model.sold,
          onMessage: message => onMessage(App.Message.GotSoldMessage({ message })),
          label: 'Fruit',
          choice: Fruit,
          value: Option.none(),
          option: fruit => ({
            label: fruit,
            description: fruit === 'Durian' ? 'Out of season' : undefined,
            disabled: fruit === 'Durian',
          }),
          placeholder: 'Durian is out of season',
          style,
          mixins: Listbox.fluid,
        },
        h,
      ),
    ]),
})
