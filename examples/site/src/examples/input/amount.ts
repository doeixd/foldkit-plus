import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Input, InputSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Model = Schema.Struct({ amount: Schema.String })
const Message = defineMessageUnion({ Typed: { value: Schema.String } })

// A unit before and after the number, and the keyboard a phone offers for it.
export default example({
  title: 'An amount',
  slots: InputSlots,
  recipe: Recipes.Input,
  state: {
    Model,
    Message,
    init: () => ({ model: { amount: '49.00' } }),
    update: (model, { value }) => ({ model: modifyFields(model, { amount: () => value }) }),
  },
  view: ({ style, model, onMessage, h }) =>
    Input.view(
      {
        id: 'amount',
        name: 'amount',
        label: 'Price',
        inputMode: 'decimal',
        value: model.amount,
        onInput: value => onMessage(Message.Typed({ value })),
        start: h.span([], ['$']),
        end: h.span([], ['USD']),
        style,
      },
      h,
    ),
})
