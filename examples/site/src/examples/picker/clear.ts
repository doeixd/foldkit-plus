import { Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { modifyFields } from 'foldkit/struct'
import { Bundles, ChoiceChange, Picker, PickerSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { PickerMenu, PickerSheet } from '../../snippets/picker.js'

const sorts = ['relevance', 'price', 'name'] as const
const Sort = Picker.one(sorts)

// The value is the application's, so the clear button sends the
// application's own Message, and the application empties its field through
// the same `Choice` that folds a pick. It is drawn beside the dropdown's
// trigger and beside the phone's opener.
const App = Bundle.compose({ sort: Schema.Option(Schema.Literals(sorts)) }).pipe(
  Bundle.withMessages({ Cleared: {} }),
  Bundle.withChild('box', Bundles.Picker, {
    args: { id: 'sort-clear' },
    onOut: out => model => ({ model: { ...model, sort: Sort.picked(model.sort, out) } }),
  }),
)

export default example({
  title: 'A clear button',
  slots: PickerSlots,
  recipe: Recipes.Picker,
  state: App.placements.runtime({
    Model: App.Model,
    initial: { sort: Option.some('name') },
    update: App.placements.update(model => ({
      model: modifyFields(model, {
        sort: sort => Sort.picked(sort, ChoiceChange.ClearedSelection()),
      }),
    })),
  }),
  view: ({ style, model, onMessage, h }) =>
    Picker.view(
      {
        model: model.box,
        onMessage: message => onMessage(App.Message.GotBoxMessage({ message })),
        label: 'Sort',
        choice: Sort,
        value: model.sort,
        placeholder: 'Sort by',
        clear: { onClear: onMessage(App.Message.Cleared()) },
        style,
        listbox: [PickerMenu.mixin],
        sheet: [PickerSheet.mixin],
      },
      h,
    ),
})
