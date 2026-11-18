import { Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Bundles, Picker, PickerSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { PickerMenu, PickerSheet } from '../../snippets/picker.js'

const sorts = ['relevance', 'newest', 'price', 'name'] as const
const Sort = Picker.one(sorts)

const App = Bundle.compose({ sort: Schema.Option(Schema.Literals(sorts)) }).pipe(
  Bundle.withChild('box', Bundles.Picker, {
    args: { id: 'sort-groups' },
    onOut: out => model => ({ model: { ...model, sort: Sort.picked(model.sort, out) } }),
  }),
)

// Rows next to each other with one group name stand under its heading, in
// the dropdown and in the sheet.
export default example({
  title: 'Groups',
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
        groupBy: sort => (sort === 'price' || sort === 'name' ? 'Field' : 'Smart'),
        heading: group => h.span([], [group]),
        placeholder: 'Sort by',
        style,
        listbox: [PickerMenu.mixin],
        sheet: [PickerSheet.mixin],
      },
      h,
    ),
})
