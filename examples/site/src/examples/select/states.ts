import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Recipes, Select, SelectSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { stack } from '../../snippets/layout.js'

const Model = Schema.Struct({ region: Schema.String })
const Message = defineMessageUnion({ Chose: { region: Schema.String } })

const options = [
  { value: 'europe', label: 'Europe' },
  { value: 'americas', label: 'Americas' },
]

// `disabled` refuses the control; `invalid` shows the error edge and says so
// (`aria-invalid`).
export default example({
  title: 'Disabled and invalid',
  slots: SelectSlots,
  recipe: Recipes.Select,
  state: {
    Model,
    Message,
    init: () => ({ model: { region: 'europe' } }),
    update: (model, { region }) => ({ model: model.region === region ? model : { region } }),
  },
  view: ({ style, model, onMessage, h }) => {
    const common = {
      options,
      value: model.region,
      onChange: (region: string) => onMessage(Message.Chose({ region })),
      style,
    }
    return stack(h, [
      Select.view({ id: 'off', label: 'Disabled', disabled: true, ...common }, h),
      Select.view({ id: 'bad', label: 'Invalid', invalid: true, ...common }, h),
    ])
  },
})
