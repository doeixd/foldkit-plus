import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Button, ButtonSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { row } from '../../snippets/layout.js'

const Format = Schema.Literals(['Bold', 'Italic', 'Underline'])
const Model = Schema.Struct({ on: Schema.Array(Format) })
const Message = defineMessageUnion({ Toggled: { format: Format } })

// `pressed` draws `aria-pressed` and the recipe's pressed look. Which are on
// is the application's own state, folded by hand: no Bundle is needed.
export default example({
  title: 'Toggle',
  slots: ButtonSlots,
  recipe: Recipes.Button,
  state: {
    Model,
    Message,
    init: () => ({ model: { on: ['Bold'] } }),
    update: (model, { format }) => ({
      model: modifyFields(model, {
        on: on => (on.includes(format) ? on.filter(each => each !== format) : [...on, format]),
      }),
    }),
  },
  view: ({ style, model, onMessage, h }) =>
    row(
      h,
      Format.literals.map(format =>
        Button.view(
          {
            label: format,
            pressed: model.on.includes(format),
            onClick: onMessage(Message.Toggled({ format })),
            style,
          },
          h,
        ),
      ),
      [h.Role('group'), h.AriaLabel('Text style')],
    ),
})
