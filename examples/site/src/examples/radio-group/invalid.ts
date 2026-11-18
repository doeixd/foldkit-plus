import { Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Bundles, RadioGroup, RadioGroupSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const App = Bundle.compose({ answer: Schema.OptionFromNullOr(Schema.String) }).pipe(
  Bundle.withChild('choice', Bundles.RadioGroup, {
    args: { id: 'answer' },
    onOut: out => model => ({ model: { ...model, answer: Option.some(out.value) } }),
  }),
)

// An `error` makes the group `aria-invalid`, says why under it and describes
// the group by it. It goes with the answer: the field's own rule is the
// application's.
export default example({
  title: 'Invalid',
  slots: RadioGroupSlots,
  recipe: Recipes.RadioGroup,
  state: App.placements.runtime({ Model: App.Model, initial: { answer: Option.none() } }),
  view: ({ style, model, onMessage, h }) =>
    RadioGroup.view(
      {
        model: model.choice,
        onMessage: message => onMessage(App.Message.GotChoiceMessage({ message })),
        legend: 'Will you attend?',
        options: [
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
        ],
        value: model.answer,
        ...(Option.isNone(model.answer) ? { error: 'Choose an answer.' } : {}),
        style,
      },
      h,
    ),
})
