import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { OtpField, OtpFieldSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { stack } from '../../snippets/layout.js'

const Model = Schema.Struct({ code: Schema.String })
const Message = defineMessageUnion({ Typed: { code: Schema.String } })

// Empty and filling are the same field at different values. `invalid` marks a
// refused code, `disabled` takes no input, and `readOnly` shows a code that
// cannot be changed. The one that takes input holds a code of its own.
export default example({
  title: 'Refused, disabled and read only',
  slots: OtpFieldSlots,
  recipe: Recipes.OtpField,
  state: {
    Model,
    Message,
    init: () => ({ model: { code: '482910' } }),
    update: (_, { code }) => ({ model: { code } }),
  },
  view: ({ style, model, onMessage, h }) =>
    stack(
      h,
      [
        { id: 'refused', label: 'Refused code', invalid: true },
        { id: 'off', label: 'Disabled', disabled: true },
        { id: 'fixed', label: 'Read only', readOnly: true },
      ].map(options =>
        OtpField.view(
          {
            ...options,
            value: model.code,
            onChange: code => onMessage(Message.Typed({ code })),
            style,
          },
          h,
        ),
      ),
    ),
})
