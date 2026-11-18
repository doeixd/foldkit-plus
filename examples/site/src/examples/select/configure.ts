import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Recipes, Select, SelectSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { forSlots } from '../../snippets/theme.js'

const Filled = forSlots(SelectSlots)(Recipes.Select({ variant: 'filled', size: 'sm' }))

// Every select of the application is a small filled one with the same
// placeholder; a use gives its options and its value.
const AppSelect = Select.configure({
  base: { style: Filled, placeholder: 'Choose one' },
})

const Model = Schema.Struct({ plan: Schema.String })
const Message = defineMessageUnion({ Chose: { plan: Schema.String } })

export default example({
  title: 'Configure once',
  slots: SelectSlots,
  recipe: Recipes.Select,
  state: {
    Model,
    Message,
    init: () => ({ model: { plan: '' } }),
    update: (model, { plan }) => ({ model: model.plan === plan ? model : { plan } }),
  },
  view: ({ model, onMessage, h }) =>
    AppSelect.view(
      {
        id: 'plan',
        label: 'Plan',
        options: [
          { value: 'free', label: 'Free' },
          { value: 'team', label: 'Team' },
        ],
        value: model.plan,
        onChange: plan => onMessage(Message.Chose({ plan })),
      },
      h,
    ),
})
