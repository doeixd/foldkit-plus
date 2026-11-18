import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { OtpField, OtpFieldSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Model = Schema.Struct({ code: Schema.String })
const Message = defineMessageUnion({ Typed: { code: Schema.String } })

// One real input over the cells, which only show its characters: paste, the
// caret and the code a phone offers all stay the browser's. `groups` splits the
// cells into runs with a separator between them.
export default example({
  title: 'Basic',
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
        label: 'Sign-in code',
        groups: [3, 3],
        value: model.code,
        onChange: code => onMessage(Message.Typed({ code })),
        style,
      },
      h,
    ),
})
