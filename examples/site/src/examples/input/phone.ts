import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as Mount from 'foldkit/mount'
import { modifyFields } from 'foldkit/struct'
import { InputMask } from 'foldkit-primitives/dom'
import { Input, InputSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Model = Schema.Struct({ phone: Schema.String })
const Message = defineMessageUnion({ Masked: { value: Schema.String } })

// A phone number is typed as digits and shown as `(555) 123-4567`. `InputMask`
// is a Mount on the control that rewrites it and keeps the caret; the Input
// only passes it through `attributes`. The masked text is what is kept here.
export default example({
  title: 'A masked phone number',
  slots: InputSlots,
  recipe: Recipes.Input,
  state: {
    Model,
    Message,
    init: () => ({ model: { phone: '' } }),
    update: (model, { value }) => ({ model: modifyFields(model, { phone: () => value }) }),
  },
  view: ({ style, model, onMessage, h }) =>
    Input.view(
      {
        id: 'masked-phone',
        name: 'phone',
        label: 'Phone',
        type: 'tel',
        inputMode: 'tel',
        placeholder: '(555) 123-4567',
        value: model.phone,
        start: h.span([], ['+1']),
        attributes: {
          input: [
            h.OnMount(
              Mount.mapMessage(InputMask({ pattern: '(###) ###-####' }), ({ value }) =>
                onMessage(Message.Masked({ value })),
              ),
            ),
          ],
        },
        style,
      },
      h,
    ),
})
