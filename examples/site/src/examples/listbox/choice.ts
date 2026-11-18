import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Bundles, Listbox, ListboxSlots, Recipes, type Choice } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// A rule of the application's own, written against the public `Choice`
// interface: the shipped `many`, with a third pick refused.
const upToTwo = <Item extends string>(
  items: ReadonlyArray<Item>,
): Choice<Item, ReadonlyArray<Item>> => {
  const many = Listbox.many(items)
  return {
    ...many,
    picked: (value, change) => {
      const next = many.picked(value, change)
      return next.length > 2 ? value : next
    },
  }
}

const colours = ['Amber', 'Blue', 'Coral', 'Green'] as const
const Colours = upToTwo(colours)

const App = Bundle.compose({ colours: Schema.Array(Schema.Literals(colours)) }).pipe(
  Bundle.withChild('box', Bundles.Listbox, {
    args: { id: 'two-colours', multiple: true },
    onOut: out => model => ({ model: { ...model, colours: Colours.picked(model.colours, out) } }),
  }),
)

export default example({
  title: 'A choice of your own: at most two',
  slots: ListboxSlots,
  recipe: Recipes.Listbox,
  state: App.placements.runtime({ Model: App.Model, initial: { colours: ['Blue'] } }),
  view: ({ style, model, onMessage, h }) =>
    Listbox.view(
      {
        model: model.box,
        onMessage: message => onMessage(App.Message.GotBoxMessage({ message })),
        label: 'Colours, up to two',
        choice: Colours,
        value: model.colours,
        placeholder: 'Pick up to two',
        style,
      },
      h,
    ),
})
