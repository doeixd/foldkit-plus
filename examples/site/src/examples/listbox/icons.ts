import { Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Bundles, Listbox, ListboxSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const fruits = ['Apple', 'Banana', 'Cherry', 'Durian'] as const
const Fruit = Listbox.one(fruits)
const glyphs: Readonly<Record<(typeof fruits)[number], string>> = {
  Apple: '🍎',
  Banana: '🍌',
  Cherry: '🍒',
  Durian: '🥭',
}

const App = Bundle.compose({ fruit: Schema.Option(Schema.Literals(fruits)) }).pipe(
  Bundle.withChild('box', Bundles.Listbox, {
    args: { id: 'fruit-icons' },
    onOut: out => model => ({ model: { ...model, fruit: Fruit.picked(model.fruit, out) } }),
  }),
)

// A row's `icon` is drawn before its label, in the list and on the trigger:
// a glyph, an avatar, a flag or a coloured dot are all the same option.
export default example({
  title: 'Icons',
  slots: ListboxSlots,
  recipe: Recipes.Listbox,
  state: App.placements.runtime({ Model: App.Model, initial: { fruit: Option.some('Cherry') } }),
  view: ({ style, model, onMessage, h }) =>
    Listbox.view(
      {
        model: model.box,
        onMessage: message => onMessage(App.Message.GotBoxMessage({ message })),
        label: 'Fruit',
        choice: Fruit,
        value: model.fruit,
        option: fruit => ({ label: fruit, icon: h.span([], [glyphs[fruit]]) }),
        placeholder: 'Pick a fruit',
        style,
        mixins: Listbox.fluid,
      },
      h,
    ),
})
