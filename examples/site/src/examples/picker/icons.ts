import { Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Bundles, Picker, PickerSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { PickerMenu, PickerSheet } from '../../snippets/picker.js'

const sorts = ['relevance', 'price', 'name'] as const
const Sort = Picker.one(sorts)
const rows = {
  relevance: { label: 'Most relevant', note: 'What matches best', glyph: '★' },
  price: { label: 'Lowest price', note: 'The cheapest first', glyph: '£' },
  name: { label: 'Name', note: 'A to Z', glyph: 'A' },
}

const App = Bundle.compose({ sort: Schema.Option(Schema.Literals(sorts)) }).pipe(
  Bundle.withChild('box', Bundles.Picker, {
    args: { id: 'sort-icons' },
    onOut: out => model => ({ model: { ...model, sort: Sort.picked(model.sort, out) } }),
  }),
)

// A row's `icon` and `description` are drawn in the dropdown and in the sheet
// alike, and the icon on the trigger.
export default example({
  title: 'Icons and descriptions',
  slots: PickerSlots,
  recipe: Recipes.Picker,
  state: App.placements.runtime({ Model: App.Model, initial: { sort: Option.some('price') } }),
  view: ({ style, model, onMessage, h }) =>
    Picker.view(
      {
        model: model.box,
        onMessage: message => onMessage(App.Message.GotBoxMessage({ message })),
        label: 'Sort',
        choice: Sort,
        value: model.sort,
        option: sort => ({
          label: rows[sort].label,
          description: rows[sort].note,
          icon: h.span([], [rows[sort].glyph]),
        }),
        placeholder: 'Sort by',
        style,
        listbox: [PickerMenu.mixin],
        sheet: [PickerSheet.mixin],
      },
      h,
    ),
})
