import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { OtpField, OtpFieldSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Model = Schema.Struct({ code: Schema.String })
const Message = defineMessageUnion({ Typed: { code: Schema.String } })

// `pattern: 'alphanumeric'` takes either, and offers a text keyboard; what is
// typed is kept to the pattern and the length before it is sent.
export default example({
  title: 'Letters and digits',
  slots: OtpFieldSlots,
  recipe: Recipes.OtpField,
  state: {
    Model,
    Message,
    init: () => ({ model: { code: '' } }),
    update: (_, { code }) => ({ model: { code } }),
  },
  view: ({ style, model, onMessage, h }) =>
    OtpField.view(
      {
        label: 'Invite code',
        length: 8,
        groups: [4, 4],
        pattern: 'alphanumeric',
        value: model.code,
        onChange: code => onMessage(Message.Typed({ code })),
        style,
      },
      h,
    ),
})
