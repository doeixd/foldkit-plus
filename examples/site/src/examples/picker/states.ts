import { Option } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Bundles, Picker, PickerSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { stack } from '../../snippets/layout.js'
import { PickerMenu, PickerSheet } from '../../snippets/picker.js'

const sorts = ['relevance', 'price', 'name'] as const
const Sort = Picker.one(sorts)

const price: Option.Option<(typeof sorts)[number]> = Option.some('price')

// Each Picker is placed once: its own open state and its own Sheet.
const App = Bundle.compose({}).pipe(
  Bundle.withChild('invalid', Bundles.Picker, {
    args: { id: 'sort-invalid' },
    onOut: Bundle.ignore,
  }),
  Bundle.withChild('off', Bundles.Picker, { args: { id: 'sort-off' }, onOut: Bundle.ignore }),
)

export default example({
  title: 'Invalid and disabled',
  slots: PickerSlots,
  recipe: Recipes.Picker,
  state: App.placements.runtime({ Model: App.Model, initial: {} }),
  view: ({ style, model, onMessage, h }) =>
    stack(h, [
      Picker.view(
        {
          model: model.invalid,
          onMessage: message => onMessage(App.Message.GotInvalidMessage({ message })),
          label: 'Sort',
          choice: Sort,
          value: Option.none(),
          placeholder: 'Sort by: required',
          invalid: true,
          style,
          listbox: [PickerMenu.mixin],
          sheet: [PickerSheet.mixin],
        },
        h,
      ),
      Picker.view(
        {
          model: model.off,
          onMessage: message => onMessage(App.Message.GotOffMessage({ message })),
          label: 'Sort',
          choice: Sort,
          value: price,
          disabled: true,
          style,
          listbox: [PickerMenu.mixin],
          sheet: [PickerSheet.mixin],
        },
        h,
      ),
    ]),
})
