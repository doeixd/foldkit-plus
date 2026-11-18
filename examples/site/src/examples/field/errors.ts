import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Field, FieldSlots, Input, InputSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { forSlots } from '../../snippets/theme.js'

const Control = forSlots(InputSlots)(Recipes.Input({}))
const Model = Schema.Struct({ handle: Schema.String })
const Message = defineMessageUnion({ Typed: { value: Schema.String } })

// Errors are a list of lines under the control, in an alert; the shell and
// the control both say it is invalid, and the control points at the list.
export default example({
  title: 'Errors',
  slots: FieldSlots,
  recipe: Recipes.Field,
  state: {
    Model,
    Message,
    init: () => ({ model: { handle: 'ada lovelace!' } }),
    update: (_, { value }) => ({ model: { handle: value } }),
  },
  view: ({ style, model, onMessage, h }) => {
    const errors = [
      ...(/\s/.test(model.handle) ? ['No spaces'] : []),
      ...(/[^\w\s]/.test(model.handle) ? ['Letters and digits only'] : []),
    ]
    return Field.view(
      {
        id: 'handle',
        label: 'Handle',
        optional: true,
        errors,
        control: Input.view(
          {
            id: 'handle',
            value: model.handle,
            invalid: errors.length > 0,
            onInput: value => onMessage(Message.Typed({ value })),
            attributes: {
              input: Field.describedBy(h, 'handle', { errors: errors.length > 0 }),
            },
            style: Control,
            draw: ({ input }, h) => h.input(input),
          },
          h,
        ),
        style,
      },
      h,
    )
  },
})
