import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Recipes, Select, SelectSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Model = Schema.Struct({ region: Schema.String })
const Message = defineMessageUnion({ Chose: { region: Schema.String } })

// An empty first option that names what to choose, muted while it is the
// chosen one and not a choice itself. The value is empty until one is made.
export default example({
  title: 'Placeholder and description',
  slots: SelectSlots,
  recipe: Recipes.Select,
  state: {
    Model,
    Message,
    init: () => ({ model: { region: '' } }),
    update: (model, { region }) => ({ model: model.region === region ? model : { region } }),
  },
  view: ({ style, model, onMessage, h }) =>
    Select.view(
      {
        id: 'region-placeholder',
        label: 'Region',
        placeholder: 'Choose a region',
        description: 'Where your data is kept.',
        options: [
          { value: 'europe', label: 'Europe' },
          { value: 'americas', label: 'Americas' },
        ],
        value: model.region,
        onChange: region => onMessage(Message.Chose({ region })),
        style,
      },
      h,
    ),
})
