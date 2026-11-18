import { Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Bundles, Picker, PickerSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { PickerMenu, PickerSheet } from '../../snippets/picker.js'

const sorts = ['relevance', 'price', 'name'] as const
const Sort = Picker.one(sorts)

// One control, one Model and one set of Messages at every width: a dropdown
// above the theme's `md` breakpoint, and below it an opener that shows the
// options in a bottom sheet. Both are drawn and the style shows one, so a
// server render is right at any width; narrow the window to see the sheet.
const App = Bundle.compose({ sort: Schema.Option(Schema.Literals(sorts)) }).pipe(
  Bundle.withChild('box', Bundles.Picker, {
    args: { id: 'sort' },
    onOut: out => model => ({ model: { ...model, sort: Sort.picked(model.sort, out) } }),
  }),
)

export default example({
  title: 'Sort order',
  slots: PickerSlots,
  recipe: Recipes.Picker,
  state: App.placements.runtime({ Model: App.Model, initial: { sort: Option.none() } }),
  view: ({ style, model, onMessage, h }) =>
    Picker.view(
      {
        model: model.box,
        onMessage: message => onMessage(App.Message.GotBoxMessage({ message })),
        label: 'Sort',
        choice: Sort,
        value: model.sort,
        option: sort =>
          ({
            relevance: { label: 'Most relevant' },
            price: { label: 'Lowest price' },
            name: { label: 'Name' },
          })[sort],
        placeholder: 'Sort by',
        style,
        listbox: [PickerMenu.mixin],
        sheet: [PickerSheet.mixin],
      },
      h,
    ),
})
