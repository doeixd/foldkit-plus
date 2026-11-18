import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { OtpField, OtpFieldSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Model = Schema.Struct({ code: Schema.String })
const Message = defineMessageUnion({ Typed: { code: Schema.String } })

// `mask` hides the code: the input is a password field and each filled cell
// shows a dot, or the mark you give. The application still holds the real code.
export default example({
  title: 'A hidden code',
  slots: OtpFieldSlots,
  recipe: Recipes.OtpField,
  state: {
    Model,
    Message,
    init: () => ({ model: { code: '482' } }),
    update: (_, { code }) => ({ model: { code } }),
  },
  view: ({ style, model, onMessage, h }) =>
    OtpField.view(
      {
        label: 'Card PIN',
        length: 4,
        mask: true,
        value: model.code,
        onChange: code => onMessage(Message.Typed({ code })),
        style,
      },
      h,
    ),
})
