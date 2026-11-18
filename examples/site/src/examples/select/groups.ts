import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Recipes, Select, SelectSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Model = Schema.Struct({ country: Schema.String })
const Message = defineMessageUnion({ Chose: { country: Schema.String } })

// Options in a row with the same `group` sit under one heading, an
// `optgroup`; one with no group stands outside any. `disabled` shows an
// option and refuses it.
export default example({
  title: 'Groups',
  slots: SelectSlots,
  recipe: Recipes.Select,
  state: {
    Model,
    Message,
    init: () => ({ model: { country: 'fr' } }),
    update: (model, { country }) => ({ model: model.country === country ? model : { country } }),
  },
  view: ({ style, model, onMessage, h }) =>
    Select.view(
      {
        id: 'country',
        label: 'Country',
        options: [
          { value: 'us', label: 'United States', group: 'Americas' },
          { value: 'ca', label: 'Canada', group: 'Americas' },
          { value: 'fr', label: 'France', group: 'Europe' },
          { value: 'de', label: 'Germany', group: 'Europe', disabled: true },
          { value: 'other', label: 'Somewhere else' },
        ],
        value: model.country,
        onChange: country => onMessage(Message.Chose({ country })),
        style,
      },
      h,
    ),
})
