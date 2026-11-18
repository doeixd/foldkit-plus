import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Recipes, Select, SelectSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Model = Schema.Struct({ region: Schema.String })
const Message = defineMessageUnion({ Chose: { region: Schema.String } })

// The native `select`: the browser owns the list, the keys and the form
// value; the options are data, and the chosen value is the application's.
export default example({
  title: 'Basic',
  slots: SelectSlots,
  recipe: Recipes.Select,
  state: {
    Model,
    Message,
    init: () => ({ model: { region: 'europe' } }),
    update: (model, { region }) => ({ model: model.region === region ? model : { region } }),
  },
  view: ({ style, model, onMessage, h }) =>
    Select.view(
      {
        id: 'region',
        label: 'Region',
        options: [
          { value: 'europe', label: 'Europe' },
          { value: 'americas', label: 'Americas' },
          { value: 'apac', label: 'Asia Pacific' },
        ],
        value: model.region,
        onChange: region => onMessage(Message.Chose({ region })),
        name: 'region',
        style,
      },
      h,
    ),
})
