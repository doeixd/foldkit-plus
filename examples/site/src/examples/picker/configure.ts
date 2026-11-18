import { Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Bundles, Picker, PickerSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { PickerMenu, PickerSheet } from '../../snippets/picker.js'

// Stated once, at module scope: the dropdown's look and the sheet's, and the
// words every picker of the application says. Each use gives what differs.
const AppPicker = Picker.configure({
  base: {
    listbox: [PickerMenu.mixin],
    sheet: [PickerSheet.mixin],
    placeholder: 'Choose',
    words: { clear: 'Clear the choice' },
  },
})

const sorts = ['relevance', 'price', 'name'] as const
const Sort = Picker.one(sorts)

const App = Bundle.compose({ sort: Schema.Option(Schema.Literals(sorts)) }).pipe(
  Bundle.withChild('box', Bundles.Picker, {
    args: { id: 'sort-configured' },
    onOut: out => model => ({ model: { ...model, sort: Sort.picked(model.sort, out) } }),
  }),
)

export default example({
  title: 'Configure once',
  slots: PickerSlots,
  recipe: Recipes.Picker,
  state: App.placements.runtime({ Model: App.Model, initial: { sort: Option.none() } }),
  view: ({ style, model, onMessage, h }) =>
    AppPicker.view(
      {
        model: model.box,
        onMessage: message => onMessage(App.Message.GotBoxMessage({ message })),
        label: 'Sort',
        choice: Sort,
        value: model.sort,
        style,
      },
      h,
    ),
})
