import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Input, InputSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Model = Schema.Struct({ site: Schema.String })
const Message = defineMessageUnion({ Typed: { value: Schema.String } })

// `start` and `end` sit inside the field's box, beside the control: the box
// carries the border and the focus ring, so the three read as one field.
export default example({
  title: 'A prefix and a suffix',
  slots: InputSlots,
  recipe: Recipes.Input,
  state: {
    Model,
    Message,
    init: () => ({ model: { site: 'foldkit' } }),
    update: (model, { value }) => ({ model: modifyFields(model, { site: () => value }) }),
  },
  view: ({ style, model, onMessage, h }) =>
    Input.view(
      {
        id: 'site',
        label: 'Website',
        value: model.site,
        onInput: value => onMessage(Message.Typed({ value })),
        start: h.span([], ['https://']),
        end: h.span([], ['.com']),
        style,
      },
      h,
    ),
})
