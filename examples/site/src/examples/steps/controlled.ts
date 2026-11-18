import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Recipes, Steps, StepsSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Message = defineMessageUnion({ WentBack: { index: Schema.Number } })

// With `onSelect`, a completed step is a button that goes back to it. A step
// ahead never is: reaching it is the form's job, not the list's.
export default example({
  title: 'Going back',
  slots: StepsSlots,
  recipe: Recipes.Steps,
  state: {
    Model: Schema.Number,
    Message,
    init: () => ({ model: 3 }),
    update: (_, message) => ({ model: message.index }),
  },
  view: ({ style, model: current, onMessage, h }) =>
    Steps.view(
      {
        label: 'Checkout',
        steps: [{ title: 'Account' }, { title: 'Plan' }, { title: 'Payment' }, { title: 'Review' }],
        current,
        onSelect: index => onMessage(Message.WentBack({ index })),
        style,
      },
      h,
    ),
})
